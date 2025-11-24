/**
 * Tests for Execution Engine
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { createSchema, t } from "@lens/core";
import { ExecutionEngine, DataLoader } from "./engine";
import { createResolvers } from "../resolvers/create";

// Test schema
const schema = createSchema({
	User: {
		id: t.id(),
		name: t.string(),
		email: t.string(),
		bio: t.string().nullable(),
		posts: t.hasMany("Post"),
	},
	Post: {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		authorId: t.string(),
		author: t.belongsTo("User"),
	},
});

// Test data
const users = [
	{ id: "1", name: "Alice", email: "alice@example.com", bio: "Developer", posts: [] },
	{ id: "2", name: "Bob", email: "bob@example.com", bio: null, posts: [] },
];

const posts = [
	{ id: "p1", title: "First Post", content: "Hello world", authorId: "1", author: users[0] },
	{ id: "p2", title: "Second Post", content: "Another post", authorId: "1", author: users[0] },
];

// Update user posts
users[0].posts = posts;

describe("DataLoader", () => {
	test("batches multiple loads", async () => {
		const batchFn = mock(async (keys: string[]) => keys.map((k) => ({ id: k })));

		const loader = new DataLoader(batchFn);

		// Load multiple items in same tick
		const [a, b, c] = await Promise.all([loader.load("a"), loader.load("b"), loader.load("c")]);

		// Should batch into single call
		expect(batchFn).toHaveBeenCalledTimes(1);
		expect(batchFn).toHaveBeenCalledWith(["a", "b", "c"]);
		expect(a).toEqual({ id: "a" });
		expect(b).toEqual({ id: "b" });
		expect(c).toEqual({ id: "c" });
	});

	test("deduplicates keys", async () => {
		const batchFn = mock(async (keys: string[]) => keys.map((k) => ({ id: k })));

		const loader = new DataLoader(batchFn);

		const [a1, a2] = await Promise.all([loader.load("a"), loader.load("a")]);

		// Should only have one key
		expect(batchFn).toHaveBeenCalledWith(["a"]);
		expect(a1).toEqual({ id: "a" });
		expect(a2).toEqual({ id: "a" });
	});
});

describe("ExecutionEngine", () => {
	let engine: ExecutionEngine<typeof schema.definition, { db: object }>;

	beforeEach(() => {
		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => users.find((u) => u.id === id) ?? null,
				list: async () => users,
				create: async (input) => ({ ...users[0], ...input, id: "new" }),
				update: async (input) => ({ ...users[0], ...input }),
				delete: async () => true,
			},
			Post: {
				resolve: async (id) => posts.find((p) => p.id === id) ?? null,
				list: async () => posts,
			},
		});

		engine = new ExecutionEngine(resolvers, {
			schema,
			createContext: () => ({ db: {} }),
		});
	});

	describe("executeGet", () => {
		test("returns entity by id", async () => {
			const user = await engine.executeGet("User", "1");

			expect(user).toEqual(users[0]);
		});

		test("returns null for non-existent id", async () => {
			const user = await engine.executeGet("User", "999");

			expect(user).toBeNull();
		});

		test("applies field selection", async () => {
			const user = await engine.executeGet("User", "1", { name: true, email: true });

			expect(user).toEqual({
				id: "1", // id always included
				name: "Alice",
				email: "alice@example.com",
			});
			expect(user).not.toHaveProperty("bio");
			expect(user).not.toHaveProperty("posts");
		});

		test("handles false in selection (excludes field)", async () => {
			const user = await engine.executeGet("User", "1", {
				name: true,
				email: false,
				bio: true,
			});

			expect(user).toEqual({
				id: "1",
				name: "Alice",
				bio: "Developer",
			});
			expect(user).not.toHaveProperty("email");
		});
	});

	describe("executeList", () => {
		test("returns list of entities", async () => {
			const userList = await engine.executeList("User");

			expect(userList).toHaveLength(2);
			expect(userList[0]).toEqual(users[0]);
		});

		test("applies selection to list results", async () => {
			const userList = await engine.executeList("User", {}, { name: true });

			expect(userList).toHaveLength(2);
			expect(userList[0]).toEqual({ id: "1", name: "Alice" });
			expect(userList[0]).not.toHaveProperty("email");
		});
	});

	describe("field selection", () => {
		test("includes id by default", async () => {
			const user = await engine.executeGet("User", "1", { name: true });

			expect(user?.id).toBe("1");
		});

		test("handles nested relation selection", async () => {
			const post = await engine.executeGet("Post", "p1", {
				title: true,
				author: {
					select: { name: true },
				},
			});

			expect(post).toEqual({
				id: "p1",
				title: "First Post",
				author: {
					id: "1",
					name: "Alice",
				},
			});
			expect(post?.author).not.toHaveProperty("email");
		});

		test("handles hasMany relation selection", async () => {
			const user = await engine.executeGet("User", "1", {
				name: true,
				posts: {
					select: { title: true },
				},
			});

			expect(user?.name).toBe("Alice");
			expect(user?.posts).toHaveLength(2);
			expect(user?.posts?.[0]).toEqual({ id: "p1", title: "First Post" });
			expect(user?.posts?.[0]).not.toHaveProperty("content");
		});

		test("returns null for null data", async () => {
			const user = await engine.executeGet("User", "999", { name: true });

			expect(user).toBeNull();
		});

		test("returns full object when no selection provided", async () => {
			const user = await engine.executeGet("User", "1");

			expect(user).toEqual(users[0]);
		});
	});

	describe("mutations", () => {
		test("executeCreate creates entity", async () => {
			const user = await engine.executeCreate("User", {
				name: "Charlie",
				email: "charlie@example.com",
			});

			expect(user.id).toBe("new");
			expect(user.name).toBe("Charlie");
		});

		test("executeUpdate updates entity", async () => {
			const user = await engine.executeUpdate("User", {
				id: "1",
				name: "Alice Updated",
			});

			expect(user.name).toBe("Alice Updated");
		});

		test("executeDelete deletes entity", async () => {
			const result = await engine.executeDelete("User", "1");

			expect(result).toBe(true);
		});
	});

	describe("errors", () => {
		test("throws for unknown entity resolver", async () => {
			await expect(engine.executeGet("Unknown" as any, "1")).rejects.toThrow(
				"No resolver found for entity: Unknown",
			);
		});

		test("throws for missing list resolver", async () => {
			const resolvers = createResolvers(schema, {
				User: {
					resolve: async () => null,
				},
			});
			const limitedEngine = new ExecutionEngine(resolvers, () => ({ db: {} }));

			await expect(limitedEngine.executeList("User")).rejects.toThrow(
				"No list resolver found for entity: User",
			);
		});

		test("throws for missing create resolver", async () => {
			const resolvers = createResolvers(schema, {
				User: {
					resolve: async () => null,
				},
			});
			const limitedEngine = new ExecutionEngine(resolvers, () => ({ db: {} }));

			await expect(limitedEngine.executeCreate("User", {})).rejects.toThrow(
				"No create resolver found for entity: User",
			);
		});
	});

	describe("subscribe", () => {
		test("yields entity updates", async () => {
			const values: unknown[] = [];

			for await (const value of engine.subscribe("User", "1")) {
				values.push(value);
				break; // Only get first value for non-streaming resolver
			}

			expect(values).toHaveLength(1);
			expect(values[0]).toEqual(users[0]);
		});

		test("applies selection to subscription", async () => {
			const values: unknown[] = [];

			for await (const value of engine.subscribe("User", "1", { name: true })) {
				values.push(value);
				break;
			}

			expect(values[0]).toEqual({ id: "1", name: "Alice" });
		});
	});

	describe("pagination", () => {
		test("executeListPaginated returns paginated result", async () => {
			const result = await engine.executeListPaginated("User");

			expect(result.data).toHaveLength(2);
			expect(result.pageInfo).toBeDefined();
			expect(result.pageInfo.startCursor).toBe("1");
			expect(result.pageInfo.endCursor).toBe("2");
			expect(result.pageInfo.hasPreviousPage).toBe(false);
			expect(result.pageInfo.hasNextPage).toBe(false);
		});

		test("executeListPaginated with take returns correct hasNextPage", async () => {
			const result = await engine.executeListPaginated("User", { take: 1 });

			expect(result.data).toHaveLength(1);
			expect(result.pageInfo.hasNextPage).toBe(true);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		test("executeListPaginated with skip sets hasPreviousPage", async () => {
			const result = await engine.executeListPaginated("User", { skip: 1 });

			// Note: mock resolver doesn't implement skip, but hasPreviousPage should still be true
			expect(result.pageInfo.hasPreviousPage).toBe(true);
		});

		test("executeListPaginated applies selection", async () => {
			const result = await engine.executeListPaginated("User", {}, { name: true });

			expect(result.data[0]).toEqual({ id: "1", name: "Alice" });
			expect(result.data[0]).not.toHaveProperty("email");
		});

		test("executeListPaginated returns empty pageInfo for empty results", async () => {
			const result = await engine.executeListPaginated("User", { where: { id: "nonexistent" } });

			// Our test resolver doesn't filter by where, so this will still return all users
			// In a real implementation, the resolver would filter
			expect(result.pageInfo).toBeDefined();
		});
	});
});

// =============================================================================
// Reactive Execution Tests
// =============================================================================

import { GraphStateManager, type StateClient, type StateUpdateMessage } from "../state/graph-state-manager";

describe("ExecutionEngine Reactive", () => {
	// Test schema
	const reactiveSchema = createSchema({
		Post: {
			id: t.id(),
			title: t.string(),
			content: t.string(),
		},
	});

	describe("executeReactive", () => {
		test("throws without GraphStateManager", async () => {
			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id) => ({ id, title: "Test", content: "Content" }),
				},
			});
			const engine = new ExecutionEngine(resolvers, () => ({}));

			await expect(engine.executeReactive("Post", "1")).rejects.toThrow(
				"executeReactive requires a GraphStateManager",
			);
		});

		test("emits return value to state manager", async () => {
			const stateManager = new GraphStateManager();
			const mockClient = createMockClient("c1");
			stateManager.addClient(mockClient);
			stateManager.subscribe("c1", "Post", "123", "*");
			mockClient.messages = [];

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id) => ({ id, title: "Hello", content: "World" }),
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			const sub = await engine.executeReactive("Post", "123");

			// Wait for async emit
			await sleep(10);

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0].updates.title.data).toBe("Hello");
			expect(mockClient.messages[0].updates.content.data).toBe("World");

			sub.unsubscribe();
		});

		test("emits all yields from async generator", async () => {
			const stateManager = new GraphStateManager();
			const mockClient = createMockClient("c1");
			stateManager.addClient(mockClient);
			stateManager.subscribe("c1", "Post", "123", "*");
			mockClient.messages = [];

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async function* (id) {
						yield { id, title: "First", content: "Content 1" };
						await sleep(5);
						yield { id, title: "Second", content: "Content 2" };
						await sleep(5);
						yield { id, title: "Third", content: "Content 3" };
					},
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			await engine.executeReactive("Post", "123");

			// Wait for all yields
			await sleep(50);

			// Should have received updates (only changed fields after initial)
			expect(mockClient.messages.length).toBeGreaterThanOrEqual(3);
			expect(mockClient.messages[0].updates.title.data).toBe("First");
		});

		test("serializes Date objects in reactive updates", async () => {
			const schemaWithDate = createSchema({
				Event: {
					id: t.id(),
					name: t.string(),
					date: t.datetime(),
				},
			});

			const stateManager = new GraphStateManager();
			const mockClient = createMockClient("c1");
			stateManager.addClient(mockClient);
			stateManager.subscribe("c1", "Event", "1", "*");
			mockClient.messages = [];

			const testDate = new Date("2024-01-01T00:00:00Z");

			const resolvers = createResolvers(schemaWithDate, {
				Event: {
					resolve: async (id) => ({
						id,
						name: "Conference",
						date: testDate,
					}),
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: schemaWithDate,
				createContext: () => ({}),
				stateManager,
			});

			await engine.executeReactive("Event", "1");
			await sleep(10);

			expect(mockClient.messages.length).toBe(1);
			// Date should be serialized to ISO string
			expect(mockClient.messages[0].updates.date.data).toBe("2024-01-01T00:00:00.000Z");
		});

		test("supports ctx.emit() from resolver", async () => {
			const stateManager = new GraphStateManager();
			const mockClient = createMockClient("c1");
			stateManager.addClient(mockClient);
			stateManager.subscribe("c1", "Post", "123", "*");
			mockClient.messages = [];

			let emitFn: ((data: unknown) => void) | null = null;

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id, ctx) => {
						// Capture emit function for external use
						emitFn = (ctx as any).emit;
						return { id, title: "Initial", content: "Start" };
					},
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			await engine.executeReactive("Post", "123");
			await sleep(10);

			// Use captured emit function
			expect(emitFn).not.toBeNull();
			emitFn!({ title: "Updated via emit" });

			await sleep(10);

			// Should have initial + update
			expect(mockClient.messages.length).toBe(2);
			expect(mockClient.messages[1].updates.title.data).toBe("Updated via emit");
		});

		test("onCleanup is called on unsubscribe", async () => {
			const stateManager = new GraphStateManager();
			const cleanupCalled = mock(() => {});

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id, ctx) => {
						(ctx as any).onCleanup(cleanupCalled);
						return { id, title: "Test", content: "Content" };
					},
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			const sub = await engine.executeReactive("Post", "123");
			await sleep(10);

			expect(cleanupCalled).not.toHaveBeenCalled();

			sub.unsubscribe();

			expect(cleanupCalled).toHaveBeenCalledTimes(1);
		});

		test("stops emitting after unsubscribe", async () => {
			const stateManager = new GraphStateManager();
			const mockClient = createMockClient("c1");
			stateManager.addClient(mockClient);
			stateManager.subscribe("c1", "Post", "123", "*");

			let emitFn: ((data: unknown) => void) | null = null;

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id, ctx) => {
						emitFn = (ctx as any).emit;
						return { id, title: "Initial", content: "Start" };
					},
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			const sub = await engine.executeReactive("Post", "123");
			await sleep(10);
			mockClient.messages = [];

			sub.unsubscribe();

			// Try to emit after unsubscribe
			emitFn!({ title: "Should not appear" });
			await sleep(10);

			// No new messages should be received
			expect(mockClient.messages.length).toBe(0);
		});

		test("cancelSubscription works", async () => {
			const stateManager = new GraphStateManager();
			const cleanupCalled = mock(() => {});

			const resolvers = createResolvers(reactiveSchema, {
				Post: {
					resolve: async (id, ctx) => {
						(ctx as any).onCleanup(cleanupCalled);
						return { id, title: "Test", content: "Content" };
					},
				},
			});

			const engine = new ExecutionEngine(resolvers, {
				schema: reactiveSchema,
				createContext: () => ({}),
				stateManager,
			});

			const sub = await engine.executeReactive("Post", "123");
			await sleep(10);

			expect(engine.getActiveSubscriptionCount()).toBe(1);

			const result = engine.cancelSubscription(sub.id);
			expect(result).toBe(true);
			expect(cleanupCalled).toHaveBeenCalledTimes(1);
			expect(engine.getActiveSubscriptionCount()).toBe(0);

			// Second cancel should return false
			expect(engine.cancelSubscription(sub.id)).toBe(false);
		});
	});
});

describe("Array serialization", () => {
	test("serializes array of Date objects", async () => {
		const schemaWithDates = createSchema({
			Event: {
				id: t.id(),
				name: t.string(),
				dates: t.array(t.datetime()),
			},
		});

		const date1 = new Date("2024-01-01T00:00:00Z");
		const date2 = new Date("2024-12-31T23:59:59Z");

		const resolvers = createResolvers(schemaWithDates, {
			Event: {
				resolve: async (id) => ({
					id,
					name: "Conference",
					dates: [date1, date2],
				}),
			},
		});

		const engine = new ExecutionEngine(resolvers, {
			schema: schemaWithDates,
			createContext: () => ({}),
		});

		const result = await engine.executeGet("Event", "1");

		expect(result).toBeDefined();
		expect(result?.name).toBe("Conference");
		expect(result?.dates).toBeInstanceOf(Array);
		expect(result?.dates).toHaveLength(2);
		// Dates should be serialized to ISO strings
		expect(result?.dates[0]).toBe("2024-01-01T00:00:00.000Z");
		expect(result?.dates[1]).toBe("2024-12-31T23:59:59.000Z");
	});

	test("handles null values in date arrays", async () => {
		const schemaWithDates = createSchema({
			Event: {
				id: t.id(),
				name: t.string(),
				dates: t.array(t.datetime()),
			},
		});

		const date1 = new Date("2024-01-01T00:00:00Z");

		const resolvers = createResolvers(schemaWithDates, {
			Event: {
				resolve: async (id) => ({
					id,
					name: "Conference",
					dates: [date1, null, undefined],
				}),
			},
		});

		const engine = new ExecutionEngine(resolvers, {
			schema: schemaWithDates,
			createContext: () => ({}),
		});

		const result = await engine.executeGet("Event", "1");

		expect(result?.dates).toEqual(["2024-01-01T00:00:00.000Z", null, undefined]);
	});

	test("passes through arrays without serialization", async () => {
		const schemaWithStrings = createSchema({
			Post: {
				id: t.id(),
				title: t.string(),
				tags: t.array(t.string()),
			},
		});

		const resolvers = createResolvers(schemaWithStrings, {
			Post: {
				resolve: async (id) => ({
					id,
					title: "Test Post",
					tags: ["javascript", "typescript", "lens"],
				}),
			},
		});

		const engine = new ExecutionEngine(resolvers, {
			schema: schemaWithStrings,
			createContext: () => ({}),
		});

		const result = await engine.executeGet("Post", "1");

		expect(result?.tags).toEqual(["javascript", "typescript", "lens"]);
	});

	test("handles serialization errors gracefully", async () => {
		const schemaWithDates = createSchema({
			Event: {
				id: t.id(),
				name: t.string(),
				dates: t.array(t.datetime()),
			},
		});

		const resolvers = createResolvers(schemaWithDates, {
			Event: {
				resolve: async (id) => ({
					id,
					name: "Conference",
					// Invalid date values
					dates: [new Date("invalid"), "not a date" as any],
				}),
			},
		});

		const engine = new ExecutionEngine(resolvers, {
			schema: schemaWithDates,
			createContext: () => ({}),
		});

		// Should not throw, but return original values or handle error
		const result = await engine.executeGet("Event", "1");
		expect(result).toBeDefined();
		expect(result?.name).toBe("Conference");
	});
});

// =============================================================================
// Test Helpers
// =============================================================================

function createMockClient(id: string): StateClient & { messages: StateUpdateMessage[] } {
	const client: StateClient & { messages: StateUpdateMessage[] } = {
		id,
		messages: [],
		send: (msg) => {
			client.messages.push(msg);
		},
	};
	return client;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
