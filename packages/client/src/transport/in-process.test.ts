/**
 * @sylphx/lens-client - In-Process Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { entity, lens, router, t } from "@sylphx/lens-core";
import { createServer } from "@sylphx/lens-server";
import { z } from "zod";
import { type ExtractServerTypes, inProcess, type LensServerInterface, type TypedTransport } from "./in-process";
import type { Observable, Result } from "./types";

// =============================================================================
// Mock Server
// =============================================================================

function createMockServer(overrides: Partial<LensServerInterface> = {}): LensServerInterface {
	return {
		getMetadata: () => ({
			version: "1.0.0",
			operations: {
				user: { get: { type: "query" } },
				post: { create: { type: "mutation" } },
			},
		}),
		execute: async (op) => ({ data: { id: "1", path: op.path } }),
		...overrides,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("inProcess transport", () => {
	describe("connect()", () => {
		it("returns metadata from server", async () => {
			const server = createMockServer();
			const transport = inProcess({ server });

			const metadata = await transport.connect();

			expect(metadata.version).toBe("1.0.0");
			expect(metadata.operations.user).toBeDefined();
		});

		it("returns server metadata directly without network call", async () => {
			const getMetadata = mock(() => ({
				version: "2.0.0",
				operations: {},
			}));
			const server = createMockServer({ getMetadata });
			const transport = inProcess({ server });

			await transport.connect();

			expect(getMetadata).toHaveBeenCalledTimes(1);
		});
	});

	describe("execute()", () => {
		it("executes query operation", async () => {
			const server = createMockServer();
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			})) as Result;

			expect(result.data).toEqual({ id: "1", path: "user.get" });
		});

		it("executes mutation operation", async () => {
			const execute = mock(async () => ({ data: { id: "new-1" } }));
			const server = createMockServer({ execute });
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "2",
				path: "post.create",
				type: "mutation",
				input: { title: "Hello" },
			})) as Result;

			expect(result.data).toEqual({ id: "new-1" });
			expect(execute).toHaveBeenCalledWith({
				id: "2",
				path: "post.create",
				type: "mutation",
				input: { title: "Hello" },
			});
		});

		it("handles subscription operation", async () => {
			const mockObservable: Observable<Result> = {
				subscribe: (observer) => {
					observer.next?.({ data: { count: 1 } });
					observer.next?.({ data: { count: 2 } });
					return { unsubscribe: () => {} };
				},
			};

			const server = createMockServer({
				execute: () => mockObservable,
			});
			const transport = inProcess({ server });

			const result = transport.execute({
				id: "3",
				path: "counter.watch",
				type: "subscription",
			});

			// Should return observable
			expect(result).toHaveProperty("subscribe");

			const values: unknown[] = [];
			const observable = result as Observable<Result>;
			observable.subscribe({
				next: (r) => values.push(r.data),
			});

			expect(values).toEqual([{ count: 1 }, { count: 2 }]);
		});

		it("passes operation input correctly", async () => {
			const execute = mock(async (op) => ({ data: op.input }));
			const server = createMockServer({ execute });
			const transport = inProcess({ server });

			const input = { userId: "123", options: { includeDeleted: true } };
			const result = (await transport.execute({
				id: "4",
				path: "user.get",
				type: "query",
				input,
			})) as Result;

			expect(result.data).toEqual(input);
		});

		it("handles server errors", async () => {
			const server = createMockServer({
				execute: async () => ({ error: new Error("Database error") }),
			});
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "5",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe("Database error");
		});

		it("handles server throwing", async () => {
			const server = createMockServer({
				execute: async () => {
					throw new Error("Unexpected error");
				},
			});
			const transport = inProcess({ server });

			await expect(
				transport.execute({
					id: "6",
					path: "user.get",
					type: "query",
				}),
			).rejects.toThrow("Unexpected error");
		});
	});

	describe("integration", () => {
		it("works with multiple operations", async () => {
			const server = createMockServer({
				execute: async (op) => {
					if (op.path === "user.get") return { data: { name: "John" } };
					if (op.path === "post.create") return { data: { id: "post-1" } };
					return { error: new Error("Unknown path") };
				},
			});
			const transport = inProcess({ server });

			const [user, post] = await Promise.all([
				transport.execute({ id: "1", path: "user.get", type: "query" }),
				transport.execute({ id: "2", path: "post.create", type: "mutation", input: {} }),
			]);

			expect((user as Result).data).toEqual({ name: "John" });
			expect((post as Result).data).toEqual({ id: "post-1" });
		});
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

// Type helpers
type Equals<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

describe("inProcess type inference", () => {
	// Test entities
	const User = entity("User", {
		id: t.id(),
		name: t.string(),
		email: t.string(),
	});

	interface TestContext {
		db: Map<string, unknown>;
	}

	describe("TypedTransport", () => {
		it("preserves server type through phantom _api property", () => {
			const { query } = lens<TestContext>();

			const server = createServer({
				router: router({
					user: router({
						get: query()
							.input(z.object({ id: z.string() }))
							.returns(User)
							.resolve(() => ({ id: "1", name: "John", email: "john@test.com" })),
					}),
				}),
				context: () => ({ db: new Map() }),
			});

			const transport = inProcess({ server });

			// TypedTransport should have _api property type
			type TransportType = typeof transport;

			// Should extend TypedTransport
			type _assertTypedTransport = Assert<TransportType extends TypedTransport<unknown> ? true : false>;
			const _check: _assertTypedTransport = true;
			expect(_check).toBe(true);

			// Runtime: transport should have connect and execute
			expect(typeof transport.connect).toBe("function");
			expect(typeof transport.execute).toBe("function");
		});

		it("_api type matches server._types", () => {
			const { query, mutation } = lens<TestContext>();

			const appRouter = router({
				user: router({
					get: query()
						.input(z.object({ id: z.string() }))
						.returns(User)
						.resolve(() => ({ id: "1", name: "John", email: "john@test.com" })),
					create: mutation()
						.input(z.object({ name: z.string(), email: z.string() }))
						.returns(User)
						.resolve(({ input }) => ({ id: "new", ...input })),
				}),
			});

			const server = createServer({
				router: appRouter,
				context: () => ({ db: new Map() }),
			});

			const transport = inProcess({ server });

			// Extract types
			type ServerTypes = typeof server._types;
			type TransportApi = (typeof transport)["_api"];

			// TransportApi should match ServerTypes
			type _assertMatch = Assert<Equals<TransportApi, ServerTypes>>;
			const _check: _assertMatch = true;
			expect(_check).toBe(true);
		});
	});

	describe("ExtractServerTypes", () => {
		it("extracts _types from server with intersection type", () => {
			const { query } = lens<TestContext>();

			const server = createServer({
				router: router({
					test: query().resolve(() => ({ ok: true })),
				}),
				context: () => ({ db: new Map() }),
			});

			// ExtractServerTypes should extract _types
			type Extracted = ExtractServerTypes<typeof server>;

			// Should have router property
			type _assertHasRouter = Assert<Extracted extends { router: unknown } ? true : false>;
			const _check: _assertHasRouter = true;
			expect(_check).toBe(true);
		});

		it("returns unknown for non-server types", () => {
			type NoTypes = ExtractServerTypes<{ foo: string }>;

			// Should be unknown for objects without _types
			type _assertUnknown = Assert<Equals<NoTypes, unknown>>;
			const _check: _assertUnknown = true;
			expect(_check).toBe(true);
		});
	});

	describe("Generic type preservation", () => {
		it("preserves router structure through transport", () => {
			const { query, mutation } = lens<TestContext>();

			const server = createServer({
				router: router({
					users: router({
						list: query()
							.returns([User])
							.resolve(() => []),
						get: query()
							.input(z.object({ id: z.string() }))
							.returns(User)
							.resolve(() => ({ id: "1", name: "John", email: "john@test.com" })),
						create: mutation()
							.input(z.object({ name: z.string(), email: z.string() }))
							.returns(User)
							.resolve(({ input }) => ({ id: "new", ...input })),
					}),
					posts: router({
						trending: query().resolve(() => []),
					}),
				}),
				context: () => ({ db: new Map() }),
			});

			const transport = inProcess({ server });

			// The transport's _api should have the full router structure
			type Api = (typeof transport)["_api"];
			type RouterType = Api["router"];

			// RouterType should have users and posts namespaces
			type _assertUsers = Assert<RouterType["_routes"] extends { users: unknown } ? true : false>;
			type _assertPosts = Assert<RouterType["_routes"] extends { posts: unknown } ? true : false>;

			const checks: [_assertUsers, _assertPosts] = [true, true];
			expect(checks).toEqual([true, true]);
		});

		it("preserves query/mutation types through transport", () => {
			const { query, mutation } = lens<TestContext>();

			const server = createServer({
				router: router({
					getData: query()
						.input(z.object({ id: z.string() }))
						.returns(User)
						.resolve(() => ({ id: "1", name: "John", email: "john@test.com" })),
					setData: mutation()
						.input(z.object({ id: z.string(), value: z.string() }))
						.resolve(({ input }) => ({ updated: input.id })),
				}),
				context: () => ({ db: new Map() }),
			});

			const transport = inProcess({ server });

			type Api = (typeof transport)["_api"];
			type RouterType = Api["router"];
			type Routes = RouterType["_routes"];

			// getData should be QueryDef
			type GetDataType = Routes["getData"];
			type _assertQuery = Assert<GetDataType extends { _type: "query" } ? true : false>;

			// setData should be MutationDef
			type SetDataType = Routes["setData"];
			type _assertMutation = Assert<SetDataType extends { _type: "mutation" } ? true : false>;

			const checks: [_assertQuery, _assertMutation] = [true, true];
			expect(checks).toEqual([true, true]);
		});
	});

	describe("Real server integration", () => {
		it("works with full createServer setup", async () => {
			const { query, mutation } = lens<TestContext>();

			const db = new Map<string, { id: string; name: string; email: string }>();
			db.set("1", { id: "1", name: "Alice", email: "alice@test.com" });

			const server = createServer({
				router: router({
					user: router({
						get: query()
							.input(z.object({ id: z.string() }))
							.returns(User)
							.resolve(({ input }) => {
								const user = db.get(input.id);
								if (!user) throw new Error("Not found");
								return user;
							}),
						create: mutation()
							.input(z.object({ name: z.string(), email: z.string() }))
							.returns(User)
							.resolve(({ input }) => {
								const user = { id: String(db.size + 1), ...input };
								db.set(user.id, user);
								return user;
							}),
					}),
				}),
				context: () => ({ db }),
			});

			const transport = inProcess({ server });

			// Test connect
			const metadata = await transport.connect();
			expect(metadata.version).toBeDefined();

			// Test execute query
			const queryResult = await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
				input: { id: "1" },
			});
			expect((queryResult as Result).data).toEqual({
				id: "1",
				name: "Alice",
				email: "alice@test.com",
			});

			// Test execute mutation
			const mutationResult = await transport.execute({
				id: "2",
				path: "user.create",
				type: "mutation",
				input: { name: "Bob", email: "bob@test.com" },
			});
			expect((mutationResult as Result).data).toEqual({
				id: "2",
				name: "Bob",
				email: "bob@test.com",
			});
		});
	});
});
