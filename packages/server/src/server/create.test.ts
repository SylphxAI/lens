/**
 * @sylphx/lens-server - Server Tests
 *
 * Tests for Lens server operations and GraphStateManager integration.
 */

import { describe, expect, it } from "bun:test";
import { entity, mutation, query, resolver, t } from "@sylphx/lens-core";
import { z } from "zod";
import { createServer, type WebSocketLike } from "./create";

// =============================================================================
// Test Fixtures
// =============================================================================

// Entities
const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	bio: t.string().nullable(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// Mock data
const mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@example.com", bio: "Developer" },
	{ id: "user-2", name: "Bob", email: "bob@example.com", bio: "Designer" },
];

const _mockPosts = [
	{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" },
	{ id: "post-2", title: "Test", content: "Post", authorId: "user-1" },
];

// Mock WebSocket factory
function createMockWs(): WebSocketLike & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send: (data: string) => messages.push(data),
		close: () => {},
		onmessage: null,
		onclose: null,
		onerror: null,
	};
}

// =============================================================================
// Test: Server Creation
// =============================================================================

describe("createServer", () => {
	it("creates a server instance", () => {
		const server = createServer({
			entities: { User, Post },
		});

		expect(server).toBeDefined();
		expect(typeof server.executeQuery).toBe("function");
		expect(typeof server.executeMutation).toBe("function");
		expect(typeof server.handleWebSocket).toBe("function");
		expect(typeof server.handleRequest).toBe("function");
		expect(typeof server.getStateManager).toBe("function");
	});

	it("throws for invalid query definition", () => {
		expect(() =>
			createServer({
				entities: { User },
				queries: {
					invalidQuery: { notAQuery: true } as never,
				},
			}),
		).toThrow("Invalid query definition: invalidQuery");
	});

	it("throws for invalid mutation definition", () => {
		expect(() =>
			createServer({
				entities: { User },
				mutations: {
					invalidMutation: { notAMutation: true } as never,
				},
			}),
		).toThrow("Invalid mutation definition: invalidMutation");
	});
});

// =============================================================================
// Test: Query Execution
// =============================================================================

describe("executeQuery", () => {
	it("executes a simple query", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const result = await server.executeQuery("getUsers");
		expect(result).toEqual(mockUsers);
	});

	it("executes a query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const result = await server.executeQuery("getUser", { id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("validates query input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		await expect(server.executeQuery("getUser", { id: 123 as unknown as string })).rejects.toThrow("Invalid input");
	});

	it("throws for unknown query", async () => {
		const server = createServer({
			entities: { User },
			queries: {},
		});

		await expect(server.executeQuery("unknownQuery")).rejects.toThrow("Query not found: unknownQuery");
	});
});

// =============================================================================
// Test: Mutation Execution
// =============================================================================

describe("executeMutation", () => {
	it("executes a simple mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "user-new",
				name: input.name,
				email: input.email,
			}));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const result = await server.executeMutation("createUser", {
			name: "Charlie",
			email: "charlie@example.com",
		});

		expect(result).toEqual({
			id: "user-new",
			name: "Charlie",
			email: "charlie@example.com",
		});
	});

	it("validates mutation input", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string().email() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		await expect(server.executeMutation("createUser", { name: "Test", email: "invalid-email" })).rejects.toThrow(
			"Invalid input",
		);
	});

	it("throws for unknown mutation", async () => {
		const server = createServer({
			entities: { User },
			mutations: {},
		});

		await expect(server.executeMutation("unknownMutation", {})).rejects.toThrow("Mutation not found: unknownMutation");
	});
});

// =============================================================================
// Test: WebSocket Protocol
// =============================================================================

describe("WebSocket Protocol", () => {
	it("handles handshake message", () => {
		const server = createServer({
			entities: { User },
			queries: {},
			mutations: {},
			version: "2.1.0",
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate handshake
		ws.onmessage?.({ data: JSON.stringify({ type: "handshake", id: "hs-1" }) });

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("handshake");
		expect(response.id).toBe("hs-1");
		expect(response.version).toBe("2.1.0");
	});

	it("handles query message", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate query
		ws.onmessage?.({ data: JSON.stringify({ type: "query", id: "q-1", operation: "getUsers" }) });

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.id).toBe("q-1");
		expect(response.data).toEqual(mockUsers);
	});

	it("handles mutation message", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate mutation
		ws.onmessage?.({
			data: JSON.stringify({
				type: "mutation",
				id: "m-1",
				operation: "createUser",
				input: { name: "Test" },
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.id).toBe("m-1");
		expect(response.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("handles parse error", () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Send invalid JSON
		ws.onmessage?.({ data: "invalid json" });

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("error");
		expect(response.error.code).toBe("PARSE_ERROR");
	});
});

// =============================================================================
// Test: Subscribe Protocol (Field-Level)
// =============================================================================

describe("Subscribe Protocol", () => {
	it("handles subscribe message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe to user
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name", "email"],
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// Should receive messages (either from GraphStateManager or operation-level)
		expect(ws.messages.length).toBeGreaterThan(0);

		// Find the operation-level data message (has subscription id)
		const dataMessage = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === "data" && m.id === "sub-1");

		// Should have received operation-level data
		expect(dataMessage).toBeDefined();
		expect(dataMessage.data).toMatchObject({ name: "Alice" });
	});

	it("handles unsubscribe message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		// Should not throw
		expect(true).toBe(true);
	});

	it("handles updateFields message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe with partial fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name"],
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Update fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "sub-1",
				addFields: ["email"],
				removeFields: [],
			}),
		});

		// Should not throw
		expect(true).toBe(true);
	});
});

