/**
 * Tests for Preact Hooks
 *
 * NOTE: These tests require DOM environment (happy-dom).
 * Run from packages/preact directory: cd packages/preact && bun test
 */

// Skip all tests if DOM is not available (when run from root)
const hasDom = typeof document !== "undefined";

import { test as bunTest, describe, expect } from "bun:test";

const test = hasDom ? bunTest : bunTest.skip;

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { signal } from "@preact/signals";
import { render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { useLazyQuery, useMutation, useQuery } from "./hooks.js";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialValue: T | null = null): QueryResult<T> & {
	_setValue: (value: T) => void;
	_setError: (error: Error) => void;
	_triggerUpdate: (value: T) => void;
} {
	let currentValue = initialValue;
	let _currentError: Error | null = null;
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
			for (const cb of subscribers) cb(value);
			if (!resolved && resolvePromise) {
				resolved = true;
				resolvePromise(value);
			}
		},
		_setError(error: Error) {
			_currentError = error;
			result.loading.value = false;
			result.error.value = error;
			if (!resolved && rejectPromise) {
				resolved = true;
				rejectPromise(error);
			}
		},
		_triggerUpdate(value: T) {
			currentValue = value;
			result.signal.value = value;
			for (const cb of subscribers) cb(value);
		},
	};

	return result as QueryResult<T> & {
		_setValue: (value: T) => void;
		_setError: (error: Error) => void;
		_triggerUpdate: (value: T) => void;
	};
}

// =============================================================================
// Helper to render hook in component
// =============================================================================

function renderHook<T>(hook: () => T) {
	let result: T | undefined;
	function TestComponent() {
		result = hook();
		return null;
	}
	const rendered = render(h(TestComponent, null));
	return {
		result: {
			get current() {
				return result!;
			},
		},
		unmount: rendered.unmount,
		rerender: () => rendered.rerender(h(TestComponent, null)),
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
		mockQuery._setValue({ id: "123", name: "John" });

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
		mockQuery._setError(new Error("Query failed"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("Query failed");
		expect(result.current.data).toBe(null);
	});

	test("converts non-Error to Error object", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		// Simulate error with non-Error object
		mockQuery._setError("string error" as any);

		await waitFor(() => {
			expect(result.current.error).toBeInstanceOf(Error);
		});

		expect(result.current.error?.message).toBe("string error");
	});

	test("skips query when skip option is true", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery, { skip: true }));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles null query input", () => {
		const { result } = renderHook(() => useQuery(null));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles undefined query input", () => {
		const { result } = renderHook(() => useQuery(undefined));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles query accessor function returning null", () => {
		const { result } = renderHook(() => useQuery(() => null));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles query accessor function returning undefined", () => {
		const { result } = renderHook(() => useQuery(() => undefined));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("resolves query accessor function", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery));

		mockQuery._setValue({ id: "123", name: "John" });

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});
	});

	test("updates when query subscription emits", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		// First value
		mockQuery._setValue({ id: "123", name: "John" });

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Update value via subscription
		mockQuery._triggerUpdate({ id: "123", name: "Jane" });

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Jane");
		});
	});

	test("refetch successfully updates data", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		mockQuery._setValue({ id: "123", name: "John" });

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Create a new promise that will resolve
		let resolveRefetch: ((value: { id: string; name: string }) => void) | null = null;
		const refetchPromise = new Promise<{ id: string; name: string }>((resolve) => {
			resolveRefetch = resolve;
		});

		// Override the then method temporarily to simulate refetch success
		const originalThen = mockQuery.then;
		mockQuery.then = (onfulfilled, onrejected) => {
			return refetchPromise.then(onfulfilled, onrejected);
		};

		// Trigger refetch
		result.current.refetch();

		// Trigger the success
		resolveRefetch?.({ id: "123", name: "Updated" });

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Updated");
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBe(null);

		// Restore original then
		mockQuery.then = originalThen;
	});

	test("refetch handles errors correctly", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery));

		mockQuery._setValue({ id: "123", name: "John" });

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Create a new promise that will reject
		let rejectRefetch: ((error: Error) => void) | null = null;
		const refetchPromise = new Promise<{ id: string; name: string }>((_resolve, reject) => {
			rejectRefetch = reject;
		});

		// Override the then method temporarily to simulate refetch error
		const originalThen = mockQuery.then;
		mockQuery.then = (onfulfilled, onrejected) => {
			return refetchPromise.then(onfulfilled, onrejected);
		};

		// Trigger refetch
		result.current.refetch();

		// Trigger the error
		rejectRefetch?.(new Error("Refetch failed"));

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Refetch failed");
		});

		expect(result.current.loading).toBe(false);

		// Restore original then
		mockQuery.then = originalThen;
	});

	test("refetch does nothing when query is null", () => {
		const { result } = renderHook(() => useQuery(null));

		// Should not throw
		result.current.refetch();

		expect(result.current.loading).toBe(false);
	});

	test("refetch does nothing when skip is true", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(mockQuery, { skip: true }));

		// Should not throw or change state
		result.current.refetch();

		expect(result.current.loading).toBe(false);
	});

	test("unsubscribes on unmount", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { unmount } = renderHook(() => useQuery(mockQuery));

		mockQuery._setValue({ id: "123", name: "John" });

		// Unmount
		unmount();

		// Try to update after unmount - should not throw
		mockQuery._triggerUpdate({ id: "123", name: "Updated" });

		// No error expected
		expect(true).toBe(true);
	});
});

// =============================================================================
// Tests: useMutation
// =============================================================================

