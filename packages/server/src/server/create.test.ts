/**
 * @sylphx/lens-server - Server Tests
 *
 * Tests for the pure executor server.
 * Server only does: getMetadata() and execute()
 */

import { describe, expect, it } from "bun:test";
import { entity, firstValueFrom, mutation, query, resolver, router, t } from "@sylphx/lens-core";
import { z } from "zod";
import { optimisticPlugin } from "../plugin/optimistic.js";
import { createApp } from "./create.js";

// =============================================================================
// Test Entities
// =============================================================================

const User = entity("User", {
	id: z.string(),
	name: z.string(),
	email: z.string().optional(),
});

// =============================================================================
// Test Queries and Mutations
// =============================================================================

const getUser = query()
	.input(z.object({ id: z.string() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: input.id,
		name: "Test User",
		email: "test@example.com",
	}));

const getUsers = query().resolve(() => [
	{ id: "1", name: "User 1" },
	{ id: "2", name: "User 2" },
]);

const createUser = mutation()
	.input(z.object({ name: z.string(), email: z.string().optional() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: "new-id",
		name: input.name,
		email: input.email,
	}));

const updateUser = mutation()
	.input(z.object({ id: z.string(), name: z.string().optional() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: input.id,
		name: input.name ?? "Updated",
	}));

const deleteUser = mutation()
	.input(z.object({ id: z.string() }))
	.resolve(() => ({ success: true }));

// =============================================================================
// createApp Tests
// =============================================================================

describe("createApp", () => {
	it("creates a server instance", () => {
		const server = createApp({
			entities: { User },
			queries: { getUser },
			mutations: { createUser },
		});

		expect(server).toBeDefined();
		expect(typeof server.getMetadata).toBe("function");
		expect(typeof server.execute).toBe("function");
	});

	it("creates server with router", () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
			},
		});

		const server = createApp({ router: appRouter });

		expect(server).toBeDefined();
		const metadata = server.getMetadata();
		expect(metadata.operations.user).toBeDefined();
	});

	it("creates server with custom version", () => {
		const server = createApp({
			queries: { getUser },
			version: "2.0.0",
		});

		const metadata = server.getMetadata();
		expect(metadata.version).toBe("2.0.0");
	});

	it("creates server with empty config", () => {
		const server = createApp({});

		expect(server).toBeDefined();
		const metadata = server.getMetadata();
		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations).toEqual({});
	});
});

// =============================================================================
// getMetadata Tests
// =============================================================================

describe("getMetadata", () => {
	it("returns correct metadata structure", () => {
		const server = createApp({
			queries: { getUser, getUsers },
			mutations: { createUser, updateUser },
			version: "1.2.3",
		});

		const metadata = server.getMetadata();

		expect(metadata.version).toBe("1.2.3");
		expect(metadata.operations.getUser.type).toBe("query");
		expect(metadata.operations.getUser.returnType).toBe("User"); // Now includes returnType
		expect(metadata.operations.getUsers.type).toBe("query");
		expect(metadata.operations.createUser.type).toBe("mutation");
		expect(metadata.operations.updateUser.type).toBe("mutation");
	});

	it("includes optimistic hints for mutations with optimisticPlugin", () => {
		const server = createApp({
			mutations: { createUser, updateUser, deleteUser },
			plugins: [optimisticPlugin()],
		});

		const metadata = server.getMetadata();

		// Auto-derived from naming convention when using optimisticPlugin
		expect(metadata.operations.createUser.optimistic).toBeDefined();
		expect(metadata.operations.updateUser.optimistic).toBeDefined();
		expect(metadata.operations.deleteUser.optimistic).toBeDefined();
	});

	it("does not include optimistic hints without optimisticPlugin", () => {
		const server = createApp({
			mutations: { createUser, updateUser, deleteUser },
		});

		const metadata = server.getMetadata();

		// Without plugin, no optimistic hints
		expect(metadata.operations.createUser.optimistic).toBeUndefined();
		expect(metadata.operations.updateUser.optimistic).toBeUndefined();
		expect(metadata.operations.deleteUser.optimistic).toBeUndefined();
	});

	it("handles nested router paths", () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
				profile: {
					update: updateUser,
				},
			},
		});

		const server = createApp({ router: appRouter });
		const metadata = server.getMetadata();

		expect(metadata.operations.user).toBeDefined();
		expect((metadata.operations.user as Record<string, Record<string, unknown>>).get.type).toBe("query");
		expect((metadata.operations.user as Record<string, Record<string, unknown>>).get.returnType).toBe("User");
		expect((metadata.operations.user as Record<string, unknown>).create).toBeDefined();
	});
});

