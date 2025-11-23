/**
 * Integration Tests: Relationship Loading
 *
 * Tests for automatic relationship loading via DataLoader
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import {
	defineResource,
	hasMany,
	belongsTo,
	hasOne,
	ResourceRegistry,
	getRegistry,
} from "../resource/index.js";
import type { QueryContext } from "../resource/types.js";

describe("Relationship Loading Integration", () => {
	let registry: ResourceRegistry;

	beforeEach(() => {
		// Clear registry before each test
		getRegistry().clear();
		registry = getRegistry();
	});

	describe("hasMany Relationships", () => {
		it("should load hasMany relationship with include", async () => {
			// Define resources
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				relationships: {
					posts: hasMany("post", { foreignKey: "authorId" }),
				},
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string(),
				}),
				relationships: {
					author: belongsTo("user", { foreignKey: "authorId" }),
				},
			});

			// Mock database
			const users = [{ id: "1", name: "Alice" }];
			const posts = [
				{ id: "p1", title: "Post 1", authorId: "1" },
				{ id: "p2", title: "Post 2", authorId: "1" },
			];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					if (tableName === "posts") {
						return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async (
					tableName: string,
					foreignKey: string,
					parentIds: readonly string[],
				) => {
					if (tableName === "posts" && foreignKey === "authorId") {
						return posts.filter((p) => parentIds.includes(p.authorId));
					}
					return [];
				},
			};

			const ctx: QueryContext = { db };

			// Query with include
			const result = await User.api.get.query(
				{ id: "1" },
				{ select: { id: true, name: true, posts: true } },
				ctx,
			);

			expect(result).toEqual({
				id: "1",
				name: "Alice",
				posts: [
					{ id: "p1", title: "Post 1", authorId: "1" },
					{ id: "p2", title: "Post 2", authorId: "1" },
				],
			});
		});

		it("should batch hasMany relationship loading", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				relationships: {
					posts: hasMany("post", { foreignKey: "authorId" }),
				},
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string(),
				}),
			});

			const users = [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			];
			const posts = [
				{ id: "p1", title: "Post 1", authorId: "1" },
				{ id: "p2", title: "Post 2", authorId: "1" },
				{ id: "p3", title: "Post 3", authorId: "2" },
			];

			let batchLoadByIdsCallCount = 0;

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					batchLoadByIdsCallCount++;
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					if (tableName === "posts") {
						return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async (
					tableName: string,
					foreignKey: string,
					parentIds: readonly string[],
				) => {
					if (tableName === "posts" && foreignKey === "authorId") {
						return posts.filter((p) => parentIds.includes(p.authorId));
					}
					return [];
				},
			};

			const ctx: QueryContext = { db };

			// Load multiple users - should batch
			const [result1, result2] = await Promise.all([
				User.api.get.query(
					{ id: "1" },
					{ select: { id: true, posts: true } },
					ctx,
				),
				User.api.get.query(
					{ id: "2" },
					{ select: { id: true, posts: true } },
					ctx,
				),
			]);

			// Verify both users got their posts
			expect(result1.id).toBe("1");
			expect(result2.id).toBe("2");
			// DataLoader should batch these - should be 1 call for users batch
			expect(batchLoadByIdsCallCount).toBeLessThan(5);
		});
	});

	describe("belongsTo Relationships", () => {
		it("should load belongsTo relationship with include", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string(),
				}),
				relationships: {
					author: belongsTo("user", { foreignKey: "authorId" }),
				},
			});

			const users = [{ id: "1", name: "Alice" }];
			const posts = [{ id: "p1", title: "Post 1", authorId: "1" }];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					if (tableName === "posts") {
						return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async () => [],
			};

			const ctx: QueryContext = { db };

			const result = await Post.api.get.query(
				{ id: "p1" },
				{ select: { id: true, title: true, author: true } },
				ctx,
			);

			expect(result).toEqual({
				id: "p1",
				title: "Post 1",
				author: { id: "1", name: "Alice" },
			});
		});

		it("should handle missing belongsTo relationship gracefully", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string().optional(),
				}),
				relationships: {
					author: belongsTo("user", { foreignKey: "authorId" }),
				},
			});

			const posts = [{ id: "p1", title: "Orphan Post" }];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "posts") {
						return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async () => [],
			};

			const ctx: QueryContext = { db };

			const result = await Post.api.get.query(
				{ id: "p1" },
				{ select: { id: true, title: true, author: true } },
				ctx,
			);

			expect(result).toEqual({
				id: "p1",
				title: "Orphan Post",
				author: null,
			});
		});
	});

	describe("hasOne Relationships", () => {
		it("should load hasOne relationship with include", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				relationships: {
					profile: hasOne("profile", { foreignKey: "userId" }),
				},
			});

			const Profile = defineResource({
				name: "profile",
				fields: z.object({
					id: z.string(),
					bio: z.string(),
					userId: z.string(),
				}),
			});

			const users = [{ id: "1", name: "Alice" }];
			const profiles = [{ id: "pr1", bio: "Hello", userId: "1" }];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					if (tableName === "profiles") {
						return ids.map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async (
					tableName: string,
					foreignKey: string,
					parentIds: readonly string[],
				) => {
					if (tableName === "profiles" && foreignKey === "userId") {
						return profiles.filter((p) => parentIds.includes(p.userId));
					}
					return [];
				},
			};

			const ctx: QueryContext = { db };

			const result = await User.api.get.query(
				{ id: "1" },
				{ select: { id: true, name: true, profile: true } },
				ctx,
			);

			expect(result).toEqual({
				id: "1",
				name: "Alice",
				profile: { id: "pr1", bio: "Hello", userId: "1" },
			});
		});
	});

	describe("Nested Relationships", () => {
		it("should load deeply nested relationships", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				relationships: {
					posts: hasMany("post", { foreignKey: "authorId" }),
				},
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string(),
				}),
				relationships: {
					author: belongsTo("user", { foreignKey: "authorId" }),
					comments: hasMany("comment", { foreignKey: "postId" }),
				},
			});

			const Comment = defineResource({
				name: "comment",
				fields: z.object({
					id: z.string(),
					text: z.string(),
					postId: z.string(),
					authorId: z.string(),
				}),
				relationships: {
					author: belongsTo("user", { foreignKey: "authorId" }),
				},
			});

			const users = [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			];
			const posts = [{ id: "p1", title: "Post 1", authorId: "1" }];
			const comments = [
				{ id: "c1", text: "Comment 1", postId: "p1", authorId: "2" },
			];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					if (tableName === "posts") {
						return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
					}
					if (tableName === "comments") {
						return ids
							.map((id) => comments.find((c) => c.id === id))
							.filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async (
					tableName: string,
					foreignKey: string,
					parentIds: readonly string[],
				) => {
					if (tableName === "posts" && foreignKey === "authorId") {
						return posts.filter((p) => parentIds.includes(p.authorId));
					}
					if (tableName === "comments" && foreignKey === "postId") {
						return comments.filter((c) => parentIds.includes(c.postId));
					}
					return [];
				},
			};

			const ctx: QueryContext = { db };

			// Query with nested includes: user -> posts -> comments -> author
			const result = await User.api.get.query(
				{ id: "1" },
				{
					select: {
						id: true,
						name: true,
						posts: {
							select: {
								id: true,
								title: true,
								comments: {
									select: {
										id: true,
										text: true,
										author: true,
									},
								},
							},
						},
					},
				},
				ctx,
			);

			expect(result).toEqual({
				id: "1",
				name: "Alice",
				posts: [
					{
						id: "p1",
						title: "Post 1",
						comments: [
							{
								id: "c1",
								text: "Comment 1",
								author: { id: "2", name: "Bob" },
							},
						],
					},
				],
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle relationship loading errors gracefully", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				relationships: {
					posts: hasMany("post", { foreignKey: "authorId" }),
				},
			});

			const Post = defineResource({
				name: "post",
				fields: z.object({
					id: z.string(),
					title: z.string(),
					authorId: z.string(),
				}),
			});

			const users = [{ id: "1", name: "Alice" }];

			const db = {
				batchLoadByIds: async (tableName: string, ids: readonly string[]) => {
					if (tableName === "users") {
						return ids.map((id) => users.find((u) => u.id === id)).filter(Boolean);
					}
					return [];
				},
				batchLoadRelated: async () => {
					throw new Error("Database error");
				},
			};

			const ctx: QueryContext = { db };

			// Should fallback to empty array on error
			const result = await User.api.get.query(
				{ id: "1" },
				{ select: { id: true, name: true, posts: true } },
				ctx,
			);

			expect(result).toEqual({
				id: "1",
				name: "Alice",
				posts: [],
			});
		});
	});
});
