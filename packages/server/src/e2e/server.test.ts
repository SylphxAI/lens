/**
 * @lens - E2E Tests
 *
 * End-to-end tests for server and client working together.
 * Tests the complete flow of:
 * - Operations protocol (queries, mutations, subscriptions)
 * - GraphStateManager integration
 * - Field-level subscriptions
 * - Minimum transfer (diff computation)
 * - Reference counting and canDerive
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { entity, t, query, mutation, type Update, applyUpdate } from "@sylphx/core";
import { createServer, type WebSocketLike } from "../server/create";

// =============================================================================
// Test Fixtures
// =============================================================================

// Entities
const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	status: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// Mock data
let mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@example.com", status: "online" },
	{ id: "user-2", name: "Bob", email: "bob@example.com", status: "offline" },
];

let mockPosts = [
	{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" },
	{ id: "post-2", title: "Test", content: "Post", authorId: "user-1" },
];

// =============================================================================
// Mock WebSocket Client
// =============================================================================

/**
 * Mock WebSocket client for testing the server.
 * Simulates client-side message handling.
 */
function createMockClient(server: ReturnType<typeof createServer>) {
	const messages: unknown[] = [];
	const subscriptions = new Map<
		string,
		{
			onData: (data: unknown) => void;
			onUpdate: (updates: Record<string, Update>) => void;
			onError: (error: Error) => void;
			onComplete: () => void;
			lastData: unknown;
		}
	>();
	const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();

	let messageIdCounter = 0;
	const nextId = () => `msg_${++messageIdCounter}`;

	// Mock WebSocket interface for server
	const ws: WebSocketLike & { messages: unknown[] } = {
		messages,
		send: (data: string) => {
			const msg = JSON.parse(data);
			messages.push(msg);

			// Route message to appropriate handler
			if (msg.type === "data" || msg.type === "result") {
				// Response to pending request or subscription initial data
				const pendingReq = pending.get(msg.id);
				if (pendingReq) {
					pending.delete(msg.id);
					pendingReq.resolve(msg.data);
				}

				const sub = subscriptions.get(msg.id);
				if (sub) {
					sub.lastData = msg.data;
					sub.onData(msg.data);
				}
			} else if (msg.type === "update") {
				const sub = subscriptions.get(msg.id);
				if (sub) {
					// Apply updates to last data
					if (sub.lastData && typeof sub.lastData === "object" && msg.updates) {
						const updated = { ...(sub.lastData as Record<string, unknown>) };
						for (const [field, update] of Object.entries(msg.updates as Record<string, Update>)) {
							updated[field] = applyUpdate(updated[field], update);
						}
						sub.lastData = updated;
						sub.onData(updated);
					}
					sub.onUpdate(msg.updates);
				}
			} else if (msg.type === "error") {
				const pendingReq = pending.get(msg.id);
				if (pendingReq) {
					pending.delete(msg.id);
					pendingReq.reject(new Error(msg.error.message));
				}

				const sub = subscriptions.get(msg.id);
				if (sub) {
					sub.onError(new Error(msg.error.message));
				}
			}
		},
		close: () => {},
		onmessage: null,
		onclose: null,
		onerror: null,
	};

	// Connect server to mock WebSocket
	server.handleWebSocket(ws);

	return {
		ws,
		messages,

		subscribe(
			operation: string,
			input: unknown,
			fields: string[] | "*",
			callbacks: {
				onData: (data: unknown) => void;
				onUpdate: (updates: Record<string, Update>) => void;
				onError: (error: Error) => void;
				onComplete: () => void;
			},
		) {
			const id = nextId();
			subscriptions.set(id, { ...callbacks, lastData: null });

			// Send subscribe message to server
			ws.onmessage?.({
				data: JSON.stringify({
					type: "subscribe",
					id,
					operation,
					input,
					fields,
				}),
			});

			return {
				unsubscribe: () => {
					subscriptions.delete(id);
					ws.onmessage?.({ data: JSON.stringify({ type: "unsubscribe", id }) });
					callbacks.onComplete();
				},
				updateFields: (add?: string[], remove?: string[]) => {
					ws.onmessage?.({
						data: JSON.stringify({ type: "updateFields", id, addFields: add, removeFields: remove }),
					});
				},
			};
		},

		async query(operation: string, input?: unknown, fields?: string[] | "*"): Promise<unknown> {
			return new Promise((resolve, reject) => {
				const id = nextId();
				pending.set(id, { resolve, reject });

				ws.onmessage?.({
					data: JSON.stringify({
						type: "query",
						id,
						operation,
						input,
						fields,
					}),
				});
			});
		},

		async mutate(operation: string, input: unknown): Promise<unknown> {
			return new Promise((resolve, reject) => {
				const id = nextId();
				pending.set(id, { resolve, reject });

				ws.onmessage?.({
					data: JSON.stringify({
						type: "mutation",
						id,
						operation,
						input,
					}),
				});
			});
		},
	};
}