// =============================================================================
// execute Tests
// =============================================================================

describe("execute", () => {
	it("executes query successfully", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { id: "123" },
			}),
		);

		expect(result.data).toEqual({
			id: "123",
			name: "Test User",
			email: "test@example.com",
		});
		expect(result.error).toBeUndefined();
	});

	it("executes mutation successfully", async () => {
		const server = createApp({
			mutations: { createUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "createUser",
				input: { name: "New User", email: "new@example.com" },
			}),
		);

		expect(result.data).toEqual({
			id: "new-id",
			name: "New User",
			email: "new@example.com",
		});
		expect(result.error).toBeUndefined();
	});

	it("returns error for unknown operation", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "unknownOperation",
				input: {},
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain("not found");
	});

	it("returns error for invalid input", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { invalid: true }, // Missing required 'id'
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
	});

	it("executes router operations with dot notation", async () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
			},
		});

		const server = createApp({ router: appRouter });

		const queryResult = await firstValueFrom(
			server.execute({
				path: "user.get",
				input: { id: "456" },
			}),
		);

		expect(queryResult.data).toEqual({
			id: "456",
			name: "Test User",
			email: "test@example.com",
		});

		const mutationResult = await firstValueFrom(
			server.execute({
				path: "user.create",
				input: { name: "Router User" },
			}),
		);

		expect(mutationResult.data).toEqual({
			id: "new-id",
			name: "Router User",
			email: undefined,
		});
	});

	it("handles resolver errors gracefully", async () => {
		const errorQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(() => {
				throw new Error("Resolver error");
			});

		const server = createApp({
			queries: { errorQuery },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "errorQuery",
				input: { id: "1" },
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Resolver error");
	});

	it("executes query without input", async () => {
		const server = createApp({
			queries: { getUsers },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUsers",
			}),
		);

		expect(result.data).toHaveLength(2);
	});
});

// =============================================================================
// Context Tests
// =============================================================================

describe("context", () => {
	it("passes context to resolvers", async () => {
		let capturedContext: unknown = null;

		const contextQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return { id: "1", name: "test" };
			});

		const server = createApp({
			queries: { contextQuery },
			context: () => ({ userId: "user-123", role: "admin" }),
		});

		await firstValueFrom(
			server.execute({
				path: "contextQuery",
				input: { id: "1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "user-123",
			role: "admin",
		});
	});

	it("supports async context factory", async () => {
		let capturedContext: unknown = null;

		const contextQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return { id: "1", name: "test" };
			});

		const server = createApp({
			queries: { contextQuery },
			context: async () => {
				await new Promise((r) => setTimeout(r, 10));
				return { userId: "async-user" };
			},
		});

		await firstValueFrom(
			server.execute({
				path: "contextQuery",
				input: { id: "1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "async-user",
		});
	});
});

// =============================================================================
// Selection Tests
// =============================================================================

describe("selection", () => {
	it("supports $select in input", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: {
					id: "123",
					$select: { name: true },
				},
			}),
		);

		expect(result.data).toEqual({
			id: "123", // id always included
			name: "Test User",
		});
		expect((result.data as Record<string, unknown>).email).toBeUndefined();
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("type inference", () => {
	it("infers types correctly", () => {
		const server = createApp({
			queries: { getUser },
			mutations: { createUser },
		});

		// Type check - if this compiles, types are working
		const metadata = server.getMetadata();
		expect(metadata.version).toBeDefined();

		// The _types property exists for type inference
		expect((server as { _types?: unknown })._types).toBeUndefined(); // Runtime undefined, compile-time exists
	});
});

// =============================================================================
// Field Resolver Tests (GraphQL-style per-field resolution)
// =============================================================================

