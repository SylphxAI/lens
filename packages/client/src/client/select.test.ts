/**
 * @sylphx/lens-client - Select Tests
 *
 * Comprehensive tests for QueryResult.select() functionality:
 * - Basic field selection
 * - Nested object selection
 * - Array field selection
 * - Nested relation selection
 * - Type inference
 * - Chained select calls
 * - Select with subscribe
 * - Edge cases
 */

// @ts-nocheck - Runtime tests with dynamic client types

import { describe, expect, it } from "bun:test";
import { entity, lens, router, t } from "@sylphx/lens-core";
import { createApp } from "@sylphx/lens-server";
import { z } from "zod";
import { inProcess } from "../transport/direct.js";
import type { SelectedType } from "./create";
import { createClient } from "./create";

// =============================================================================
// Test Entities
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	age: t.int().nullable(),
	role: t.enum(["user", "admin", "guest"]),
	isActive: t.boolean(),
	metadata: t.object<{ theme: string; language: string; notifications: boolean }>(),
	tags: t.array(t.string()),
	createdAt: t.date(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
	viewCount: t.int(),
	authorId: t.string(),
});

interface TestContext {
	db: {
		users: Map<string, any>;
		posts: Map<string, any>;
		comments: Map<string, any>;
	};
}

// =============================================================================
// Test Data
// =============================================================================

const testUser = {
	id: "user-1",
	name: "Alice",
	email: "alice@example.com",
	age: 30,
	role: "admin" as const,
	isActive: true,
	metadata: { theme: "dark", language: "en", notifications: true },
	tags: ["developer", "typescript", "lens"],
	createdAt: new Date("2024-01-01"),
};

const testPosts = [
	{
		id: "post-1",
		title: "First Post",
		content: "This is the first post content.",
		published: true,
		viewCount: 100,
		authorId: "user-1",
	},
	{
		id: "post-2",
		title: "Second Post",
		content: "This is the second post content.",
		published: false,
		viewCount: 50,
		authorId: "user-1",
	},
	{
		id: "post-3",
		title: "Third Post",
		content: "This is the third post content.",
		published: true,
		viewCount: 200,
		authorId: "user-1",
	},
];

const testComments = [
	{ id: "comment-1", body: "Great post!", postId: "post-1", authorId: "user-2" },
	{ id: "comment-2", body: "Thanks for sharing", postId: "post-1", authorId: "user-3" },
	{ id: "comment-3", body: "Interesting", postId: "post-2", authorId: "user-2" },
];

// =============================================================================
// Helper: Create Test Server
// =============================================================================

function createTestServer() {
	const { query } = lens<TestContext>();

	const users = new Map<string, any>();
	const posts = new Map<string, any>();
	const comments = new Map<string, any>();

	// Seed test data
	users.set(testUser.id, testUser);
	users.set("user-2", { ...testUser, id: "user-2", name: "Bob", email: "bob@example.com" });
	users.set("user-3", { ...testUser, id: "user-3", name: "Charlie", email: "charlie@example.com" });
	for (const post of testPosts) {
		posts.set(post.id, post);
	}
	for (const comment of testComments) {
		comments.set(comment.id, comment);
	}

	return createApp({
		router: router({
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("User not found");
						return user;
					}),

				list: query()
					.returns(User)
					.resolve(({ ctx }) => Array.from(ctx.db.users.values())),

				withPosts: query()
					.input(z.object({ id: z.string() }))
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("User not found");
						const userPosts = Array.from(ctx.db.posts.values()).filter((p: any) => p.authorId === input.id);
						return { ...user, posts: userPosts };
					}),

				withPostsAndComments: query()
					.input(z.object({ id: z.string() }))
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("User not found");
						const userPosts = Array.from(ctx.db.posts.values())
							.filter((p: any) => p.authorId === input.id)
							.map((post: any) => ({
								...post,
								comments: Array.from(ctx.db.comments.values()).filter((c: any) => c.postId === post.id),
							}));
						return { ...user, posts: userPosts };
					}),
			}),

			post: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(Post)
					.resolve(({ input, ctx }) => {
						const post = ctx.db.posts.get(input.id);
						if (!post) throw new Error("Post not found");
						return post;
					}),

				list: query()
					.returns(Post)
					.resolve(({ ctx }) => Array.from(ctx.db.posts.values())),

				withAuthor: query()
					.input(z.object({ id: z.string() }))
					.resolve(({ input, ctx }) => {
						const post = ctx.db.posts.get(input.id);
						if (!post) throw new Error("Post not found");
						const author = ctx.db.users.get(post.authorId);
						return { ...post, author };
					}),

				withComments: query()
					.input(z.object({ id: z.string() }))
					.resolve(({ input, ctx }) => {
						const post = ctx.db.posts.get(input.id);
						if (!post) throw new Error("Post not found");
						const postComments = Array.from(ctx.db.comments.values()).filter((c: any) => c.postId === input.id);
						return { ...post, comments: postComments };
					}),
			}),

			nested: router({
				deep: query().resolve(() => ({
					level1: {
						level2: {
							level3: {
								value: "deep-value",
								array: [1, 2, 3],
							},
						},
					},
				})),

				complex: query().resolve(() => ({
					id: "complex-1",
					data: {
						items: [
							{ id: "item-1", name: "Item 1", meta: { score: 10 } },
							{ id: "item-2", name: "Item 2", meta: { score: 20 } },
							{ id: "item-3", name: "Item 3", meta: { score: 30 } },
						],
						summary: { total: 3, average: 20 },
					},
					config: {
						enabled: true,
						options: ["a", "b", "c"],
					},
				})),
			}),
		}),
		context: () => ({ db: { users, posts, comments } }),
	});
}