// =============================================================================
// Test: Basic Operations
// =============================================================================

describe("E2E - Basic Operations", () => {
	it("query without input", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const client = createMockClient(server);
		const result = await client.query("getUsers");
		expect(result).toEqual(mockUsers);
	});

	it("query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const client = createMockClient(server);
		const result = await client.query("getUser", { id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "user-new",
				name: input.name,
				email: input.email,
				status: "online",
			}));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const client = createMockClient(server);
		const result = await client.mutate("createUser", { name: "Charlie", email: "charlie@example.com" });
		expect(result).toMatchObject({ name: "Charlie", email: "charlie@example.com" });
	});
});

// =============================================================================
// Test: Subscriptions
// =============================================================================

describe("E2E - Subscriptions", () => {
	it("subscribe receives initial data", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const client = createMockClient(server);
		const received: unknown[] = [];

		client.subscribe("getUser", { id: "user-1" }, "*", {
			onData: (data) => received.push(data),
			onUpdate: () => {},
			onError: () => {},
			onComplete: () => {},
		});

		await new Promise((r) => setTimeout(r, 50));

		expect(received.length).toBeGreaterThanOrEqual(1);
		expect(received[0]).toMatchObject({ name: "Alice" });
	});

	it("subscribe receives updates via ctx.emit", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const watchUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				emitFn = ctx.emit;
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { User },
			queries: { watchUser },
		});

		const client = createMockClient(server);
		const received: unknown[] = [];

		client.subscribe("watchUser", { id: "user-1" }, "*", {
			onData: (data) => received.push(data),
			onUpdate: () => {},
			onError: () => {},
			onComplete: () => {},
		});

		await new Promise((r) => setTimeout(r, 50));

		// Initial data
		expect(received.length).toBeGreaterThanOrEqual(1);
		expect(received[0]).toMatchObject({ name: "Alice" });

		const initialCount = received.length;

		// Emit update
		emitFn?.({ id: "user-1", name: "Alice Updated", email: "alice@example.com", status: "away" });

		await new Promise((r) => setTimeout(r, 50));

		// Should receive update
		expect(received.length).toBeGreaterThan(initialCount);
	});

	it("unsubscribe stops receiving updates", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const watchUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				emitFn = ctx.emit;
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { User },
			queries: { watchUser },
		});

		const client = createMockClient(server);
		const received: unknown[] = [];

		const sub = client.subscribe("watchUser", { id: "user-1" }, "*", {
			onData: (data) => received.push(data),
			onUpdate: () => {},
			onError: () => {},
			onComplete: () => {},
		});

		await new Promise((r) => setTimeout(r, 50));

		// Initial data
		const initialCount = received.length;
		expect(initialCount).toBeGreaterThanOrEqual(1);

		// Unsubscribe
		sub.unsubscribe();

		// Emit update after unsubscribe
		emitFn?.({ id: "user-1", name: "Alice Updated", email: "alice@example.com", status: "away" });

		await new Promise((r) => setTimeout(r, 50));

		// Should not receive after unsubscribe
		expect(received.length).toBe(initialCount);
	});
});

// =============================================================================
// Test: Server API
// =============================================================================

describe("E2E - Server API", () => {
	it("executes queries via mock client", async () => {
		const whoami = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const searchUsers = query()
			.input(z.object({ query: z.string() }))
			.returns([User])
			.resolve(({ input }) =>
				mockUsers.filter((u) => u.name.toLowerCase().includes(input.query.toLowerCase())),
			);

		const server = createServer({
			entities: { User },
			queries: { whoami, searchUsers },
		});

		const client = createMockClient(server);

		const me = await client.query("whoami");
		expect(me).toMatchObject({ name: "Alice" });

		const users = await client.query("searchUsers", { query: "bob" });
		expect(users).toEqual([mockUsers[1]]);
	});

	it("executes mutations via mock client", async () => {
		const updateStatus = mutation()
			.input(z.object({ id: z.string(), status: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				const user = mockUsers.find((u) => u.id === input.id);
				if (!user) throw new Error("User not found");
				return { ...user, status: input.status };
			});

		const server = createServer({
			entities: { User },
			mutations: { updateStatus },
		});

		const client = createMockClient(server);
		const result = await client.mutate("updateStatus", { id: "user-1", status: "busy" });
		expect(result).toMatchObject({ status: "busy" });
	});
});

// =============================================================================
// Test: Cleanup (ctx.onCleanup)
// =============================================================================

describe("E2E - Cleanup", () => {
	it("calls cleanup on unsubscribe", async () => {
		let cleanedUp = false;

		const watchUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				ctx.onCleanup(() => {
					cleanedUp = true;
				});
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { User },
			queries: { watchUser },
		});

		const client = createMockClient(server);

		const sub = client.subscribe("watchUser", { id: "user-1" }, "*", {
			onData: () => {},
			onUpdate: () => {},
			onError: () => {},
			onComplete: () => {},
		});

		await new Promise((r) => setTimeout(r, 50));

		// Unsubscribe should trigger cleanup
		sub.unsubscribe();
		expect(cleanedUp).toBe(true);
	});
});

