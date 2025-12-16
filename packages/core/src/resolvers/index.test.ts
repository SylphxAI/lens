/**
 * @sylphx/lens-core - Field Resolvers Tests
 *
 * Tests for resolver() function with field builder pattern.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { entity } from "../schema/define.js";
import { model } from "../schema/model.js";
import { t } from "../schema/types.js";
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

// =============================================================================
// Test: Edge Cases & Error Handling
// =============================================================================

describe("Edge cases and error handling", () => {
	it("throws error for non-existent field", async () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
		}));

		const parent = mockDb.users[0];

		await expect(userResolver.resolveField("nonexistent" as any, parent, {}, mockCtx)).rejects.toThrow(
			'Field "nonexistent" not found in resolver',
		);
	});

	it("resolveAll with object-style select (name + args)", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number().default(10) }))
				.resolve(({ parent, args, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id).slice(0, args.limit)),
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
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		const parent = mockDb.users[0];
		const result = await userResolver.resolveAll(parent, mockCtx, ["id", "nonexistent"]);

		expect(result.id).toBe("1");
		expect(result.nonexistent).toBeUndefined();
	});

	it("getArgsSchema returns null for non-existent field", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
		}));

		expect(userResolver.getArgsSchema("nonexistent")).toBeNull();
	});
});

// =============================================================================
// Test: Additional Field Builders
// =============================================================================

describe("Additional field builders", () => {
	it("int field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			postCount: f.int().resolve(({ parent, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id).length),
		}));

		const parent = mockDb.users[0];
		const count = await userResolver.resolveField("postCount", parent, {}, mockCtx);
		expect(count).toBe(2);
	});

	it("float field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			avgPostLength: f.float().resolve(({ parent, ctx }) => {
				const posts = ctx.db.posts.filter((p) => p.authorId === parent.id);
				const totalLength = posts.reduce((sum, p) => sum + p.content.length, 0);
				return totalLength / posts.length;
			}),
		}));

		const parent = mockDb.users[0];
		const avg = await userResolver.resolveField("avgPostLength", parent, {}, mockCtx);
		expect(avg).toBe(4); // (5 + 3) / 2 = 4 (World + Bar)
	});

	it("boolean field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			hasPublishedPosts: f
				.boolean()
				.resolve(({ parent, ctx }) => ctx.db.posts.some((p) => p.authorId === parent.id && p.published)),
		}));

		const parent = mockDb.users[0];
		const hasPublished = await userResolver.resolveField("hasPublishedPosts", parent, {}, mockCtx);
		expect(hasPublished).toBe(true);
	});

	it("datetime field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			createdAt: f.datetime().resolve(() => new Date("2024-01-15")),
		}));

		const parent = mockDb.users[0];
		const date = await userResolver.resolveField("createdAt", parent, {}, mockCtx);
		expect(date).toBeInstanceOf(Date);
	});

	it("date field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			birthDate: f.date().resolve(() => new Date("1990-05-20")),
		}));

		const parent = mockDb.users[0];
		const date = await userResolver.resolveField("birthDate", parent, {}, mockCtx);
		expect(date).toBeInstanceOf(Date);
	});

	it("nullable scalar field builder works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			nickname: f
				.string()
				.nullable()
				.resolve(({ parent }) => (parent.name === "John" ? "Johnny" : null)),
		}));

		const parent1 = mockDb.users[0];
		const parent2 = mockDb.users[1];

		const nick1 = await userResolver.resolveField("nickname", parent1, {}, mockCtx);
		const nick2 = await userResolver.resolveField("nickname", parent2, {}, mockCtx);

		expect(nick1).toBe("Johnny");
		expect(nick2).toBeNull();
	});

	it("nullable scalar field with args works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			nickname: f
				.string()
				.args(z.object({ uppercase: z.boolean().default(false) }))
				.nullable()
				.resolve(({ parent, args }) => {
					if (parent.name !== "John") return null;
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

	it("nullable relation field with args works", async () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			latestPost: f
				.one(Post)
				.args(z.object({ published: z.boolean().default(false) }))
				.nullable()
				.resolve(({ parent, args, ctx }) => {
					const posts = ctx.db.posts.filter((p) => p.authorId === parent.id);
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
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		const postResolver = resolver(Post, (f) => ({
			id: f.expose("id"),
			title: f.expose("title"),
		}));

		const map = toResolverMap([userResolver, postResolver]);

		expect(map.size).toBe(2);
		expect(map.get("User")).toBe(userResolver);
		expect(map.get("Post")).toBe(postResolver);
	});

	it("throws error for entity without name", () => {
		// Create entity without name (edge case)
		const UnnamedEntity = { fields: { id: t.id() }, _name: undefined } as any;

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
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		expect(userResolver.isSubscription("id")).toBe(false);
		expect(userResolver.isSubscription("name")).toBe(false);
	});

	it("isSubscription returns false for .resolve() fields", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			avatar: f.string().resolve(({ parent, ctx }) => ctx.cdn.getAvatar(parent.avatarKey)),
			posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id)),
		}));

		expect(userResolver.isSubscription("id")).toBe(false);
		expect(userResolver.isSubscription("avatar")).toBe(false);
		expect(userResolver.isSubscription("posts")).toBe(false);
	});

	it("isSubscription returns false for non-existent field", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
		}));

		expect(userResolver.isSubscription("nonexistent")).toBe(false);
	});
});

// =============================================================================
// Test: getFieldMode()
// =============================================================================

describe("getFieldMode()", () => {
	it("returns 'exposed' for exposed fields", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
		}));

		expect(userResolver.getFieldMode("id")).toBe("exposed");
		expect(userResolver.getFieldMode("name")).toBe("exposed");
	});

	it("returns 'resolve' for .resolve() fields", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			avatar: f.string().resolve(({ parent, ctx }) => ctx.cdn.getAvatar(parent.avatarKey)),
			posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.posts.filter((p) => p.authorId === parent.id)),
		}));

		expect(userResolver.getFieldMode("id")).toBe("exposed");
		expect(userResolver.getFieldMode("avatar")).toBe("resolve");
		expect(userResolver.getFieldMode("posts")).toBe("resolve");
	});

	it("returns null for non-existent field", () => {
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
		}));

		expect(userResolver.getFieldMode("nonexistent")).toBeNull();
	});

	it("works with fields that have args", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number() }))
				.resolve(({ args, ctx }) => ctx.db.posts.slice(0, args.limit)),
		}));

		expect(userResolver.getFieldMode("posts")).toBe("resolve");
	});
});

// =============================================================================
// Test: f.json<T>() typed JSON field builder
// =============================================================================

describe("f.json<T>()", () => {
	interface SessionStatus {
		isActive: boolean;
		text: string;
	}

	it("supports .resolve() with typed JSON", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			sessionStatus: f.json<SessionStatus>().resolve(() => ({
				isActive: true,
				text: "Working",
			})),
		}));

		expect(userResolver.getFieldMode("sessionStatus")).toBe("resolve");
	});

	it("supports .args() with typed JSON", () => {
		const userResolver = resolver<MockContext>()(User, (f) => ({
			id: f.expose("id"),
			statusWithArgs: f
				.json<SessionStatus>()
				.args(z.object({ detailed: z.boolean() }))
				.resolve(({ args }) => ({
					isActive: true,
					text: args.detailed ? "Working on task" : "Working",
				})),
		}));

		expect(userResolver.getFieldMode("statusWithArgs")).toBe("resolve");
	});
});

// =============================================================================
// Test: Entity to Resolver Conversion (Phase 4 - ADR-001)
// =============================================================================

describe("createResolverFromEntity()", () => {
	it("creates resolver with all fields exposed for plain entity", () => {
		const PlainUser = entity("PlainUser", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		const resolverDef = createResolverFromEntity(PlainUser);

		expect(resolverDef.entity._name).toBe("PlainUser");
		expect(resolverDef.hasField("id")).toBe(true);
		expect(resolverDef.hasField("name")).toBe(true);
		expect(resolverDef.hasField("email")).toBe(true);
		expect(resolverDef.isExposed("id")).toBe(true);
		expect(resolverDef.isExposed("name")).toBe(true);
		expect(resolverDef.isExposed("email")).toBe(true);
	});

	it("converts inline .resolve() to resolved field", () => {
		const UserWithComputed = entity("UserWithComputed", (t) => ({
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
			fullName: t.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));

		const resolverDef = createResolverFromEntity(UserWithComputed);

		expect(resolverDef.isExposed("id")).toBe(true);
		expect(resolverDef.isExposed("firstName")).toBe(true);
		expect(resolverDef.isExposed("lastName")).toBe(true);
		expect(resolverDef.isExposed("fullName")).toBe(false);
		expect(resolverDef.getFieldMode("fullName")).toBe("resolve");
	});

	it("resolves exposed fields from parent data", async () => {
		const PlainUser = entity("PlainUser", (t) => ({
			id: t.id(),
			name: t.string(),
		}));

		const resolverDef = createResolverFromEntity(PlainUser);
		const parent = { id: "1", name: "John" };

		const id = await resolverDef.resolveField("id", parent, {}, {});
		const name = await resolverDef.resolveField("name", parent, {}, {});

		expect(id).toBe("1");
		expect(name).toBe("John");
	});

	it("resolves inline .resolve() fields with parent context", async () => {
		const UserWithComputed = entity("UserWithComputed", (t) => ({
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
			fullName: t.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));

		const resolverDef = createResolverFromEntity(UserWithComputed);
		const parent = { id: "1", firstName: "John", lastName: "Doe" };

		const fullName = await resolverDef.resolveField("fullName", parent, {}, {});

		expect(fullName).toBe("John Doe");
	});

	it("resolves inline .resolve() fields with ctx context", async () => {
		interface DB {
			posts: Array<{ id: string; title: string; authorId: string }>;
		}

		const UserWithPosts = entity("UserWithPosts", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t
				.many(() => Post)
				.resolve(({ parent, ctx }) => {
					const db = ctx as DB;
					return db.posts.filter((p) => p.authorId === parent.id);
				}),
		}));

		const resolverDef = createResolverFromEntity(UserWithPosts);
		const parent = { id: "1", name: "John" };
		const ctx = {
			posts: [
				{ id: "p1", title: "Hello", authorId: "1" },
				{ id: "p2", title: "World", authorId: "2" },
			],
		};

		const posts = await resolverDef.resolveField("posts", parent, {}, ctx);

		expect(posts).toHaveLength(1);
		expect((posts as any[])[0].title).toBe("Hello");
	});

	it("resolveAll returns all fields", async () => {
		const UserWithComputed = entity("UserWithComputed", (t) => ({
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
			fullName: t.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));

		const resolverDef = createResolverFromEntity(UserWithComputed);
		const parent = { id: "1", firstName: "Jane", lastName: "Smith" };

		const result = await resolverDef.resolveAll(parent, {});

		expect(result.id).toBe("1");
		expect(result.firstName).toBe("Jane");
		expect(result.lastName).toBe("Smith");
		expect(result.fullName).toBe("Jane Smith");
	});

	it("produces same result as separate resolver()", async () => {
		// Inline resolver style (unified)
		const UserInline = entity("UserInline", (t) => ({
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
			fullName: t.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));
		const inlineResolverDef = createResolverFromEntity(UserInline);

		// Separate resolver style (legacy)
		const UserSeparate = entity("UserSeparate", {
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
		});
		const separateResolverDef = resolver(UserSeparate, (f) => ({
			id: f.expose("id"),
			firstName: f.expose("firstName"),
			lastName: f.expose("lastName"),
			fullName: f.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));

		const parent = { id: "1", firstName: "John", lastName: "Doe" };

		// Both should produce same results
		const inlineResult = await inlineResolverDef.resolveAll(parent, {});
		const separateResult = await separateResolverDef.resolveAll(parent, {});

		expect(inlineResult.id).toBe(separateResult.id);
		expect(inlineResult.firstName).toBe(separateResult.firstName);
		expect(inlineResult.lastName).toBe(separateResult.lastName);
		expect(inlineResult.fullName).toBe(separateResult.fullName);
	});
});

describe("hasInlineResolvers()", () => {
	it("returns false for entity without inline resolvers", () => {
		const PlainUser = entity("PlainUser", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		expect(hasInlineResolvers(PlainUser)).toBe(false);
	});

	it("returns true for entity with .resolve()", () => {
		const UserWithResolve = entity("UserWithResolve", (t) => ({
			id: t.id(),
			name: t.string(),
			fullName: t.string().resolve(({ parent }) => parent.name),
		}));

		expect(hasInlineResolvers(UserWithResolve)).toBe(true);
	});

	it("returns false for object-based entity definition", () => {
		const ObjectUser = entity("ObjectUser", {
			id: t.id(),
			name: t.string(),
		});

		expect(hasInlineResolvers(ObjectUser)).toBe(false);
	});

	it("returns true for model with .resolve() chain", () => {
		const UserWithResolve = model("UserWithResolve", (t) => ({
			id: t.id(),
			name: t.string(),
		})).resolve({
			name: ({ source }) => (source as { name: string }).name.toUpperCase(),
		});

		expect(hasInlineResolvers(UserWithResolve)).toBe(true);
	});

	it("returns true for model with .subscribe() chain", () => {
		const UserWithSubscribe = model("UserWithSubscribe", (t) => ({
			id: t.id(),
			name: t.string(),
		})).subscribe({
			name:
				() =>
				({ emit }) => {
					emit("test");
				},
		});

		expect(hasInlineResolvers(UserWithSubscribe)).toBe(true);
	});

	it("returns true for model with .resolve().subscribe() chain", () => {
		const UserWithBoth = model("UserWithBoth", (t) => ({
			id: t.id(),
			name: t.string(),
		}))
			.resolve({
				name: ({ source }) => (source as { name: string }).name,
			})
			.subscribe({
				name:
					() =>
					({ emit }) => {
						emit("test");
					},
			});

		expect(hasInlineResolvers(UserWithBoth)).toBe(true);
	});
});

describe("createResolverFromEntity() with model chain methods", () => {
	it("handles model with .resolve() chain", async () => {
		const User = model("User", (t) => ({
			id: t.id(),
			name: t.string(),
		})).resolve({
			name: ({ source }) => (source as { name: string }).name.toUpperCase(),
		});

		const resolverDef = createResolverFromEntity(User);

		expect(resolverDef.getFieldMode("id")).toBe("exposed");
		expect(resolverDef.getFieldMode("name")).toBe("resolve");

		const result = await resolverDef.resolveField("name", { id: "1", name: "john" }, {}, {});
		expect(result).toBe("JOHN");
	});

	it("handles model with .resolve().subscribe() chain (live mode)", () => {
		const User = model("User", (t) => ({
			id: t.id(),
			name: t.string(),
		}))
			.resolve({
				name: ({ source }) => (source as { name: string }).name,
			})
			.subscribe({
				name:
					() =>
					({ emit }) => {
						emit("test");
					},
			});

		const resolverDef = createResolverFromEntity(User);

		expect(resolverDef.getFieldMode("id")).toBe("exposed");
		expect(resolverDef.getFieldMode("name")).toBe("live");
	});

	it("resolver and subscriber are both callable", async () => {
		let subscriberCalled = false;

		const User = model("User", (t) => ({
			id: t.id(),
			balance: t.string(),
		}))
			.resolve({
				balance: ({ source }) => `$${(source as { balance: number }).balance}`,
			})
			.subscribe({
				balance:
					() =>
					({ emit }) => {
						subscriberCalled = true;
						emit("$100");
					},
			});

		const resolverDef = createResolverFromEntity(User);

		// Test resolver
		const resolved = await resolverDef.resolveField("balance", { id: "1", balance: 50 }, {}, {});
		expect(resolved).toBe("$50");

		// Test subscriber via subscribeField (returns publisher for "live" mode)
		const parent = { id: "1", balance: 50 };
		const publisher = resolverDef.subscribeField("balance", parent, {}, {});
		expect(publisher).not.toBeNull();
		expect(typeof publisher).toBe("function");

		// Execute publisher
		publisher!({ emit: () => {}, onCleanup: () => {} });
		expect(subscriberCalled).toBe(true);
	});
});
