/**
 * @sylphx/lens-integration-tests - Direct Transport Tests
 *
 * Tests that require both @sylphx/lens-client and @sylphx/lens-server.
 */

import { describe, expect, it, mock } from "bun:test";
import {
	direct,
	type ExtractServerTypes,
	type LensServerInterface,
	type Observable,
	type Result,
	type TypedTransport,
} from "@sylphx/lens-client";
import { id, lens, model, router, string } from "@sylphx/lens-core";
import { createApp } from "@sylphx/lens-server";
import { z } from "zod";

// =============================================================================
// Mock App
// =============================================================================

/**
 * Create a mock Observable that emits a single value and completes.
 */
function createMockObservable<T>(getValue: () => T | Promise<T>): Observable<Result<T>> {
	return {
		subscribe: (observer) => {
			(async () => {
				try {
					const value = await getValue();
					observer.next?.({ $: "snapshot", data: value } as Result<T>);
					observer.complete?.();
				} catch (error) {
					observer.error?.(error instanceof Error ? error : new Error(String(error)));
				}
			})();
			return { unsubscribe: () => {} };
		},
	};
}

function createMockApp(overrides: Partial<LensServerInterface> = {}): LensServerInterface {
	return {
		getMetadata: () => ({
			version: "1.0.0",
			operations: {
				user: { get: { type: "query" } },
				post: { create: { type: "mutation" } },
			},
		}),
		execute: (op) => createMockObservable(() => ({ id: "1", path: op.path })),
		...overrides,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("direct transport", () => {
	describe("connect()", () => {
		it("returns metadata from server", async () => {
			const app = createMockApp();
			const transport = direct({ app });

			const metadata = await transport.connect();

			expect(metadata.version).toBe("1.0.0");
			expect(metadata.operations.user).toBeDefined();
		});

		it("returns server metadata directly without network call", async () => {
			const getMetadata = mock(() => ({
				version: "2.0.0",
				operations: {},
			}));
			const app = createMockApp({ getMetadata });
			const transport = direct({ app });

			await transport.connect();

			expect(getMetadata).toHaveBeenCalledTimes(1);
		});
	});

	describe("query()", () => {
		it("executes query operation", async () => {
			const app = createMockApp();
			const transport = direct({ app });

			const result = (await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			})) as Result;

			expect(result.data).toEqual({ id: "1", path: "user.get" });
		});

		it("passes operation input correctly", async () => {
			const execute = mock((op) => createMockObservable(() => op.input));
			const app = createMockApp({ execute });
			const transport = direct({ app });

			const input = { userId: "123", options: { includeDeleted: true } };
			const result = (await transport.query({
				id: "4",
				path: "user.get",
				type: "query",
				input,
			})) as Result;

			expect(result.data).toEqual(input);
		});

		it("handles server errors", async () => {
			const app = createMockApp({
				execute: () => ({
					subscribe: (observer) => {
						observer.next?.({ $: "error", error: "Database error" } as Result);
						observer.complete?.();
						return { unsubscribe: () => {} };
					},
				}),
			});
			const transport = direct({ app });

			const result = (await transport.query({
				id: "5",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.$).toBe("error");
			if (result.$ === "error") {
				expect(result.error).toBe("Database error");
			}
		});

		it("handles server throwing", async () => {
			const app = createMockApp({
				execute: () => ({
					subscribe: (observer) => {
						observer.error?.(new Error("Unexpected error"));
						return { unsubscribe: () => {} };
					},
				}),
			});
			const transport = direct({ app });

			await expect(
				transport.query({
					id: "6",
					path: "user.get",
					type: "query",
				}),
			).rejects.toThrow("Unexpected error");
		});
	});

	describe("mutation()", () => {
		it("executes mutation operation", async () => {
			const execute = mock(() => createMockObservable(() => ({ id: "new-1" })));
			const app = createMockApp({ execute });
			const transport = direct({ app });

			const result = (await transport.mutation({
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
	});

	describe("subscription()", () => {
		it("handles subscription operation", () => {
			const mockObservable: Observable<Result> = {
				subscribe: (observer) => {
					observer.next?.({ $: "snapshot", data: { count: 1 } });
					observer.next?.({ $: "snapshot", data: { count: 2 } });
					return { unsubscribe: () => {} };
				},
			};

			const app = createMockApp({
				execute: () => mockObservable,
			});
			const transport = direct({ app });

			const result = transport.subscription({
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
	});

	describe("integration", () => {
		it("works with multiple operations", async () => {
			const app = createMockApp({
				execute: (op) => {
					if (op.path === "user.get") return createMockObservable(() => ({ name: "John" }));
					if (op.path === "post.create") return createMockObservable(() => ({ id: "post-1" }));
					return {
						subscribe: (observer) => {
							observer.next?.({ $: "error", error: "Unknown path" } as Result);
							observer.complete?.();
							return { unsubscribe: () => {} };
						},
					};
				},
			});
			const transport = direct({ app });

			const [user, post] = await Promise.all([
				transport.query({ id: "1", path: "user.get", type: "query" }),
				transport.mutation({ id: "2", path: "post.create", type: "mutation", input: {} }),
			]);

			expect((user as Result).$ === "snapshot" ? (user as Result).data : null).toEqual({ name: "John" });
			expect((post as Result).$ === "snapshot" ? (post as Result).data : null).toEqual({ id: "post-1" });
		});
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

// Type helpers
type Equals<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

describe("direct type inference", () => {
	// Test entities
	const User = model("User", {
		id: id(),
		name: string(),
		email: string(),
	});

	interface TestContext {
		db: Map<string, unknown>;
	}

	describe("TypedTransport", () => {
		it("preserves server type through phantom _api property", () => {
			const { query } = lens<TestContext>();

			const app = createApp({
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

			const transport = direct({ app });

			// TypedTransport should have _api property type
			type TransportType = typeof transport;

			// Should extend TypedTransport
			type _assertTypedTransport = Assert<TransportType extends TypedTransport<unknown> ? true : false>;
			const _check: _assertTypedTransport = true;
			expect(_check).toBe(true);

			// Runtime: transport should have connect and capability methods
			expect(typeof transport.connect).toBe("function");
			expect(typeof transport.query).toBe("function");
			expect(typeof transport.mutation).toBe("function");
			expect(typeof transport.subscription).toBe("function");
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

			const app = createApp({
				router: appRouter,
				context: () => ({ db: new Map() }),
			});

			const transport = direct({ app });

			// Extract types
			type ServerTypes = typeof app._types;
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

			const app = createApp({
				router: router({
					test: query().resolve(() => ({ ok: true })),
				}),
				context: () => ({ db: new Map() }),
			});

			// ExtractServerTypes should extract _types
			type Extracted = ExtractServerTypes<typeof app>;

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

			const app = createApp({
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

			const transport = direct({ app });

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

			const app = createApp({
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

			const transport = direct({ app });

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
		it("works with full createApp setup", async () => {
			const { query, mutation } = lens<TestContext>();

			const db = new Map<string, { id: string; name: string; email: string }>();
			db.set("1", { id: "1", name: "Alice", email: "alice@test.com" });

			const app = createApp({
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

			const transport = direct({ app });

			// Test connect
			const metadata = await transport.connect();
			expect(metadata.version).toBeDefined();

			// Test query
			const queryResult = await transport.query({
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

			// Test mutation
			const mutationResult = await transport.mutation({
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
