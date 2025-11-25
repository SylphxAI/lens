/**
 * V2 Complete Example - Operations
 *
 * Demonstrates: Queries, Mutations, Optimistic Updates
 *
 * Key concept: Operations are free-form, not locked to CRUD!
 * - whoami, searchUsers, promoteBatch (not just User.get/list/create)
 *
 * Optimistic Updates (simple DSL):
 * - 'merge'                     → UPDATE: merge input into entity
 * - 'create'                    → CREATE: auto tempId
 * - 'delete'                    → DELETE: mark deleted
 * - { merge: { field: value } } → UPDATE + set extra fields
 * - { updateMany: {...} }       → Cross-entity updates
 *
 * Future: Could auto-derive from naming convention:
 * - updateX → merge
 * - createX → create
 * - deleteX → delete
 */

import { query, mutation } from "@lens/core";
import { z } from "zod";
import { User, Post, Comment } from "./schema";

// =============================================================================
// Queries - 讀取資料
// =============================================================================

/**
 * 取得當前用戶 (no input needed)
 */
export const whoami = query()
	.returns(User)
	.resolve(({ ctx }) => ctx.currentUser);

/**
 * 取得單一用戶
 */
export const getUser = query()
	.input(z.object({ id: z.string() }))
	.returns(User)
	.resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }));

/**
 * 搜尋用戶 (free-form operation, 唔係 CRUD)
 */
export const searchUsers = query()
	.input(z.object({ query: z.string(), limit: z.number().optional() }))
	.returns([User])
	.resolve(({ input, ctx }) =>
		ctx.db.user.findMany({
			where: { name: { contains: input.query } },
			take: input.limit ?? 10,
		})
	);

/**
 * 取得單一文章 (with nested author)
 */
export const getPost = query()
	.input(z.object({ id: z.string() }))
	.returns(Post)
	.resolve(({ input, ctx }) => ctx.db.post.findUnique({ where: { id: input.id } }));

/**
 * 取得熱門文章
 */
export const trendingPosts = query()
	.input(z.object({ limit: z.number().default(10) }))
	.returns([Post])
	.resolve(({ input, ctx }) =>
		ctx.db.post.findMany({
			where: { published: true },
			orderBy: { createdAt: "desc" },
			take: input.limit,
		})
	);

// =============================================================================
// Mutations - 修改資料 (with Optimistic Updates)
// =============================================================================

/**
 * 更新用戶資料
 *
 * .optimistic('merge') - 將 input merge 入 entity
 */
export const updateUser = mutation()
	.input(
		z.object({
			id: z.string(),
			name: z.string().optional(),
			email: z.string().optional(),
			avatar: z.string().optional(),
		})
	)
	.returns(User)
	.optimistic("merge")
	.resolve(({ input, ctx }) =>
		ctx.db.user.update({
			where: { id: input.id },
			data: input,
		})
	);

/**
 * 建立新文章
 *
 * .optimistic('create') - 自動生成 tempId
 */
export const createPost = mutation()
	.input(
		z.object({
			title: z.string(),
			content: z.string(),
		})
	)
	.returns(Post)
	.optimistic({ create: { published: false } })
	.resolve(({ input, ctx }) =>
		ctx.db.post.create({
			data: {
				...input,
				authorId: ctx.currentUser.id,
			},
		})
	);

/**
 * 更新文章
 */
export const updatePost = mutation()
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			content: z.string().optional(),
		})
	)
	.returns(Post)
	.optimistic("merge")
	.resolve(({ input, ctx }) =>
		ctx.db.post.update({
			where: { id: input.id },
			data: { ...input, updatedAt: new Date() },
		})
	);

/**
 * 發佈文章
 *
 * { merge: { published: true } } - merge + 額外設定 field
 */
export const publishPost = mutation()
	.input(z.object({ id: z.string() }))
	.returns(Post)
	.optimistic({ merge: { published: true } })
	.resolve(({ input, ctx }) =>
		ctx.db.post.update({
			where: { id: input.id },
			data: { published: true, updatedAt: new Date() },
		})
	);

/**
 * 批量升級用戶角色 (跨 entity optimistic update)
 *
 * { updateMany: {...} } - 一次更新多個 entities
 * $ prefix 代表 reference input field
 */
export const bulkPromoteUsers = mutation()
	.input(
		z.object({
			userIds: z.array(z.string()),
			newRole: z.enum(["user", "admin", "vip"]),
		})
	)
	.returns({
		users: [User],
		count: z.number(),
	})
	.optimistic({
		updateMany: {
			entity: "User",
			ids: "$userIds",
			set: { role: "$newRole" },
		},
	})
	.resolve(async ({ input, ctx }) => {
		const users = await ctx.db.user.updateMany({
			where: { id: { in: input.userIds } },
			data: { role: input.newRole },
		});

		return {
			users: await ctx.db.user.findMany({
				where: { id: { in: input.userIds } },
			}),
			count: users.count,
		};
	});

/**
 * 添加留言
 */
export const addComment = mutation()
	.input(
		z.object({
			postId: z.string(),
			content: z.string(),
		})
	)
	.returns(Comment)
	.optimistic("create")
	.resolve(({ input, ctx }) =>
		ctx.db.comment.create({
			data: {
				...input,
				authorId: ctx.currentUser.id,
			},
		})
	);

// =============================================================================
// Export all operations
// =============================================================================

export const queries = {
	whoami,
	getUser,
	searchUsers,
	getPost,
	trendingPosts,
};

export const mutations = {
	updateUser,
	createPost,
	updatePost,
	publishPost,
	bulkPromoteUsers,
	addComment,
};
