/**
 * Tests for Query Optimizer Link
 */

import { describe, expect, test, mock } from "bun:test";
import { queryOptimizerLink } from "./query-optimizer";
import { createOperationContext } from "./types";

describe("queryOptimizerLink", () => {
	describe("Scenario 1: Full Superset (Cache Hit)", () => {
		test("derives from cache when all fields available", async () => {
			const mockNext = mock(async () => ({
				data: { id: "1", name: "Alice", email: "alice@example.com", bio: "Developer" },
			}));

			const link = queryOptimizerLink();
			const linkFn = link();

			// First request - fetch all fields
			const op1 = createOperationContext("query", "User", "get", {
				id: "1",
			});
			await linkFn(op1, mockNext);

			expect(mockNext).toHaveBeenCalledTimes(1);

			// Second request - subset of fields
			const op2 = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true },
			});
			const result = await linkFn(op2, mockNext);

			// Should NOT call next again (derived from cache)
			expect(mockNext).toHaveBeenCalledTimes(1);
			expect(result.data).toEqual({ name: "Alice", email: "alice@example.com" });
			expect(result.meta?.fromCache).toBe(true);
			expect(result.meta?.derived).toBe(true);
		});
	});

	describe("Scenario 2: Partial Overlap (Incremental Fetch)", () => {
		test("fetches only missing fields and merges with cache", async () => {
			let callCount = 0;
			const mockNext = mock(async (op) => {
				callCount++;
				const input = op.input as { select?: Record<string, boolean> };

				// First call - return name and email
				if (callCount === 1) {
					return {
						data: { name: "Alice", email: "alice@example.com" },
					};
				}

				// Second call - return only bio (missing field)
				if (callCount === 2) {
					const fields = input.select ? Object.keys(input.select) : [];
					expect(fields).toEqual(["bio"]);
					return {
						data: { bio: "Developer" },
					};
				}

				return { data: {} };
			});

			const link = queryOptimizerLink({ incrementalFetch: true });
			const linkFn = link();

			// First request - fetch name and email
			const op1 = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true },
			});
			const result1 = await linkFn(op1, mockNext);

			expect(result1.data).toEqual({ name: "Alice", email: "alice@example.com" });
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Second request - needs name, email, and bio
			const op2 = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true, bio: true },
			});
			const result2 = await linkFn(op2, mockNext);

			// Should fetch only bio, merge with cached name and email
			expect(mockNext).toHaveBeenCalledTimes(2);
			expect(result2.data).toEqual({
				name: "Alice",
				email: "alice@example.com",
				bio: "Developer",
			});
			expect(result2.meta?.incrementalFetch).toBe(true);
		});

		test("fetches all fields when incremental fetch disabled and cache incomplete", async () => {
			let callCount = 0;
			const mockNext = mock(async (op) => {
				callCount++;
				if (callCount === 1) {
					return { data: { name: "Alice", email: "alice@example.com" } };
				}
				// Second call should fetch all requested fields (not just missing)
				return { data: { name: "Alice", email: "alice@example.com", bio: "Developer" } };
			});

			const link = queryOptimizerLink({ incrementalFetch: false });
			const linkFn = link();

			// First request - cache name and email
			const op1 = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true },
			});
			await linkFn(op1, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Second request - needs bio too, but cache only has name & email
			// With incrementalFetch disabled, should fetch all fields again
			const op2 = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true, bio: true },
			});
			const result = await linkFn(op2, mockNext);

			// Should fetch all fields (not incremental)
			expect(mockNext).toHaveBeenCalledTimes(2);
			expect(result.meta?.incrementalFetch).toBeUndefined();
		});
	});

	describe("Scenario 3: No Cache (Cold Start)", () => {
		test("fetches from server when no cache", async () => {
			const mockNext = mock(async () => ({
				data: { id: "1", name: "Alice", email: "alice@example.com" },
			}));

			const link = queryOptimizerLink();
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true, email: true },
			});
			const result = await linkFn(op, mockNext);

			expect(mockNext).toHaveBeenCalledTimes(1);
			expect(result.data).toEqual({ id: "1", name: "Alice", email: "alice@example.com" });
			expect(result.meta?.fromCache).toBeUndefined();
		});
	});

	describe("Scenario 4: Query Deduplication", () => {
		test("deduplicates simultaneous identical requests", async () => {
			const mockNext = mock(async () => {
				// Simulate slow request
				await new Promise((resolve) => setTimeout(resolve, 50));
				return {
					data: { id: "1", name: "Alice" },
				};
			});

			const link = queryOptimizerLink({ deduplication: true });
			const linkFn = link();

			const op1 = createOperationContext("query", "User", "get", { id: "1" });
			const op2 = createOperationContext("query", "User", "get", { id: "1" });
			const op3 = createOperationContext("query", "User", "get", { id: "1" });

			// Fire all requests simultaneously
			const [result1, result2, result3] = await Promise.all([
				linkFn(op1, mockNext),
				linkFn(op2, mockNext),
				linkFn(op3, mockNext),
			]);

			// Should only call next once (deduplicated)
			expect(mockNext).toHaveBeenCalledTimes(1);
			expect(result1.data).toEqual({ id: "1", name: "Alice" });
			expect(result2.data).toEqual({ id: "1", name: "Alice" });
			expect(result3.data).toEqual({ id: "1", name: "Alice" });
		});

		test("skips deduplication if disabled", async () => {
			const mockNext = mock(async () => ({
				data: { id: "1", name: "Alice" },
			}));

			const link = queryOptimizerLink({ deduplication: false });
			const linkFn = link();

			const op1 = createOperationContext("query", "User", "get", { id: "1" });
			const op2 = createOperationContext("query", "User", "get", { id: "1" });

			await Promise.all([linkFn(op1, mockNext), linkFn(op2, mockNext)]);

			// Should call next twice (not deduplicated)
			expect(mockNext).toHaveBeenCalledTimes(2);
		});
	});

	describe("Cache Invalidation", () => {
		test("mutations invalidate entity cache", async () => {
			const mockNext = mock(async (op) => {
				if (op.type === "query") {
					return { data: { id: "1", name: "Alice" } };
				}
				if (op.type === "mutation") {
					return { data: { id: "1", name: "Bob" } };
				}
				return { data: {} };
			});

			const link = queryOptimizerLink();
			const linkFn = link();

			// Query - caches result
			const op1 = createOperationContext("query", "User", "get", { id: "1" });
			await linkFn(op1, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Mutation - should invalidate cache
			const op2 = createOperationContext("mutation", "User", "update", {
				id: "1",
				name: "Bob",
			});
			await linkFn(op2, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(2);

			// Query again - should fetch (cache invalidated)
			const op3 = createOperationContext("query", "User", "get", { id: "1" });
			await linkFn(op3, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(3);
		});
	});

	describe("Cache TTL", () => {
		test("respects cache TTL", async () => {
			const mockNext = mock(async () => ({
				data: { id: "1", name: "Alice" },
			}));

			const link = queryOptimizerLink({ ttl: 100 }); // 100ms TTL
			const linkFn = link();

			// First request - cache miss
			const op = createOperationContext("query", "User", "get", {
				id: "1",
				select: { name: true },
			});
			await linkFn(op, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Second request immediately - cache hit
			await linkFn(op, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Wait for TTL to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Third request - cache expired, should fetch
			await linkFn(op, mockNext);
			expect(mockNext).toHaveBeenCalledTimes(2);
		});
	});

	describe("Error Handling", () => {
		test("does not cache errors", async () => {
			let callCount = 0;
			const mockNext = mock(async () => {
				callCount++;
				if (callCount === 1) {
					return { error: new Error("Server error") };
				}
				return { data: { id: "1", name: "Alice" } };
			});

			const link = queryOptimizerLink();
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });

			// First request - error
			const result1 = await linkFn(op, mockNext);
			expect(result1.error).toBeDefined();
			expect(mockNext).toHaveBeenCalledTimes(1);

			// Second request - should retry (error not cached)
			const result2 = await linkFn(op, mockNext);
			expect(result2.data).toEqual({ id: "1", name: "Alice" });
			expect(mockNext).toHaveBeenCalledTimes(2);
		});
	});

	describe("Non-Query Operations", () => {
		test("passes through subscriptions without optimization", async () => {
			const mockNext = mock(async () => ({ data: null }));

			const link = queryOptimizerLink();
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", { id: "1" });
			await linkFn(op, mockNext);

			expect(mockNext).toHaveBeenCalledTimes(1);
		});
	});
});
