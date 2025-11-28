/**
 * V2 Complete Example - Server
 *
 * Demonstrates: Server setup with operations + type export for client
 */

import { type InferApi, createServer } from "@sylphx/lens-server";
import { mutations, queries } from "./operations";
import { Comment, Post, User, relations } from "./schema";

// =============================================================================
// Mock Database (use Prisma/Drizzle in production)
// =============================================================================

const db = {
	user: {
		data: new Map([
			[
				"1",
				{
					id: "1",
					name: "Alice",
					email: "alice@test.com",
					role: "admin" as const,
					createdAt: new Date(),
				},
			],
			[
				"2",
				{
					id: "2",
					name: "Bob",
					email: "bob@test.com",
					role: "user" as const,
					createdAt: new Date(),
				},
			],
			[
				"3",
				{
					id: "3",
					name: "Charlie",
					email: "charlie@test.com",
					role: "vip" as const,
					createdAt: new Date(),
				},
			],
		]),
		findUnique: async ({ where }: { where: { id: string } }) => db.user.data.get(where.id) ?? null,
		findMany: async ({ where, take }: { where?: any; take?: number }) => {
			let results = Array.from(db.user.data.values());
			if (where?.name?.contains) {
				results = results.filter((u) =>
					u.name.toLowerCase().includes(where.name.contains.toLowerCase()),
				);
			}
			if (where?.id?.in) {
				results = results.filter((u) => where.id.in.includes(u.id));
			}
			return take ? results.slice(0, take) : results;
		},
		update: async ({ where, data }: { where: { id: string }; data: any }) => {
			const user = db.user.data.get(where.id);
			if (!user) throw new Error("User not found");
			const updated = { ...user, ...data };
			db.user.data.set(where.id, updated);
			return updated;
		},
		updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: any }) => {
			let count = 0;
			for (const id of where.id.in) {
				const user = db.user.data.get(id);
				if (user) {
					db.user.data.set(id, { ...user, ...data });
					count++;
				}
			}
			return { count };
		},
	},
	post: {
		data: new Map([
			[
				"1",
				{
					id: "1",
					title: "Hello World",
					content: "First post!",
					published: true,
					authorId: "1",
					createdAt: new Date(),
				},
			],
			[
				"2",
				{
					id: "2",
					title: "Lens Guide",
					content: "How to use Lens...",
					published: true,
					authorId: "1",
					createdAt: new Date(),
				},
			],
		]),
		findUnique: async ({ where }: { where: { id: string } }) => db.post.data.get(where.id) ?? null,
		findMany: async ({ where, orderBy, take }: { where?: any; orderBy?: any; take?: number }) => {
			let results = Array.from(db.post.data.values());
			if (where?.published !== undefined) {
				results = results.filter((p) => p.published === where.published);
			}
			if (orderBy?.createdAt === "desc") {
				results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			}
			return take ? results.slice(0, take) : results;
		},
		create: async ({ data }: { data: any }) => {
			const id = String(db.post.data.size + 1);
			const post = { id, ...data, createdAt: new Date() };
			db.post.data.set(id, post);
			return post;
		},
		update: async ({ where, data }: { where: { id: string }; data: any }) => {
			const post = db.post.data.get(where.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, ...data };
			db.post.data.set(where.id, updated);
			return updated;
		},
	},
	comment: {
		data: new Map<string, any>(),
		create: async ({ data }: { data: any }) => {
			const id = String(db.comment.data.size + 1);
			const comment = { id, ...data, createdAt: new Date() };
			db.comment.data.set(id, comment);
			return comment;
		},
	},
};

// =============================================================================
// Entity Resolvers (for nested fields)
// =============================================================================

const entityResolvers = {
	User: {
		// Resolve User.posts relation
		posts: async (user: { id: string }) => {
			return Array.from(db.post.data.values()).filter((p) => p.authorId === user.id);
		},
	},
	Post: {
		// Resolve Post.author relation
		author: async (post: { authorId: string }) => {
			return db.user.data.get(post.authorId);
		},
	},
};

// =============================================================================
// Server Setup
// =============================================================================

const server = createServer({
	// Schema
	entities: { User, Post, Comment },
	relations,

	// Operations
	queries,
	mutations,

	// Entity resolvers for nested fields
	resolvers: entityResolvers,

	// Context factory - runs per request
	context: async (req) => {
		// In production: validate JWT, get user from session
		const userId =
			(req as { headers?: Record<string, string> })?.headers?.["x-user-id"] ?? "1";
		const currentUser = await db.user.findUnique({ where: { id: userId } });

		return {
			db,
			currentUser,
			requestId: crypto.randomUUID(),
		};
	},
});

// =============================================================================
// Export API Type (for client type inference)
// =============================================================================

/**
 * Client imports this TYPE (not runtime value) for type-safe API access
 *
 * Usage in client:
 * ```typescript
 * import type { Api } from './server';
 * const client = createClient<Api>({ transport: ws({ url: '...' }) });
 * ```
 */
export type Api = InferApi<typeof server>;

// =============================================================================
// Start Server
// =============================================================================

const PORT = 3000;

// Use server.listen() which handles HTTP + WebSocket
server.listen(PORT).then(() => {
	console.log(`
🔭 Lens Server running!

   HTTP:      http://localhost:${PORT}
   WebSocket: ws://localhost:${PORT}/ws

   Queries:   whoami, getUser, searchUsers, getPost, trendingPosts
   Mutations: updateUser, createPost, updatePost, publishPost, bulkPromoteUsers, addComment
`);
});
