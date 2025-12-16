/**
 * @sylphx/lens-core - Field Resolvers Tests
 *
 * Tests for resolver() function with the new simplified API.
 * Uses plain functions for computed fields: ({ source, ctx }) => ...
 * Uses t.args().resolve() for fields with arguments.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { id, string } from "../schema/fields.js";
import { model } from "../schema/model.js";
import {
	createResolverFromEntity,
	hasInlineResolvers,
	isExposedField,
	isResolvedField,
	isResolverDef,
	resolver,
	toResolverMap,
} from "./index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
	avatarKey: string(),
});

const Post = model("Post", {
	id: id(),
	title: string(),
	content: string(),
	authorId: string(),
});

const _Comment = model("Comment", {
	id: id(),
	content: string(),
	postId: string(),
	authorId: string(),
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
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		expect(userResolver.entity._name).toBe("User");
		expect(userResolver.hasField("id")).toBe(true);
		expect(userResolver.hasField("name")).toBe(true);
		expect(userResolver.hasField("email")).toBe(false);
	});

	it("getFieldNames returns all field names", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			email: t.expose("email"),
		}));

		const names = userResolver.getFieldNames();
		expect(names).toContain("id");
		expect(names).toContain("name");
		expect(names).toContain("email");
		expect(names).toHaveLength(3);
	});

	it("isExposed returns true for exposed fields", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
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
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		const parent = mockDb.users[0];
		const idResult = await userResolver.resolveField("id", parent, {}, mockCtx);
		const name = await userResolver.resolveField("name", parent, {}, mockCtx);

		expect(idResult).toBe("1");
		expect(name).toBe("John");
	});

	it("resolves computed fields with plain functions", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			// Plain function resolver - new API
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
		}));

		const parent = mockDb.users[0];
		const avatar = await userResolver.resolveField("avatar", parent, {}, mockCtx);

		expect(avatar).toBe("https://cdn.example.com/john-avatar");
	});

	it("resolves relation fields with plain functions", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			// Plain function for relations - new API
			posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
		}));

		const parent = mockDb.users[0];
		const posts = await userResolver.resolveField("posts", parent, {}, mockCtx);

		expect(posts).toHaveLength(2);
		expect((posts as any[])[0].title).toBe("Hello");
	});

	it("resolves one-to-one relations with plain functions", async () => {
		const postResolver = resolver<MockContext>()(Post, (t) => ({
			id: t.expose("id"),
			// Plain function for one-to-one relation
			author: ({ source, ctx }) => ctx.db.users.find((u) => u.id === source.authorId)!,
		}));

		const parent = mockDb.posts[0];
		const author = await postResolver.resolveField("author", parent, {}, mockCtx);

		expect((author as any).name).toBe("John");
	});

	it("resolveAll resolves all fields", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			// Plain function resolver
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx);

		expect(result.id).toBe("1");
		expect(result.name).toBe("John");
		expect(result.avatar).toBe("https://cdn.example.com/john-avatar");
	});

	it("resolveAll respects select parameter", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			email: t.expose("email"),
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
	it("handles async plain function resolvers", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			// Async plain function
			posts: async ({ source, ctx }) => {
				await new Promise((r) => setTimeout(r, 1));
				return ctx.db.posts.filter((p) => p.authorId === source.id);
			},
		}));

		const parent = mockDb.users[0];
		const posts = await userResolver.resolveField("posts", parent, {}, mockCtx);

		expect(posts).toHaveLength(2);
	});
});

// =============================================================================
// Test: Type Guards
// =============================================================================

describe("Type guards", () => {
	it("isExposedField identifies exposed fields", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			// Plain function is wrapped internally
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
		}));

		expect(isExposedField(userResolver.fields.id)).toBe(true);
		// Plain functions are wrapped as resolved fields
		expect(isExposedField(userResolver.fields.avatar)).toBe(false);
	});

	it("isResolvedField identifies resolved fields", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
		}));

		expect(isResolvedField(userResolver.fields.id)).toBe(false);
		expect(isResolvedField(userResolver.fields.avatar)).toBe(true);
	});

	it("isResolverDef identifies resolver definitions", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
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
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
			comments: ({ source, ctx }) => ctx.db.comments.filter((c) => c.authorId === source.id),
		}));

		const postResolver = resolver<MockContext>()(Post, (t) => ({
			id: t.expose("id"),
			title: t.expose("title"),
			author: ({ source, ctx }) => ctx.db.users.find((u) => u.id === source.authorId)!,
			comments: ({ source, ctx }) => ctx.db.comments.filter((c) => c.postId === source.id),
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
		const postResolver = resolver<MockContext>()(Post, (t) => ({
			id: t.expose("id"),
			author: ({ source, ctx }) => ctx.db.users.find((u) => u.id === source.authorId) ?? null,
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
	it("resolves field with args using t.args().resolve()", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			posts: t
				.args(
					z.object({
						limit: z.number().default(10),
						published: z.boolean().optional(),
					}),
				)
				.resolve(({ source, args, ctx }) => {
					let posts = ctx.db.posts.filter((p) => p.authorId === source.id);
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

	it("resolves computed field with args", async () => {
		const postResolver = resolver<MockContext>()(Post, (t) => ({
			id: t.expose("id"),
			excerpt: t
				.args(z.object({ length: z.number().default(100) }))
				.resolve(({ source, args }) => `${source.content.slice(0, args.length)}...`),
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
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			posts: t.args(z.object({ limit: z.number() })).resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		expect(userResolver.getArgsSchema("id")).toBeNull();
		expect(userResolver.getArgsSchema("posts")).toBeDefined();
	});

	it("validates args against schema", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			posts: t
				.args(z.object({ limit: z.number().min(1).max(100) }))
				.resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		const parent = mockDb.users[0];

		// Invalid args should throw
		await expect(userResolver.resolveField("posts", parent, { limit: 0 }, mockCtx)).rejects.toThrow();
		await expect(userResolver.resolveField("posts", parent, { limit: 101 }, mockCtx)).rejects.toThrow();
	});
});

// =============================================================================
// Test: Edge Cases & Error Handling
// =============================================================================

describe("Edge cases and error handling", () => {
	it("throws error for non-existent field", async () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
		}));

		const parent = mockDb.users[0];

		await expect(userResolver.resolveField("nonexistent" as any, parent, {}, mockCtx)).rejects.toThrow(
			'Field "nonexistent" not found in resolver',
		);
	});

	it("resolveAll with object-style select (name + args)", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
			posts: t
				.args(z.object({ limit: z.number().default(10) }))
				.resolve(({ source, args, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id).slice(0, args.limit)),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx, [
			{ name: "id" },
			{ name: "posts", args: { limit: 1 } },
		]);

		expect(result.id).toBe("1");
		expect((result.posts as any[]).length).toBe(1);
		expect(result.name).toBeUndefined();
	});

	it("resolveAll ignores non-existent fields in select", async () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx, ["id", "nonexistent"]);

		expect(result.id).toBe("1");
		expect(result.nonexistent).toBeUndefined();
	});

	it("getArgsSchema returns null for non-existent field", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
		}));

		expect(userResolver.getArgsSchema("nonexistent")).toBeNull();
	});
});

// =============================================================================
// Test: Computed Fields (New API)
// =============================================================================

describe("Computed fields with new API", () => {
	it("int-returning computed field works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			postCount: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id).length,
		}));

		const parent = mockDb.users[0];
		const count = await userResolver.resolveField("postCount", parent, {}, mockCtx);
		expect(count).toBe(2);
	});

	it("float-returning computed field works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			avgPostLength: ({ source, ctx }) => {
				const posts = ctx.db.posts.filter((p) => p.authorId === source.id);
				const totalLength = posts.reduce((sum, p) => sum + p.content.length, 0);
				return totalLength / posts.length;
			},
		}));

		const parent = mockDb.users[0];
		const avg = await userResolver.resolveField("avgPostLength", parent, {}, mockCtx);
		expect(avg).toBe(4); // (5 + 3) / 2 = 4 (World + Bar)
	});

	it("boolean-returning computed field works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			hasPublishedPosts: ({ source, ctx }) => ctx.db.posts.some((p) => p.authorId === source.id && p.published),
		}));

		const parent = mockDb.users[0];
		const hasPublished = await userResolver.resolveField("hasPublishedPosts", parent, {}, mockCtx);
		expect(hasPublished).toBe(true);
	});

	it("date-returning computed field works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			createdAt: () => new Date("2024-01-15"),
		}));

		const parent = mockDb.users[0];
		const date = await userResolver.resolveField("createdAt", parent, {}, mockCtx);
		expect(date).toBeInstanceOf(Date);
	});

	it("nullable computed field works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			nickname: ({ source }) => (source.name === "John" ? "Johnny" : null),
		}));

		const parent1 = mockDb.users[0];
		const parent2 = mockDb.users[1];

		const nick1 = await userResolver.resolveField("nickname", parent1, {}, mockCtx);
		const nick2 = await userResolver.resolveField("nickname", parent2, {}, mockCtx);

		expect(nick1).toBe("Johnny");
		expect(nick2).toBeNull();
	});

	it("computed field with args works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			nickname: t.args(z.object({ uppercase: z.boolean().default(false) })).resolve(({ source, args }) => {
				if (source.name !== "John") return null;
				const nick = "Johnny";
				return args.uppercase ? nick.toUpperCase() : nick;
			}),
		}));

		const parent = mockDb.users[0];
		const nick1 = await userResolver.resolveField("nickname", parent, {}, mockCtx);
		const nick2 = await userResolver.resolveField("nickname", parent, { uppercase: true }, mockCtx);

		expect(nick1).toBe("Johnny");
		expect(nick2).toBe("JOHNNY");
	});

	it("relation field with args works", async () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			latestPost: t.args(z.object({ published: z.boolean().default(false) })).resolve(({ source, args, ctx }) => {
				const posts = ctx.db.posts.filter((p) => p.authorId === source.id);
				if (args.published) {
					return posts.find((p) => p.published) ?? null;
				}
				return posts[0] ?? null;
			}),
		}));

		const parent = mockDb.users[0];
		const post = (await userResolver.resolveField("latestPost", parent, { published: true }, mockCtx)) as any;

		expect(post?.title).toBe("Hello");
	});
});

// =============================================================================
// Test: Resolver Array Support (Functional Pattern)
// =============================================================================

describe("toResolverMap()", () => {
	it("converts resolver array to map", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		const postResolver = resolver(Post, (t) => ({
			id: t.expose("id"),
			title: t.expose("title"),
		}));

		const map = toResolverMap([userResolver, postResolver]);

		expect(map.size).toBe(2);
		expect(map.get("User")).toBe(userResolver);
		expect(map.get("Post")).toBe(postResolver);
	});

	it("throws error for entity without name", () => {
		// Create entity without name (edge case)
		const UnnamedEntity = { fields: { id: id() }, _name: undefined } as any;

		const badResolver = {
			entity: UnnamedEntity,
			fields: {},
		} as any;

		expect(() => toResolverMap([badResolver])).toThrow("Resolver entity must have a name");
	});
});

// =============================================================================
// Test: Subscription Detection (.subscribe() vs .resolve())
// =============================================================================

describe("Subscription detection", () => {
	it("isSubscription returns false for exposed fields", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		expect(userResolver.isSubscription("id")).toBe(false);
		expect(userResolver.isSubscription("name")).toBe(false);
	});

	it("isSubscription returns false for plain function fields", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
			posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
		}));

		expect(userResolver.isSubscription("id")).toBe(false);
		expect(userResolver.isSubscription("avatar")).toBe(false);
		expect(userResolver.isSubscription("posts")).toBe(false);
	});

	it("isSubscription returns false for non-existent field", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
		}));

		expect(userResolver.isSubscription("nonexistent")).toBe(false);
	});
});

// =============================================================================
// Test: getFieldMode()
// =============================================================================

describe("getFieldMode()", () => {
	it("returns 'exposed' for exposed fields", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
			name: t.expose("name"),
		}));

		expect(userResolver.getFieldMode("id")).toBe("exposed");
		expect(userResolver.getFieldMode("name")).toBe("exposed");
	});

	it("returns 'resolve' for plain function fields", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
			posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
		}));

		expect(userResolver.getFieldMode("id")).toBe("exposed");
		expect(userResolver.getFieldMode("avatar")).toBe("resolve");
		expect(userResolver.getFieldMode("posts")).toBe("resolve");
	});

	it("returns null for non-existent field", () => {
		const userResolver = resolver(User, (t) => ({
			id: t.expose("id"),
		}));

		expect(userResolver.getFieldMode("nonexistent")).toBeNull();
	});

	it("works with fields that have args", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			posts: t.args(z.object({ limit: z.number() })).resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		expect(userResolver.getFieldMode("posts")).toBe("resolve");
	});
});

// =============================================================================
// Test: JSON typed field
// =============================================================================

describe("JSON typed computed field", () => {
	interface SessionStatus {
		isActive: boolean;
		text: string;
	}

	it("supports plain function returning JSON object", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			sessionStatus: (): SessionStatus => ({
				isActive: true,
				text: "Working",
			}),
		}));

		expect(userResolver.getFieldMode("sessionStatus")).toBe("resolve");
	});

	it("supports .args() with JSON return type", () => {
		const userResolver = resolver<MockContext>()(User, (t) => ({
			id: t.expose("id"),
			statusWithArgs: t.args(z.object({ detailed: z.boolean() })).resolve(
				({ args }): SessionStatus => ({
					isActive: true,
					text: args.detailed ? "Working on task" : "Working",
				}),
			),
		}));

		expect(userResolver.getFieldMode("statusWithArgs")).toBe("resolve");
	});
});

// =============================================================================
// Test: Model to Resolver Conversion
// =============================================================================

describe("createResolverFromEntity()", () => {
	it("creates resolver with all fields exposed for plain model", () => {
		const PlainUser = model("PlainUser", {
			id: id(),
			name: string(),
			email: string(),
		});

		const resolverDef = createResolverFromEntity(PlainUser);

		expect(resolverDef.entity._name).toBe("PlainUser");
		expect(resolverDef.hasField("id")).toBe(true);
		expect(resolverDef.hasField("name")).toBe(true);
		expect(resolverDef.hasField("email")).toBe(true);
		expect(resolverDef.isExposed("id")).toBe(true);
		expect(resolverDef.isExposed("name")).toBe(true);
		expect(resolverDef.isExposed("email")).toBe(true);
	});

	it("resolves exposed fields from parent data", async () => {
		const PlainUser = model("PlainUser", {
			id: id(),
			name: string(),
		});

		const resolverDef = createResolverFromEntity(PlainUser);
		const parent = { id: "1", name: "John" };

		const idResult = await resolverDef.resolveField("id", parent, {}, {});
		const name = await resolverDef.resolveField("name", parent, {}, {});

		expect(idResult).toBe("1");
		expect(name).toBe("John");
	});

	it("resolveAll returns all fields", async () => {
		const PlainUser = model("PlainUser", {
			id: id(),
			name: string(),
			email: string(),
		});

		const resolverDef = createResolverFromEntity(PlainUser);
		const parent = { id: "1", name: "Jane", email: "jane@test.com" };

		const result = await resolverDef.resolveAll(parent, {});

		expect(result.id).toBe("1");
		expect(result.name).toBe("Jane");
		expect(result.email).toBe("jane@test.com");
	});
});

describe("hasInlineResolvers()", () => {
	it("returns false for model without inline resolvers", () => {
		const PlainUser = model("PlainUser", {
			id: id(),
			name: string(),
			email: string(),
		});

		expect(hasInlineResolvers(PlainUser)).toBe(false);
	});

	// Note: model().resolve() chain was removed in v3.0
	// Use standalone resolver(Model, ...) instead
});