describe("field resolvers", () => {
	// Test entities for field resolver tests
	const Author = entity("Author", {
		id: t.id(),
		name: t.string(),
	});

	const Post = entity("Post", {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		published: t.boolean(),
		authorId: t.string(),
	});

	// Mock data
	const mockDb = {
		authors: [
			{ id: "a1", name: "Alice" },
			{ id: "a2", name: "Bob" },
		],
		posts: [
			{ id: "p1", title: "Post 1", content: "Content 1", published: true, authorId: "a1" },
			{ id: "p2", title: "Post 2", content: "Content 2", published: false, authorId: "a1" },
			{ id: "p3", title: "Post 3", content: "Content 3", published: true, authorId: "a1" },
			{ id: "p4", title: "Post 4", content: "Content 4", published: true, authorId: "a2" },
		],
	};

	type TestContext = { db: typeof mockDb };

	it("resolves field with nested input args (like GraphQL)", async () => {
		// Define field resolver with args (like GraphQL)
		const authorResolver = resolver<TestContext>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.args(
					z.object({
						limit: z.number().optional(),
						published: z.boolean().optional(),
					}),
				)
				.resolve(({ parent, args, ctx }) => {
					let posts = ctx.db.posts.filter((p) => p.authorId === parent.id);
					if (args.published !== undefined) {
						posts = posts.filter((p) => p.published === args.published);
					}
					if (args.limit !== undefined) {
						posts = posts.slice(0, args.limit);
					}
					return posts;
				}),
		}));

		const getAuthor = query<TestContext>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		// Test with nested input: get author with only published posts, limit 2
		const result = await firstValueFrom(
			server.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						name: true,
						posts: {
							input: { published: true, limit: 2 },
							select: { id: true, title: true },
						},
					},
				},
			}),
		);

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();

		const data = result.data as { id: string; name: string; posts: { id: string; title: string }[] };
		expect(data.id).toBe("a1");
		expect(data.name).toBe("Alice");
		expect(data.posts).toHaveLength(2); // limit: 2
		expect(data.posts.every((p) => p.title)).toBe(true); // only selected fields
	});

	it("passes context to field resolvers", async () => {
		let capturedContext: TestContext | null = null;

		const authorResolver = resolver<TestContext>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f.many(Post).resolve(({ parent, ctx }) => {
				capturedContext = ctx;
				return ctx.db.posts.filter((p) => p.authorId === parent.id);
			}),
		}));

		const getAuthor = query<TestContext>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		await firstValueFrom(
			server.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						posts: true,
					},
				},
			}),
		);

		expect(capturedContext).toBeDefined();
		expect(capturedContext?.db).toBe(mockDb);
	});

	it("supports nested input at multiple levels", async () => {
		// Comment entity for deeper nesting
		const Comment = entity("Comment", {
			id: t.id(),
			body: t.string(),
			postId: t.string(),
		});

		const mockDbWithComments = {
			...mockDb,
			comments: [
				{ id: "c1", body: "Comment 1", postId: "p1" },
				{ id: "c2", body: "Comment 2", postId: "p1" },
				{ id: "c3", body: "Comment 3", postId: "p2" },
			],
		};

		type CtxWithComments = { db: typeof mockDbWithComments };

		const postResolver = resolver<CtxWithComments>()(Post, (f) => ({
			id: f.expose("id"),
			title: f.expose("title"),
			comments: f
				.many(Comment)
				.args(z.object({ limit: z.number().optional() }))
				.resolve(({ parent, args, ctx }) => {
					let comments = ctx.db.comments.filter((c) => c.postId === parent.id);
					if (args.limit !== undefined) {
						comments = comments.slice(0, args.limit);
					}
					return comments;
				}),
		}));

		const authorResolver = resolver<CtxWithComments>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number().optional() }))
				.resolve(({ parent, args, ctx }) => {
					let posts = ctx.db.posts.filter((p) => p.authorId === parent.id);
					if (args.limit !== undefined) {
						posts = posts.slice(0, args.limit);
					}
					return posts;
				}),
		}));

		const getAuthor = query<CtxWithComments>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post, Comment },
			queries: { getAuthor },
			resolvers: [authorResolver, postResolver],
			context: () => ({ db: mockDbWithComments }),
		});

		// Nested input at multiple levels:
		// Author.posts(limit: 1) -> Post.comments(limit: 1)
		const result = await firstValueFrom(
			server.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						posts: {
							input: { limit: 1 },
							select: {
								id: true,
								title: true,
								comments: {
									input: { limit: 1 },
									select: { id: true, body: true },
								},
							},
						},
					},
				},
			}),
		);

		expect(result.error).toBeUndefined();
		const data = result.data as any;
		expect(data.posts).toHaveLength(1);
		expect(data.posts[0].comments).toHaveLength(1);
	});

	it("works without nested input (default args)", async () => {
		const authorResolver = resolver<TestContext>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.args(z.object({ limit: z.number().default(10) }))
				.resolve(({ parent, args, ctx }) => {
					return ctx.db.posts.filter((p) => p.authorId === parent.id).slice(0, args.limit);
				}),
		}));

		const getAuthor = query<TestContext>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		// Without nested input - should use default args
		const result = await firstValueFrom(
			server.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						posts: { select: { id: true } },
					},
				},
			}),
		);

		expect(result.error).toBeUndefined();
		const data = result.data as any;
		expect(data.posts).toHaveLength(3); // All of Alice's posts (default limit 10)
	});

	it("emit() goes through field resolvers", async () => {
		// Track how many times posts resolver is called
		let postsResolverCallCount = 0;

		const Author = entity("Author", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		const mockDb = {
			authors: [{ id: "a1", name: "Alice" }],
			posts: [
				{ id: "p1", title: "Post 1", authorId: "a1" },
				{ id: "p2", title: "Post 2", authorId: "a1" },
			],
		};

		const authorResolver = resolver<{ db: typeof mockDb }>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f.many(Post).resolve(({ parent, ctx }) => {
				postsResolverCallCount++;
				return ctx.db.posts.filter((p) => p.authorId === parent.id);
			}),
		}));

		type EmitFn = ((data: unknown) => void) & { merge: (partial: unknown) => void };
		let capturedEmit: EmitFn | null = null;

		const getAuthor = query<{ db: typeof mockDb; emit: EmitFn }>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				capturedEmit = ctx.emit as EmitFn;
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		// Subscribe to query with nested posts
		const results: unknown[] = [];
		const subscription = server
			.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						name: true,
						posts: { select: { id: true, title: true } },
					},
				},
			})
			.subscribe({
				next: (result) => {
					results.push(result);
				},
			});

		// Wait for initial result
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(results.length).toBe(1);
		expect(postsResolverCallCount).toBe(1); // Called once for initial query

		// Add a new post to the mock DB
		mockDb.posts.push({ id: "p3", title: "Post 3", authorId: "a1" });

		// Emit updated author (this should trigger field resolvers)
		capturedEmit!({ id: "a1", name: "Alice Updated" });

		// Wait for emit to process
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(results.length).toBe(2);
		expect(postsResolverCallCount).toBe(2); // Called again after emit!

		// Verify the emitted result includes the new post (from re-running posts resolver)
		const latestResult = results[1] as { data: { posts: { id: string }[] } };
		expect(latestResult.data.posts).toHaveLength(3); // Should have 3 posts now

		subscription.unsubscribe();
	});

	it("field resolvers receive onCleanup for cleanup registration", async () => {
		let cleanupCalled = false;
		let resolverReceivedOnCleanup = false;

		const Author = entity("Author", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		const mockDb = {
			authors: [{ id: "a1", name: "Alice" }],
			posts: [{ id: "p1", title: "Post 1", authorId: "a1" }],
		};

		// Use .resolve().subscribe() to get onCleanup access
		// Per ADR-002: .resolve() alone is pure/batchable, no emit/onCleanup
		// .resolve().subscribe() gives initial value + subscription capabilities
		const authorResolver = resolver<{ db: typeof mockDb }>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.resolve(({ parent, ctx }) => {
					// Initial resolution (batchable, no emit/onCleanup)
					return ctx.db.posts.filter((p) => p.authorId === parent.id);
				})
				.subscribe(({ parent, ctx }) => {
					// Subscription setup (has emit/onCleanup)
					resolverReceivedOnCleanup = ctx.onCleanup !== undefined;

					// Register cleanup
					ctx.onCleanup(() => {
						cleanupCalled = true;
					});
				}),
		}));

		const getAuthor = query<{ db: typeof mockDb }>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		const subscription = server
			.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						posts: { select: { id: true } },
					},
				},
			})
			.subscribe({});

		// Wait for query to execute
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Verify field resolver received onCleanup
		expect(resolverReceivedOnCleanup).toBe(true);
		expect(cleanupCalled).toBe(false); // Not called yet

		// Unsubscribe should trigger cleanup
		subscription.unsubscribe();

		// Cleanup should be called
		expect(cleanupCalled).toBe(true);
	});

	it("field-level emit updates specific field and notifies observer", async () => {
		const Author = entity("Author", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		const mockDb = {
			authors: [{ id: "a1", name: "Alice" }],
			posts: [
				{ id: "p1", title: "Post 1", authorId: "a1" },
				{ id: "p2", title: "Post 2", authorId: "a1" },
			],
		};

		// Track field emit
		let capturedFieldEmit: ((value: unknown) => void) | undefined;

		// Use .resolve().subscribe() to get emit access
		// Per ADR-002: .resolve() alone is pure/batchable, no emit/onCleanup
		// .resolve().subscribe() gives initial value + subscription capabilities
		const authorResolver = resolver<{ db: typeof mockDb }>()(Author, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f
				.many(Post)
				.resolve(({ parent, ctx }) => {
					// Initial resolution (batchable, no emit)
					return ctx.db.posts.filter((p) => p.authorId === parent.id);
				})
				.subscribe(({ parent, ctx }) => {
					// Subscription setup (has emit/onCleanup)
					// Capture the field emit for later use
					capturedFieldEmit = ctx.emit;

					// Register cleanup
					ctx.onCleanup(() => {
						capturedFieldEmit = undefined;
					});
				}),
		}));

		const getAuthor = query<{ db: typeof mockDb }>()
			.input(z.object({ id: z.string() }))
			.returns(Author)
			.resolve(({ input, ctx }) => {
				const author = ctx.db.authors.find((a) => a.id === input.id);
				if (!author) throw new Error("Author not found");
				return author;
			});

		const server = createApp({
			entities: { Author, Post },
			queries: { getAuthor },
			resolvers: [authorResolver],
			context: () => ({ db: mockDb }),
		});

		const results: unknown[] = [];
		const subscription = server
			.execute({
				path: "getAuthor",
				input: {
					id: "a1",
					$select: {
						id: true,
						name: true,
						posts: { select: { id: true, title: true } },
					},
				},
			})
			.subscribe({
				next: (result) => {
					results.push(result);
				},
			});

		// Wait for initial result
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(results.length).toBe(1);
		expect(capturedFieldEmit).toBeDefined();

		const initialResult = results[0] as { data: { posts: { id: string }[] } };
		expect(initialResult.data.posts).toHaveLength(2);

		// Use field-level emit to update just the posts field
		const newPosts = [
			{ id: "p1", title: "Updated Post 1", authorId: "a1" },
			{ id: "p2", title: "Updated Post 2", authorId: "a1" },
			{ id: "p3", title: "New Post 3", authorId: "a1" },
		];
		capturedFieldEmit!(newPosts);

		// Wait for field emit to process
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(results.length).toBe(2);
		const updatedResult = results[1] as { data: { posts: { id: string; title: string }[] } };
		expect(updatedResult.data.posts).toHaveLength(3);
		expect(updatedResult.data.posts[2].title).toBe("New Post 3");

		subscription.unsubscribe();
	});

	it("emit skips observer notification when value unchanged", async () => {
		type EmitFn = (data: { id: string; name: string }) => void;
		let capturedEmit: EmitFn | undefined;

		// Query that captures emit for external use
		const liveQuery = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				capturedEmit = ctx.emit as EmitFn;
				return { id: input.id, name: "Initial" };
			});

		const testRouter = router({ liveQuery });
		const app = createApp({ router: testRouter });

		const results: unknown[] = [];
		const observable = app.execute({
			path: "liveQuery",
			input: { id: "1" },
		});

		const subscription = observable.subscribe({
			next: (value) => results.push(value),
		});

		// Wait for initial result
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(results.length).toBe(1);
		const firstResult = results[0] as { data: { id: string; name: string } };
		expect(firstResult.data.name).toBe("Initial");

		// Emit same value - should be skipped (equality check)
		capturedEmit!({ id: "1", name: "Initial" });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(results.length).toBe(1); // Still 1, not 2

		// Emit same value again - should be skipped
		capturedEmit!({ id: "1", name: "Initial" });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(results.length).toBe(1); // Still 1

		// Emit different value - should emit
		capturedEmit!({ id: "1", name: "Changed" });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(results.length).toBe(2); // Now 2
		expect((results[1] as { data: { name: string } }).data.name).toBe("Changed");

		// Emit same "Changed" value again - should be skipped
		capturedEmit!({ id: "1", name: "Changed" });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(results.length).toBe(2); // Still 2

		subscription.unsubscribe();
	});
});