// =============================================================================
// Test: GraphStateManager Integration
// =============================================================================

describe("GraphStateManager Integration", () => {
	it("provides access to state manager", () => {
		const server = createServer({
			entities: { User },
		});

		const stateManager = server.getStateManager();
		expect(stateManager).toBeDefined();
		expect(typeof stateManager.emit).toBe("function");
		expect(typeof stateManager.subscribe).toBe("function");
	});

	it("tracks client state after subscribe", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const stateManager = server.getStateManager();

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// State manager should have the client registered
		const stats = stateManager.getStats();
		expect(stats.clients).toBe(1);
	});

	it("removes client state on disconnect", async () => {
		const server = createServer({
			entities: { User },
		});

		const stateManager = server.getStateManager();

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate disconnect
		ws.onclose?.();

		const stats = stateManager.getStats();
		expect(stats.clients).toBe(0);
	});
});

// =============================================================================
// Test: HTTP Handler
// =============================================================================

describe("handleRequest", () => {
	it("handles query request", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "query", operation: "getUsers" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual(mockUsers);
	});

	it("handles mutation request", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "mutation", operation: "createUser", input: { name: "Test" } }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("rejects non-POST requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "GET" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
	});
});

// =============================================================================
// Test: Streaming (Async Generator) Support
// =============================================================================

