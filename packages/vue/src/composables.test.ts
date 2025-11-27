/**
 * Tests for Vue Composables
 */

import { describe, expect, test } from "bun:test";
import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { ref } from "vue";
import { useLazyQuery, useMutation, useQuery } from "./composables";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialValue: T | null = null): QueryResult<T> & {
	_setValue: (value: T) => void;
	_setError: (error: Error) => void;
} {
	let currentValue = initialValue;
	const subscribers: Array<(value: T) => void> = [];
	let resolved = false;
	let resolvePromise: ((value: T) => void) | null = null;
	let rejectPromise: ((error: Error) => void) | null = null;

	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
		if (initialValue !== null) {
			resolved = true;
			resolve(initialValue);
		}
	});

	const result = {
		get value() {
			return currentValue;
		},
		signal: { value: currentValue } as any,
		loading: { value: initialValue === null } as any,
		error: { value: null } as any,
		subscribe(callback?: (data: T) => void): () => void {
			if (callback) {
				subscribers.push(callback);
				if (currentValue !== null) {
					callback(currentValue);
				}
			}
			return () => {
				const idx = subscribers.indexOf(callback!);
				if (idx >= 0) subscribers.splice(idx, 1);
			};
		},
		select() {
			return result as unknown as QueryResult<T>;
		},
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
		): Promise<TResult1 | TResult2> {
			return promise.then(onfulfilled, onrejected);
		},
		// Test helpers
		_setValue(value: T) {
			currentValue = value;
			for (const cb of subscribers) cb(value);
			if (!resolved && resolvePromise) {
				resolved = true;
				resolvePromise(value);
			}
		},
		_setError(error: Error) {
			if (!resolved && rejectPromise) {
				resolved = true;
				rejectPromise(error);
			}
		},
	};

	return result as QueryResult<T> & {
		_setValue: (value: T) => void;
		_setError: (error: Error) => void;
	};
}

// =============================================================================
// Tests: useQuery
// =============================================================================

describe("useQuery", () => {
	test("returns loading state initially", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();
		const { data, loading, error } = useQuery(() => mockQuery);

		expect(loading.value).toBe(true);
		expect(data.value).toBe(null);
		expect(error.value).toBe(null);
	});

	test("returns data when query resolves", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});
		const { data, loading, error } = useQuery(() => mockQuery);

		// Wait for promise to resolve
		await new Promise((r) => setTimeout(r, 10));

		expect(data.value).toEqual({ id: "123", name: "John" });
		expect(loading.value).toBe(false);
		expect(error.value).toBe(null);
	});

	test("skips query when skip option is true", () => {
		const mockQuery = createMockQueryResult<{ id: string }>();
		const { data, loading } = useQuery(() => mockQuery, { skip: true });

		expect(loading.value).toBe(false);
		expect(data.value).toBe(null);
	});

	test("skips query when skip ref is true", () => {
		const mockQuery = createMockQueryResult<{ id: string }>();
		const skip = ref(true);
		const { data, loading } = useQuery(() => mockQuery, { skip });

		expect(loading.value).toBe(false);
		expect(data.value).toBe(null);
	});
});

// =============================================================================
// Tests: useMutation
// =============================================================================

describe("useMutation", () => {
	test("executes mutation and returns result", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { data, loading, mutate } = useMutation(mutationFn);

		expect(loading.value).toBe(false);
		expect(data.value).toBe(null);

		const result = await mutate({ name: "New User" });

		expect(result.data).toEqual({ id: "new-id", name: "New User" });
		expect(data.value).toEqual({ id: "new-id", name: "New User" });
		expect(loading.value).toBe(false);
	});

	test("handles mutation error", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string }>> => {
			throw new Error("Mutation failed");
		};

		const { error, loading, mutate } = useMutation(mutationFn);

		try {
			await mutate({ name: "New User" });
		} catch {
			// Expected error
		}

		expect(error.value?.message).toBe("Mutation failed");
		expect(loading.value).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { data, error, loading, mutate, reset } = useMutation(mutationFn);

		await mutate({ name: "New User" });
		expect(data.value).not.toBe(null);

		reset();

		expect(data.value).toBe(null);
		expect(error.value).toBe(null);
		expect(loading.value).toBe(false);
	});
});

// =============================================================================
// Tests: useLazyQuery
// =============================================================================

describe("useLazyQuery", () => {
	test("does not execute query on creation", () => {
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "123" });
		const { data, loading } = useLazyQuery(() => mockQuery);

		expect(loading.value).toBe(false);
		expect(data.value).toBe(null);
	});

	test("executes query when execute is called", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});
		const { data, execute } = useLazyQuery(() => mockQuery);

		const result = await execute();

		expect(result).toEqual({ id: "123", name: "John" });
		expect(data.value).toEqual({ id: "123", name: "John" });
	});

	test("reset clears query state", async () => {
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "123" });
		const { data, error, loading, execute, reset } = useLazyQuery(() => mockQuery);

		await execute();
		expect(data.value).not.toBe(null);

		reset();

		expect(data.value).toBe(null);
		expect(error.value).toBe(null);
		expect(loading.value).toBe(false);
	});
});
