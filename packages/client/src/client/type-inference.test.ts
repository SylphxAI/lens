/**
 * @sylphx/lens-client - Type Inference Tests
 *
 * End-to-end tests for type inference from server to client.
 * Tests the full inference chain:
 *   server._types.router → inProcess() → TypedTransport → createClient() → typed methods
 */

import { describe, expect, it } from "bun:test";
import { entity, lens, router, t } from "@sylphx/lens-core";
import { createServer } from "@sylphx/lens-server";
import { z } from "zod";
import { inProcess, type TypedTransport } from "../transport/in-process";
import { createClient } from "./create";

// =============================================================================
// Test Entities
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	role: t.enum(["user", "admin", "moderator"]),
	bio: t.string().optional(),
	createdAt: t.date(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
	authorId: t.string(),
	viewCount: t.int(),
});

const _Comment = entity("Comment", {
	id: t.id(),
	text: t.string(),
	postId: t.string(),
	authorId: t.string(),
});

// =============================================================================
// Test Context
// =============================================================================

interface TestContext {
	db: {
		users: Map<
			string,
			{ id: string; name: string; email: string; role: "user" | "admin" | "moderator"; createdAt: Date }
		>;
		posts: Map<
			string,
			{ id: string; title: string; content: string; published: boolean; authorId: string; viewCount: number }
		>;
	};
	currentUser: { id: string; name: string } | null;
}

// =============================================================================
// Type Helpers
// =============================================================================

type Equals<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

// =============================================================================
// Test: Server Type Inference
// =============================================================================

describe("Server type inference", () => {
	it("server._types.router contains correct router type", () => {
		const { query } = lens<TestContext>();

		const userRouter = router({
			get: query()
				.input(z.object({ id: z.string() }))
				.returns(User)
				.resolve(({ input, ctx }) => {
					const user = ctx.db.users.get(input.id);
					if (!user) throw new Error("Not found");
					return user;
				}),
			list: query()
				.returns([User])
				.resolve(({ ctx }) => Array.from(ctx.db.users.values())),
		});

		const server = createServer({
			router: router({ user: userRouter }),
			context: () => ({
				db: { users: new Map(), posts: new Map() },
				currentUser: null,
			}),
		});

		// _types is a phantom type - exists only at type level, not runtime
		// Type check - _types.router should exist at type level
		type ServerTypes = typeof server._types;
		type RouterType = ServerTypes["router"];

		// RouterType should be a RouterDef
		type _assertRouter = Assert<RouterType extends { _type: "router" } ? true : false>;
		const _check: _assertRouter = true;
		expect(_check).toBe(true);

		// Runtime check - server should have getMetadata
		expect(typeof server.getMetadata).toBe("function");
	});
});

// =============================================================================
// Test: inProcess Transport Type Inference
// =============================================================================

describe("inProcess transport type inference", () => {
	it("inProcess() returns TypedTransport with server types", () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				user: router({
					whoami: query()
						.returns(User)
						.resolve(({ ctx }) => {
							if (!ctx.currentUser) throw new Error("Not authenticated");
							const user = ctx.db.users.get(ctx.currentUser.id);
							if (!user) throw new Error("User not found");
							return user;
						}),
				}),
			}),
			context: () => ({
				db: { users: new Map(), posts: new Map() },
				currentUser: null,
			}),
		});

		const transport = inProcess({ server });

		// Transport should have _api property (phantom type)
		type TransportType = typeof transport;
		type _assertTyped = Assert<TransportType extends TypedTransport<unknown> ? true : false>;
		const _check: _assertTyped = true;
		expect(_check).toBe(true);
	});

	it("TypedTransport preserves server _types through the chain", () => {
		const { query, mutation } = lens<TestContext>();

		const appRouter = router({
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("Not found");
						return user;
					}),
				update: mutation()
					.input(z.object({ id: z.string(), name: z.string() }))
					.returns(User)
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("Not found");
						const updated = { ...user, name: input.name };
						ctx.db.users.set(input.id, updated);
						return updated;
					}),
			}),
		});

		const server = createServer({
			router: appRouter,
			context: () => ({
				db: { users: new Map(), posts: new Map() },
				currentUser: null,
			}),
		});

		const transport = inProcess({ server });

		// Extract the API type from transport
		type TransportApi = (typeof transport)["_api"];

		// Should have router property
		type _assertHasRouter = Assert<TransportApi extends { router: unknown } ? true : false>;
		const _check: _assertHasRouter = true;
		expect(_check).toBe(true);
	});
});

// =============================================================================
// Test: createClient Type Inference
// =============================================================================

