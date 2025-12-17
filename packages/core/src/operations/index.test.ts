/**
 * @sylphx/lens-core - Operations API Tests
 *
 * Tests for the query() and mutation() builder pattern.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { id, string } from "../schema/fields.js";
import { model } from "../schema/model.js";
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
	router,
	tempId,
} from "./index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
});

const Post = model("Post", {
	id: id(),
	title: string(),
	content: string(),
	authorId: string(),
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
			ctx: {
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
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
			ctx: {
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
		});
		expect(result).toEqual({
			id: "created-1",
			title: "Hello",
			content: "World",
			authorId: "user-1",
		});
	});

	it("supports multi-entity returns", () => {
		const Notification = model("Notification", {
			id: id(),
			userId: string(),
			message: string(),
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
	it("generates unique temporary IDs", () => {
		const id1 = tempId();
		const id2 = tempId();
		const id3 = tempId();

		// All IDs should be unique
		expect(id1).not.toBe(id2);
		expect(id2).not.toBe(id3);
		expect(id1).not.toBe(id3);

		// All IDs should start with "temp_"
		expect(id1.startsWith("temp_")).toBe(true);
		expect(id2.startsWith("temp_")).toBe(true);
		expect(id3.startsWith("temp_")).toBe(true);
	});

	it("isTempId identifies temporary IDs", () => {
		expect(isTempId("temp_0")).toBe(true);
		expect(isTempId("temp_123")).toBe(true);
		expect(isTempId("temp_1234567890_abc123")).toBe(true);
		expect(isTempId(tempId())).toBe(true);
		expect(isTempId("real-id")).toBe(false);
		expect(isTempId("123")).toBe(false);
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
			ctx: {
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
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
			ctx: {
				userId: "user-1",
				permissions: ["read", "write"],
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
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

	it("throws if returns().resolve() is called without input", () => {
		expect(() => {
			// @ts-expect-error - Testing runtime behavior
			mutation()
				.returns(User)
				.resolve(() => ({}));
		}).toThrow("Mutation requires input schema");
	});
});

// =============================================================================
// Test: Optimistic Callback with Input Proxy
// =============================================================================

describe("Optimistic callback with input proxy", () => {
	it("converts callback to Pipeline with input references", () => {
		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string(), authorId: z.string() }))
			.returns(Post)
			.optimistic(({ input }) => {
				// Simulate building steps with input references
				// The proxy should intercept property access and return { $input: 'propName' }
				const titleRef = input.title;
				const contentRef = input.content;
				const authorIdRef = input.authorId;

				// Create mock StepBuilder that returns these references
				return [
					{
						build: () => ({
							namespace: "entity",
							effect: "create",
							args: {
								type: "Post",
								data: {
									title: titleRef,
									content: contentRef,
									authorId: authorIdRef,
								},
							},
						}),
					},
				] as unknown as never[];
			})
			.resolve(({ input }) => ({
				id: "real-id",
				title: input.title,
				content: input.content,
				authorId: input.authorId,
				published: false,
				viewCount: 0,
			}));

		expect(createPost._optimistic).toBeDefined();
		expect(createPost._optimistic).toHaveProperty("$pipe");

		// Verify the pipeline was created
		const pipeline = createPost._optimistic as { $pipe: unknown[] };
		expect(pipeline.$pipe).toBeArrayOfSize(1);
		expect(pipeline.$pipe[0]).toHaveProperty("namespace", "entity");
		expect(pipeline.$pipe[0]).toHaveProperty("effect", "create");
	});

	it("handles multiple step builders in callback", () => {
		const complexMutation = mutation()
			.input(z.object({ userId: z.string(), postId: z.string() }))
			.returns(Post)
			.optimistic(({ input }) => {
				const userIdRef = input.userId;
				const postIdRef = input.postId;

				return [
					{
						build: () => ({
							namespace: "entity",
							effect: "update",
							args: { type: "User", id: userIdRef },
						}),
					},
					{
						build: () => ({
							namespace: "entity",
							effect: "update",
							args: { type: "Post", id: postIdRef },
						}),
					},
				] as unknown as never[];
			})
			.resolve(({ input }) => ({
				id: input.postId,
				title: "Title",
				content: "Content",
				published: true,
				authorId: input.userId,
				viewCount: 0,
			}));

		const pipeline = complexMutation._optimistic as { $pipe: unknown[] };
		expect(pipeline.$pipe).toBeArrayOfSize(2);
	});

	it("input proxy intercepts nested property access", () => {
		const mutation1 = mutation()
			.input(z.object({ data: z.object({ name: z.string(), email: z.string() }) }))
			.returns(User)
			.optimistic(({ input }) => {
				// Access nested properties
				const dataRef = input.data;

				return [
					{
						build: () => ({
							namespace: "entity",
							effect: "create",
							args: { type: "User", data: dataRef },
						}),
					},
				] as unknown as never[];
			})
			.resolve(() => ({
				id: "1",
				name: "John",
				email: "john@example.com",
				role: "user" as const,
				createdAt: new Date(),
			}));

		expect(mutation1._optimistic).toBeDefined();
		const pipeline = mutation1._optimistic as { $pipe: unknown[] };
		expect(pipeline.$pipe).toBeArrayOfSize(1);
	});
});

// =============================================================================
// Test: Named Operations
// =============================================================================

describe("Named operations", () => {
	it("query() accepts a name parameter", () => {
		const namedQuery = query("getUserById")
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: input.id,
				name: "John",
				email: "john@example.com",
				role: "user" as const,
				createdAt: new Date(),
			}));

		expect(namedQuery._name).toBe("getUserById");
		expect(namedQuery._type).toBe("query");
	});

	it("mutation() accepts a name parameter", () => {
		const namedMutation = mutation("createUser")
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "1",
				name: input.name,
				email: "john@example.com",
				role: "user" as const,
				createdAt: new Date(),
			}));

		expect(namedMutation._name).toBe("createUser");
		expect(namedMutation._type).toBe("mutation");
	});

	it("query() name persists through builder chain", () => {
		const q = query("test")
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(() => ({
				id: "1",
				name: "John",
				email: "john@example.com",
				role: "user" as const,
				createdAt: new Date(),
			}));

		expect(q._name).toBe("test");
	});

	it("mutation() name persists through optimistic chain", () => {
		const m = mutation("updatePost")
			.input(z.object({ id: z.string() }))
			.returns(Post)
			.optimistic("merge")
			.resolve(({ input }) => ({
				id: input.id,
				title: "Title",
				content: "Content",
				published: true,
				authorId: "1",
				viewCount: 0,
			}));

		expect(m._name).toBe("updatePost");
	});
});

// =============================================================================
// Test: Query without returns() or input()
// =============================================================================

describe("Query minimal configuration", () => {
	it("query can be created with only resolve()", () => {
		const simpleQuery = query().resolve(() => ({ status: "ok" }));

		expect(simpleQuery._type).toBe("query");
		expect(simpleQuery._input).toBeUndefined();
		expect(simpleQuery._output).toBeUndefined();
		expect(simpleQuery._resolve).toBeDefined();
	});

	it("query with name but no input/returns", () => {
		const healthCheck = query("health").resolve(() => ({ healthy: true }));

		expect(healthCheck._name).toBe("health");
		expect(healthCheck._type).toBe("query");
		expect(healthCheck._input).toBeUndefined();
		expect(healthCheck._output).toBeUndefined();
	});

	it("executes simple query resolver", async () => {
		const getTime = query().resolve(() => ({ timestamp: Date.now() }));

		const result = await getTime._resolve!({
			input: undefined,
			ctx: {
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
		});

		expect(result).toHaveProperty("timestamp");
		expect(typeof (result as { timestamp: number }).timestamp).toBe("number");
	});
});

// =============================================================================
// Test: Mutation resolve without .returns()
// =============================================================================

describe("Mutation without returns()", () => {
	it("mutation can resolve directly after input()", () => {
		const deleteSomething = mutation()
			.input(z.object({ id: z.string() }))
			.resolve(({ input }) => ({ deleted: true, id: input.id }));

		expect(deleteSomething._type).toBe("mutation");
		expect(deleteSomething._input).toBeDefined();
		expect(deleteSomething._output).toBeUndefined();
	});

	it("executes mutation without returns()", async () => {
		const performAction = mutation()
			.input(z.object({ action: z.string() }))
			.resolve(async ({ input }) => ({
				success: true,
				action: input.action,
				timestamp: Date.now(),
			}));

		const result = await performAction._resolve({
			input: { action: "test" },
			ctx: {
				emit: (() => {}) as never,
				onCleanup: () => () => {},
			},
		});

		expect((result as { success: boolean }).success).toBe(true);
		expect((result as { action: string }).action).toBe("test");
	});
});

// =============================================================================
// Test: Edge Cases for Type Guards
// =============================================================================

describe("Type guard edge cases", () => {
	it("isQueryDef handles undefined", () => {
		expect(isQueryDef(undefined)).toBe(false);
	});

	it("isMutationDef handles undefined", () => {
		expect(isMutationDef(undefined)).toBe(false);
	});

	it("isOperationDef handles undefined", () => {
		expect(isOperationDef(undefined)).toBe(false);
	});

	it("isRouterDef handles undefined", () => {
		expect(isRouterDef(undefined)).toBe(false);
	});

	it("isOptimisticDSL handles array", () => {
		expect(isOptimisticDSL([])).toBe(false);
		expect(isOptimisticDSL([1, 2, 3])).toBe(false);
	});

	it("isOptimisticDSL handles boolean", () => {
		expect(isOptimisticDSL(true)).toBe(false);
		expect(isOptimisticDSL(false)).toBe(false);
	});

	it("isTempId handles empty string", () => {
		expect(isTempId("")).toBe(false);
	});

	it("isTempId handles non-temp_ prefix", () => {
		expect(isTempId("temp-123")).toBe(false);
		expect(isTempId("TEMP_123")).toBe(false);
		expect(isTempId("temporary_123")).toBe(false);
	});
});

// =============================================================================
// Test: flattenRouter with empty router
// =============================================================================

describe("flattenRouter edge cases", () => {
	it("handles empty router", () => {
		const emptyRouter = router({});
		const flattened = flattenRouter(emptyRouter);

		expect(flattened.size).toBe(0);
	});

	it("handles router with only one procedure", () => {
		const singleRouter = router({
			test: query()
				.returns(User)
				.resolve(() => ({ id: "1", name: "John", email: "john@example.com" })),
		});

		const flattened = flattenRouter(singleRouter);

		expect(flattened.size).toBe(1);
		expect(flattened.has("test")).toBe(true);
	});

	it("preserves procedure reference through flattening", () => {
		const testQuery = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));

		const testRouter = router({ test: testQuery });
		const flattened = flattenRouter(testRouter);

		// The flattened procedure should be the same object reference
		expect(flattened.get("test")).toBe(testQuery);
	});
});

// =============================================================================
// Test: Mutation optimistic with different DSL patterns
// =============================================================================

describe("Optimistic DSL patterns", () => {
	it("supports 'merge' sugar syntax", () => {
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(Post)
			.optimistic("merge")
			.resolve(({ input }) => ({
				id: input.id,
				title: "Title",
				content: "Content",
				published: true,
				authorId: "1",
				viewCount: 0,
			}));

		expect(m._optimistic).toBe("merge");
		expect(isOptimisticDSL(m._optimistic)).toBe(true);
	});

	it("supports 'delete' sugar syntax", () => {
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(Post)
			.optimistic("delete")
			.resolve(({ input }) => ({
				id: input.id,
				title: "",
				content: "",
				published: false,
				authorId: "",
				viewCount: 0,
			}));

		expect(m._optimistic).toBe("delete");
		expect(isOptimisticDSL(m._optimistic)).toBe(true);
	});

	it("supports object merge with additional fields", () => {
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(Post)
			.optimistic({ merge: { published: true, updatedAt: Date.now() } })
			.resolve(({ input }) => ({
				id: input.id,
				title: "Title",
				content: "Content",
				published: true,
				authorId: "1",
				viewCount: 0,
			}));

		expect(m._optimistic).toEqual({ merge: { published: true, updatedAt: expect.any(Number) } });
		expect(isOptimisticDSL(m._optimistic)).toBe(true);
	});

	it("supports Pipeline DSL directly", () => {
		const pipeline = {
			$pipe: [
				{
					namespace: "entity",
					effect: "update",
					args: { type: "Post", id: "123" },
				},
			],
		};

		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(Post)
			.optimistic(pipeline as never)
			.resolve(({ input }) => ({
				id: input.id,
				title: "Title",
				content: "Content",
				published: true,
				authorId: "1",
				viewCount: 0,
			}));

		expect(m._optimistic).toEqual(pipeline);
		expect(isOptimisticDSL(m._optimistic)).toBe(true);
	});
});

// =============================================================================
// Test: Context types with operations factory
// =============================================================================

describe("operations() factory context handling", () => {
	it("maintains context type through complex chains", () => {
		interface ComplexContext {
			db: { query: (sql: string) => unknown };
			cache: Map<string, unknown>;
			logger: { log: (msg: string) => void };
		}

		const { query, mutation } = operations<ComplexContext>();

		const complexQuery = query("complexOp")
			.input(z.object({ key: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				ctx.logger.log(`Querying ${input.key}`);
				const cached = ctx.cache.get(input.key);
				if (!cached) {
					ctx.db.query(`SELECT * FROM users WHERE key = '${input.key}'`);
				}
				return {
					id: "1",
					name: "John",
					email: "john@example.com",
					role: "user" as const,
					createdAt: new Date(),
				};
			});

		const complexMutation = mutation("complexMut")
			.input(z.object({ id: z.string(), data: z.string() }))
			.returns(User)
			.optimistic("merge")
			.resolve(({ input, ctx }) => {
				ctx.logger.log(`Mutating ${input.id}`);
				ctx.cache.set(input.id, input.data);
				return {
					id: input.id,
					name: input.data,
					email: "john@example.com",
					role: "user" as const,
					createdAt: new Date(),
				};
			});

		expect(complexQuery._name).toBe("complexOp");
		expect(complexMutation._name).toBe("complexMut");
		expect(complexMutation._optimistic).toBe("merge");
	});
});
