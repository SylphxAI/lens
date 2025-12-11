/**
 * @sylphx/lens-client - Transport Types Tests
 */

import { describe, expect, it } from "bun:test";
import type {
	EntitiesMetadata,
	FullTransport,
	MutationCapable,
	Operation,
	QueryCapable,
	RequestTransport,
	SubscriptionCapable,
	Transport,
} from "./types.js";
import {
	getEffectiveOperationType,
	hasAnySubscription,
	isLegacyTransport,
	isMutationCapable,
	isQueryCapable,
	isSubscriptionCapable,
} from "./types.js";

// =============================================================================
// Mock Transports for Testing
// =============================================================================

const mockOperation: Operation = {
	id: "op-1",
	path: "test.operation",
	type: "query",
	input: { id: "123" },
};

function createQueryOnlyTransport(): QueryCapable {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		query: async () => ({ data: "query result" }),
	};
}

function createMutationOnlyTransport(): MutationCapable {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		mutation: async () => ({ data: "mutation result" }),
	};
}

function createSubscriptionOnlyTransport(): SubscriptionCapable {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		subscription: () => ({
			subscribe: (observer) => {
				observer.next?.({ data: "subscription result" });
				return { unsubscribe: () => {} };
			},
		}),
	};
}

function createRequestTransport(): RequestTransport {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		query: async () => ({ data: "query result" }),
		mutation: async () => ({ data: "mutation result" }),
	};
}

function createFullTransport(): FullTransport {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		query: async () => ({ data: "query result" }),
		mutation: async () => ({ data: "mutation result" }),
		subscription: () => ({
			subscribe: (observer) => {
				observer.next?.({ data: "subscription result" });
				return { unsubscribe: () => {} };
			},
		}),
	};
}

