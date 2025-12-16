/**
 * V2 Complete Example - Server
 *
 * Demonstrates:
 * - lens<AppContext>() factory for typed builders
 * - Model definitions (scalar fields only - schema is SSOT)
 * - resolver() pattern with pure values (functional)
 * - Field arguments with .args(schema).resolve(({ source, args, ctx }) => ...)
 * - Plain function resolvers for simple computed fields: ({ source, ctx }) => ...
 */

import { model, id, string, boolean, datetime, enumType, nullable, router, lens } from "@sylphx/lens-core";
import { entity as e, temp, ref, now, branch } from "@sylphx/reify";
// Note: `e` is the Reify entity helper, `model` is the Lens model definition builder
import { createApp, createHandler, optimisticPlugin } from "@sylphx/lens-server";
import { z } from "zod";

// =============================================================================
// Models (scalar fields only - no circular reference issues)
// =============================================================================

export const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
	role: enumType(["user", "admin", "vip"]),
	avatar: nullable(string()),
	createdAt: datetime(),
});

export const Post = model("Post", {
	id: id(),
	title: string(),
	content: string(),
	published: boolean(),
	authorId: string(),  // FK to User
	updatedAt: nullable(datetime()),
	createdAt: datetime(),
});

export const Comment = model("Comment", {
	id: id(),
	content: string(),
	postId: string(),    // FK to Post
	authorId: string(),  // FK to User
	createdAt: datetime(),
});

// For UDSL demo
export const Session = model("Session", {
	id: id(),
	title: string(),
	userId: string(),
	createdAt: datetime(),
});

export const Message = model("Message", {
	id: id(),
	sessionId: string(),
	role: enumType(["user", "assistant"]),
	content: string(),
	createdAt: datetime(),
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
	sessions: new Map<string, { id: string; title: string; userId: string; createdAt: Date }>(),
	messages: new Map<string, { id: string; sessionId: string; role: "user" | "assistant"; content: string; createdAt: Date }>(),
};

// =============================================================================
// Typed Builders (functional pattern - define context once)
// =============================================================================

// Use .withPlugins() pattern for correct TypeScript inference
// (explicit type param + inline plugins doesn't infer correctly)
const { query, mutation, resolver, plugins } = lens<AppContext>().withPlugins([
	optimisticPlugin(),
]);

// =============================================================================
// Field Resolvers (pure values - no mutable registry)
// =============================================================================

// User resolver - defines which fields are exposed and how relations are resolved
const userResolver = resolver(User, (t) => ({
	id: t.expose("id"),
	name: t.expose("name"),
	email: t.expose("email"),
	role: t.expose("role"),
	avatar: t.expose("avatar"),
	createdAt: t.expose("createdAt"),
	// Relation with field arguments (GraphQL-style)
	// New API: use t.args().resolve() without type annotations
	posts: t
		.args(
			z.object({
				first: z.number().default(10),
				published: z.boolean().optional(),
			}),
		)
		.resolve(({ source, args, ctx }) => {
			let posts = Array.from(ctx.db.posts.values()).filter((p) => p.authorId === source.id);
			if (args.published !== undefined) {
				posts = posts.filter((p) => p.published === args.published);
			}
			return posts.slice(0, args.first);
		}),
	// Relation with limit arg
	comments: t
		.args(z.object({ first: z.number().default(10) }))
		.resolve(({ source, args, ctx }) =>
			Array.from(ctx.db.comments.values())
				.filter((c) => c.authorId === source.id)
				.slice(0, args.first)
		),
}));

// Post resolver
const postResolver = resolver(Post, (t) => ({
	id: t.expose("id"),
	title: t.expose("title"),
	content: t.expose("content"),
	published: t.expose("published"),
	updatedAt: t.expose("updatedAt"),
	createdAt: t.expose("createdAt"),
	// Computed field with args - use t.args().resolve() without type annotations
	excerpt: t
		.args(z.object({ length: z.number().default(100) }))
		.resolve(({ source, args }) => {
			const text = source.content;
			if (text.length <= args.length) return text;
			return text.slice(0, args.length) + "...";
		}),
	// Relation: Post.author (belongsTo - FK on Post) - plain function resolver
	author: ({ source, ctx }) => {
		const author = ctx.db.users.get(source.authorId);
		if (!author) throw new Error(`Author not found: ${source.authorId}`);
		return author;
	},
	// Relation with field arguments
	comments: t
		.args(z.object({ first: z.number().default(10) }))
		.resolve(({ source, args, ctx }) =>
			Array.from(ctx.db.comments.values())
				.filter((c) => c.postId === source.id)
				.slice(0, args.first)
		),
}));

// Comment resolver
const commentResolver = resolver(Comment, (t) => ({
	id: t.expose("id"),
	content: t.expose("content"),
	createdAt: t.expose("createdAt"),
	// Relation: Comment.author (belongsTo - FK on Comment) - plain function resolver
	author: ({ source, ctx }) => {
		const author = ctx.db.users.get(source.authorId);
		if (!author) throw new Error(`Author not found: ${source.authorId}`);
		return author;
	},
	// Relation: Comment.post (belongsTo - FK on Comment) - plain function resolver
	post: ({ source, ctx }) => {
		const post = ctx.db.posts.get(source.postId);
		if (!post) throw new Error(`Post not found: ${source.postId}`);
		return post;
	},
}));

// =============================================================================
// Operations (context type inferred from lens())
// =============================================================================

const userRouter = router({
	whoami: query()
		.returns(User)
		.resolve(({ ctx }) => {
			if (!ctx.currentUser) throw new Error("Not authenticated");
			return ctx.currentUser;
		}),

	get: query()
		.input(z.object({ id: z.string() }))
		.returns(User)
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error("User not found");
			return user;
		}),

	search: query()
		.input(z.object({ query: z.string(), limit: z.number().optional() }))
		.returns([User])
		.resolve(({ input, ctx }) => {
			const results = Array.from(ctx.db.users.values()).filter((u) =>
				u.name.toLowerCase().includes(input.query.toLowerCase()),
			);
			return input.limit ? results.slice(0, input.limit) : results;
		}),

	update: mutation()
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
			const updated = {
				...user,
				...(input.name && { name: input.name }),
				...(input.email && { email: input.email }),
				...(input.avatar && { avatar: input.avatar }),
			};
			ctx.db.users.set(input.id, updated);
			return updated;
		}),

	bulkPromote: mutation()
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
	get: query()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			return post;
		}),

	trending: query()
		.input(z.object({ limit: z.number().default(10) }))
		.returns([Post])
		.resolve(({ input, ctx }) => {
			const posts = Array.from(ctx.db.posts.values())
				.filter((p) => p.published)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			return posts.slice(0, input.limit);
		}),

	create: mutation()
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

	update: mutation()
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
			const updated = {
				...post,
				...(input.title && { title: input.title }),
				...(input.content && { content: input.content }),
				updatedAt: new Date(),
			};
			ctx.db.posts.set(input.id, updated);
			return updated;
		}),

	publish: mutation()
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
	add: mutation()
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
// Reify Demo: Chat Router
// =============================================================================