// =============================================================================
// Observable Completion Tests
// =============================================================================

describe("observable behavior", () => {
	it("delivers initial result immediately for queries", async () => {
		const simpleQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input }) => ({ id: input.id, name: "Test" }));

		const server = createApp({ queries: { simpleQuery } });

		const result = await firstValueFrom(
			server.execute({
				path: "simpleQuery",
				input: { id: "1" },
			}),
		);

		expect(result.data).toEqual({ id: "1", name: "Test" });
		expect(result.error).toBeUndefined();
	});

	it("keeps subscription open for potential emit", async () => {
		type EmitFn = (data: unknown) => void;
		let capturedEmit: EmitFn | undefined;

		const liveQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input, ctx }) => {
				capturedEmit = ctx.emit as EmitFn;
				return { id: input.id, name: "Initial" };
			});

		const server = createApp({ queries: { liveQuery } });

		const results: unknown[] = [];
		const subscription = server
			.execute({
				path: "liveQuery",
				input: { id: "1" },
			})
			.subscribe({
				next: (value) => results.push(value),
			});

		await new Promise((r) => setTimeout(r, 50));
		expect(results.length).toBe(1);

		// Emit should still work (subscription is open)
		capturedEmit!({ id: "1", name: "Updated" });
		await new Promise((r) => setTimeout(r, 50));

		expect(results.length).toBe(2);
		subscription.unsubscribe();
	});

	it("delivers mutation result via observable", async () => {
		const testMutation = mutation()
			.input(z.object({ name: z.string() }))
			.resolve(({ input }) => ({ id: "new", name: input.name }));

		const server = createApp({ mutations: { testMutation } });

		const result = await firstValueFrom(
			server.execute({
				path: "testMutation",
				input: { name: "Test" },
			}),
		);

		expect(result.data).toEqual({ id: "new", name: "Test" });
	});

	it("can be unsubscribed", async () => {
		let resolverCalls = 0;

		const simpleQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input }) => {
				resolverCalls++;
				return { id: input.id };
			});

		const server = createApp({ queries: { simpleQuery } });

		const subscription = server
			.execute({
				path: "simpleQuery",
				input: { id: "1" },
			})
			.subscribe({});

		await new Promise((r) => setTimeout(r, 50));
		subscription.unsubscribe();

		// Should have been called exactly once
		expect(resolverCalls).toBe(1);
	});
});

