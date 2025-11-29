/**
 * @sylphx/lens-core - Field Resolvers Tests
 *
 * Tests for resolver() function with field builder pattern.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { entity } from "../schema/define";
import { t } from "../schema/types";
import { createResolverRegistry, isExposedField, isResolvedField, isResolverDef, resolver } from "./index";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	avatarKey: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

const Comment = entity("Comment", {
	id: t.id(),
	content: t.string(),
	postId: t.string(),
	authorId: t.string(),
});

// Mock data
const mockDb = {
	users: [
		{ id: "1", name: "John", email: "john@example.com", avatarKey: "john-avatar" },
		{ id: "2", name: "Jane", email: "jane@example.com", avatarKey: "jane-avatar" },
	],
	posts: [
		{ id: "p1", title: "Hello", content: "World", authorId: "1", published: true },
		{ id: "p2", title: "Foo", content: "Bar", authorId: "1", published: false },
		{ id: "p3", title: "Test", content: "Post", authorId: "2", published: true },
	],
	comments: [
		{ id: "c1", content: "Great!", postId: "p1", authorId: "2" },
		{ id: "c2", content: "Nice!", postId: "p1", authorId: "1" },
	],
};

// Mock context
type MockContext = {
	db: typeof mockDb;
	cdn: { getAvatar: (key: string) => string };
};

const mockCtx: MockContext = {
	db: mockDb,
	cdn: { getAvatar: (key: string) => `https://cdn.example.com/${key}` },
};

// =============================================================================
// Test: resolver()
// =============================================================================

describe("resolver()", () => {
	it("creates a resolver definition with exposed fields", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		expect(userResolver.entity._name).toBe("User");
		expect(userResolver.hasField("id")).toBe(true);
		expect(userResolver.hasField("name")).toBe(true);
		expect(userResolver.hasField("email")).toBe(false);
	});

	it("getFieldNames returns all field names", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			email: f.expose("email"),
		}));

		const names = userResolver.getFieldNames();
		expect(names).toContain("id");
		expect(names).toContain("name");
		expect(names).toContain("email");
		expect(names).toHaveLength(3);
	});

	it("isExposed returns true for exposed fields", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		expect(userResolver.isExposed("id")).toBe(true);
		expect(userResolver.isExposed("name")).toBe(true);
	});
});

// =============================================================================
// Test: Field Resolution
// =============================================================================

describe("Field resolution", () => {
	it("resolves exposed fields from parent", async () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		const parent = mockDb.users[0];
		const id = await userResolver.resolveField("id", parent, {}, mockCtx);
		const name = await userResolver.resolveField("name", parent, {}, mockCtx);

		expect(id).toBe("1");
		expect(name).toBe("John");
	});

	it("resolves computed scalar fields", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			avatar: f.string().resolve(({ parent, ctx }) => ctx.cdn.getAvatar(parent.avatarKey)),
		}));

		const parent = mockDb.users[0];
		const avatar = await userResolver.resolveField("avatar", parent, {}, mockCtx);

		expect(avatar).toBe("https://cdn.example.com/john-avatar");
	});

	it("resolves relation fields with f.many()", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id)),
		}));

		const parent = mockDb.users[0];
		const posts = await userResolver.resolveField("posts", parent, {}, mockCtx);

		expect(posts).toHaveLength(2);
		expect((posts as any[])[0].title).toBe("Hello");
	});

	it("resolves relation fields with f.one()", async () => {
		const postResolver = resolver<MockContext>()(Post, (f) => ({
			id: f.expose("id"),
			author: f.one(User).resolve(({ parent, ctx }) => ctx.db.users.find((u) => u.id === parent.authorId)!),
		}));

		const parent = mockDb.posts[0];
		const author = await postResolver.resolveField("author", parent, {}, mockCtx);

		expect((author as any).name).toBe("John");
	});

	it("resolveAll resolves all fields", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			avatar: f.string().resolve(({ parent, ctx }) => ctx.cdn.getAvatar(parent.avatarKey)),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx);

		expect(result.id).toBe("1");
		expect(result.name).toBe("John");
		expect(result.avatar).toBe("https://cdn.example.com/john-avatar");
	});

	it("resolveAll respects select parameter", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			email: f.expose("email"),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx, ["id", "name"]);

		expect(result.id).toBe("1");
		expect(result.name).toBe("John");
		expect(result.email).toBeUndefined();
	});
});

// =============================================================================
// Test: Async Resolution
// =============================================================================

describe("Async resolution", () => {
	it("handles async resolvers", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f.many(Post).resolve(async ({ parent, ctx }) => {
				await new Promise((r) => setTimeout(r, 1));
				return ctx.db.posts.filter((p) => p.authorId === parent.id);
			}),
		}));

		const parent = mockDb.users[0];
		const posts = await userResolver.resolveField("posts", parent, {}, mockCtx);

		expect(posts).toHaveLength(2);
	});
});

// =============================================================================
// Test: Resolver Registry
// =============================================================================

describe("createResolverRegistry()", () => {
	it("registers and retrieves resolvers", () => {
		const registry = createResolverRegistry<MockContext>();

		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		registry.register(userResolver);

		expect(registry.has("User")).toBe(true);
		expect(registry.has("Post")).toBe(false);

		const retrieved = registry.get("User");
		expect(retrieved).toBeDefined();
		expect(retrieved?.entity._name).toBe("User");
	});

	it("registers multiple resolvers", () => {
		const registry = createResolverRegistry<MockContext>();

		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
		}));

		const postResolver = resolver<MockContext>()(Post, (f) => ({
			id: f.expose("id"),
		}));

		registry.register(userResolver);
		registry.register(postResolver);

		expect(registry.has("User")).toBe(true);
		expect(registry.has("Post")).toBe(true);
		expect(registry.resolvers.size).toBe(2);
	});
});

// =============================================================================
// Test: Type Guards
// =============================================================================

describe("Type guards", () => {
	it("isExposedField identifies exposed fields", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			avatar: f.string().resolve(() => ""),
		}));

		expect(isExposedField(userResolver.fields.id)).toBe(true);
		expect(isExposedField(userResolver.fields.avatar)).toBe(false);
	});

	it("isResolvedField identifies resolved fields", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			avatar: f.string().resolve(() => ""),
		}));

		expect(isResolvedField(userResolver.fields.id)).toBe(false);
		expect(isResolvedField(userResolver.fields.avatar)).toBe(true);
	});

	it("isResolverDef identifies resolver definitions", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
		}));

		expect(isResolverDef(userResolver)).toBe(true);
		expect(isResolverDef({})).toBe(false);
		expect(isResolverDef(null)).toBe(false);
	});
});

// =============================================================================
// Test: Complex Scenarios
// =============================================================================

describe("Complex scenarios", () => {
	it("handles multiple entities with relations", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id)),
			comments: f.many(Comment).resolve(({ parent, ctx }) => ctx.db.comments.filter((c) => c.authorId === parent.id)),
		}));

		const postResolver = resolver<MockContext>()(Post, (f) => ({
			id: f.expose("id"),
			title: f.expose("title"),
			author: f.one(User).resolve(({ parent, ctx }) => ctx.db.users.find((u) => u.id === parent.authorId)!),
			comments: f.many(Comment).resolve(({ parent, ctx }) => ctx.db.comments.filter((c) => c.postId === parent.id)),
		}));

		// Test User.posts
		const user = mockDb.users[0];
		const userResult = await userResolver.resolveAll(user, mockCtx);
		expect(userResult.name).toBe("John");
		expect((userResult.posts as any[]).length).toBe(2);

		// Test Post.author
		const post = mockDb.posts[0];
		const postResult = await postResolver.resolveAll(post, mockCtx);
		expect(postResult.title).toBe("Hello");
		expect((postResult.author as any).name).toBe("John");
		expect((postResult.comments as any[]).length).toBe(2);
	});

	it("supports nullable relation fields", async () => {
		const postResolver = resolver<MockContext>()(Post, (f) => ({
			id: f.expose("id"),
			author: f
				.one(User)
				.nullable()
				.resolve(({ parent, ctx }) => ctx.db.users.find((u) => u.id === parent.authorId) ?? null),
		}));

		const post = { ...mockDb.posts[0], authorId: "nonexistent" };
		const author = await postResolver.resolveField("author", post, {}, mockCtx);

		expect(author).toBeNull();
	});
});

// =============================================================================
// Test: Field Arguments
// =============================================================================

describe("Field arguments", () => {
	it("resolves field with args using .args() builder", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f
				.many(Post)
				.args(
					z.object({
						limit: z.number().default(10),
						published: z.boolean().optional(),
					}),
				)
				.resolve(({ parent, args, ctx }) => {
					let posts = ctx.db.posts.filter((p) => p.authorId === parent.id);
					if (args.published !== undefined) {
						posts = posts.filter((p) => p.published === args.published);
					}
					return posts.slice(0, args.limit);
				}),
		}));

		const parent = mockDb.users[0];

		// With default args
		const allPosts = await userResolver.resolveField("posts", parent, {}, mockCtx);
		expect(allPosts).toHaveLength(2);

		// With limit
		const limitedPosts = await userResolver.resolveField("posts", parent, { limit: 1 }, mockCtx);
		expect(limitedPosts).toHaveLength(1);

		// With published filter
		const publishedPosts = await userResolver.resolveField("posts", parent, { published: true }, mockCtx);
		expect(publishedPosts).toHaveLength(1);
		expect((publishedPosts as any[])[0].title).toBe("Hello");
	});

	it("resolves scalar field with args", async () => {
		const postResolver = resolver<MockContext>()(Post, (f) => ({
			id: f.expose("id"),
			excerpt: f
				.string()
				.args(z.object({ length: z.number().default(100) }))
				.resolve(({ parent, args }) => `${parent.content.slice(0, args.length)}...`),
		}));

		const parent = mockDb.posts[0]; // content = "World"

		// With default length
		const excerpt1 = await postResolver.resolveField("excerpt", parent, {}, mockCtx);
		expect(excerpt1).toBe("World...");

		// With custom length
		const excerpt2 = await postResolver.resolveField("excerpt", parent, { length: 3 }, mockCtx);
		expect(excerpt2).toBe("Wor...");
	});

	it("getArgsSchema returns schema for field with args", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number() }))
				.resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		expect(userResolver.getArgsSchema("id")).toBeNull();
		expect(userResolver.getArgsSchema("posts")).toBeDefined();
	});

	it("validates args against schema", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number().min(1).max(100) }))
				.resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		const parent = mockDb.users[0];

		// Invalid args should throw
		await expect(userResolver.resolveField("posts", parent, { limit: 0 }, mockCtx)).rejects.toThrow();
		await expect(userResolver.resolveField("posts", parent, { limit: 101 }, mockCtx)).rejects.toThrow();
	});
});