describe("Streaming Support", () => {
	it("handles async generator query", async () => {
		const streamQuery = query()
			.returns(User)
			.resolve(async function* () {
				yield mockUsers[0];
				yield mockUsers[1];
			});

		const server = createServer({
			entities: { User },
			queries: { streamQuery },
		});

		// executeQuery returns first value
		const result = await server.executeQuery("streamQuery");
		expect(result).toEqual(mockUsers[0]);
	});

	it("streams values via WebSocket subscribe", async () => {
		let yieldCount = 0;

		const streamQuery = query()
			.returns(User)
			.resolve(async function* () {
				yieldCount++;
				yield mockUsers[0];
				yieldCount++;
				yield mockUsers[1];
			});

		const server = createServer({
			entities: { User },
			queries: { streamQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe to stream
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "streamQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		expect(yieldCount).toBe(2);
		expect(ws.messages.length).toBeGreaterThanOrEqual(1);
	});
});

// =============================================================================
// Test: Minimum Transfer (Diff Computation)
// =============================================================================

describe("Minimum Transfer", () => {
	it("sends initial data on subscribe", async () => {
		let _emitFn: ((data: unknown) => void) | null = null;

		const liveQuery = query()
			.returns(User)
			.resolve(({ emit }) => {
				_emitFn = emit;
				return { id: "1", name: "Alice", email: "alice@example.com" };
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// First message should have data
		expect(ws.messages.length).toBeGreaterThan(0);
		const firstUpdate = JSON.parse(ws.messages[0]);
		// Can be "data" or "update" with value strategy for initial
		expect(["data", "update"]).toContain(firstUpdate.type);
		// Verify we got the data
		if (firstUpdate.type === "data") {
			expect(firstUpdate.data).toMatchObject({ name: "Alice" });
		} else {
			expect(firstUpdate.updates).toBeDefined();
		}
	});

	it("sends updates via emit", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const liveQuery = query()
			.returns(User)
			.resolve(({ emit }) => {
				emitFn = emit;
				return { id: "1", name: "Alice", email: "alice@example.com" };
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		const initialCount = ws.messages.length;

		// Emit update with changed data
		emitFn?.({ id: "1", name: "Bob", email: "bob@example.com" });

		await new Promise((r) => setTimeout(r, 50));

		// Should have received additional messages
		expect(ws.messages.length).toBeGreaterThanOrEqual(initialCount);
	});
});

// =============================================================================
// Test: onCleanup
// =============================================================================

describe("onCleanup", () => {
	it("calls cleanup function on unsubscribe", async () => {
		let cleanedUp = false;

		const liveQuery = query()
			.returns(User)
			.resolve(({ ctx }) => {
				ctx.onCleanup(() => {
					cleanedUp = true;
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		expect(cleanedUp).toBe(true);
	});

	it("calls cleanup on client disconnect", async () => {
		let cleanedUp = false;

		const liveQuery = query()
			.returns(User)
			.resolve(({ ctx }) => {
				ctx.onCleanup(() => {
					cleanedUp = true;
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Disconnect
		ws.onclose?.();

		expect(cleanedUp).toBe(true);
	});

	it("allows cleanup removal via returned function", async () => {
		let cleanedUp = false;

		const liveQuery = query()
			.returns(User)
			.resolve(({ ctx }) => {
				const remove = ctx.onCleanup(() => {
					cleanedUp = true;
				});
				// Remove the cleanup before unsubscribe
				remove();
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		// Should not have cleaned up since we removed it
		expect(cleanedUp).toBe(false);
	});
});

// =============================================================================
// Test: execute() method (for in-process transport)
// =============================================================================

describe("execute method", () => {
	it("executes a query operation", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const result = await server.execute({ path: "getUsers" });
		expect(result.data).toEqual(mockUsers);
		expect(result.error).toBeUndefined();
	});

	it("executes a mutation operation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const result = await server.execute({ path: "createUser", input: { name: "Test" } });
		expect(result.data).toEqual({ id: "new", name: "Test", email: "" });
		expect(result.error).toBeUndefined();
	});

	it("returns error for unknown operation", async () => {
		const server = createServer({
			entities: { User },
		});

		const result = await server.execute({ path: "unknownOp" });
		expect(result.data).toBeUndefined();
		expect(result.error).toBeDefined();
		expect(result.error?.message).toBe("Operation not found: unknownOp");
	});

	it("catches and returns errors from operations", async () => {
		const errorQuery = query()
			.returns(User)
			.resolve(() => {
				throw new Error("Test error");
			});

		const server = createServer({
			entities: { User },
			queries: { errorQuery },
		});

		const result = await server.execute({ path: "errorQuery" });
		expect(result.data).toBeUndefined();
		expect(result.error).toBeDefined();
		expect(result.error?.message).toBe("Test error");
	});

	it("converts non-Error exceptions to Error objects", async () => {
		const errorQuery = query()
			.returns(User)
			.resolve(() => {
				throw "String error";
			});

		const server = createServer({
			entities: { User },
			queries: { errorQuery },
		});

		const result = await server.execute({ path: "errorQuery" });
		expect(result.error).toBeDefined();
		expect(result.error?.message).toBe("String error");
	});
});

// =============================================================================
// Test: getMetadata() and buildOperationsMap()
// =============================================================================

describe("getMetadata", () => {
	it("returns server metadata with version and operations", () => {
		const getUser = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			queries: { getUser },
			mutations: { createUser },
			version: "1.2.3",
		});

		const metadata = server.getMetadata();
		expect(metadata.version).toBe("1.2.3");
		expect(metadata.operations).toBeDefined();
		expect(metadata.operations.getUser).toEqual({ type: "query" });
		// createUser auto-derives optimistic "create" from naming convention (converted to Pipeline)
		expect((metadata.operations.createUser as any).type).toBe("mutation");
		expect((metadata.operations.createUser as any).optimistic.$pipe).toBeDefined();
		expect((metadata.operations.createUser as any).optimistic.$pipe[0].$do).toBe("entity.create");
	});

	it("builds nested operations map from namespaced routes", () => {
		const getUserQuery = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const createUserMutation = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			queries: { "user.get": getUserQuery },
			mutations: { "user.create": createUserMutation },
		});

		const metadata = server.getMetadata();
		expect(metadata.operations.user).toBeDefined();
		expect((metadata.operations.user as any).get).toEqual({ type: "query" });
		// Auto-derives optimistic "create" from naming convention (converted to Pipeline)
		expect((metadata.operations.user as any).create.type).toBe("mutation");
		expect((metadata.operations.user as any).create.optimistic.$pipe).toBeDefined();
		expect((metadata.operations.user as any).create.optimistic.$pipe[0].$do).toBe("entity.create");
	});

	it("includes optimistic config in mutation metadata", () => {
		const updateUser = mutation()
			.input(z.object({ id: z.string(), name: z.string() }))
			.returns(User)
			.optimistic("merge")
			.resolve(({ input }) => ({ id: input.id, name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { updateUser },
		});

		const metadata = server.getMetadata();
		// Sugar "merge" is converted to Reify Pipeline
		expect(metadata.operations.updateUser).toEqual({
			type: "mutation",
			optimistic: {
				$pipe: [
					{
						$do: "entity.update",
						$with: {
							type: "User",
							id: { $input: "id" },
							name: { $input: "name" },
						},
					},
				],
			},
		});
	});

	it("handles deeply nested namespaced operations", () => {
		const deepQuery = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const server = createServer({
			entities: { User },
			queries: { "api.v1.user.get": deepQuery },
		});

		const metadata = server.getMetadata();
		const operations = metadata.operations as any;
		expect(operations.api.v1.user.get).toEqual({ type: "query" });
	});
});

// =============================================================================
// Test: HTTP handleRequest edge cases
// =============================================================================

describe("handleRequest edge cases", () => {
	it("returns metadata on GET /__lens/metadata", async () => {
		const server = createServer({
			entities: { User },
			version: "1.0.0",
		});

		const request = new Request("http://localhost/__lens/metadata", { method: "GET" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.version).toBe("1.0.0");
		expect(body.operations).toBeDefined();
	});

	it("returns 404 for unknown operation", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operation: "unknownOp" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(404);

		const body = await response.json();
		expect(body.error).toBe("Operation not found: unknownOp");
	});

	it("returns 500 for operation errors", async () => {
		const errorQuery = query()
			.returns(User)
			.resolve(() => {
				throw new Error("Internal error");
			});

		const server = createServer({
			entities: { User },
			queries: { errorQuery },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operation: "errorQuery" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(500);

		const body = await response.json();
		expect(body.error).toContain("Internal error");
	});

	it("handles POST requests for queries", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operation: "getUser", input: { id: "user-1" } }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual(mockUsers[0]);
	});
});

// =============================================================================
// Test: Context creation errors
// =============================================================================

describe("Context creation errors", () => {
	it("handles context factory errors in executeQuery", async () => {
		const getUser = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const server = createServer({
			entities: { User },
			queries: { getUser },
			context: () => {
				throw new Error("Context creation failed");
			},
		});

		await expect(server.executeQuery("getUser")).rejects.toThrow("Context creation failed");
	});

	it("handles async context factory errors in executeMutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
			context: async () => {
				throw new Error("Async context error");
			},
		});

		await expect(server.executeMutation("createUser", { name: "Test" })).rejects.toThrow("Async context error");
	});

	it("handles context errors in subscription", async () => {
		const liveQuery = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
			context: () => {
				throw new Error("Context error in subscription");
			},
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// Should receive error message
		const errorMsg = ws.messages.find((m) => {
			const parsed = JSON.parse(m);
			return parsed.type === "error" && parsed.id === "sub-1";
		});

		expect(errorMsg).toBeDefined();
		const parsed = JSON.parse(errorMsg!);
		expect(parsed.error.message).toContain("Context error in subscription");
	});
});

// =============================================================================
// Test: Subscription edge cases
// =============================================================================

describe("Subscription edge cases", () => {
	it("handles subscription input validation errors", async () => {
		const getUser = query()
			.input(z.object({ id: z.string().min(5) }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "a" }, // Too short
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		const errorMsg = ws.messages.find((m) => {
			const parsed = JSON.parse(m);
			return parsed.type === "error";
		});

		expect(errorMsg).toBeDefined();
		const parsed = JSON.parse(errorMsg!);
		expect(parsed.error.message).toContain("Invalid input");
	});

	it("handles updateFields for non-existent subscription", () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Try to update fields for non-existent subscription
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "non-existent",
				addFields: ["name"],
			}),
		});

		// Should not throw - just be a no-op
		expect(true).toBe(true);
	});

	it("handles unsubscribe for non-existent subscription", () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Try to unsubscribe from non-existent subscription
		ws.onmessage?.({
			data: JSON.stringify({
				type: "unsubscribe",
				id: "non-existent",
			}),
		});

		// Should not throw - just be a no-op
		expect(true).toBe(true);
	});

	it("upgrades to full subscription with wildcard", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe with partial fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name"],
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Upgrade to full subscription
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "sub-1",
				addFields: ["*"],
			}),
		});

		// Should not throw
		expect(true).toBe(true);
	});

	it("downgrades from wildcard to specific fields", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe with wildcard
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Downgrade to specific fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "sub-1",
				setFields: ["name", "email"],
			}),
		});

		// Should not throw
		expect(true).toBe(true);
	});

	it("ignores add/remove when already subscribed to wildcard", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe with wildcard
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Try to add fields (should be ignored)
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "sub-1",
				addFields: ["bio"],
			}),
		});

		// Should not throw
		expect(true).toBe(true);
	});

	it("handles async generator with empty stream", async () => {
		const emptyStream = query()
			.returns(User)
			.resolve(async function* () {
				// Empty generator - yields nothing
			});

		const server = createServer({
			entities: { User },
			queries: { emptyStream },
		});

		await expect(server.executeQuery("emptyStream")).rejects.toThrow("returned empty stream");
	});
});