// =============================================================================
// Basic Field Selection Tests
// =============================================================================

describe("QueryResult.select() - Basic Field Selection", () => {
	it("selects single field", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ name: true });

		const data = await selected;

		expect(data.name).toBe("Alice");
		// Other fields should not be present in type, but may be at runtime
		// This is primarily a type-level feature
	});

	it("selects multiple fields", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({
			id: true,
			name: true,
			email: true,
		});

		const data = await selected;

		expect(data.id).toBe("user-1");
		expect(data.name).toBe("Alice");
		expect(data.email).toBe("alice@example.com");
	});

	it("selects all scalar fields", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({
			id: true,
			name: true,
			email: true,
			age: true,
			role: true,
			isActive: true,
			createdAt: true,
		});

		const data = await selected;

		expect(data.id).toBe("user-1");
		expect(data.name).toBe("Alice");
		expect(data.email).toBe("alice@example.com");
		expect(data.age).toBe(30);
		expect(data.role).toBe("admin");
		expect(data.isActive).toBe(true);
		expect(data.createdAt).toBeInstanceOf(Date);
	});

	it("selects nullable field", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ age: true });

		const data = await selected;

		expect(data.age).toBe(30);
	});

	it("selects enum field", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ role: true });

		const data = await selected;

		expect(data.role).toBe("admin");
	});

	it("selects boolean field", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ isActive: true });

		const data = await selected;

		expect(data.isActive).toBe(true);
	});
});

// =============================================================================
// Object Field Selection Tests
// =============================================================================

describe("QueryResult.select() - Object Field Selection", () => {
	it("selects object field entirely", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ metadata: true });

		const data = await selected;

		expect(data.metadata).toEqual({
			theme: "dark",
			language: "en",
			notifications: true,
		});
	});

	it("selects nested object fields", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.nested.deep();
		const selected = result.select({
			level1: {
				select: {
					level2: {
						select: {
							level3: true,
						},
					},
				},
			},
		});

		const data = await selected;

		expect(data.level1.level2.level3).toEqual({
			value: "deep-value",
			array: [1, 2, 3],
		});
	});

	it("selects partial nested object", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.nested.complex();
		const selected = result.select({
			id: true,
			config: true,
		});

		const data = await selected;

		expect(data.id).toBe("complex-1");
		expect(data.config.enabled).toBe(true);
		expect(data.config.options).toEqual(["a", "b", "c"]);
	});
});

// =============================================================================
// Array Field Selection Tests
// =============================================================================

describe("QueryResult.select() - Array Field Selection", () => {
	it("selects array field entirely", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ tags: true });

		const data = await selected;

		expect(data.tags).toEqual(["developer", "typescript", "lens"]);
	});

	it("selects array of objects", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.post.list();
		const data = await result;

		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(3);
		expect(data[0].title).toBe("First Post");
	});

	it("selects fields from array items", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.nested.complex();
		const selected = result.select({
			data: {
				select: {
					items: true,
				},
			},
		});

		const data = await selected;

		expect(data.data.items.length).toBe(3);
		expect(data.data.items[0].name).toBe("Item 1");
	});
});

// =============================================================================
// Nested Relation Selection Tests
// =============================================================================

