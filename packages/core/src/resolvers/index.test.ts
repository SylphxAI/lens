/**
 * @sylphx/lens-core - Entity Resolvers Tests
 *
 * Tests for entityResolvers() function.
 */

import { describe, expect, it } from "bun:test";
import { entityResolvers, isBatchResolver, isEntityResolvers } from "./index";

// =============================================================================
// Test Fixtures
// =============================================================================

interface User {
	id: string;
	name: string;
	email: string;
}

interface Post {
	id: string;
	title: string;
	content: string;
	authorId: string;
}

interface Comment {
	id: string;
	content: string;
	postId: string;
	authorId: string;
}

// Mock database
const mockDb = {
	users: [
		{ id: "1", name: "John", email: "john@example.com" },
		{ id: "2", name: "Jane", email: "jane@example.com" },
	] as User[],
	posts: [
		{ id: "p1", title: "Hello", content: "World", authorId: "1" },
		{ id: "p2", title: "Foo", content: "Bar", authorId: "1" },
		{ id: "p3", title: "Test", content: "Post", authorId: "2" },
	] as Post[],
	comments: [
		{ id: "c1", content: "Great!", postId: "p1", authorId: "2" },
		{ id: "c2", content: "Nice!", postId: "p1", authorId: "1" },
	] as Comment[],
};

// =============================================================================
// Test: entityResolvers()
// =============================================================================

describe("entityResolvers()", () => {
	it("creates entity resolvers instance", () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
			},
		});

		expect(resolvers.definitions).toBeDefined();
		expect(resolvers.hasEntity("User")).toBe(true);
		expect(resolvers.hasEntity("Post")).toBe(false);
	});

	it("getResolver returns resolver for entity field", () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
			},
		});

		const postsResolver = resolvers.getResolver("User", "posts");
		expect(postsResolver).toBeDefined();
		expect(typeof postsResolver).toBe("function");
	});

	it("getEntityResolvers returns all resolvers for entity", () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
				comments: (user: User) => mockDb.comments.filter((c) => c.authorId === user.id),
			},
		});

		const userResolvers = resolvers.getEntityResolvers("User");
		expect(userResolvers).toBeDefined();
		expect(userResolvers?.posts).toBeDefined();
		expect(userResolvers?.comments).toBeDefined();
	});

	it("hasFieldResolver checks if field resolver exists", () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
			},
		});

		expect(resolvers.hasFieldResolver("User", "posts")).toBe(true);
		expect(resolvers.hasFieldResolver("User", "comments")).toBe(false);
		expect(resolvers.hasFieldResolver("Post", "author")).toBe(false);
	});

	it("getEntityNames returns all entity names", () => {
		const resolvers = entityResolvers({
			User: { posts: () => [] },
			Post: { author: () => null },
			Comment: { post: () => null },
		});

		const names = resolvers.getEntityNames();
		expect(names).toContain("User");
		expect(names).toContain("Post");
		expect(names).toContain("Comment");
		expect(names).toHaveLength(3);
	});
});

// =============================================================================
// Test: Simple Resolvers
// =============================================================================

describe("Simple resolvers", () => {
	it("resolve executes simple resolver", async () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
			},
		});

		const user = mockDb.users[0]; // John
		const posts = await resolvers.resolve<User, Post[]>("User", "posts", user);

		expect(posts).toHaveLength(2);
		expect(posts?.[0].title).toBe("Hello");
		expect(posts?.[1].title).toBe("Foo");
	});

	it("resolve executes async resolver", async () => {
		const resolvers = entityResolvers({
			User: {
				posts: async (user: User) => {
					// Simulate async operation
					await new Promise((r) => setTimeout(r, 1));
					return mockDb.posts.filter((p) => p.authorId === user.id);
				},
			},
		});

		const user = mockDb.users[0];
		const posts = await resolvers.resolve<User, Post[]>("User", "posts", user);

		expect(posts).toHaveLength(2);
	});

	it("resolve returns undefined for non-existent resolver", async () => {
		const resolvers = entityResolvers({
			User: { posts: () => [] },
		});

		const result = await resolvers.resolve("User", "comments", mockDb.users[0]);
		expect(result).toBeUndefined();

		const result2 = await resolvers.resolve("Post", "author", { id: "p1" });
		expect(result2).toBeUndefined();
	});
});

// =============================================================================
// Test: Batch Resolvers
// =============================================================================