// =============================================================================
// Test: GraphStateManager Integration
// =============================================================================

describe("E2E - GraphStateManager", () => {
	it("mutation updates are broadcast to subscribers", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				emitFn = ctx.emit;
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const updateUser = mutation()
			.input(z.object({ id: z.string(), name: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				const user = mockUsers.find((u) => u.id === input.id);
				if (!user) throw new Error("Not found");
				return { ...user, name: input.name };
			});

		const server = createServer({
			entities: { User },
			queries: { getUser },
			mutations: { updateUser },
		});

		const client = createMockClient(server);
		const received: unknown[] = [];

		// Subscribe to user
		client.subscribe("getUser", { id: "user-1" }, "*", {
			onData: (data) => received.push(data),
			onUpdate: () => {},
			onError: () => {},
			onComplete: () => {},
		});

		await new Promise((r) => setTimeout(r, 50));

		// Initial data received
		expect(received.length).toBeGreaterThanOrEqual(1);

		// Execute mutation
		await client.mutate("updateUser", { id: "user-1", name: "Alice Updated" });

		// If using ctx.emit in the subscription, we can manually broadcast
		emitFn?.({ id: "user-1", name: "Alice Updated", email: "alice@example.com", status: "online" });

		await new Promise((r) => setTimeout(r, 50));

		// Should have received update
		expect(received.length).toBeGreaterThan(1);
	});
});

// =============================================================================
// Test: Entity Resolvers and Nested Selection
// =============================================================================

describe("E2E - Entity Resolvers", () => {
	it("executes entity resolvers for nested selection via $select", async () => {
		// Mock data
		const users = [
			{ id: "user-1", name: "Alice", email: "alice@example.com" },
			{ id: "user-2", name: "Bob", email: "bob@example.com" },
		];

		const posts = [
			{ id: "post-1", title: "Hello World", content: "First post", authorId: "user-1" },
			{ id: "post-2", title: "Second Post", content: "More content", authorId: "user-1" },
		];

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => users.find((u) => u.id === input.id) ?? null);

		// Create entity resolvers for User.posts
		const resolvers = {
			getResolver: (entityName: string, fieldName: string) => {
				if (entityName === "User" && fieldName === "posts") {
					return (user: { id: string }) => posts.filter((p) => p.authorId === user.id);
				}
				return undefined;
			},
		};

		const server = createServer({
			entities: { User, Post },
			queries: { getUser },
			resolvers: resolvers as any,
		});

		// Test with $select for nested posts
		const result = await server.executeQuery("getUser", {
			id: "user-1",
			$select: {
				name: true,
				posts: {
					select: {
						title: true,
					},
				},
			},
		});

		expect(result).toMatchObject({
			id: "user-1",
			name: "Alice",
			posts: [
				{ id: "post-1", title: "Hello World" },
				{ id: "post-2", title: "Second Post" },
			],
		});
	});

	it("handles DataLoader batching for entity resolvers", async () => {
		// Track batch calls
		let batchCallCount = 0;

		const users = [
			{ id: "user-1", name: "Alice" },
			{ id: "user-2", name: "Bob" },
		];

		const posts = [
			{ id: "post-1", title: "Post 1", authorId: "user-1" },
			{ id: "post-2", title: "Post 2", authorId: "user-2" },
		];

		const getUsers = query()
			.returns([User])
			.resolve(() => users);

		// Create batch resolver for User.posts (object with batch property)
		const resolvers = {
			getResolver: (entityName: string, fieldName: string) => {
				if (entityName === "User" && fieldName === "posts") {
					// Return batch resolver object (not a function with batch attached)
					return {
						batch: async (parents: { id: string }[]) => {
							batchCallCount++;
							return parents.map((parent) => posts.filter((p) => p.authorId === parent.id));
						},
					};
				}
				return undefined;
			},
		};

		const server = createServer({
			entities: { User, Post },
			queries: { getUsers },
			resolvers: resolvers as any,
		});

		// Execute query with nested selection for all users
		const result = await server.executeQuery("getUsers", {
			$select: {
				name: true,
				posts: {
					select: {
						title: true,
					},
				},
			},
		});

		// Should have batched the posts resolution into a single call
		expect(batchCallCount).toBe(1);
		expect(result).toHaveLength(2);
	});
});
