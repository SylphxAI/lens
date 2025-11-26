/**
 * Example Lens Server
 */
import { entity, t, query, mutation, router } from "@sylphx/lens-core";
import { createServer } from "@sylphx/lens-server";
import { z } from "zod";

// =============================================================================
// Entities
// =============================================================================

export const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	createdAt: t.date(),
});

export const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
	authorId: t.string(),
	createdAt: t.date(),
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
// Operations
// =============================================================================

const userRouter = router({
	get: query<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(User)
		.resolve(({ input }) => {
			const user = db.users.get(input.id);
			if (!user) throw new Error("User not found");
			return user;
		}),

	list: query<AppContext>()
		.returns([User])
		.resolve(() => Array.from(db.users.values())),

	create: mutation<AppContext>()
		.input(z.object({ name: z.string(), email: z.string() }))
		.returns(User)
		.optimistic("create")
		.resolve(({ input }) => {
			const id = `user-${Date.now()}`;
			const user = { id, ...input, createdAt: new Date() };
			db.users.set(id, user);
			return user;
		}),
});

const postRouter = router({
	get: query<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.resolve(({ input }) => {
			const post = db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			return post;
		}),

	list: query<AppContext>()
		.returns([Post])
		.resolve(() => Array.from(db.posts.values())),

	byAuthor: query<AppContext>()
		.input(z.object({ authorId: z.string() }))
		.returns([Post])
		.resolve(({ input }) =>
			Array.from(db.posts.values()).filter(p => p.authorId === input.authorId)
		),

	create: mutation<AppContext>()
		.input(z.object({ title: z.string(), content: z.string(), authorId: z.string() }))
		.returns(Post)
		.optimistic("create")
		.resolve(({ input }) => {
			const id = `post-${Date.now()}`;
			const post = { id, ...input, published: false, createdAt: new Date() };
			db.posts.set(id, post);
			return post;
		}),

	update: mutation<AppContext>()
		.input(z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional() }))
		.returns(Post)
		.optimistic("merge")
		.resolve(({ input }) => {
			const post = db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, ...input };
			db.posts.set(input.id, updated);
			return updated;
		}),

	publish: mutation<AppContext>()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.optimistic({ merge: { published: true } })
		.resolve(({ input }) => {
			const post = db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			post.published = true;
			return post;
		}),

	delete: mutation<AppContext>()
		.input(z.object({ id: z.string() }))
		.resolve(({ input }) => {
			const existed = db.posts.delete(input.id);
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

export const server = createServer({
	router: appRouter,
	entities: { User, Post },
	context: () => ({
		currentUser: { id: "user-1", name: "Alice" },
	}),
});

export { db };