// =============================================================================
// Backpressure Tests
// =============================================================================

describe("emit backpressure", () => {
	it("handles rapid emit calls without losing data", async () => {
		type EmitFn = (data: unknown) => void;
		let capturedEmit: EmitFn | undefined;

		const liveQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input, ctx }) => {
				capturedEmit = ctx.emit as EmitFn;
				return { id: input.id, count: 0 };
			});

		const server = createApp({ queries: { liveQuery } });

		const results: unknown[] = [];
		const subscription = server
			.execute({
				path: "liveQuery",
				input: { id: "1" },
			})
			.subscribe({
				next: (value) => results.push(value),
			});

		await new Promise((r) => setTimeout(r, 50));

		// Rapidly emit many values
		for (let i = 1; i <= 10; i++) {
			capturedEmit!({ id: "1", count: i });
		}

		// Wait for all emits to process
		await new Promise((r) => setTimeout(r, 100));

		// Should have received all unique values
		// Note: deduplication may reduce count if emit is too fast
		expect(results.length).toBeGreaterThan(1);

		// The last result should have count = 10
		const lastResult = results[results.length - 1] as { data: { count: number } };
		expect(lastResult.data.count).toBe(10);

		subscription.unsubscribe();
	});
});

// =============================================================================
// Observable Error Handling Tests
// =============================================================================

