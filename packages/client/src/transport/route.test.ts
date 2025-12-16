/**
 * @sylphx/lens-client - Route Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { routeByType } from "./route.js";
import type { Observable, Result, Transport } from "./types.js";

// =============================================================================
// Mock Transport Factory
// =============================================================================

function createMockTransport(name: string, overrides: Partial<Transport> = {}): Transport {
	return {
		connect: async () => ({
			version: "1.0.0",
			operations: { [`${name}.op`]: { type: "query" as const } },
		}),
		execute: async (op) => ({ data: { transport: name, path: op.path } }),
		...overrides,
	};
}

// =============================================================================
// Tests: route()
// =============================================================================

describe("route()", () => {
	describe("pattern matching", () => {
		it("matches exact patterns", async () => {
			const authTransport = createMockTransport("auth");
			const defaultTransport = createMockTransport("default");

			const transport = route({
				"auth.login": authTransport,
				"*": defaultTransport,
			});

			const result = (await transport.execute({
				id: "1",
				path: "auth.login",
				type: "query",
			})) as Result;

			expect(result.data).toEqual({ transport: "auth", path: "auth.login" });
		});

		it("matches wildcard patterns (prefix.*)", async () => {
			const userTransport = createMockTransport("user");
			const defaultTransport = createMockTransport("default");

			const transport = route({
				"user.*": userTransport,
				"*": defaultTransport,
			});

			const result1 = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			const result2 = (await transport.execute({
				id: "2",
				path: "user.profile.update",
				type: "mutation",
			})) as Result;

			expect(result1.data).toEqual({ transport: "user", path: "user.get" });
			expect(result2.data).toEqual({ transport: "user", path: "user.profile.update" });
		});

		it("falls back to * pattern", async () => {
			const defaultTransport = createMockTransport("default");

			const transport = route({
				"auth.*": createMockTransport("auth"),
				"*": defaultTransport,
			});

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.data).toEqual({ transport: "default", path: "user.get" });
		});

		it("prioritizes more specific patterns", async () => {
			const authLoginTransport = createMockTransport("auth-login");
			const authTransport = createMockTransport("auth");

			const transport = route({
				"auth.*": authTransport,
				"auth.login": authLoginTransport,
				"*": createMockTransport("default"),
			});

			// auth.login should match auth.login (more specific) not auth.*
			const result = (await transport.execute({
				id: "1",
				path: "auth.login",
				type: "query",
			})) as Result;

			expect(result.data).toEqual({ transport: "auth-login", path: "auth.login" });
		});

		it("throws when no pattern matches and no fallback", () => {
			const transport = route({
				"auth.*": createMockTransport("auth"),
			});

			// Synchronously throws because findMatchingTransport throws
			expect(() =>
				transport.execute({
					id: "1",
					path: "user.get",
					type: "query",
				}),
			).toThrow("No transport matched for path: user.get");
		});
	});

	describe("connect()", () => {
		it("connects all transports in parallel", async () => {
			const authConnect = mock(async () => ({
				version: "1.0.0",
				operations: { "auth.login": { type: "mutation" as const } },
			}));
			const userConnect = mock(async () => ({
				version: "1.0.0",
				operations: { "user.get": { type: "query" as const } },
			}));

			const transport = route({
				"auth.*": { connect: authConnect, execute: async () => ({}) },
				"user.*": { connect: userConnect, execute: async () => ({}) },
			});

			await transport.connect();

			expect(authConnect).toHaveBeenCalledTimes(1);
			expect(userConnect).toHaveBeenCalledTimes(1);
		});

		it("merges metadata from all transports", async () => {
			const transport = route({
				"auth.*": {
					connect: async () => ({
						version: "1.0.0",
						operations: { "auth.login": { type: "mutation" as const } },
					}),
					execute: async () => ({}),
				},
				"user.*": {
					connect: async () => ({
						version: "1.0.0",
						operations: { "user.get": { type: "query" as const } },
					}),
					execute: async () => ({}),
				},
				"*": {
					connect: async () => ({
						version: "1.0.0",
						operations: { "default.op": { type: "query" as const } },
					}),
					execute: async () => ({}),
				},
			});

			const metadata = await transport.connect();

			// Check using Object.keys since toHaveProperty may interpret dots as nested paths
			expect(Object.keys(metadata.operations)).toContain("auth.login");
			expect(Object.keys(metadata.operations)).toContain("user.get");
			expect(Object.keys(metadata.operations)).toContain("default.op");
		});

		it("uses first transport version", async () => {
			const transport = route({
				"auth.*": {
					connect: async () => ({ version: "2.0.0", operations: {} }),
					execute: async () => ({}),
				},
				"*": {
					connect: async () => ({ version: "1.0.0", operations: {} }),
					execute: async () => ({}),
				},
			});

			const metadata = await transport.connect();

			// More specific patterns come first after sorting
			expect(metadata.version).toBe("2.0.0");
		});

		it("handles transport connection failures gracefully", async () => {
			const transport = route({
				"auth.*": {
					connect: async () => {
						throw new Error("Connection failed");
					},
					execute: async () => ({}),
				},
				"*": {
					connect: async () => ({
						version: "1.0.0",
						operations: { "default.op": { type: "query" as const } },
					}),
					execute: async () => ({}),
				},
			});

			// Should not throw, falls back to empty metadata for failed transport
			const metadata = await transport.connect();

			expect(Object.keys(metadata.operations)).toContain("default.op");
		});
	});

	describe("validation", () => {
		it("throws when no patterns provided", () => {
			expect(() => route({})).toThrow("route() requires at least one pattern");
		});
	});

	describe("subscription support", () => {
		it("routes subscriptions correctly", async () => {
			const observable: Observable<Result> = {
				subscribe: (observer) => {
					observer.next?.({ data: { event: "test" } });
					return { unsubscribe: () => {} };
				},
			};

			const transport = route({
				"events.*": {
					connect: async () => ({ version: "1.0.0", operations: {} }),
					execute: () => observable,
				},
				"*": createMockTransport("default"),
			});

			const result = transport.execute({
				id: "1",
				path: "events.watch",
				type: "subscription",
			}) as Observable<Result>;

			expect(result).toHaveProperty("subscribe");

			const values: unknown[] = [];
			result.subscribe({ next: (r) => values.push(r.data) });
			expect(values).toEqual([{ event: "test" }]);
		});
	});
});

// =============================================================================
// Capability-based Mock Transports for routeByType
// =============================================================================

import type { MutationCapable, QueryCapable, SubscriptionCapable } from "./types.js";

function createQueryCapableTransport(name: string): QueryCapable {
	return {
		connect: async () => ({
			version: "1.0.0",
			operations: { [`${name}.op`]: { type: "query" as const } },
		}),
		query: async (op) => ({ data: { transport: name, path: op.path } }),
	};
}

function createMutationCapableTransport(name: string): MutationCapable {
	return {
		connect: async () => ({
			version: "1.0.0",
			operations: { [`${name}.op`]: { type: "mutation" as const } },
		}),
		mutation: async (op) => ({ data: { transport: name, path: op.path } }),
	};
}

function createSubscriptionCapableTransport(name: string): SubscriptionCapable {
	return {
		connect: async () => ({
			version: "1.0.0",
			operations: { [`${name}.op`]: { type: "subscription" as const } },
		}),
		subscription: (op) => ({
			subscribe: (observer) => {
				observer.next?.({ data: { transport: name, path: op.path } });
				return { unsubscribe: () => {} };
			},
		}),
	};
}

function createFullCapableTransport(name: string): QueryCapable & MutationCapable & SubscriptionCapable {
	return {
		connect: async () => ({
			version: "1.0.0",
			operations: { [`${name}.op`]: { type: "query" as const } },
		}),
		query: async (op) => ({ data: { transport: name, path: op.path } }),
		mutation: async (op) => ({ data: { transport: name, path: op.path } }),
		subscription: (op) => ({
			subscribe: (observer) => {
				observer.next?.({ data: { transport: name, path: op.path } });
				return { unsubscribe: () => {} };
			},
		}),
	};
}

// =============================================================================
// Tests: routeByType() - Type-Safe Capability-Based
// =============================================================================

describe("routeByType()", () => {
	it("routes query to query transport", async () => {
		const queryTransport = createQueryCapableTransport("query");
		const defaultTransport = createFullCapableTransport("default");

		const transport = routeByType({
			query: queryTransport,
			default: defaultTransport,
		});

		// Uses the query capability
		const result = await transport.query({
			id: "1",
			path: "user.get",
			type: "query",
			input: {},
		});

		expect(result.data).toEqual({ transport: "query", path: "user.get" });
	});

	it("routes mutation to mutation transport", async () => {
		const mutationTransport = createMutationCapableTransport("mutation");
		const defaultTransport = createFullCapableTransport("default");

		const transport = routeByType({
			mutation: mutationTransport,
			default: defaultTransport,
		});

		// Uses the mutation capability
		const result = await transport.mutation({
			id: "1",
			path: "user.create",
			type: "mutation",
			input: {},
		});

		expect(result.data).toEqual({ transport: "mutation", path: "user.create" });
	});

	it("routes subscription to subscription transport", async () => {
		const subscriptionTransport = createSubscriptionCapableTransport("subscription");
		const defaultTransport = createFullCapableTransport("default");

		const transport = routeByType({
			subscription: subscriptionTransport,
			default: defaultTransport,
		});

		// Uses the subscription capability
		const observable = transport.subscription({
			id: "1",
			path: "events.watch",
			type: "subscription",
			input: {},
		});

		const values: unknown[] = [];
		observable.subscribe({ next: (r) => values.push(r.data) });
		expect(values).toEqual([{ transport: "subscription", path: "events.watch" }]);
	});

	it("falls back to default transport for capabilities", async () => {
		const defaultTransport = createFullCapableTransport("default");

		const transport = routeByType({
			default: defaultTransport,
		});

		const result1 = await transport.query({
			id: "1",
			path: "user.get",
			type: "query",
			input: {},
		});

		const result2 = await transport.mutation({
			id: "2",
			path: "user.create",
			type: "mutation",
			input: {},
		});

		expect(result1.data).toEqual({ transport: "default", path: "user.get" });
		expect(result2.data).toEqual({ transport: "default", path: "user.create" });
	});

	it("connects all unique transports only once", async () => {
		const sharedConnect = mock(async () => ({
			version: "1.0.0",
			operations: { shared: { type: "query" as const } },
		}));
		const subscriptionConnect = mock(async () => ({
			version: "1.0.0",
			operations: { sub: { type: "subscription" as const } },
		}));

		// Create shared transport object (same reference)
		const sharedTransport: QueryCapable = {
			connect: sharedConnect,
			query: async () => ({}),
		};

		const subscriptionTransport: SubscriptionCapable = {
			connect: subscriptionConnect,
			subscription: () => ({
				subscribe: () => ({ unsubscribe: () => {} }),
			}),
		};

		const transport = routeByType({
			query: sharedTransport,
			subscription: subscriptionTransport,
			default: sharedTransport, // Same reference as query
		});

		await transport.connect();

		// Shared transport should only be connected once (deduplicated via Set)
		expect(sharedConnect).toHaveBeenCalledTimes(1);
		expect(subscriptionConnect).toHaveBeenCalledTimes(1);
	});

	it("merges metadata from all transports", async () => {
		const transport = routeByType({
			query: {
				connect: async () => ({
					version: "1.0.0",
					operations: { "query.get": { type: "query" as const } },
				}),
				query: async () => ({}),
			},
			subscription: {
				connect: async () => ({
					version: "1.0.0",
					operations: { "sub.watch": { type: "subscription" as const } },
				}),
				subscription: () => ({
					subscribe: () => ({ unsubscribe: () => {} }),
				}),
			},
			default: {
				connect: async () => ({
					version: "1.0.0",
					operations: { "default.op": { type: "query" as const } },
				}),
				query: async () => ({}),
				mutation: async () => ({}),
			},
		});

		const metadata = await transport.connect();

		expect(Object.keys(metadata.operations)).toContain("query.get");
		expect(Object.keys(metadata.operations)).toContain("sub.watch");
		expect(Object.keys(metadata.operations)).toContain("default.op");
	});

	it("infers capabilities from config (type-safety)", async () => {
		// HTTP for queries/mutations, WS for subscriptions
		const httpTransport: QueryCapable & MutationCapable = {
			connect: async () => ({ version: "1.0.0", operations: {} }),
			query: async (op) => ({ data: `query:${op.path}` }),
			mutation: async (op) => ({ data: `mutation:${op.path}` }),
		};

		const wsTransport: SubscriptionCapable = {
			connect: async () => ({ version: "1.0.0", operations: {} }),
			subscription: (op) => ({
				subscribe: (observer) => {
					observer.next?.({ data: `subscription:${op.path}` });
					return { unsubscribe: () => {} };
				},
			}),
		};

		const transport = routeByType({
			default: httpTransport,
			subscription: wsTransport,
		});

		// Should have all three capabilities
		const queryResult = await transport.query({ id: "1", path: "test", type: "query", input: {} });
		const mutationResult = await transport.mutation({ id: "2", path: "test", type: "mutation", input: {} });

		const subValues: unknown[] = [];
		transport
			.subscription({ id: "3", path: "test", type: "subscription", input: {} })
			.subscribe({ next: (r) => subValues.push(r.data) });

		expect(queryResult.data).toBe("query:test");
		expect(mutationResult.data).toBe("mutation:test");
		expect(subValues).toEqual(["subscription:test"]);
	});
});

// =============================================================================
// Tests: routeByPath() (deprecated)
// =============================================================================

describe("routeByPath() (deprecated)", () => {
	it("converts to route() format", async () => {
		const authTransport = createMockTransport("auth");
		const defaultTransport = createMockTransport("default");

		const transport = routeByPath({
			paths: { "auth.": authTransport },
			default: defaultTransport,
		});

		const result = (await transport.execute({
			id: "1",
			path: "auth.login",
			type: "query",
		})) as Result;

		expect(result.data).toEqual({ transport: "auth", path: "auth.login" });
	});

	it("handles paths without trailing dot", async () => {
		const userTransport = createMockTransport("user");
		const defaultTransport = createMockTransport("default");

		const transport = routeByPath({
			paths: { user: userTransport },
			default: defaultTransport,
		});

		// Should match exact path
		const result = (await transport.execute({
			id: "1",
			path: "user",
			type: "query",
		})) as Result;

		expect(result.data).toEqual({ transport: "user", path: "user" });
	});
});
