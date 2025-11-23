/**
 * Basic Example - Server
 *
 * This file sets up the Lens server with resolvers.
 */

import { createServer, createResolvers } from "@lens/server";
import { schema } from "./schema";

// In-memory database for demo
const db = {
	users: new Map<string, { id: string; name: string; email: string; avatar?: string; createdAt: string }>([
		["1", { id: "1", name: "Alice", email: "alice@example.com", createdAt: new Date().toISOString() }],
		["2", { id: "2", name: "Bob", email: "bob@example.com", avatar: "https://example.com/bob.png", createdAt: new Date().toISOString() }],
	]),
	posts: new Map<string, { id: string; title: string; content: string; published: boolean; authorId: string; createdAt: string }>([
		["1", { id: "1", title: "Hello World", content: "My first post!", published: true, authorId: "1", createdAt: new Date().toISOString() }],
		["2", { id: "2", title: "Lens is Amazing", content: "Building reactive APIs is easy now.", published: true, authorId: "1", createdAt: new Date().toISOString() }],
		["3", { id: "3", title: "Draft Post", content: "Work in progress...", published: false, authorId: "2", createdAt: new Date().toISOString() }],
	]),
};

// Define resolvers for each entity
const resolvers = createResolvers(schema, {
	User: {
		// Single entity resolver
		resolve: async (id) => {
			const user = db.users.get(id);
			if (!user) return null;

			// Resolve posts relation
			const posts = Array.from(db.posts.values())
				.filter((p) => p.authorId === id)
				.map((p) => ({
					...p,
					author: user,
				}));

			return { ...user, posts };
		},
		// Batch resolver for N+1 optimization
		batch: async (ids) => {
			return ids.map((id) => {
				const user = db.users.get(id);
				if (!user) return null;

				const posts = Array.from(db.posts.values())
					.filter((p) => p.authorId === id)
					.map((p) => ({
						...p,
						author: user,
					}));

				return { ...user, posts };
			});
		},
		// Create mutation
		create: async (input) => {
			const id = String(db.users.size + 1);
			const user = {
				id,
				name: input.name as string,
				email: input.email as string,
				avatar: input.avatar as string | undefined,
				createdAt: new Date().toISOString(),
			};
			db.users.set(id, user);
			return { ...user, posts: [] };
		},
		// Update mutation
		update: async (input) => {
			const user = db.users.get(input.id);
			if (!user) throw new Error("User not found");

			const updated = { ...user, ...input };
			db.users.set(input.id, updated);

			const posts = Array.from(db.posts.values())
				.filter((p) => p.authorId === input.id)
				.map((p) => ({
					...p,
					author: updated,
				}));

			return { ...updated, posts };
		},
		// Delete mutation
		delete: async (id) => {
			const deleted = db.users.delete(id);
			return deleted;
		},
	},
	Post: {
		resolve: async (id) => {
			const post = db.posts.get(id);
			if (!post) return null;

			const author = db.users.get(post.authorId);
			if (!author) return null;

			return {
				...post,
				author: { ...author, posts: [] },
			};
		},
		batch: async (ids) => {
			return ids.map((id) => {
				const post = db.posts.get(id);
				if (!post) return null;

				const author = db.users.get(post.authorId);
				if (!author) return null;

				return {
					...post,
					author: { ...author, posts: [] },
				};
			});
		},
		create: async (input) => {
			const id = String(db.posts.size + 1);
			const authorId = (input as { authorId: string }).authorId ?? "1";
			const post = {
				id,
				title: input.title as string,
				content: input.content as string,
				published: (input.published as boolean) ?? false,
				authorId,
				createdAt: new Date().toISOString(),
			};
			db.posts.set(id, post);

			const author = db.users.get(authorId)!;
			return {
				...post,
				author: { ...author, posts: [] },
			};
		},
		update: async (input) => {
			const post = db.posts.get(input.id);
			if (!post) throw new Error("Post not found");

			const updated = { ...post, ...input };
			db.posts.set(input.id, updated);

			const author = db.users.get(post.authorId)!;
			return {
				...updated,
				author: { ...author, posts: [] },
			};
		},
		delete: async (id) => {
			return db.posts.delete(id);
		},
	},
});

// Create and start the server
const server = createServer({
	schema,
	resolvers,
	context: () => ({ db }),
});

// Start listening
const PORT = 3000;
server.listen(PORT);
console.log(`Lens server running on ws://localhost:${PORT}`);