describe("observable error handling", () => {
	it("propagates resolver errors to observer", async () => {
		const errorQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(() => {
				throw new Error("Test error");
			});

		const server = createApp({ queries: { errorQuery } });

		const result = await firstValueFrom(
			server.execute({
				path: "errorQuery",
				input: { id: "1" },
			}),
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toBe("Test error");
	});

	it("handles async resolver errors", async () => {
		const asyncErrorQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(async () => {
				await new Promise((r) => setTimeout(r, 10));
				throw new Error("Async error");
			});

		const server = createApp({ queries: { asyncErrorQuery } });

		const result = await firstValueFrom(
			server.execute({
				path: "asyncErrorQuery",
				input: { id: "1" },
			}),
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toBe("Async error");
	});
});

// =============================================================================
// Test: Subscription Detection
// =============================================================================

describe("Subscription detection", () => {
	// Test entity for subscription detection
	const Profile = entity("Profile", {
		id: t.id(),
		name: t.string(),
		status: t.string(),
	});

	describe("hasAnySubscription", () => {
		it("returns false when no resolvers are configured", () => {
			const server = createApp({
				entities: { User },
				queries: { getUser },
			});

			expect(server.hasAnySubscription("User")).toBe(false);
		});

		it("returns false when entity has only .resolve() fields", () => {
			const userResolver = resolver(User, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				displayName: f.string().resolve(({ parent }) => `User: ${parent.name}`),
			}));

			const server = createApp({
				entities: { User },
				queries: { getUser },
				resolvers: [userResolver],
			});

			expect(server.hasAnySubscription("User")).toBe(false);
		});

		it("returns true when entity has a .subscribe() field", () => {
			const profileResolver = resolver(Profile, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				// Subscription field
				status: f.string().subscribe(({ ctx }) => {
					ctx.emit("online");
				}),
			}));

			const server = createApp({
				entities: { Profile },
				queries: {
					getProfile: query()
						.input(z.object({ id: z.string() }))
						.returns(Profile)
						.resolve(({ input }) => ({ id: input.id, name: "Test", status: "online" })),
				},
				resolvers: [profileResolver],
			});

			expect(server.hasAnySubscription("Profile")).toBe(true);
		});

		it("returns false with select that excludes subscription field", () => {
			const profileResolver = resolver(Profile, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				status: f.string().subscribe(({ ctx }) => {
					ctx.emit("online");
				}),
			}));

			const server = createApp({
				entities: { Profile },
				queries: {
					getProfile: query()
						.input(z.object({ id: z.string() }))
						.returns(Profile)
						.resolve(({ input }) => ({ id: input.id, name: "Test", status: "online" })),
				},
				resolvers: [profileResolver],
			});

			// Only selecting non-subscription fields
			expect(server.hasAnySubscription("Profile", { id: true, name: true })).toBe(false);
		});

		it("returns true with select that includes subscription field", () => {
			const profileResolver = resolver(Profile, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				status: f.string().subscribe(({ ctx }) => {
					ctx.emit("online");
				}),
			}));

			const server = createApp({
				entities: { Profile },
				queries: {
					getProfile: query()
						.input(z.object({ id: z.string() }))
						.returns(Profile)
						.resolve(({ input }) => ({ id: input.id, name: "Test", status: "online" })),
				},
				resolvers: [profileResolver],
			});

			// Selecting the subscription field
			expect(server.hasAnySubscription("Profile", { id: true, status: true })).toBe(true);
		});

		it("returns false for unknown entity", () => {
			const server = createApp({
				entities: { User },
				queries: { getUser },
			});

			expect(server.hasAnySubscription("UnknownEntity")).toBe(false);
		});
	});

	describe("requiresStreamingTransport", () => {
		it("returns false for regular query", () => {
			const server = createApp({
				entities: { User },
				queries: { getUser },
			});

			expect(server.requiresStreamingTransport("getUser")).toBe(false);
		});

		it("returns true for async generator query", () => {
			const streamQuery = query().subscribe(async function* () {
				yield { count: 1 };
				yield { count: 2 };
			});

			const server = createApp({
				queries: { streamQuery },
			});

			expect(server.requiresStreamingTransport("streamQuery")).toBe(true);
		});

		it("returns false for unknown operation", () => {
			const server = createApp({
				queries: { getUser },
			});

			expect(server.requiresStreamingTransport("unknownOperation")).toBe(false);
		});

		it("returns true when return type has subscription fields", () => {
			const profileResolver = resolver(Profile, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				status: f.string().subscribe(({ ctx }) => {
					ctx.emit("online");
				}),
			}));

			const getProfile = query()
				.input(z.object({ id: z.string() }))
				.returns(Profile)
				.resolve(({ input }) => ({ id: input.id, name: "Test", status: "online" }));

			const server = createApp({
				entities: { Profile },
				queries: { getProfile },
				resolvers: [profileResolver],
			});

			// No select - checks all fields
			expect(server.requiresStreamingTransport("getProfile")).toBe(true);
		});

		it("returns false when select excludes subscription fields", () => {
			const profileResolver = resolver(Profile, (f) => ({
				id: f.expose("id"),
				name: f.expose("name"),
				status: f.string().subscribe(({ ctx }) => {
					ctx.emit("online");
				}),
			}));

			const getProfile = query()
				.input(z.object({ id: z.string() }))
				.returns(Profile)
				.resolve(({ input }) => ({ id: input.id, name: "Test", status: "online" }));

			const server = createApp({
				entities: { Profile },
				queries: { getProfile },
				resolvers: [profileResolver],
			});

			// Only selecting non-subscription fields
			expect(server.requiresStreamingTransport("getProfile", { id: true, name: true })).toBe(false);
		});
	});
});