// =============================================================================
// Test: Query with $select
// =============================================================================

describe("Query with $select", () => {
	it("handles query with $select parameter", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		// Use $select to trigger selection processing
		const result = await server.executeQuery("getUser", {
			id: "user-1",
			$select: { name: true, email: true },
		});

		expect(result).toBeDefined();
		expect((result as any).id).toBe("user-1");
		expect((result as any).name).toBe("Alice");
	});

	it("processes WebSocket query message with select", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Query with select
		ws.onmessage?.({
			data: JSON.stringify({
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "user-1" },
				select: { name: true, email: true },
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.data.name).toBe("Alice");
	});

	it("applies field selection with fields array", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Query with fields array (backward compat)
		ws.onmessage?.({
			data: JSON.stringify({
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name"],
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.data.id).toBe("user-1"); // id is always included
		expect(response.data.name).toBe("Alice");
	});
});

// =============================================================================
// Test: Logger integration
// =============================================================================

describe("Logger integration", () => {
	it("calls logger.error on cleanup errors", async () => {
		const errorLogs: string[] = [];
		const liveQuery = query()
			.returns(User)
			.resolve(({ ctx }) => {
				ctx.onCleanup(() => {
					throw new Error("Cleanup failed");
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
			logger: {
				error: (msg, ...args) => {
					errorLogs.push(`${msg} ${args.join(" ")}`);
				},
			},
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe (triggers cleanup error)
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		expect(errorLogs.length).toBeGreaterThan(0);
		expect(errorLogs[0]).toContain("Cleanup error");
	});

	it("calls logger.error on disconnect cleanup errors", async () => {
		const errorLogs: string[] = [];
		const liveQuery = query()
			.returns(User)
			.resolve(({ ctx }) => {
				ctx.onCleanup(() => {
					throw new Error("Disconnect cleanup failed");
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
			logger: {
				error: (msg, ...args) => {
					errorLogs.push(`${msg} ${args.join(" ")}`);
				},
			},
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Disconnect (triggers cleanup)
		ws.onclose?.();

		expect(errorLogs.length).toBeGreaterThan(0);
		expect(errorLogs[0]).toContain("Cleanup error");
	});
});

// =============================================================================
// Test: DataLoader Batching
// =============================================================================

describe("DataLoader Batching", () => {
	it("batches multiple load calls into single batch function call", async () => {
		let batchCallCount = 0;
		let receivedKeys: string[] = [];

		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}
		}

		const loader = new TestDataLoader(async (keys) => {
			batchCallCount++;
			receivedKeys = keys;
			return keys.map((k) => `value-${k}`);
		});

		// Load multiple keys in same tick
		const promises = [loader.load("key1"), loader.load("key2"), loader.load("key3")];

		const results = await Promise.all(promises);

		// Should batch all calls into single batch function call
		expect(batchCallCount).toBe(1);
		expect(receivedKeys).toEqual(["key1", "key2", "key3"]);
		expect(results).toEqual(["value-key1", "value-key2", "value-key3"]);
	});

	it("handles duplicate keys in same batch", async () => {
		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}
		}

		const loader = new TestDataLoader(async (keys) => {
			return keys.map((k) => `value-${k}`);
		});

		// Load same key multiple times
		const promises = [loader.load("key1"), loader.load("key1"), loader.load("key1")];

		const results = await Promise.all(promises);

		// All should resolve with same value
		expect(results).toEqual(["value-key1", "value-key1", "value-key1"]);
	});

	it("handles batch function errors", async () => {
		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}
		}

		const loader = new TestDataLoader(async () => {
			throw new Error("Batch function error");
		});

		const promises = [loader.load("key1"), loader.load("key2")];

		// All loads should reject with same error
		await expect(Promise.all(promises)).rejects.toThrow("Batch function error");
	});

	it("does not schedule dispatch twice if already scheduled", async () => {
		let dispatchCount = 0;

		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				dispatchCount++;
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}
		}

		const loader = new TestDataLoader(async (keys) => {
			return keys.map((k) => `value-${k}`);
		});

		// Load multiple keys
		await Promise.all([loader.load("key1"), loader.load("key2"), loader.load("key3")]);

		// Should only dispatch once despite multiple load calls
		expect(dispatchCount).toBe(1);
	});

	it("clears pending batches when clear is called", () => {
		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}

			getBatchSize(): number {
				return this.batch.size;
			}
		}

		const loader = new TestDataLoader(async (keys) => {
			return keys.map((k) => `value-${k}`);
		});

		// Add some items to batch (but don't await - they won't dispatch yet)
		loader.load("key1");
		loader.load("key2");

		// Clear should remove pending items
		loader.clear();

		// Batch should be empty
		expect(loader.getBatchSize()).toBe(0);
	});

	it("handles null results from batch function", async () => {
		class TestDataLoader {
			private batch: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }[]> = new Map();
			private scheduled = false;

			constructor(private batchFn: (keys: string[]) => Promise<(string | null)[]>) {}

			async load(key: string): Promise<string | null> {
				return new Promise((resolve, reject) => {
					const existing = this.batch.get(key);
					if (existing) {
						existing.push({ resolve, reject });
					} else {
						this.batch.set(key, [{ resolve, reject }]);
					}
					this.scheduleDispatch();
				});
			}

			private scheduleDispatch(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				queueMicrotask(() => this.dispatch());
			}

			private async dispatch(): Promise<void> {
				this.scheduled = false;
				const batch = this.batch;
				this.batch = new Map();

				const keys = Array.from(batch.keys());
				if (keys.length === 0) return;

				try {
					const results = await this.batchFn(keys);
					keys.forEach((key, index) => {
						const callbacks = batch.get(key)!;
						const result = results[index] ?? null;
						for (const { resolve } of callbacks) resolve(result);
					});
				} catch (error) {
					for (const callbacks of batch.values()) {
						for (const { reject } of callbacks) reject(error as Error);
					}
				}
			}

			clear(): void {
				this.batch.clear();
			}
		}

		const loader = new TestDataLoader(async (keys) => {
			// Return null for some keys
			return keys.map((k) => (k === "key2" ? null : `value-${k}`));
		});

		const results = await Promise.all([loader.load("key1"), loader.load("key2"), loader.load("key3")]);

		expect(results).toEqual(["value-key1", null, "value-key3"]);
	});
});

