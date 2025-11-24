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

		engine = new ExecutionEngine(resolvers, () => ({ db: {} }));
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
});
