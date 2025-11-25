/**
 * Tests for Svelte Stores
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { get } from "svelte/store";
import { query, mutation, lazyQuery } from "./stores";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialData: T | null = null) {
	const subscribers = new Set<(value: T) => void>();
	let currentData = initialData;
	let pendingResolvers: Array<{ resolve: (v: T) => void; reject: (e: Error) => void }> = [];
	let resolvedValue: T | null = null;
	let rejectedError: Error | null = null;

	const result = {
		// Promise-like - called each time .then is invoked
		then: <R1, R2>(
			onFulfilled?: ((value: T) => R1) | null,
			onRejected?: ((err: Error) => R2) | null,
		): Promise<R1 | R2> => {
			// If already resolved/rejected, return immediately
			if (resolvedValue !== null) {
				return Promise.resolve(onFulfilled ? onFulfilled(resolvedValue) : (resolvedValue as unknown as R1));
			}
			if (rejectedError !== null) {
				if (onRejected) {
					return Promise.resolve(onRejected(rejectedError));
				}
				return Promise.reject(rejectedError);
			}

			// Otherwise wait for resolution
			return new Promise<R1 | R2>((resolve, reject) => {
				pendingResolvers.push({
					resolve: (value: T) => {
						resolve(onFulfilled ? onFulfilled(value) : (value as unknown as R1));
					},
					reject: (err: Error) => {
						if (onRejected) {
							resolve(onRejected(err));
						} else {
							reject(err);
						}
					},
				});
			});
		},
		// Subscribable
		subscribe: (callback: (value: T) => void) => {
			subscribers.add(callback);
			if (currentData !== null) {
				callback(currentData);
			}
			return () => {
				subscribers.delete(callback);
			};
		},
		// Test helpers
		_resolve: (value: T) => {
			currentData = value;
			resolvedValue = value;
			for (const { resolve } of pendingResolvers) {
				resolve(value);
			}
			pendingResolvers = [];
			for (const cb of subscribers) cb(value);
		},
		_reject: (err: Error) => {
			rejectedError = err;
			for (const { reject } of pendingResolvers) {
				reject(err);
			}
			pendingResolvers = [];
		},
	};

	return result;
}

// =============================================================================
// Tests
// =============================================================================

describe("query()", () => {
	test("creates a readable store with initial loading state", () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = query(mockResult as never);
		const value = get(store);

		expect(value.loading).toBe(true);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("updates store when query resolves", async () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = query(mockResult as never);

		// Subscribe to trigger the query
		const unsubscribe = store.subscribe(() => {});

		// Resolve the query
		mockResult._resolve({ id: "123", name: "John" });

		// Wait for async update
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.data).toEqual({ id: "123", name: "John" });

		unsubscribe();
	});

	test("handles query errors", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		// Subscribe to trigger the query
		const unsubscribe = store.subscribe(() => {});

		// Reject the query
		mockResult._reject(new Error("Network error"));

		// Wait for async update
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Network error");
		expect(value.data).toBe(null);

		unsubscribe();
	});

	test("skips query when skip option is true", () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never, { skip: true });
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
	});
});

describe("mutation()", () => {
	test("creates a store with initial idle state", () => {
		const mutationFn = async (_input: { title: string }) => ({
			data: { id: "1", title: "Test" },
		});
		const store = mutation(mutationFn);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("shows loading state during mutation", async () => {
		let resolvePromise: (value: { data: { id: string } }) => void;
		const mutationFn = (_input: { title: string }) =>
			new Promise<{ data: { id: string } }>((resolve) => {
				resolvePromise = resolve;
			});

		const store = mutation(mutationFn);
		const values: boolean[] = [];

		// Subscribe to track loading states
		store.subscribe((v) => values.push(v.loading));

		// Start mutation
		const promise = store.mutate({ title: "Test" });

		// Should be loading
		expect(get(store).loading).toBe(true);

		// Resolve
		resolvePromise!({ data: { id: "1" } });
		await promise;

		// Should not be loading
		expect(get(store).loading).toBe(false);
		expect(get(store).data).toEqual({ id: "1" });
	});

	test("handles mutation errors", async () => {
		const mutationFn = async (_input: { title: string }) => {
			throw new Error("Mutation failed");
		};

		const store = mutation(mutationFn);

		await expect(store.mutate({ title: "Test" })).rejects.toThrow("Mutation failed");

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Mutation failed");
	});

	test("reset clears the state", async () => {
		const mutationFn = async (_input: { title: string }) => ({
			data: { id: "1", title: "Test" },
		});

		const store = mutation(mutationFn);
		await store.mutate({ title: "Test" });

		// Data should be set
		expect(get(store).data).toEqual({ id: "1", title: "Test" });

		// Reset
		store.reset();

		const value = get(store);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
		expect(value.error).toBe(null);
	});
});

describe("lazyQuery()", () => {
	test("creates a store with idle state (not loading)", () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("execute triggers the query", async () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute should start loading
		const promise = store.execute();

		// Should be loading
		expect(get(store).loading).toBe(true);

		// Resolve
		mockResult._resolve({ id: "123", name: "John" });
		const result = await promise;

		// Should have data
		expect(result).toEqual({ id: "123", name: "John" });
		expect(get(store).data).toEqual({ id: "123", name: "John" });
		expect(get(store).loading).toBe(false);
	});

	test("reset clears the state", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute and resolve
		const promise = store.execute();
		mockResult._resolve({ id: "123" });
		await promise;

		// Data should be set
		expect(get(store).data).toEqual({ id: "123" });

		// Reset
		store.reset();

		const value = get(store);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
	});
});