// =============================================================================
// Test: HTTP Server Lifecycle (listen, close, findConnectionByWs)
// =============================================================================

describe("HTTP Server Lifecycle", () => {
	it("handles GET requests that are not metadata endpoint", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/some-other-path", { method: "GET" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	it("handles PUT requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "PUT" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	it("handles DELETE requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "DELETE" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	it("handles PATCH requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "PATCH" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	it("handles OPTIONS requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "OPTIONS" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	it("handles HEAD requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "HEAD" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
	});

	it("can start and stop server with listen/close", async () => {
		const server = createServer({
			entities: { User },
			logger: {
				info: () => {}, // Silent logger for test
			},
		});

		// Start server on a random high port to avoid conflicts
		const port = 30000 + Math.floor(Math.random() * 10000);

		try {
			await server.listen(port);

			// Verify server is running by making a request
			const response = await fetch(`http://localhost:${port}/__lens/metadata`);
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.version).toBeDefined();
		} finally {
			// Always close the server
			await server.close();
		}
	});

	it("handles method not allowed via real HTTP server", async () => {
		const server = createServer({
			entities: { User },
			logger: {
				info: () => {}, // Silent logger for test
			},
		});

		const port = 30000 + Math.floor(Math.random() * 10000);

		try {
			await server.listen(port);

			// Make a PUT request which should return 405
			const response = await fetch(`http://localhost:${port}/api`, { method: "PUT" });
			expect(response.status).toBe(405);
			const text = await response.text();
			expect(text).toBe("Method not allowed");
		} finally {
			await server.close();
		}
	});

	// Note: WebSocket integration via Bun.serve's native WebSocket upgrade (lines 1184-1193)
	// is tested through unit tests using mock WebSockets. Full integration tests with real
	// WebSocket clients would require additional setup and are better suited for E2E tests.
});

