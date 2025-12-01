/**
 * @sylphx/lens-core - Operations API Tests
 *
 * Tests for the query() and mutation() builder pattern.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { entity } from "../schema/define.js";
import { t } from "../schema/types.js";
import {
	flattenRouter,
	isMutationDef,
	isOperationDef,
	isOptimisticDSL,
	isQueryDef,
	isRouterDef,
	isTempId,
	mutation,
	operations,
	query,
	resetTempIdCounter,
	router,
	tempId,
} from "./index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// =============================================================================
// Test: query() Builder
// =============================================================================

describe("query() builder", () => {
	it("creates a query without input", () => {
		const whoami = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));

		expect(whoami._type).toBe("query");
		expect(whoami._input).toBeUndefined();
		expect(whoami._output).toBe(User);
		expect(whoami._resolve).toBeDefined();
	});

	it("creates a query with input", () => {
		const getUserById = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(getUserById._type).toBe("query");
		expect(getUserById._input).toBeDefined();
		expect(getUserById._output).toBe(User);
	});

	it("creates a query returning array", () => {
		const listUsers = query()
			.returns([User])
			.resolve(() => [
				{ id: "1", name: "John", email: "john@example.com" },
				{ id: "2", name: "Jane", email: "jane@example.com" },
			]);

		expect(listUsers._type).toBe("query");
		expect(listUsers._output).toEqual([User]);
	});

	it("creates a query with Zod schema as return type", () => {
		const ResponseSchema = z.object({
			success: z.boolean(),
			message: z.string(),
			count: z.number(),
		});

		const getStatus = query()
			.returns(ResponseSchema)
			.resolve(() => ({
				success: true,
				message: "OK",
				count: 42,
			}));

		expect(getStatus._type).toBe("query");
		expect(getStatus._output).toBe(ResponseSchema);

		// Type inference check - this should compile
		type Expected = { success: boolean; message: string; count: number };
		const _typeCheck: Expected = { success: true, message: "OK", count: 42 };
		expect(_typeCheck).toBeDefined();
	});

	it("executes resolver function", async () => {
		const mockDb = {
			user: {
				findUnique: async ({ where }: { where: { id: string } }) => ({
					id: where.id,
					name: "John",
					email: "john@example.com",
				}),
			},
		};

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(async ({ input }) => mockDb.user.findUnique({ where: { id: input.id } }));

		const result = await getUser._resolve!({
			input: { id: "123" },
			ctx: {},
			emit: (() => {}) as never,
			onCleanup: () => () => {},
		});
		expect(result).toEqual({ id: "123", name: "John", email: "john@example.com" });
	});
});

// =============================================================================
// Test: mutation() Builder
// =============================================================================

describe("mutation() builder", () => {
	it("creates a mutation with input and returns", () => {
		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.resolve(({ input }) => ({
				id: "1",
				title: input.title,
				content: input.content,
				authorId: "user-1",
			}));

		expect(createPost._type).toBe("mutation");
		expect(createPost._input).toBeDefined();
		expect(createPost._output).toBe(Post);
		expect(createPost._optimistic).toBeUndefined();
	});

	it("creates a mutation with optimistic DSL", () => {
		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.optimistic("create")
			.resolve(({ input }) => ({
				id: "real-id",
				title: input.title,
				content: input.content,
				authorId: "user-1",
			}));

		expect(createPost._type).toBe("mutation");
		expect(createPost._optimistic).toBe("create");
	});

	it("creates a mutation with optimistic DSL object", () => {
		const updatePost = mutation()
			.input(z.object({ id: z.string(), title: z.string() }))
			.returns(Post)
			.optimistic({ merge: { updatedAt: "now" } })
			.resolve(({ input }) => ({
				id: input.id,
				title: input.title,
				content: "content",
				authorId: "user-1",
			}));

		expect(updatePost._type).toBe("mutation");
		expect(updatePost._optimistic).toEqual({ merge: { updatedAt: "now" } });
	});

	it("executes resolver function", async () => {
		const mockDb = {
			post: {
				create: async ({ data }: { data: { title: string; content: string } }) => ({
					id: "created-1",
					...data,
					authorId: "user-1",
				}),
			},
		};

		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.resolve(async ({ input }) => mockDb.post.create({ data: input }));

		const result = await createPost._resolve({
			input: { title: "Hello", content: "World" },
			ctx: {},
			emit: (() => {}) as never,
			onCleanup: () => () => {},
		});
		expect(result).toEqual({
			id: "created-1",
			title: "Hello",
			content: "World",
			authorId: "user-1",
		});
	});

	it("supports multi-entity returns", () => {
		const Notification = entity("Notification", {
			id: t.id(),
			userId: t.string(),
			message: t.string(),
		});

		const promoteUsers = mutation()
			.input(z.object({ userIds: z.array(z.string()), role: z.string() }))
			.returns({ users: [User], notifications: [Notification] })
			.resolve(({ input }) => ({
				users: input.userIds.map((id) => ({ id, name: "User", email: "user@example.com" })),
				notifications: input.userIds.map((id) => ({
					id: `notif-${id}`,
					userId: id,
					message: "Promoted!",
				})),
			}));

		expect(promoteUsers._type).toBe("mutation");
		expect(promoteUsers._output).toEqual({ users: [User], notifications: [Notification] });
	});
});

// =============================================================================
// Test: tempId()
// =============================================================================

describe("tempId()", () => {
	beforeEach(() => {
		resetTempIdCounter();
	});

	it("generates unique temporary IDs", () => {
		const id1 = tempId();
		const id2 = tempId();
		const id3 = tempId();

		expect(id1).toBe("temp_0");
		expect(id2).toBe("temp_1");
		expect(id3).toBe("temp_2");
	});

	it("isTempId identifies temporary IDs", () => {
		expect(isTempId("temp_0")).toBe(true);
		expect(isTempId("temp_123")).toBe(true);
		expect(isTempId("real-id")).toBe(false);
		expect(isTempId("123")).toBe(false);
	});

	it("resetTempIdCounter resets the counter", () => {
		tempId();
		tempId();
		resetTempIdCounter();
		expect(tempId()).toBe("temp_0");
	});
});

// =============================================================================
// Test: Type Guards
// =============================================================================

describe("Type guards", () => {
	it("isQueryDef identifies query definitions", () => {
		const q = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));

		expect(isQueryDef(q)).toBe(true);
		expect(isQueryDef({})).toBe(false);
		expect(isQueryDef(null)).toBe(false);
		expect(isQueryDef({ _type: "mutation" })).toBe(false);
	});

	it("isMutationDef identifies mutation definitions", () => {
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(isMutationDef(m)).toBe(true);
		expect(isMutationDef({})).toBe(false);
		expect(isMutationDef({ _type: "query" })).toBe(false);
	});

	it("isOperationDef identifies any operation", () => {
		const q = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(isOperationDef(q)).toBe(true);
		expect(isOperationDef(m)).toBe(true);
		expect(isOperationDef({})).toBe(false);
	});
});

// =============================================================================
// Test: Async Generator Support (Streaming)
// =============================================================================

describe("Streaming support", () => {
	it("query supports async generators", async () => {
		const streamingQuery = query()
			.returns([User])
			.resolve(async function* () {
				yield [{ id: "1", name: "John", email: "john@example.com" }];
				yield [
					{ id: "1", name: "John", email: "john@example.com" },
					{ id: "2", name: "Jane", email: "jane@example.com" },
				];
			});

		expect(streamingQuery._type).toBe("query");
		expect(streamingQuery._resolve).toBeDefined();

		// Execute and collect results
		const generator = streamingQuery._resolve!({
			input: undefined,
			ctx: {},
			emit: (() => {}) as never,
			onCleanup: () => () => {},
		}) as AsyncGenerator<unknown[]>;
		const results: unknown[][] = [];

		for await (const result of generator) {
			results.push(result);
		}

		expect(results).toHaveLength(2);
		expect(results[0]).toHaveLength(1);
		expect(results[1]).toHaveLength(2);
	});
});

// =============================================================================
// Test: Input Validation
// =============================================================================

describe("Input validation", () => {
	it("input schema validates data", () => {
		const schema = z.object({ id: z.string() });
		const _getUser = query()
			.input(schema)
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		// Valid input
		const result = schema.safeParse({ id: "123" });
		expect(result.success).toBe(true);

		// Invalid input
		const invalid = schema.safeParse({ id: 123 });
		expect(invalid.success).toBe(false);
	});
});

// =============================================================================
// Test: router() Builder
// =============================================================================

describe("router() builder", () => {
	it("creates a router with queries and mutations", () => {
		const appRouter = router({
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" })),
				list: query()
					.returns([User])
					.resolve(() => []),
				create: mutation()
					.input(z.object({ name: z.string(), email: z.string() }))
					.returns(User)
					.resolve(({ input }) => ({ id: "1", ...input })),
			}),
			post: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(Post)
					.resolve(({ input }) => ({
						id: input.id,
						title: "Title",
						content: "Content",
						authorId: "1",
					})),
			}),
		});

		expect(appRouter._type).toBe("router");
		expect(appRouter._routes).toBeDefined();
		expect(isRouterDef(appRouter)).toBe(true);
		expect(isRouterDef(appRouter._routes.user)).toBe(true);
		expect(isRouterDef(appRouter._routes.post)).toBe(true);
	});

	it("isRouterDef identifies router definitions", () => {
		const r = router({
			test: query()
				.returns(User)
				.resolve(() => ({ id: "1", name: "John", email: "john@example.com" })),
		});

		expect(isRouterDef(r)).toBe(true);
		expect(isRouterDef({})).toBe(false);
		expect(isRouterDef(null)).toBe(false);
		expect(isRouterDef({ _type: "query" })).toBe(false);
	});

	it("flattenRouter converts nested router to flat map", () => {
		const appRouter = router({
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" })),
				create: mutation()
					.input(z.object({ name: z.string(), email: z.string() }))
					.returns(User)
					.resolve(({ input }) => ({ id: "1", ...input })),
			}),
			post: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(Post)
					.resolve(({ input }) => ({
						id: input.id,
						title: "Title",
						content: "Content",
						authorId: "1",
					})),
				comment: router({
					list: query()
						.returns([User])
						.resolve(() => []),
				}),
			}),
		});

		const flattened = flattenRouter(appRouter);

		expect(flattened.size).toBe(4);
		expect(flattened.has("user.get")).toBe(true);
		expect(flattened.has("user.create")).toBe(true);
		expect(flattened.has("post.get")).toBe(true);
		expect(flattened.has("post.comment.list")).toBe(true);

		// Verify types
		expect(isQueryDef(flattened.get("user.get"))).toBe(true);
		expect(isMutationDef(flattened.get("user.create"))).toBe(true);
		expect(isQueryDef(flattened.get("post.comment.list"))).toBe(true);
	});

	it("supports deeply nested routers", () => {
		const appRouter = router({
			api: router({
				v1: router({
					user: router({
						profile: router({
							get: query()
								.returns(User)
								.resolve(() => ({ id: "1", name: "John", email: "john@example.com" })),
						}),
					}),
				}),
			}),
		});

		const flattened = flattenRouter(appRouter);

		expect(flattened.size).toBe(1);
		expect(flattened.has("api.v1.user.profile.get")).toBe(true);
	});

	it("handles mixed flat and nested operations", () => {
		const appRouter = router({
			// Flat operation at root
			health: query()
				.returns(User) // Using User as placeholder
				.resolve(() => ({ id: "ok", name: "healthy", email: "" })),
			// Nested namespace
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" })),
			}),
		});

		const flattened = flattenRouter(appRouter);

		expect(flattened.size).toBe(2);
		expect(flattened.has("health")).toBe(true);
		expect(flattened.has("user.get")).toBe(true);
	});

	it("infers merged context type from procedures (type-level test)", () => {
		// Define different context types for each procedure
		interface DbContext {
			db: { query: (sql: string) => unknown[] };
		}
		interface UserContext {
			user: { id: string; name: string } | null;
		}
		interface CacheContext {
			cache: { get: (key: string) => unknown };
		}

		// Each procedure declares only what it needs
		const getUserById = query<DbContext & UserContext>()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				// ctx has db and user
				ctx.db.query("SELECT * FROM users");
				return { id: "1", name: ctx.user?.name ?? "Anonymous", email: "" };
			});

		const getCachedData = query<DbContext & CacheContext>()
			.input(z.object({ key: z.string() }))
			.resolve(({ ctx }) => {
				// ctx has db and cache
				ctx.cache.get("key");
				ctx.db.query("SELECT 1");
				return { id: "cached", name: "data", email: "" };
			});

		const appRouter = router({
			user: router({ get: getUserById }),
			cache: router({ get: getCachedData }),
		});

		// Router should infer merged context
		expect(appRouter._type).toBe("router");

		// Type assertion - this compiles only if InferRouterContext works correctly
		// The inferred type should be DbContext & UserContext & CacheContext
		type RouterContext = typeof appRouter extends { _context?: infer C } ? C : never;

		// This is a compile-time check - if types don't match, this won't compile
		const _typeCheck: RouterContext = {} as DbContext & UserContext & CacheContext;
		expect(_typeCheck).toBeDefined();
	});
});

// =============================================================================
// Test: operations() Factory
// =============================================================================

describe("operations() factory", () => {
	it("creates typed query and mutation builders", () => {
		interface AppContext {
			db: { users: Map<string, { id: string; name: string; email: string }> };
		}

		const { query, mutation } = operations<AppContext>();

		// query() should return a typed builder
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input, ctx }) => {
				// ctx is AppContext - this compiles only if types are correct
				const user = ctx.db.users.get(input.id);
				return user ?? { id: input.id, name: "Unknown", email: "" };
			});

		// mutation() should return a typed builder
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.resolve(({ input, ctx }) => {
				const user = { id: "new", ...input };
				ctx.db.users.set(user.id, user);
				return user;
			});

		expect(isQueryDef(getUser)).toBe(true);
		expect(isMutationDef(createUser)).toBe(true);
	});

	it("query and mutation work with named operations", () => {
		const { query, mutation } = operations<{ db: unknown }>();

		const namedQuery = query("getUsers").resolve(() => []);

		const namedMutation = mutation("createUser")
			.input(z.object({ name: z.string() }))
			.resolve(({ input }) => ({ id: "1", name: input.name }));

		expect(namedQuery._name).toBe("getUsers");
		expect(namedMutation._name).toBe("createUser");
	});

	it("resolvers receive correctly typed context", async () => {
		interface TestContext {
			userId: string;
			permissions: string[];
		}

		const { query } = operations<TestContext>();

		const whoami = query().resolve(({ ctx }) => {
			// Type check - ctx should have userId and permissions
			return { userId: ctx.userId, perms: ctx.permissions.join(",") };
		});

		const result = await whoami._resolve!({
			input: undefined,
			ctx: { userId: "user-1", permissions: ["read", "write"] },
			emit: (() => {}) as never,
			onCleanup: () => () => {},
		});

		expect(result).toEqual({ userId: "user-1", perms: "read,write" });
	});
});

// =============================================================================
// Test: Optimistic DSL Helpers
// =============================================================================

describe("Optimistic DSL Helpers", () => {
	describe("isOptimisticDSL", () => {
		it("identifies Reify Pipeline", () => {
			// Reify Pipeline has $pipe array
			const pipeline = {
				$pipe: [{ namespace: "entity", effect: "create", args: { type: "User" } }],
			};
			expect(isOptimisticDSL(pipeline)).toBe(true);
		});

		it("returns true for sugar syntax object", () => {
			expect(isOptimisticDSL({ merge: { published: true } })).toBe(true);
		});

		it("returns true for sugar syntax strings", () => {
			expect(isOptimisticDSL("merge")).toBe(true);
			expect(isOptimisticDSL("create")).toBe(true);
			expect(isOptimisticDSL("delete")).toBe(true);
		});

		it("returns false for invalid strings", () => {
			expect(isOptimisticDSL("invalid")).toBe(false);
			expect(isOptimisticDSL("update")).toBe(false);
		});

		it("returns false for empty object", () => {
			expect(isOptimisticDSL({})).toBe(false);
		});

		it("returns false for null", () => {
			expect(isOptimisticDSL(null)).toBe(false);
		});

		it("returns false for undefined", () => {
			expect(isOptimisticDSL(undefined)).toBe(false);
		});

		it("returns false for number", () => {
			expect(isOptimisticDSL(123)).toBe(false);
		});
	});
});

// =============================================================================
// Test: Mutation requires input
// =============================================================================

describe("Mutation input requirement", () => {
	it("throws if resolve is called without input", () => {
		expect(() => {
			// @ts-expect-error - Testing runtime behavior
			mutation().resolve(() => ({}));
		}).toThrow("Mutation requires input schema");
	});
});
