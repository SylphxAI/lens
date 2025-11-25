/**
 * Tests for React Hooks (Operations-based API)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { signal } from "@sylphx/client";
import {
	useQuery,
	useMutation,
	useLazyQuery,
	type UseQueryResult,
	type UseMutationResult,
	type UseLazyQueryResult,
} from "./hooks";
import type { QueryResult, MutationResult } from "@sylphx/client";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialValue: T | null = null): QueryResult<T> & {
	_setValue: (value: T) => void;
	_setError: (error: Error) => void;
} {
	let currentValue = initialValue;
	let currentError: Error | null = null;
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
		signal: signal(currentValue),
		loading: signal(initialValue === null),
		error: signal<Error | null>(null),
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
			result.signal.value = value;
			result.loading.value = false;
			result.error.value = null;
			subscribers.forEach((cb) => cb(value));
			if (!resolved && resolvePromise) {
				resolved = true;
				resolvePromise(value);
			}
		},
		_setError(error: Error) {
			currentError = error;
			result.loading.value = false;
			result.error.value = error;
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

		const { result } = renderHook(() => useQuery(mockQuery));

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("returns data when query resolves", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		// Simulate data loading
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({ id: "123", name: "John" });
		expect(result.current.error).toBe(null);
	});

	test("returns error when query fails", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		// Simulate error
		act(() => {
			mockQuery._setError(new Error("Query failed"));
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("Query failed");
		expect(result.current.data).toBe(null);
	});

	test("skips query when skip option is true", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery, { skip: true }));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("updates when query subscription emits", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		// First value
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Update value via subscription
		act(() => {
			mockQuery._setValue({ id: "123", name: "Jane" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Jane");
		});
	});
});

// =============================================================================
// Tests: useMutation
// =============================================================================

describe("useMutation", () => {
	test("executes mutation and returns result", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return {
				data: { id: "new-id", name: input.name },
			};
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		let mutationResult: MutationResult<{ id: string; name: string }> | undefined;
		await act(async () => {
			mutationResult = await result.current.mutate({ name: "New User" });
		});

		expect(mutationResult?.data).toEqual({ id: "new-id", name: "New User" });
		expect(result.current.data).toEqual({ id: "new-id", name: "New User" });
		expect(result.current.loading).toBe(false);
	});

	test("handles mutation error", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			throw new Error("Mutation failed");
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("Mutation failed");
		expect(result.current.loading).toBe(false);
	});

	test("shows loading state during mutation", async () => {
		let resolveMutation: ((value: MutationResult<{ id: string }>) => void) | null = null;
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string }>> => {
			return new Promise((resolve) => {
				resolveMutation = resolve;
			});
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		// Start mutation (don't await)
		let mutationPromise: Promise<MutationResult<{ id: string }>> | undefined;
		act(() => {
			mutationPromise = result.current.mutate({ name: "New User" });
		});

		// Should be loading
		expect(result.current.loading).toBe(true);

		// Resolve mutation
		await act(async () => {
			resolveMutation?.({ data: { id: "new-id" } });
			await mutationPromise;
		});

		expect(result.current.loading).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		await act(async () => {
			await result.current.mutate({ name: "New User" });
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});
});

// =============================================================================
// Tests: useLazyQuery
// =============================================================================

describe("useLazyQuery", () => {
	test("does not execute query on mount", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("executes query when execute is called", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({ id: "123", name: "John" });

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		let queryResult: { id: string; name: string } | undefined;
		await act(async () => {
			queryResult = await result.current.execute();
		});

		expect(queryResult).toEqual({ id: "123", name: "John" });
		expect(result.current.data).toEqual({ id: "123", name: "John" });
	});

	test("handles query error", async () => {
		// Create a mock query that rejects
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		// Set error before execute
		act(() => {
			mockQuery._setError(new Error("Query failed"));
		});

		// Execute should throw
		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("Query failed");
	});

	test("reset clears query state", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({ id: "123", name: "John" });

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});
});
