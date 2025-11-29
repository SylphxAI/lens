/**
 * V2 Complete Example - Server
 *
 * Demonstrates:
 * - Entity definitions (scalar fields only)
 * - resolver() pattern with field builder
 * - Field arguments with .args(schema).resolve((parent, args, ctx) => ...)
 * - Relations with f.one() and f.many()
 */

import { entity, t, query, mutation, router, createResolverRegistry } from "@sylphx/lens-core";
import { createServer } from "@sylphx/lens-server";
import { z } from "zod";

// =============================================================================
// Entities (scalar fields only - no circular reference issues)
// =============================================================================

export const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	role: t.enum(["user", "admin", "vip"]),
	avatar: t.string().optional(),
	createdAt: t.date(),
});

export const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
	authorId: t.string(),  // FK to User
	updatedAt: t.date().optional(),
	createdAt: t.date(),
});

export const Comment = entity("Comment", {
	id: t.id(),
	content: t.string(),
	postId: t.string(),    // FK to Post
	authorId: t.string(),  // FK to User
	createdAt: t.date(),
});

// =============================================================================
// Context
// =============================================================================

interface AppContext {
	db: typeof db;
	currentUser: (typeof db.users extends Map<string, infer V> ? V : never) | null;
	requestId: string;
}

// =============================================================================
// In-memory "database"
// =============================================================================

const db = {
	users: new Map([
		["1", { id: "1", name: "Alice", email: "alice@test.com", role: "admin" as const, createdAt: new Date() }],
		["2", { id: "2", name: "Bob", email: "bob@test.com", role: "user" as const, createdAt: new Date() }],
		["3", { id: "3", name: "Charlie", email: "charlie@test.com", role: "vip" as const, createdAt: new Date() }],
	]),
	posts: new Map([
		["1", { id: "1", title: "Hello World", content: "First post!", published: true, authorId: "1", createdAt: new Date() }],
		["2", { id: "2", title: "Lens Guide", content: "How to use Lens...", published: true, authorId: "1", createdAt: new Date() }],
	]),
	comments: new Map<string, { id: string; content: string; postId: string; authorId: string; createdAt: Date }>(),
};

// =============================================================================
// Field Resolvers (new resolver() pattern)
// =============================================================================

const resolvers = createResolverRegistry<AppContext>();

// User resolver - defines which fields are exposed and how relations are resolved
resolvers.add(User, (f) => ({
	id: f.expose("id"),
	name: f.expose("name"),
	email: f.expose("email"),
	role: f.expose("role"),
	avatar: f.expose("avatar"),
	createdAt: f.expose("createdAt"),
	// Relation with field arguments (GraphQL-style)
	posts: f
		.many(Post)
		.args(
			z.object({
				first: z.number().default(10),
				published: z.boolean().optional(),
			}),
		)
		.resolve(({ parent, args, ctx }) => {
			let posts = Array.from(ctx.db.posts.values()).filter((p) => p.authorId === parent.id);
			if (args.published !== undefined) {
				posts = posts.filter((p) => p.published === args.published);
			}
			return posts.slice(0, args.first);
		}),
	// Relation with limit arg
	comments: f
		.many(Comment)
		.args(z.object({ first: z.number().default(10) }))
		.resolve(({ parent, args, ctx }) =>
			Array.from(ctx.db.comments.values())
				.filter((c) => c.authorId === parent.id)
				.slice(0, args.first)
		),
}));

// Post resolver
resolvers.add(Post, (f) => ({
	id: f.expose("id"),
	title: f.expose("title"),
	content: f.expose("content"),
	published: f.expose("published"),
	updatedAt: f.expose("updatedAt"),
	createdAt: f.expose("createdAt"),
	// Computed field with args
	excerpt: f
		.string()
		.args(z.object({ length: z.number().default(100) }))
		.resolve(({ parent, args }) => {
			const text = parent.content;
			if (text.length <= args.length) return text;
			return text.slice(0, args.length) + "...";
		}),
	// Relation: Post.author (belongsTo - FK on Post)
	author: f.one(User).resolve(({ parent, ctx }) => {
		const author = ctx.db.users.get(parent.authorId);
		if (!author) throw new Error(`Author not found: ${parent.authorId}`);
		return author;
	}),
	// Relation with field arguments
	comments: f
		.many(Comment)
		.args(z.object({ first: z.number().default(10) }))
		.resolve(({ parent, args, ctx }) =>
			Array.from(ctx.db.comments.values())
				.filter((c) => c.postId === parent.id)
				.slice(0, args.first)
		),
}));