describe("createClient type inference", () => {
	const createTestServer = () => {
		const { query, mutation } = lens<TestContext>();

		return createServer({
			router: router({
				user: router({
					get: query()
						.input(z.object({ id: z.string() }))
						.returns(User)
						.resolve(({ input, ctx }) => {
							const user = ctx.db.users.get(input.id);
							if (!user) throw new Error("Not found");
							return user;
						}),
					list: query()
						.returns([User])
						.resolve(({ ctx }) => Array.from(ctx.db.users.values())),
					search: query()
						.input(z.object({ query: z.string(), limit: z.number().optional() }))
						.returns([User])
						.resolve(({ input, ctx }) => {
							const results = Array.from(ctx.db.users.values()).filter((u) =>
								u.name.toLowerCase().includes(input.query.toLowerCase()),
							);
							return input.limit ? results.slice(0, input.limit) : results;
						}),
					create: mutation()
						.input(z.object({ name: z.string(), email: z.string() }))
						.returns(User)
						.resolve(({ input, ctx }) => {
							const user = {
								id: `user-${Date.now()}`,
								name: input.name,
								email: input.email,
								role: "user" as const,
								createdAt: new Date(),
							};
							ctx.db.users.set(user.id, user);
							return user;
						}),
					update: mutation()
						.input(z.object({ id: z.string(), name: z.string().optional(), email: z.string().optional() }))
						.returns(User)
						.optimistic("merge")
						.resolve(({ input, ctx }) => {
							const user = ctx.db.users.get(input.id);
							if (!user) throw new Error("Not found");
							const updated = {
								...user,
								...(input.name && { name: input.name }),
								...(input.email && { email: input.email }),
							};
							ctx.db.users.set(input.id, updated);
							return updated;
						}),
				}),
				post: router({
					get: query()
						.input(z.object({ id: z.string() }))
						.returns(Post)
						.resolve(({ input, ctx }) => {
							const post = ctx.db.posts.get(input.id);
							if (!post) throw new Error("Not found");
							return post;
						}),
					trending: query()
						.input(z.object({ limit: z.number().default(10) }))
						.returns([Post])
						.resolve(({ ctx, input }) =>
							Array.from(ctx.db.posts.values())
								.filter((p) => p.published)
								.sort((a, b) => b.viewCount - a.viewCount)
								.slice(0, input.limit),
						),
					create: mutation()
						.input(z.object({ title: z.string(), content: z.string() }))
						.returns(Post)
						.optimistic("create")
						.resolve(({ input, ctx }) => {
							const post = {
								id: `post-${Date.now()}`,
								title: input.title,
								content: input.content,
								published: false,
								authorId: ctx.currentUser?.id ?? "unknown",
								viewCount: 0,
							};
							ctx.db.posts.set(post.id, post);
							return post;
						}),
				}),
			}),
			context: () => ({
				db: {
					users: new Map([
						["1", { id: "1", name: "Alice", email: "alice@test.com", role: "admin" as const, createdAt: new Date() }],
						["2", { id: "2", name: "Bob", email: "bob@test.com", role: "user" as const, createdAt: new Date() }],
					]),
					posts: new Map([
						["1", { id: "1", title: "Hello", content: "World", published: true, authorId: "1", viewCount: 100 }],
					]),
				},
				currentUser: { id: "1", name: "Alice" },
			}),
		});
	};

	it("client methods are typed correctly from server router", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Query: client.user.get({ id }) returns User shape
		const user = await client.user.get({ id: "1" });

		// Type assertions - these should compile
		const id: string = user.id;
		const name: string = user.name;
		const email: string = user.email;
		const role: "user" | "admin" | "moderator" = user.role;
		const bio: string | undefined = user.bio;
		const createdAt: Date = user.createdAt;

		expect(id).toBe("1");
		expect(name).toBe("Alice");
		expect(email).toBe("alice@test.com");
		expect(role).toBe("admin");
		expect(bio).toBeUndefined();
		expect(createdAt).toBeInstanceOf(Date);
	});

	it("client array query returns typed array", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Query: client.user.list() returns User[]
		const users = await client.user.list();

		// Should be an array
		expect(Array.isArray(users)).toBe(true);
		expect(users.length).toBeGreaterThan(0);

		// Each item should have User shape
		const firstUser = users[0];
		const name: string = firstUser.name;
		const role: "user" | "admin" | "moderator" = firstUser.role;

		expect(name).toBeDefined();
		expect(["user", "admin", "moderator"]).toContain(role);
	});

	it("client query with input is typed correctly", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Query with input
		const results = await client.user.search({ query: "al", limit: 5 });

		expect(Array.isArray(results)).toBe(true);
	});

	it("client mutation returns typed result with data and rollback", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Mutation: client.user.create returns MutationResult<User>
		const result = await client.user.create({
			name: "Charlie",
			email: "charlie@test.com",
		});

		// Should have data property with User shape
		const user = result.data!;
		const id: string = user.id;
		const name: string = user.name;
		const role: "user" | "admin" | "moderator" = user.role;

		expect(id).toBeDefined();
		expect(name).toBe("Charlie");
		expect(role).toBe("user");

		// Should have rollback function
		expect(typeof result.rollback).toBe("function");
	});

	it("client mutation with optimistic has correct types", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Mutation with .optimistic("merge")
		const result = await client.user.update({
			id: "1",
			name: "Alice Updated",
		});

		const user = result.data!;
		const name: string = user.name;

		expect(name).toBe("Alice Updated");
	});

	it("nested router paths are typed correctly", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// Nested: client.post.get
		const post = await client.post.get({ id: "1" });

		const title: string = post.title;
		const content: string = post.content;
		const published: boolean = post.published;
		const viewCount: number = post.viewCount;

		expect(title).toBe("Hello");
		expect(content).toBe("World");
		expect(published).toBe(true);
		expect(viewCount).toBe(100);
	});

	it("different routes have different types", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		// User has role field
		const user = await client.user.get({ id: "1" });
		const role: "user" | "admin" | "moderator" = user.role;
		expect(role).toBeDefined();

		// Post has viewCount field (not role)
		const post = await client.post.get({ id: "1" });
		const viewCount: number = post.viewCount;
		expect(viewCount).toBeDefined();
	});
});