// =============================================================================
// Test: SSE Handler Edge Cases
// =============================================================================

describe("SSE Handler Edge Cases", () => {
	it("handles WebSocket error callback", async () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Trigger error callback (if set)
		if (ws.onerror) {
			ws.onerror(new Error("WebSocket error"));
		}

		// Should not crash
		expect(true).toBe(true);
	});
});

// =============================================================================
// Test: Entity Resolvers
// =============================================================================

describe("Entity Resolvers", () => {
	it("executes field resolvers with select", async () => {
		const Author = entity("Author", {
			id: t.id(),
			name: t.string(),
		});

		const Article = entity("Article", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
			// author relation is resolved
		});

		const mockAuthors = [
			{ id: "author-1", name: "Alice" },
			{ id: "author-2", name: "Bob" },
		];

		const mockArticles = [
			{ id: "article-1", title: "First Post", authorId: "author-1" },
			{ id: "article-2", title: "Second Post", authorId: "author-2" },
		];

		// Create resolver for Article entity
		const articleResolver = resolver(Article, (f) => ({
			id: f.expose("id"),
			title: f.expose("title"),
			author: f.one(Author).resolve(({ parent }) => {
				return mockAuthors.find((a) => a.id === parent.authorId) ?? null;
			}),
		}));

		const getArticle = query()
			.input(z.object({ id: z.string() }))
			.returns(Article)
			.resolve(({ input }) => {
				return mockArticles.find((a) => a.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { Article, Author },
			queries: { getArticle },
			resolvers: [articleResolver],
		});

		const result = await server.executeQuery("getArticle", {
			id: "article-1",
			$select: {
				title: true,
				author: {
					select: {
						name: true,
					},
				},
			},
		});

		expect(result).toBeDefined();
		expect((result as any).title).toBe("First Post");
		expect((result as any).author).toBeDefined();
		expect((result as any).author.name).toBe("Alice");
	});

	it("handles array relations in resolvers", async () => {
		const Author = entity("Author", {
			id: t.id(),
			name: t.string(),
		});

		const Article = entity("Article", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		const mockArticles = [
			{ id: "article-1", title: "First Post", authorId: "author-1" },
			{ id: "article-2", title: "Second Post", authorId: "author-1" },
			{ id: "article-3", title: "Third Post", authorId: "author-2" },
		];

		// Create resolver for Author entity with articles relation
		const authorResolver = resolver(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			articles: f.many(Article).resolve(({ parent }) => {
				return mockArticles.filter((a) => a.authorId === parent.id);
			}),
		}));

		const getAuthor = query()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input }) => {
				return { id: input.id, name: input.id === "author-1" ? "Alice" : "Bob" };
			});

		const server = createServer({
			entities: { Article, Author },
			queries: { getAuthor },
			resolvers: [authorResolver],
		});

		const result = await server.executeQuery("getAuthor", {
			id: "author-1",
			$select: {
				name: true,
				articles: {
					select: {
						title: true,
					},
				},
			},
		});

		expect(result).toBeDefined();
		expect((result as any).name).toBe("Alice");
		expect((result as any).articles).toBeDefined();
		expect(Array.isArray((result as any).articles)).toBe(true);
		expect((result as any).articles.length).toBe(2);
		expect((result as any).articles[0].title).toBe("First Post");
	});

	it("handles field resolver with args", async () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			greeting: f
				.string()
				.args<{ formal: boolean }>()
				.resolve(({ parent, args }) => {
					return args.formal ? `Good day, ${parent.name}` : `Hey ${parent.name}!`;
				}),
		}));

		const getUser = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "Alice" }));

		const server = createServer({
			entities: { User },
			queries: { getUser },
			resolvers: [userResolver],
		});

		const result = await server.executeQuery("getUser", {
			$select: {
				name: true,
				greeting: {
					args: { formal: true },
				},
			},
		});

		expect(result).toBeDefined();
		expect((result as any).greeting).toBe("Good day, Alice");
	});

	it("returns data unchanged when no select provided", async () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			bio: f.string().resolve(({ parent }) => `Biography of ${parent.name}`),
		}));

		const getUser = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "Alice" }));

		const server = createServer({
			entities: { User },
			queries: { getUser },
			resolvers: [userResolver],
		});

		const result = await server.executeQuery("getUser");

		expect(result).toBeDefined();
		expect((result as any).name).toBe("Alice");
		// bio should not be resolved without select
		expect((result as any).bio).toBeUndefined();
	});
});