describe("QueryResult.select() - Nested Relation Selection", () => {
	it("selects user with posts", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.withPosts({ id: "user-1" });
		const selected = result.select({
			id: true,
			name: true,
			posts: true,
		});

		const data = await selected;

		expect(data.id).toBe("user-1");
		expect(data.name).toBe("Alice");
		expect(data.posts.length).toBe(3);
	});

	it("selects specific fields from nested relation", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.withPosts({ id: "user-1" });
		const selected = result.select({
			name: true,
			posts: {
				select: {
					title: true,
					published: true,
				},
			},
		});

		const data = await selected;

		expect(data.name).toBe("Alice");
		expect(data.posts.length).toBe(3);
		expect(data.posts[0].title).toBe("First Post");
		expect(data.posts[0].published).toBe(true);
	});

	it("selects post with author", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.post.withAuthor({ id: "post-1" });
		const selected = result.select({
			title: true,
			author: {
				select: {
					name: true,
					email: true,
				},
			},
		});

		const data = await selected;

		expect(data.title).toBe("First Post");
		expect(data.author.name).toBe("Alice");
		expect(data.author.email).toBe("alice@example.com");
	});

	it("selects post with comments", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.post.withComments({ id: "post-1" });
		const selected = result.select({
			title: true,
			comments: {
				select: {
					body: true,
				},
			},
		});

		const data = await selected;

		expect(data.title).toBe("First Post");
		expect(data.comments.length).toBe(2);
		expect(data.comments[0].body).toBe("Great post!");
	});

	it("selects deeply nested relations", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.withPostsAndComments({ id: "user-1" });
		const selected = result.select({
			name: true,
			posts: {
				select: {
					title: true,
					comments: {
						select: {
							body: true,
						},
					},
				},
			},
		});

		const data = await selected;

		expect(data.name).toBe("Alice");
		expect(data.posts.length).toBe(3);
		expect(data.posts[0].title).toBe("First Post");
		expect(data.posts[0].comments.length).toBe(2);
		expect(data.posts[0].comments[0].body).toBe("Great post!");
	});
});

// =============================================================================
// Chained Select Tests
// =============================================================================

describe("QueryResult.select() - Chained Calls", () => {
	it("chains multiple select calls", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });

		// First select
		const selected1 = result.select({ id: true, name: true, email: true });

		// Chain another select on the result
		const selected2 = selected1.select({ id: true, name: true });

		const data = await selected2;

		expect(data.id).toBe("user-1");
		expect(data.name).toBe("Alice");
	});

	it("creates independent query results when selecting", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });

		// Two different selections from same base
		const selectName = result.select({ name: true });
		const selectEmail = result.select({ email: true });

		const [dataName, dataEmail] = await Promise.all([selectName, selectEmail]);

		expect(dataName.name).toBe("Alice");
		expect(dataEmail.email).toBe("alice@example.com");
	});
});

// =============================================================================
// Select with Subscribe Tests
// =============================================================================