describe("Batch resolvers", () => {
	it("resolveBatch executes batch resolver", async () => {
		let batchCallCount = 0;

		const resolvers = entityResolvers({
			Post: {
				author: {
					batch: async (posts: Post[]) => {
						batchCallCount++;
						const authorIds = [...new Set(posts.map((p) => p.authorId))];
						const authors = mockDb.users.filter((u) => authorIds.includes(u.id));
						const authorMap = new Map(authors.map((a) => [a.id, a]));
						return posts.map((p) => authorMap.get(p.authorId)!);
					},
				},
			},
		});

		const posts = mockDb.posts.slice(0, 2); // First two posts (same author)
		const authors = await resolvers.resolveBatch<Post, User>("Post", "author", posts);

		expect(authors).toHaveLength(2);
		expect(authors?.[0].name).toBe("John");
		expect(authors?.[1].name).toBe("John");
		expect(batchCallCount).toBe(1); // Only one batch call!
	});

	it("resolve uses batch resolver for single item", async () => {
		const resolvers = entityResolvers({
			Post: {
				author: {
					batch: async (posts: Post[]) => {
						const authorIds = [...new Set(posts.map((p) => p.authorId))];
						const authors = mockDb.users.filter((u) => authorIds.includes(u.id));
						const authorMap = new Map(authors.map((a) => [a.id, a]));
						return posts.map((p) => authorMap.get(p.authorId)!);
					},
				},
			},
		});

		const post = mockDb.posts[0];
		const author = await resolvers.resolve<Post, User>("Post", "author", post);

		expect(author?.name).toBe("John");
	});

	it("resolveBatch falls back to individual calls for non-batch resolver", async () => {
		let callCount = 0;

		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => {
					callCount++;
					return mockDb.posts.filter((p) => p.authorId === user.id);
				},
			},
		});

		const users = mockDb.users;
		const postsPerUser = await resolvers.resolveBatch<User, Post[]>("User", "posts", users);

		expect(postsPerUser).toHaveLength(2);
		expect(postsPerUser?.[0]).toHaveLength(2); // John has 2 posts
		expect(postsPerUser?.[1]).toHaveLength(1); // Jane has 1 post
		expect(callCount).toBe(2); // Called once per user
	});
});

// =============================================================================
// Test: isBatchResolver
// =============================================================================

describe("isBatchResolver()", () => {
	it("returns true for batch resolver", () => {
		const batchResolver = { batch: (items: unknown[]) => items };
		expect(isBatchResolver(batchResolver)).toBe(true);
	});

	it("returns false for simple resolver", () => {
		const simpleResolver = (item: unknown) => item;
		expect(isBatchResolver(simpleResolver)).toBe(false);
	});

	it("returns false for null/undefined", () => {
		expect(isBatchResolver(null as any)).toBe(false);
		expect(isBatchResolver(undefined as any)).toBe(false);
	});
});

// =============================================================================
// Test: isEntityResolvers
// =============================================================================

describe("isEntityResolvers()", () => {
	it("returns true for EntityResolvers instance", () => {
		const resolvers = entityResolvers({
			User: { posts: () => [] },
		});

		expect(isEntityResolvers(resolvers)).toBe(true);
	});

	it("returns false for non-EntityResolvers", () => {
		expect(isEntityResolvers({})).toBe(false);
		expect(isEntityResolvers(null)).toBe(false);
		expect(isEntityResolvers({ definitions: {} })).toBe(false);
	});
});

// =============================================================================
// Test: Complex Scenarios
// =============================================================================

describe("Complex scenarios", () => {
	it("handles multiple entities with multiple resolvers", async () => {
		const resolvers = entityResolvers({
			User: {
				posts: (user: User) => mockDb.posts.filter((p) => p.authorId === user.id),
				comments: (user: User) => mockDb.comments.filter((c) => c.authorId === user.id),
			},
			Post: {
				author: {
					batch: async (posts: Post[]) => {
						const authorIds = [...new Set(posts.map((p) => p.authorId))];
						const authors = mockDb.users.filter((u) => authorIds.includes(u.id));
						const authorMap = new Map(authors.map((a) => [a.id, a]));
						return posts.map((p) => authorMap.get(p.authorId)!);
					},
				},
				comments: (post: Post) => mockDb.comments.filter((c) => c.postId === post.id),
			},
			Comment: {
				author: {
					batch: async (comments: Comment[]) => {
						const authorIds = [...new Set(comments.map((c) => c.authorId))];
						const authors = mockDb.users.filter((u) => authorIds.includes(u.id));
						const authorMap = new Map(authors.map((a) => [a.id, a]));
						return comments.map((c) => authorMap.get(c.authorId)!);
					},
				},
				post: {
					batch: async (comments: Comment[]) => {
						const postIds = [...new Set(comments.map((c) => c.postId))];
						const posts = mockDb.posts.filter((p) => postIds.includes(p.id));
						const postMap = new Map(posts.map((p) => [p.id, p]));
						return comments.map((c) => postMap.get(c.postId)!);
					},
				},
			},
		});

		// User.posts
		const userPosts = await resolvers.resolve<User, Post[]>("User", "posts", mockDb.users[0]);
		expect(userPosts).toHaveLength(2);

		// Post.author (batch)
		const postAuthors = await resolvers.resolveBatch<Post, User>("Post", "author", mockDb.posts);
		expect(postAuthors).toHaveLength(3);
		expect(postAuthors?.[0].name).toBe("John");
		expect(postAuthors?.[2].name).toBe("Jane");

		// Post.comments
		const postComments = await resolvers.resolve<Post, Comment[]>(
			"Post",
			"comments",
			mockDb.posts[0],
		);
		expect(postComments).toHaveLength(2);

		// Comment.author (batch)
		const commentAuthors = await resolvers.resolveBatch<Comment, User>(
			"Comment",
			"author",
			mockDb.comments,
		);
		expect(commentAuthors).toHaveLength(2);
	});
});