const chatRouter = router({
	/**
	 * Send message to chat session
	 *
	 * Uses Reify Pipeline for optimistic updates:
	 * - Client executes pipeline against cache for instant feedback
	 * - Server executes same pipeline against Prisma for persistence
	 *
	 * Callback pattern with automatic type inference!
	 * The `input` parameter is fully typed from .input() schema.
	 */
	send: mutation()
		.input(z.object({
			sessionId: z.string().optional(),  // Optional: create new if not provided
			title: z.string().optional(),
			content: z.string(),
			userId: z.string(),
		}))
		.returns(Message)
		// Callback with typed input AND typed entity operations!
		.optimistic(({ input }) => [
			// Step 1: Create or update session
			// TypeScript knows: input.sessionId is string | undefined
			branch(input.sessionId)
				.then(e.update(Session, { id: input.sessionId!, title: input.title ?? "Chat" }))
				.else(e.create(Session, {
					id: temp(),
					title: input.title ?? "New Chat",
					userId: input.userId,  // TypeScript knows: string
					createdAt: now(),
				}))
				.as("session"),

			// Step 2: Create message (references session from step 1)
			// e.create(Message, {...}) is fully type-checked!
			e.create(Message, {
				id: temp(),
				sessionId: ref("session").id,
				role: "user",           // TypeScript knows: "user" | "assistant"
				content: input.content, // TypeScript knows: string
				createdAt: now(),
			}).as("message"),
		])
		.resolve(({ input, ctx }) => {
			// Server-side execution (in real app, this would use Prisma)
			let sessionId = input.sessionId;

			// Create session if needed
			if (!sessionId) {
				sessionId = String(ctx.db.sessions.size + 1);
				ctx.db.sessions.set(sessionId, {
					id: sessionId,
					title: input.title ?? "New Chat",
					userId: input.userId,
					createdAt: new Date(),
				});
			}

			// Create message
			const messageId = String(ctx.db.messages.size + 1);
			const message = {
				id: messageId,
				sessionId,
				role: "user" as const,
				content: input.content,
				createdAt: new Date(),
			};
			ctx.db.messages.set(messageId, message);
			return message;
		}),
});

// =============================================================================
// Main Router
// =============================================================================

const appRouter = router({
	user: userRouter,
	post: postRouter,
	comment: commentRouter,
	chat: chatRouter,  // UDSL demo
});

export type AppRouter = typeof appRouter;

// =============================================================================
// Server (accepts resolver array - functional pattern)
// =============================================================================

export const app = createApp({
	router: appRouter,
	entities: { User, Post, Comment, Session, Message },
	resolvers: [userResolver, postResolver, commentResolver],  // Array of pure values
	plugins,  // From lens({ plugins })
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

if (import.meta.main) {
	const PORT = 3000;
	const handler = createHandler(app);

	Bun.serve({
		port: PORT,
		fetch: handler,
	});

	console.log(`
Lens Server running on http://localhost:${PORT}

Endpoints:
  POST /              → queries & mutations
  GET /__lens/sse     → SSE subscriptions
  GET /__lens/metadata → server metadata

Routes:
  user.whoami, user.get, user.search, user.update, user.bulkPromote
  post.get, post.trending, post.create, post.update, post.publish
  comment.add
  chat.send (Reify Pipeline with typed callback)
`);
}