// =============================================================================
// Unified Entity Definition (ADR-001) - Auto Resolver Conversion
// =============================================================================

describe("Unified Entity Definition", () => {
	describe("auto-converts entities with inline resolvers", () => {
		it("creates resolver from entity with inline .resolve()", async () => {
			// Entity with inline resolver - no separate resolver() needed
			const Product = entity("Product", (t) => ({
				id: t.id(),
				name: t.string(),
				price: t.float(),
				// Computed field with inline resolver
				displayPrice: t.string().resolve(({ parent }) => `$${(parent as { price: number }).price.toFixed(2)}`),
			}));

			const getProduct = query()
				.input(z.object({ id: z.string() }))
				.returns(Product)
				.resolve(({ input }) => ({
					id: input.id,
					name: "Test Product",
					price: 19.99,
				}));

			// No resolvers array needed! Server auto-detects inline resolvers
			const server = createApp({
				entities: { Product },
				queries: { getProduct },
			});

			const result = await firstValueFrom(
				server.execute({
					path: "getProduct",
					input: { id: "prod-1", $select: { id: true, name: true, displayPrice: true } },
				}),
			);

			expect(result.data).toEqual({
				id: "prod-1",
				name: "Test Product",
				displayPrice: "$19.99",
			});
		});

		it("explicit resolver takes priority over inline resolver", async () => {
			// Entity with inline resolver
			const Item = entity("Item", (t) => ({
				id: t.id(),
				label: t.string().resolve(() => "inline-label"),
			}));

			// Explicit resolver overrides inline
			const itemResolver = resolver(Item, (f) => ({
				id: f.expose("id"),
				label: f.string().resolve(() => "explicit-label"),
			}));

			const getItem = query()
				.input(z.object({ id: z.string() }))
				.returns(Item)
				.resolve(({ input }) => ({ id: input.id }));

			const server = createApp({
				entities: { Item },
				queries: { getItem },
				resolvers: [itemResolver], // Explicit resolver takes priority
			});

			const result = await firstValueFrom(
				server.execute({
					path: "getItem",
					input: { id: "item-1", $select: { id: true, label: true } },
				}),
			);

			expect(result.data).toEqual({
				id: "item-1",
				label: "explicit-label", // From explicit resolver, not inline
			});
		});

		it("includes inline resolver fields in metadata", () => {
			const Task = entity("Task", (t) => ({
				id: t.id(),
				title: t.string(),
				status: t.string().subscribe(({ ctx }) => {
					ctx.emit("pending");
				}),
			}));

			const server = createApp({
				entities: { Task },
				queries: {},
			});

			const metadata = server.getMetadata();
			expect(metadata.entities.Task).toBeDefined();
			expect(metadata.entities.Task.id).toBe("exposed");
			expect(metadata.entities.Task.title).toBe("exposed");
			expect(metadata.entities.Task.status).toBe("subscribe");
		});

		it("skips entities without inline resolvers", () => {
			// Plain entity without inline resolvers
			const SimpleUser = entity("SimpleUser", {
				id: t.id(),
				name: t.string(),
			});

			const server = createApp({
				entities: { SimpleUser },
				queries: {},
			});

			const metadata = server.getMetadata();
			// No resolver created for entities without inline resolvers
			expect(metadata.entities.SimpleUser).toBeUndefined();
		});
	});
});
