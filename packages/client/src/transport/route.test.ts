/**
 * @sylphx/lens-client - Route Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { routeByType } from "./route.js";

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
