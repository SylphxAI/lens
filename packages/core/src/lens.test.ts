/**
 * @sylphx/lens-core - Lens Factory Tests
 *
 * Tests for lens<TContext>() unified factory function.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { lens } from "./lens.js";
import { id, string } from "./schema/fields.js";
import { model } from "./schema/model.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
});

const _Post = model("Post", {
	id: id(),
	title: string(),
	authorId: string(),
});

interface TestContext {
	db: {
		users: Map<string, { id: string; name: string; email: string }>;
		posts: Map<string, { id: string; title: string; authorId: string }>;
	};
	currentUser: { id: string; name: string } | null;
}

const mockDb = {
	users: new Map([
		["1", { id: "1", name: "Alice", email: "alice@test.com" }],
		["2", { id: "2", name: "Bob", email: "bob@test.com" }],
	]),
	posts: new Map([["p1", { id: "p1", title: "Hello World", authorId: "1" }]]),
};

const mockCtx: TestContext = {
	db: mockDb,
	currentUser: { id: "1", name: "Alice" },
};

// =============================================================================
// Tests
// =============================================================================

describe("lens()", () => {
	it("returns resolver, query, and mutation factories", () => {
		const api = lens<TestContext>();

		expect(api.resolver).toBeTypeOf("function");
		expect(api.query).toBeTypeOf("function");
		expect(api.mutation).toBeTypeOf("function");
	});

	it("resolver creates typed resolver definitions", () => {
		const { resolver } = lens<TestContext>();

		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			email: f.expose("email"),
		}));

		expect(userResolver.entity._name).toBe("User");
		expect(userResolver.hasField("id")).toBe(true);
		expect(userResolver.hasField("name")).toBe(true);
	});

	it("resolver with context access in resolve function", async () => {
		const { resolver } = lens<TestContext>();

		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			email: t.expose("email"),
			// Use plain function for relations (new API)
			posts: ({ source, ctx }) => {
				return Array.from(ctx.db.posts.values()).filter((p) => p.authorId === source.id);
			},
		}));

		const user = { id: "1", name: "Alice", email: "alice@test.com" };
		const posts = await userResolver.resolveField("posts", user, {}, mockCtx);

		expect(posts).toHaveLength(1);
		expect((posts as any[])[0].title).toBe("Hello World");
	});

	it("query creates typed query builder", () => {
		const { query } = lens<TestContext>();

		const getUser = query()
			.args(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				const user = ctx.db.users.get(input.id);
				if (!user) throw new Error("Not found");
				return user;
			});

		expect(getUser._type).toBe("query");
		expect(getUser._input).toBeDefined();
	});

	it("mutation creates typed mutation builder", () => {
		const { mutation } = lens<TestContext>();

		const updateUser = mutation()
			.args(z.object({ id: z.string(), name: z.string() }))
			.returns(User)
			.optimistic("merge")
			.resolve(({ input, ctx }) => {
				const user = ctx.db.users.get(input.id);
				if (!user) throw new Error("Not found");
				return { ...user, name: input.name };
			});

		expect(updateUser._type).toBe("mutation");
		expect(updateUser._optimistic).toBe("merge");
	});

	it("all builders share the same context type", async () => {
		const { resolver, query, mutation } = lens<TestContext>();

		// All these should compile with TestContext
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			email: t.expose("email"),
			// Plain function for relations (new API)
			posts: ({ ctx }) => {
				// ctx is TestContext
				return Array.from(ctx.db.posts.values());
			},
		}));

		const getUser = query()
			.args(z.object({ id: z.string() }))
			.resolve(({ input, ctx }) => {
				// ctx is TestContext
				return ctx.db.users.get(input.id);
			});

		const createUser = mutation()
			.args(z.object({ name: z.string(), email: z.string() }))
			.resolve(({ input, ctx }) => {
				// ctx is TestContext
				const id = String(ctx.db.users.size + 1);
				const user = { id, ...input };
				ctx.db.users.set(id, user);
				return user;
			});

		expect(userResolver.entity._name).toBe("User");
		expect(getUser._type).toBe("query");
		expect(createUser._type).toBe("mutation");
	});

	it("resolver with field arguments", async () => {
		const { resolver } = lens<TestContext>();

		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			email: t.expose("email"),
			// Use builder pattern for fields with args (new API)
			posts: t.args(z.object({ limit: z.number().default(10) })).resolve(({ source, args, ctx }) => {
				const posts = Array.from(ctx.db.posts.values()).filter((p) => p.authorId === source.id);
				return posts.slice(0, args.limit);
			}),
		}));

		const user = { id: "1", name: "Alice", email: "alice@test.com" };

		// With default limit
		const allPosts = await userResolver.resolveField("posts", user, {}, mockCtx);
		expect(allPosts).toHaveLength(1);

		// With custom limit
		const limitedPosts = await userResolver.resolveField("posts", user, { limit: 0 }, mockCtx);
		expect(limitedPosts).toHaveLength(0);
	});

	it("works with default context type", () => {
		// Should work without specifying context type
		const { resolver, query } = lens();

		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			email: f.expose("email"),
		}));

		const getUser = query()
			.args(z.object({ id: z.string() }))
			.resolve(({ input }) => ({ id: input.id, name: "Test", email: "test@test.com" }));

		expect(userResolver.entity._name).toBe("User");
		expect(getUser._type).toBe("query");
	});
});