function createLegacyTransport(): Transport {
	return {
		connect: async () => ({ version: "1.0.0", operations: {} }),
		execute: async () => ({ data: "execute result" }),
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("Transport Capability Types", () => {
	describe("isQueryCapable", () => {
		it("returns true for query-capable transport", () => {
			const transport = createQueryOnlyTransport();
			expect(isQueryCapable(transport)).toBe(true);
		});

		it("returns true for full transport", () => {
			const transport = createFullTransport();
			expect(isQueryCapable(transport)).toBe(true);
		});

		it("returns false for subscription-only transport", () => {
			const transport = createSubscriptionOnlyTransport();
			expect(isQueryCapable(transport)).toBe(false);
		});

		it("returns false for legacy transport", () => {
			const transport = createLegacyTransport();
			expect(isQueryCapable(transport)).toBe(false);
		});
	});

	describe("isMutationCapable", () => {
		it("returns true for mutation-capable transport", () => {
			const transport = createMutationOnlyTransport();
			expect(isMutationCapable(transport)).toBe(true);
		});

		it("returns true for full transport", () => {
			const transport = createFullTransport();
			expect(isMutationCapable(transport)).toBe(true);
		});

		it("returns false for query-only transport", () => {
			const transport = createQueryOnlyTransport();
			expect(isMutationCapable(transport)).toBe(false);
		});

		it("returns false for legacy transport", () => {
			const transport = createLegacyTransport();
			expect(isMutationCapable(transport)).toBe(false);
		});
	});

	describe("isSubscriptionCapable", () => {
		it("returns true for subscription-capable transport", () => {
			const transport = createSubscriptionOnlyTransport();
			expect(isSubscriptionCapable(transport)).toBe(true);
		});

		it("returns true for full transport", () => {
			const transport = createFullTransport();
			expect(isSubscriptionCapable(transport)).toBe(true);
		});

		it("returns false for request transport", () => {
			const transport = createRequestTransport();
			expect(isSubscriptionCapable(transport)).toBe(false);
		});

		it("returns false for legacy transport", () => {
			const transport = createLegacyTransport();
			expect(isSubscriptionCapable(transport)).toBe(false);
		});
	});

	describe("isLegacyTransport", () => {
		it("returns true for legacy transport", () => {
			const transport = createLegacyTransport();
			expect(isLegacyTransport(transport)).toBe(true);
		});

		it("returns false for capability-based transport", () => {
			const transport = createFullTransport();
			expect(isLegacyTransport(transport)).toBe(false);
		});
	});

	describe("Type combinations", () => {
		it("RequestTransport has both query and mutation", () => {
			const transport = createRequestTransport();
			expect(isQueryCapable(transport)).toBe(true);
			expect(isMutationCapable(transport)).toBe(true);
			expect(isSubscriptionCapable(transport)).toBe(false);
		});

		it("FullTransport has all capabilities", () => {
			const transport = createFullTransport();
			expect(isQueryCapable(transport)).toBe(true);
			expect(isMutationCapable(transport)).toBe(true);
			expect(isSubscriptionCapable(transport)).toBe(true);
		});
	});

	describe("Transport execution", () => {
		it("QueryCapable can execute queries", async () => {
			const transport = createQueryOnlyTransport();
			const result = await transport.query(mockOperation);
			expect(result.data).toBe("query result");
		});

		it("MutationCapable can execute mutations", async () => {
			const transport = createMutationOnlyTransport();
			const result = await transport.mutation(mockOperation);
			expect(result.data).toBe("mutation result");
		});

		it("SubscriptionCapable can create subscriptions", () => {
			const transport = createSubscriptionOnlyTransport();
			const observable = transport.subscription(mockOperation);

			let receivedData: unknown;
			observable.subscribe({
				next: (result) => {
					receivedData = result.data;
				},
			});

			expect(receivedData).toBe("subscription result");
		});
	});
});

// =============================================================================
// Subscription Detection Helper Tests
// =============================================================================

describe("hasAnySubscription", () => {
	const entities: EntitiesMetadata = {
		User: {
			id: "exposed",
			name: "exposed",
			email: "resolve",
			status: "subscribe",
		},
		Post: {
			id: "exposed",
			title: "exposed",
			content: "resolve",
		},
	};

	it("returns false when entities is undefined", () => {
		expect(hasAnySubscription(undefined, "User")).toBe(false);
	});

	it("returns false when entity not found", () => {
		expect(hasAnySubscription(entities, "Unknown")).toBe(false);
	});

	it("returns true when selecting a subscribe field", () => {
		expect(hasAnySubscription(entities, "User", { status: true })).toBe(true);
	});

	it("returns false when selecting only exposed/resolve fields", () => {
		expect(hasAnySubscription(entities, "User", { id: true, name: true, email: true })).toBe(false);
	});

	it("returns true when checking all fields (no select) and entity has subscribe field", () => {
		expect(hasAnySubscription(entities, "User")).toBe(true);
	});

	it("returns false when checking all fields and entity has no subscribe field", () => {
		expect(hasAnySubscription(entities, "Post")).toBe(false);
	});

	it("handles nested selection with select property", () => {
		const nestedSelect = {
			name: true,
			posts: { select: { title: true } },
		};
		// User doesn't have subscribe in selection, Post doesn't have subscribe
		expect(hasAnySubscription(entities, "User", nestedSelect)).toBe(false);
	});

	it("prevents infinite recursion with circular references", () => {
		const circularEntities: EntitiesMetadata = {
			A: { b: "resolve" },
			B: { a: "resolve" },
		};
		// Should not hang or throw
		expect(hasAnySubscription(circularEntities, "A")).toBe(false);
	});

	it("returns true when selecting a 'live' mode field", () => {
		const entitiesWithLive: EntitiesMetadata = {
			User: {
				id: "exposed",
				name: "exposed",
				balance: "live", // .resolve().subscribe() field
			},
		};
		expect(hasAnySubscription(entitiesWithLive, "User", { balance: true })).toBe(true);
	});

	it("returns true when checking all fields and entity has 'live' field", () => {
		const entitiesWithLive: EntitiesMetadata = {
			User: {
				id: "exposed",
				name: "exposed",
				balance: "live",
			},
		};
		expect(hasAnySubscription(entitiesWithLive, "User")).toBe(true);
	});

	it("returns false when selecting only non-live fields from entity with live field", () => {
		const entitiesWithLive: EntitiesMetadata = {
			User: {
				id: "exposed",
				name: "exposed",
				balance: "live",
			},
		};
		expect(hasAnySubscription(entitiesWithLive, "User", { id: true, name: true })).toBe(false);
	});
});

describe("getEffectiveOperationType", () => {
	const entities: EntitiesMetadata = {
		User: {
			id: "exposed",
			name: "exposed",
			status: "subscribe",
		},
	};

	it("returns subscription if opType is already subscription", () => {
		expect(getEffectiveOperationType("subscription", entities, "User")).toBe("subscription");
	});

	it("returns mutation if opType is mutation (even with subscribe fields)", () => {
		expect(getEffectiveOperationType("mutation", entities, "User", { status: true })).toBe("mutation");
	});

	it("returns query if no subscribe fields selected", () => {
		expect(getEffectiveOperationType("query", entities, "User", { id: true, name: true })).toBe("query");
	});

	it("returns subscription if query selects subscribe field", () => {
		expect(getEffectiveOperationType("query", entities, "User", { status: true })).toBe("subscription");
	});

	it("returns query if returnEntityName is undefined", () => {
		expect(getEffectiveOperationType("query", entities, undefined, { status: true })).toBe("query");
	});

	it("returns query if entities is undefined", () => {
		expect(getEffectiveOperationType("query", undefined, "User", { status: true })).toBe("query");
	});

	it("returns subscription if query selects 'live' mode field", () => {
		const entitiesWithLive: EntitiesMetadata = {
			User: {
				id: "exposed",
				name: "exposed",
				balance: "live",
			},
		};
		expect(getEffectiveOperationType("query", entitiesWithLive, "User", { balance: true })).toBe("subscription");
	});

	it("returns query if query selects only non-live fields from entity with live field", () => {
		const entitiesWithLive: EntitiesMetadata = {
			User: {
				id: "exposed",
				name: "exposed",
				balance: "live",
			},
		};
		expect(getEffectiveOperationType("query", entitiesWithLive, "User", { id: true, name: true })).toBe("query");
	});
});