// Comment resolver
resolvers.add(Comment, (f) => ({
	id: f.expose("id"),
	content: f.expose("content"),
	createdAt: f.expose("createdAt"),
	// Relation: Comment.author (belongsTo - FK on Comment)
	author: f.one(User).resolve(({ parent, ctx }) => {
		const author = ctx.db.users.get(parent.authorId);
		if (!author) throw new Error(`Author not found: ${parent.authorId}`);
		return author;
	}),
	// Relation: Comment.post (belongsTo - FK on Comment)
	post: f.one(Post).resolve(({ parent, ctx }) => {
		const post = ctx.db.posts.get(parent.postId);
		if (!post) throw new Error(`Post not found: ${parent.postId}`);
		return post;
	}),
}));

// =============================================================================
// Operations
// =============================================================================

const userRouter = router({
	whoami: query<AppContext>()
		.returns(User)
		.resolve(({ ctx }) => ctx.currentUser),

	get: query<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(User)
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error("User not found");
			return user;
		}),

	search: query<AppContext>()
		.input(z.object({ query: z.string(), limit: z.number().optional() }))
		.returns([User])
		.resolve(({ input, ctx }) => {
			const results = Array.from(ctx.db.users.values()).filter((u) =>
				u.name.toLowerCase().includes(input.query.toLowerCase()),
			);
			return input.limit ? results.slice(0, input.limit) : results;
		}),

	update: mutation<AppContext>()
		.input(z.object({
			id: z.string(),
			name: z.string().optional(),
			email: z.string().optional(),
			avatar: z.string().optional(),
		}))
		.returns(User)
		.optimistic("merge")
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error("User not found");
			const updated = { ...user, ...input };
			ctx.db.users.set(input.id, updated);
			return updated;
		}),

	bulkPromote: mutation<AppContext>()
		.input(z.object({
			userIds: z.array(z.string()),
			newRole: z.enum(["user", "admin", "vip"]),
		}))
		.resolve(({ input, ctx }) => {
			let count = 0;
			for (const id of input.userIds) {
				const user = ctx.db.users.get(id);
				if (user) {
					ctx.db.users.set(id, { ...user, role: input.newRole });
					count++;
				}
			}
			return { count };
		}),
});

const postRouter = router({
	get: query<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			return post;
		}),

	trending: query<AppContext>()
		.input(z.object({ limit: z.number().default(10) }))
		.returns([Post])
		.resolve(({ input, ctx }) => {
			const posts = Array.from(ctx.db.posts.values())
				.filter((p) => p.published)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			return posts.slice(0, input.limit);
		}),

	create: mutation<AppContext>()
		.input(z.object({ title: z.string(), content: z.string() }))
		.returns(Post)
		.optimistic("create")
		.resolve(({ input, ctx }) => {
			const id = String(ctx.db.posts.size + 1);
			const post = {
				id,
				...input,
				published: false,
				authorId: ctx.currentUser?.id ?? "unknown",
				createdAt: new Date(),
			};
			ctx.db.posts.set(id, post);
			return post;
		}),

	update: mutation<AppContext>()
		.input(z.object({
			id: z.string(),
			title: z.string().optional(),
			content: z.string().optional(),
		}))
		.returns(Post)
		.optimistic("merge")
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, ...input, updatedAt: new Date() };
			ctx.db.posts.set(input.id, updated);
			return updated;
		}),

	publish: mutation<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.optimistic({ merge: { published: true } })
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, published: true, updatedAt: new Date() };
			ctx.db.posts.set(input.id, updated);
			return updated;
		}),
});

const commentRouter = router({
	add: mutation<AppContext>()
		.input(z.object({ postId: z.string(), content: z.string() }))
		.returns(Comment)
		.optimistic("create")
		.resolve(({ input, ctx }) => {
			const id = String(ctx.db.comments.size + 1);
			const comment = {
				id,
				...input,
				authorId: ctx.currentUser?.id ?? "unknown",
				createdAt: new Date(),
			};
			ctx.db.comments.set(id, comment);
			return comment;
		}),
});

// =============================================================================
// Main Router
// =============================================================================

const appRouter = router({
	user: userRouter,
	post: postRouter,
	comment: commentRouter,
});

export type AppRouter = typeof appRouter;

// =============================================================================
// Server
// =============================================================================

export const server = createServer({
	router: appRouter,
	entities: { User, Post, Comment },
	resolvers,
	context: () => ({
		db,
		currentUser: db.users.get("1") ?? null,
		requestId: crypto.randomUUID(),
	}),
});

export { db };

// =============================================================================
// Start Server (when run directly)
// =============================================================================

const PORT = 3000;

server.listen(PORT).then(() => {
	console.log(`
🔭 Lens Server running on http://localhost:${PORT}

Routes:
  user.whoami, user.get, user.search, user.update, user.bulkPromote
  post.get, post.trending, post.create, post.update, post.publish
  comment.add
`);
});