// =============================================================================
// Test: Type-level Assertions
// =============================================================================

describe("Type-level assertions", () => {
	it("client type matches expected shape", () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				user: router({
					get: query()
						.input(z.object({ id: z.string() }))
						.returns(User)
						.resolve(() => ({
							id: "1",
							name: "John",
							email: "john@test.com",
							role: "user" as const,
							createdAt: new Date(),
						})),
				}),
			}),
			context: () => ({ db: { users: new Map(), posts: new Map() }, currentUser: null }),
		});

		const client = createClient({ transport: inProcess({ server }) });

		// Extract types
		type ClientType = typeof client;
		type UserGetResult = Awaited<ReturnType<ClientType["user"]["get"]>>;

		// UserGetResult should have User shape
		type _assertId = Assert<Equals<UserGetResult["id"], string>>;
		type _assertName = Assert<Equals<UserGetResult["name"], string>>;
		type _assertRole = Assert<Equals<UserGetResult["role"], "user" | "admin" | "moderator">>;
		type _assertBio = Assert<Equals<UserGetResult["bio"], string | undefined>>;

		const checks: [_assertId, _assertName, _assertRole, _assertBio] = [true, true, true, true];
		expect(checks).toEqual([true, true, true, true]);
	});

	it("QueryResult type is correct", () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				data: router({
					list: query()
						.returns([Post])
						.resolve(() => []),
				}),
			}),
			context: () => ({ db: { users: new Map(), posts: new Map() }, currentUser: null }),
		});

		const client = createClient({ transport: inProcess({ server }) });

		type ListResult = Awaited<ReturnType<typeof client.data.list>>;

		// Should be Post[]
		type _assertArray = Assert<ListResult extends unknown[] ? true : false>;
		type ItemType = ListResult extends (infer I)[] ? I : never;
		type _assertItem = Assert<Equals<ItemType["title"], string>>;

		const checks: [_assertArray, _assertItem] = [true, true];
		expect(checks).toEqual([true, true]);
	});
});

// =============================================================================
// Test: Edge Cases
// =============================================================================

describe("Edge cases", () => {
	it("handles deeply nested routers", async () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				api: router({
					v1: router({
						users: router({
							profile: router({
								get: query()
									.input(z.object({ userId: z.string() }))
									.returns(User)
									.resolve(() => ({
										id: "deep",
										name: "Deep User",
										email: "deep@test.com",
										role: "user" as const,
										createdAt: new Date(),
									})),
							}),
						}),
					}),
				}),
			}),
			context: () => ({ db: { users: new Map(), posts: new Map() }, currentUser: null }),
		});

		const client = createClient({ transport: inProcess({ server }) });

		// Deep path should work
		const user = await client.api.v1.users.profile.get({ userId: "1" });

		expect(user.id).toBe("deep");
		expect(user.name).toBe("Deep User");

		// Type should still be correct
		const name: string = user.name;
		const role: "user" | "admin" | "moderator" = user.role;
		expect(name).toBeDefined();
		expect(role).toBe("user");
	});

	it("handles queries without input", async () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				health: query().resolve(() => ({ status: "ok", timestamp: Date.now() })),
			}),
			context: () => ({ db: { users: new Map(), posts: new Map() }, currentUser: null }),
		});

		const client = createClient({ transport: inProcess({ server }) });

		// Should be callable without arguments
		const health = (await client.health()) as { status: string; timestamp: number };

		expect(health.status).toBe("ok");
		expect(typeof health.timestamp).toBe("number");
	});

	it("handles multiple entity types in same router", async () => {
		const { query } = lens<TestContext>();

		const server = createServer({
			router: router({
				user: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(() => ({
						id: "1",
						name: "User",
						email: "user@test.com",
						role: "user" as const,
						createdAt: new Date(),
					})),
				post: query()
					.input(z.object({ id: z.string() }))
					.returns(Post)
					.resolve(() => ({
						id: "1",
						title: "Post",
						content: "Content",
						published: true,
						authorId: "1",
						viewCount: 0,
					})),
			}),
			context: () => ({ db: { users: new Map(), posts: new Map() }, currentUser: null }),
		});

		const client = createClient({ transport: inProcess({ server }) });

		const user = await client.user({ id: "1" });
		const post = await client.post({ id: "1" });

		// Different types
		expect(user.name).toBe("User");
		expect(post.title).toBe("Post");

		// Type assertions
		const userName: string = user.name;
		const postTitle: string = post.title;
		expect(userName).toBeDefined();
		expect(postTitle).toBeDefined();
	});
});
