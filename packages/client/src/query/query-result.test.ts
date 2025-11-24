/**
 * Tests for QueryResult
 */

import { describe, expect, test, mock } from "bun:test";
import { createQueryResult } from "./query-result";
import type { OperationContext, OperationResult, NextLink } from "../links/types";

// Helper to create operation context
function createOp(entity: string, op: string, input: unknown): OperationContext {
	return {
		id: "test-op",
		type: "query",
		entity,
		op,
		input,
		meta: {},
	};
}

describe("QueryResult", () => {
	describe("Thenable (await)", () => {
		test("executes operation when awaited", async () => {
			const executeLink = mock(async (op: OperationContext) => {
				return { data: { id: "1", name: "Alice" } };
			});

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			const result = await query;

			expect(executeLink).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ id: "1", name: "Alice" });
		});

		test("lazy execution - doesn't execute until awaited", () => {
			const executeLink = mock(async () => ({ data: { id: "1" } }));

			const operation = createOp("User", "get", { id: "1" });
			createQueryResult(operation, executeLink);

			// Not executed yet
			expect(executeLink).toHaveBeenCalledTimes(0);
		});

		test("caches result - only executes once for multiple awaits", async () => {
			const executeLink = mock(async () => ({ data: { id: "1", name: "Alice" } }));

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			// Await multiple times
			const result1 = await query;
			const result2 = await query;

			// Should only execute once
			expect(executeLink).toHaveBeenCalledTimes(1);
			expect(result1).toEqual(result2);
		});

		test("throws error when operation fails", async () => {
			const executeLink = mock(async () => ({
				error: new Error("Not found"),
			}));

			const operation = createOp("User", "get", { id: "999" });
			const query = createQueryResult(operation, executeLink);

			try {
			await query;
			expect(true).toBe(false); // Should not reach here
		} catch (error: unknown) {
			expect((error as Error).message).toBe("Not found");
		}
		});
	});

	describe("Subscribable (subscribe)", () => {
		test("calls next with data", async () => {
			const executeLink = mock(async () => ({ data: { id: "1", name: "Alice" } }));

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			const next = mock(() => {});
			const complete = mock(() => {});

			query.subscribe({ next, error: () => {}, complete });

			// Wait for async execution
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(next).toHaveBeenCalledWith({ id: "1", name: "Alice" });
			expect(complete).toHaveBeenCalled();
		});

		test("supports function observer", async () => {
			const executeLink = mock(async () => ({ data: { id: "1", name: "Alice" } }));

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			const next = mock(() => {});
			query.subscribe(next);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(next).toHaveBeenCalledWith({ id: "1", name: "Alice" });
		});

		test("calls error when operation fails", async () => {
			const executeLink = mock(async () => ({
				error: new Error("Not found"),
			}));

			const operation = createOp("User", "get", { id: "999" });
			const query = createQueryResult(operation, executeLink);

			const error = mock(() => {});
			query.subscribe({ next: () => {}, error, complete: () => {} });

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(error).toHaveBeenCalled();
			const errorArg = error.mock.calls[0][0];
			expect(errorArg.message).toBe("Not found");
		});

		test("unsubscribe stops subscription", async () => {
			const executeLink = mock(async () => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 50));
				return { data: { id: "1" } };
			});

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			const next = mock(() => {});
			const complete = mock(() => {});

			const subscription = query.subscribe({ next, error: () => {}, complete });

			// Unsubscribe immediately
			subscription.unsubscribe();

			// Wait to ensure nothing fires
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(next).not.toHaveBeenCalled();
			expect(complete).toHaveBeenCalledTimes(1); // Called by unsubscribe
		});

		test("independent from await - both can be used", async () => {
			let callCount = 0;
			const executeLink = mock(async () => {
				callCount++;
				return { data: { id: "1", count: callCount } };
			});

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			// First await
			const result1 = await query;
			expect(result1).toEqual({ id: "1", count: 1 });

			// Then subscribe (should be independent)
			const next = mock(() => {});
			query.subscribe(next);

			await new Promise((resolve) => setTimeout(resolve, 10));

			// Subscribe creates new execution (different operation context)
			expect(next).toHaveBeenCalled();
			expect(executeLink).toHaveBeenCalledTimes(2); // Once for await, once for subscribe
		});
	});

	describe("refetch", () => {
		test("refetch clears cache and fetches fresh", async () => {
			let value = 1;
			const executeLink = mock(async () => {
				return { data: { id: "1", value: value++ } };
			});

			const operation = createOp("User", "get", { id: "1" });
			const query = createQueryResult(operation, executeLink);

			// First await
			const result1 = await query;
			expect(result1).toEqual({ id: "1", value: 1 });

			// Await again (cached)
			const result2 = await query;
			expect(result2).toEqual({ id: "1", value: 1 });
			expect(executeLink).toHaveBeenCalledTimes(1);

			// Refetch (clears cache)
			const result3 = await query.refetch();
			expect(result3).toEqual({ id: "1", value: 2 });
			expect(executeLink).toHaveBeenCalledTimes(2);
		});
	});
});
