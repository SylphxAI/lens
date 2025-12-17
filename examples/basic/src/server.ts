/**
 * Example Lens Server
 */
import { model, id, string, boolean, datetime, lens, router, list } from "@sylphx/lens-core";
import { createApp, optimisticPlugin } from "@sylphx/lens-server";
import { z } from "zod";

// =============================================================================
// Entities
// =============================================================================

export const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
	createdAt: datetime(),
});

export const Post = model("Post", {
	id: id(),
	title: string(),
	content: string(),
	published: boolean(),
	authorId: string(),
	createdAt: datetime(),
});

// =============================================================================
// Context
// =============================================================================

interface AppContext {
	currentUser: { id: string; name: string } | null;
}

// =============================================================================
// In-memory "database"
// =============================================================================

const db = {
	users: new Map<string, { id: string; name: string; email: string; createdAt: Date }>(),
	posts: new Map<string, { id: string; title: string; content: string; published: boolean; authorId: string; createdAt: Date }>(),
};

// Seed data
db.users.set("user-1", { id: "user-1", name: "Alice", email: "alice@example.com", createdAt: new Date() });
db.users.set("user-2", { id: "user-2", name: "Bob", email: "bob@example.com", createdAt: new Date() });
db.posts.set("post-1", { id: "post-1", title: "Hello World", content: "My first post", published: true, authorId: "user-1", createdAt: new Date() });

// =============================================================================
// Typed Builders with Plugin
// =============================================================================

const { query, mutation, plugins } = lens<AppContext>({
	plugins: [optimisticPlugin()],
});

// =============================================================================
// Operations
// =============================================================================

const userRouter = router({
	get: query()
		.args(z.object({ id: z.string() }))
		.returns(User)
		.resolve(({ args }) => {
			const user = db.users.get(args.id);
			if (!user) throw new Error("User not found");
			return user;
		}),

	list: query()
		.returns(list(User))
		.resolve(() => Array.from(db.users.values())),

	create: mutation()
		.args(z.object({ name: z.string(), email: z.string() }))
		.returns(User)
		.optimistic("create")
		.resolve(({ args }) => {
			const id = `user-${Date.now()}`;
			const user = { id, ...args, createdAt: new Date() };
			db.users.set(id, user);
			return user;
		}),
});

const postRouter = router({
	get: query()
		.args(z.object({ id: z.string() }))
		.returns(Post)
		.resolve(({ args }) => {
			const post = db.posts.get(args.id);
			if (!post) throw new Error("Post not found");
			return post;
		}),

	list: query()
		.returns(list(Post))
		.resolve(() => Array.from(db.posts.values())),

	byAuthor: query()
		.args(z.object({ authorId: z.string() }))
		.returns(list(Post))
		.resolve(({ args }) =>
			Array.from(db.posts.values()).filter(p => p.authorId === args.authorId)
		),

	create: mutation()
		.args(z.object({ title: z.string(), content: z.string(), authorId: z.string() }))
		.returns(Post)
		.optimistic("create")
		.resolve(({ args }) => {
			const id = `post-${Date.now()}`;
			const post = { id, ...args, published: false, createdAt: new Date() };
			db.posts.set(id, post);
			return post;
		}),

	update: mutation()
		.args(z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional() }))
		.returns(Post)
		.optimistic("merge")
		.resolve(({ args }) => {
			const post = db.posts.get(args.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, ...args };
			db.posts.set(args.id, updated);
			return updated;
		}),

	publish: mutation()
		.args(z.object({ id: z.string() }))
		.returns(Post)
		.optimistic({ merge: { published: true } })
		.resolve(({ args }) => {
			const post = db.posts.get(args.id);
			if (!post) throw new Error("Post not found");
			post.published = true;
			return post;
		}),

	delete: mutation()
		.args(z.object({ id: z.string() }))
		.resolve(({ args }) => {
			const existed = db.posts.delete(args.id);
			return { success: existed };
		}),
});

// =============================================================================
// Main Router
// =============================================================================

const appRouter = router({
	user: userRouter,
	post: postRouter,
});

export type AppRouter = typeof appRouter;

// =============================================================================
// Server
// =============================================================================

export const app = createApp({
	router: appRouter,
	entities: { User, Post },
	plugins,
	context: () => ({
		currentUser: { id: "user-1", name: "Alice" },
	}),
});

export { db };
