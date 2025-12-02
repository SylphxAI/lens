/**
 * @sylphx/lens-client - Transport Types Tests
 */

import { describe, expect, it } from "bun:test";
import type {
	FullTransport,
	MutationCapable,
	Operation,
	QueryCapable,
	RequestTransport,
	SubscriptionCapable,
	Transport,
} from "./types.js";
import { isLegacyTransport, isMutationCapable, isQueryCapable, isSubscriptionCapable } from "./types.js";

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