describe("useMutation", () => {
	test("returns initial state", () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(typeof result.current.mutate).toBe("function");
		expect(typeof result.current.reset).toBe("function");
	});

	test("executes mutation and returns result", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		const mutationResult = await result.current.mutate({ name: "New User" });

		expect(mutationResult.data).toEqual({ id: "new-id", name: "New User" });

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "new-id", name: "New User" });
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBe(null);
	});

	test("handles mutation error", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			throw new Error("Mutation failed");
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		try {
			await result.current.mutate({ name: "New User" });
		} catch (err) {
			// Expected error
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Mutation failed");
		}

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Mutation failed");
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("converts non-Error to Error object", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string }>> => {
			throw "string error";
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		try {
			await result.current.mutate({ name: "New User" });
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
		}

		await waitFor(() => {
			expect(result.current.error).toBeInstanceOf(Error);
		});

		expect(result.current.error?.message).toBe("string error");
	});

	test("reset clears mutation state", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result, rerender } = renderHook(() => useMutation(mutationFn));

		await result.current.mutate({ name: "New User" });

		await waitFor(() => {
			expect(result.current.data).not.toBe(null);
		});

		result.current.reset();
		rerender();

		await waitFor(() => {
			expect(result.current.data).toBe(null);
		});

		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("reset clears error state", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string }>> => {
			throw new Error("Mutation failed");
		};

		const { result, rerender } = renderHook(() => useMutation(mutationFn));

		try {
			await result.current.mutate({ name: "New User" });
		} catch {
			// Expected
		}

		await waitFor(() => {
			expect(result.current.error).not.toBe(null);
		});

		result.current.reset();
		rerender();

		await waitFor(() => {
			expect(result.current.error).toBe(null);
		});
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
		expect(result.current.error).toBe(null);
		expect(typeof result.current.execute).toBe("function");
		expect(typeof result.current.reset).toBe("function");
	});

	test("executes query when execute is called", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		const queryResult = await result.current.execute();

		expect(queryResult).toEqual({ id: "123", name: "John" });

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});

		expect(result.current.loading).toBe(false);
	});

	test("handles query error", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		// Set error before execute
		mockQuery._setError(new Error("Query failed"));

		// Execute should throw
		try {
			await result.current.execute();
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Query failed");
		}

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Query failed");
		});

		expect(result.current.data).toBe(null);
	});

	test("converts non-Error to Error object", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(mockQuery));

		mockQuery._setError("string error" as any);

		try {
			await result.current.execute();
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
		}

		await waitFor(() => {
			expect(result.current.error).toBeInstanceOf(Error);
		});
	});

	test("handles null query input", async () => {
		const { result } = renderHook(() => useLazyQuery(null));

		const queryResult = await result.current.execute();

		expect(queryResult).toBe(null);
		expect(result.current.data).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("handles undefined query input", async () => {
		const { result } = renderHook(() => useLazyQuery(undefined));

		const queryResult = await result.current.execute();

		expect(queryResult).toBe(null);
		expect(result.current.data).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("resolves query accessor function", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(() => useLazyQuery(() => mockQuery));

		await result.current.execute();

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});
	});

	test("reset clears query state", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result, rerender } = renderHook(() => useLazyQuery(mockQuery));

		await result.current.execute();

		await waitFor(() => {
			expect(result.current.data).not.toBe(null);
		});

		result.current.reset();
		rerender();

		await waitFor(() => {
			expect(result.current.data).toBe(null);
		});

		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("reset clears error state", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result, rerender } = renderHook(() => useLazyQuery(mockQuery));

		mockQuery._setError(new Error("Query failed"));

		try {
			await result.current.execute();
		} catch {
			// Expected
		}

		await waitFor(() => {
			expect(result.current.error).not.toBe(null);
		});

		result.current.reset();
		rerender();

		await waitFor(() => {
			expect(result.current.error).toBe(null);
		});
	});
});

// =============================================================================
// Tests: Type Exports
// =============================================================================

describe("types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: import("./hooks.js").QueryInput<string> = null;
		const _testUndefined: import("./hooks.js").QueryInput<string> = undefined;
		const _testAccessor: import("./hooks.js").QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("UseQueryResult has correct shape", () => {
		// Type assertion test
		const result: import("./hooks.js").UseQueryResult<{ id: string }> = {
			data: null,
			loading: true,
			error: null,
			refetch: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(true);
		expect(result.error).toBe(null);
		expect(typeof result.refetch).toBe("function");
	});

	test("UseLazyQueryResult has correct shape", () => {
		const result: import("./hooks.js").UseLazyQueryResult<{ id: string }> = {
			data: null,
			loading: false,
			error: null,
			execute: async () => ({ id: "test" }),
			reset: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(false);
		expect(typeof result.execute).toBe("function");
		expect(typeof result.reset).toBe("function");
	});

	test("UseMutationResult has correct shape", () => {
		const result: import("./hooks.js").UseMutationResult<{ name: string }, { id: string }> = {
			data: null,
			loading: false,
			error: null,
			mutate: async () => ({ data: { id: "test" } }),
			reset: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(false);
		expect(typeof result.mutate).toBe("function");
		expect(typeof result.reset).toBe("function");
	});

	test("UseQueryOptions has skip property", () => {
		const options: import("./hooks.js").UseQueryOptions = { skip: true };
		expect(options.skip).toBe(true);
	});

	test("MutationFn type is correct", () => {
		const fn: import("./hooks.js").MutationFn<{ name: string }, { id: string }> = async (input) => ({
			data: { id: input.name },
		});

		expect(typeof fn).toBe("function");
	});
});