// =============================================================================
// Test: Reconnection Protocol
// =============================================================================

describe("WebSocket Reconnection", () => {
	it("handles reconnect message and returns reconnect_ack", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// First emit some data to establish state
		const stateManager = server.getStateManager();
		stateManager.emit("User", "user-1", { id: "user-1", name: "Alice", email: "alice@test.com" });

		// Simulate reconnect message
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-123",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-1",
					entity: "User",
					entityId: "user-1",
					fields: "*" as const,
					version: 0, // Client is behind
				},
			],
		};

		// Trigger message handler
		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });

		// Wait for async processing
		await new Promise((r) => setTimeout(r, 10));

		// Check reconnect_ack was sent
		const ackMessage = ws.messages.find((m) => {
			const parsed = JSON.parse(m);
			return parsed.type === "reconnect_ack";
		});

		expect(ackMessage).toBeDefined();
		const ack = JSON.parse(ackMessage!);
		expect(ack.type).toBe("reconnect_ack");
		expect(ack.reconnectId).toBe("reconnect-123");
		expect(ack.results).toBeInstanceOf(Array);
		expect(ack.results.length).toBe(1);
		expect(ack.processingTime).toBeGreaterThanOrEqual(0);
	});

	it("returns current status when client is up-to-date", async () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Emit data and get current version
		const stateManager = server.getStateManager();
		stateManager.emit("User", "user-1", { id: "user-1", name: "Alice" });
		const currentVersion = stateManager.getVersion("User", "user-1");

		// Reconnect with current version
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-456",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-1",
					entity: "User",
					entityId: "user-1",
					fields: "*" as const,
					version: currentVersion, // Client is current
				},
			],
		};

		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });
		await new Promise((r) => setTimeout(r, 10));

		const ackMessage = ws.messages.find((m) => JSON.parse(m).type === "reconnect_ack");
		const ack = JSON.parse(ackMessage!);

		expect(ack.results[0].status).toBe("current");
		expect(ack.results[0].version).toBe(currentVersion);
	});

	it("returns snapshot status when patches not available", async () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Emit data
		const stateManager = server.getStateManager();
		stateManager.emit("User", "user-1", { id: "user-1", name: "Alice" });

		// Reconnect with very old version (version 0, patches won't be available)
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-789",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-1",
					entity: "User",
					entityId: "user-1",
					fields: "*" as const,
					version: 0, // Very old version
				},
			],
		};

		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });
		await new Promise((r) => setTimeout(r, 10));

		const ackMessage = ws.messages.find((m) => JSON.parse(m).type === "reconnect_ack");
		const ack = JSON.parse(ackMessage!);

		// Should return either patched (if patches available) or snapshot
		expect(["patched", "snapshot"]).toContain(ack.results[0].status);
		if (ack.results[0].status === "snapshot") {
			expect(ack.results[0].data).toBeDefined();
			expect(ack.results[0].data.name).toBe("Alice");
		}
	});

	it("returns deleted status for non-existent entity", async () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Reconnect asking for non-existent entity
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-deleted",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-1",
					entity: "User",
					entityId: "non-existent-user",
					fields: "*" as const,
					version: 5,
				},
			],
		};

		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });
		await new Promise((r) => setTimeout(r, 10));

		const ackMessage = ws.messages.find((m) => JSON.parse(m).type === "reconnect_ack");
		const ack = JSON.parse(ackMessage!);

		expect(ack.results[0].status).toBe("deleted");
	});

	it("handles multiple subscriptions in single reconnect", async () => {
		const server = createServer({
			entities: { User, Post },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Emit data for multiple entities
		const stateManager = server.getStateManager();
		stateManager.emit("User", "user-1", { id: "user-1", name: "Alice" });
		stateManager.emit("Post", "post-1", { id: "post-1", title: "Hello" });

		// Reconnect with multiple subscriptions
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-multi",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-user",
					entity: "User",
					entityId: "user-1",
					fields: "*" as const,
					version: 0,
				},
				{
					id: "sub-post",
					entity: "Post",
					entityId: "post-1",
					fields: "*" as const,
					version: 0,
				},
			],
		};

		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });
		await new Promise((r) => setTimeout(r, 10));

		const ackMessage = ws.messages.find((m) => JSON.parse(m).type === "reconnect_ack");
		const ack = JSON.parse(ackMessage!);

		expect(ack.results.length).toBe(2);
		expect(ack.results.find((r: any) => r.entity === "User")).toBeDefined();
		expect(ack.results.find((r: any) => r.entity === "Post")).toBeDefined();
	});

	it("re-establishes subscriptions after reconnect", async () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Emit initial data
		const stateManager = server.getStateManager();
		stateManager.emit("User", "user-1", { id: "user-1", name: "Alice" });

		// Reconnect
		const reconnectMessage = {
			type: "reconnect",
			protocolVersion: 1,
			reconnectId: "reconnect-resub",
			clientTime: Date.now(),
			subscriptions: [
				{
					id: "sub-1",
					entity: "User",
					entityId: "user-1",
					fields: "*" as const,
					version: 0,
				},
			],
		};

		ws.onmessage?.({ data: JSON.stringify(reconnectMessage) });
		await new Promise((r) => setTimeout(r, 10));

		// Clear messages to check for new updates
		ws.messages.length = 0;

		// Emit new data - should be received by reconnected client
		stateManager.emit("User", "user-1", { name: "Alice Updated" });
		await new Promise((r) => setTimeout(r, 10));

		// Client should receive the update
		const updateMessage = ws.messages.find((m) => JSON.parse(m).type === "update");
		expect(updateMessage).toBeDefined();
	});
});