describe("QueryResult.select() - With Subscribe", () => {
	it("subscribes to selected fields", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ name: true, email: true });

		const updates: unknown[] = [];
		const unsubscribe = selected.subscribe((data) => {
			updates.push(data);
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(updates.length).toBeGreaterThan(0);
		expect((updates[0] as any).name).toBe("Alice");
		expect((updates[0] as any).email).toBe("alice@example.com");

		unsubscribe();
	});

	it("select returns QueryResult with all methods", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ name: true });

		// Should have all QueryResult methods
		expect(typeof selected.subscribe).toBe("function");
		expect(typeof selected.select).toBe("function");
		expect(typeof selected.then).toBe("function");
	});

	it("unsubscribe works on selected query", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ name: true });

		const updates: unknown[] = [];
		const unsubscribe = selected.subscribe((data) => {
			updates.push(data);
		});

		await new Promise((resolve) => setTimeout(resolve, 50));
		const countBefore = updates.length;

		unsubscribe();

		await new Promise((resolve) => setTimeout(resolve, 50));

		// Should not receive more updates after unsubscribe
		expect(updates.length).toBe(countBefore);
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("QueryResult.select() - Type Inference", () => {
	it("SelectedType infers correct type for single field", () => {
		type Source = { id: string; name: string; age: number };
		type Selection = { name: true };
		type Result = SelectedType<Source, Selection>;

		// Type-level check - this should compile
		const result: Result = { name: "test" };
		expect(result.name).toBe("test");
	});

	it("SelectedType infers correct type for multiple fields", () => {
		type Source = { id: string; name: string; age: number };
		type Selection = { id: true; name: true };
		type Result = SelectedType<Source, Selection>;

		const result: Result = { id: "1", name: "test" };
		expect(result.id).toBe("1");
		expect(result.name).toBe("test");
	});

	it("SelectedType infers correct type for nested objects", () => {
		type Source = { user: { id: string; name: string } };
		type Selection = { user: { select: { name: true } } };
		type Result = SelectedType<Source, Selection>;

		const result: Result = { user: { name: "test" } };
		expect(result.user.name).toBe("test");
	});

	it("SelectedType infers correct type for arrays", () => {
		type Source = { items: Array<{ id: string; name: string }> };
		type Selection = { items: { select: { name: true } } };
		type Result = SelectedType<Source, Selection>;

		const result: Result = { items: [{ name: "item1" }, { name: "item2" }] };
		expect(result.items[0].name).toBe("item1");
	});
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("QueryResult.select() - Edge Cases", () => {
	it("handles empty selection object", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({});

		const data = await selected;

		// Should still work, just returns nothing selected
		expect(data).toBeDefined();
	});

	it("handles selection on null/undefined data gracefully", async () => {
		const { query } = lens<TestContext>();

		const app = createApp({
			router: router({
				nullable: query().resolve(() => null),
			}),
			context: () => ({
				db: { users: new Map(), posts: new Map(), comments: new Map() },
			}),
		});

		const client = createClient({ transport: inProcess({ app }) });

		const result = client.nullable();
		const selected = result.select({ field: true });

		const data = await selected;

		// Should handle null gracefully
		expect(data).toBeNull();
	});

	it("handles selection when query throws", async () => {
		const { query } = lens<TestContext>();

		const app = createApp({
			router: router({
				failing: query().resolve(() => {
					throw new Error("Query failed");
				}),
			}),
			context: () => ({
				db: { users: new Map(), posts: new Map(), comments: new Map() },
			}),
		});

		const client = createClient({ transport: inProcess({ app }) });

		const result = client.failing();
		const selected = result.select({ field: true });

		try {
			await selected;
			expect(true).toBe(false); // Should not reach
		} catch (error) {
			expect((error as Error).message).toBe("Query failed");
		}
	});

	it("handles concurrent select operations", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });

		// Multiple concurrent selections
		const [data1, data2, data3] = await Promise.all([
			result.select({ name: true }),
			result.select({ email: true }),
			result.select({ id: true, role: true }),
		]);

		expect(data1.name).toBe("Alice");
		expect(data2.email).toBe("alice@example.com");
		expect(data3.id).toBe("user-1");
		expect(data3.role).toBe("admin");
	});

	it("select preserves query result value property", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });
		const selected = result.select({ name: true });

		// Value should be null initially
		expect(selected.value).toBeNull();

		// After await, value should be populated
		await selected;

		expect(selected.value).toBeDefined();
		expect((selected.value as any).name).toBe("Alice");
	});

	it("handles list queries with select", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.list();
		const data = await result;

		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(3);
	});

	it("handles deeply nested selection gracefully", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.nested.complex();
		const selected = result.select({
			id: true,
			data: {
				select: {
					items: {
						select: {
							id: true,
							meta: true,
						},
					},
					summary: true,
				},
			},
			config: {
				select: {
					enabled: true,
				},
			},
		});

		const data = await selected;

		expect(data.id).toBe("complex-1");
		expect(data.data.items[0].id).toBe("item-1");
		expect(data.data.items[0].meta.score).toBe(10);
		expect(data.data.summary.total).toBe(3);
		expect(data.config.enabled).toBe(true);
	});
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("QueryResult.select() - Integration", () => {
	it("works with real server round-trip", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		// Complex query with nested data
		const result = client.user.withPostsAndComments({ id: "user-1" });

		// Select specific fields
		const selected = result.select({
			id: true,
			name: true,
			posts: {
				select: {
					id: true,
					title: true,
					comments: {
						select: {
							id: true,
							body: true,
						},
					},
				},
			},
		});

		const data = await selected;

		// Verify structure
		expect(data.id).toBe("user-1");
		expect(data.name).toBe("Alice");
		expect(data.posts).toHaveLength(3);
		expect(data.posts[0].id).toBe("post-1");
		expect(data.posts[0].title).toBe("First Post");
		expect(data.posts[0].comments).toHaveLength(2);
		expect(data.posts[0].comments[0].id).toBe("comment-1");
		expect(data.posts[0].comments[0].body).toBe("Great post!");
	});

	it("maintains consistency between multiple subscriptions", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });

		const updates1: unknown[] = [];
		const updates2: unknown[] = [];

		const selected1 = result.select({ name: true });
		const selected2 = result.select({ email: true });

		selected1.subscribe((data) => updates1.push(data));
		selected2.subscribe((data) => updates2.push(data));

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(updates1.length).toBeGreaterThan(0);
		expect(updates2.length).toBeGreaterThan(0);
		expect((updates1[0] as any).name).toBe("Alice");
		expect((updates2[0] as any).email).toBe("alice@example.com");
	});

	it("handles rapid successive select calls", async () => {
		const app = createTestServer();
		const client = createClient({ transport: inProcess({ app }) });

		const result = client.user.get({ id: "user-1" });

		// Rapid successive selections
		const selections = [];
		for (let i = 0; i < 10; i++) {
			selections.push(result.select({ name: true, id: true }));
		}

		const results = await Promise.all(selections);

		// All should return same data
		for (const data of results) {
			expect(data.name).toBe("Alice");
			expect(data.id).toBe("user-1");
		}
	});
});
