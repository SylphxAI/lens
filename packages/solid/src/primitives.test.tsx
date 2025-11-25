/**
 * Tests for SolidJS Primitives
 */

import { describe, expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { createQuery, createMutation, createLazyQuery } from "./primitives";
import type { QueryResult, MutationResult } from "@lens/client";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(
	initialValue: T | null = null,
): QueryResult<T> & {
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
			subscribers.forEach((cb) => cb(value));
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
// Tests: createQuery
// =============================================================================

describe("createQuery", () => {
	test("returns loading state initially", () => {
		createRoot((dispose) => {
			const mockQuery = createMockQueryResult<{ id: string; name: string }>();
			const query = createQuery(() => mockQuery);

			expect(query.loading()).toBe(true);
			expect(query.data()).toBe(null);
			expect(query.error()).toBe(null);

			dispose();
		});
	});

	test("returns data when query resolves", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				// Create mock with initial value so promise resolves immediately
				const mockQuery = createMockQueryResult<{ id: string; name: string }>({
					id: "123",
					name: "John",
				});
				const query = createQuery(() => mockQuery);

				// Wait for promise to resolve
				await new Promise((r) => setTimeout(r, 10));

				expect(query.data()).toEqual({ id: "123", name: "John" });
				expect(query.loading()).toBe(false);
				expect(query.error()).toBe(null);

				dispose();
				resolve();
			});
		});
	});

	test("skips query when skip option is true", () => {
		createRoot((dispose) => {
			const mockQuery = createMockQueryResult<{ id: string }>();
			const query = createQuery(() => mockQuery, { skip: true });

			expect(query.loading()).toBe(false);
			expect(query.data()).toBe(null);

			dispose();
		});
	});
});

// =============================================================================
// Tests: createMutation
// =============================================================================

describe("createMutation", () => {
	test("executes mutation and returns result", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				const mutationFn = async (
					input: { name: string },
				): Promise<MutationResult<{ id: string; name: string }>> => {
					return { data: { id: "new-id", name: input.name } };
				};

				const mutation = createMutation(mutationFn);

				expect(mutation.loading()).toBe(false);
				expect(mutation.data()).toBe(null);

				const result = await mutation.mutate({ name: "New User" });

				expect(result.data).toEqual({ id: "new-id", name: "New User" });
				expect(mutation.data()).toEqual({ id: "new-id", name: "New User" });
				expect(mutation.loading()).toBe(false);

				dispose();
				resolve();
			});
		});
	});

	test("handles mutation error", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				const mutationFn = async (
					_input: { name: string },
				): Promise<MutationResult<{ id: string }>> => {
					throw new Error("Mutation failed");
				};

				const mutation = createMutation(mutationFn);

				try {
					await mutation.mutate({ name: "New User" });
				} catch {
					// Expected error
				}

				expect(mutation.error()?.message).toBe("Mutation failed");
				expect(mutation.loading()).toBe(false);

				dispose();
				resolve();
			});
		});
	});

	test("reset clears mutation state", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				const mutationFn = async (
					input: { name: string },
				): Promise<MutationResult<{ id: string; name: string }>> => {
					return { data: { id: "new-id", name: input.name } };
				};

				const mutation = createMutation(mutationFn);
				await mutation.mutate({ name: "New User" });

				expect(mutation.data()).not.toBe(null);

				mutation.reset();

				expect(mutation.data()).toBe(null);
				expect(mutation.error()).toBe(null);
				expect(mutation.loading()).toBe(false);

				dispose();
				resolve();
			});
		});
	});
});

// =============================================================================
// Tests: createLazyQuery
// =============================================================================

describe("createLazyQuery", () => {
	test("does not execute query on creation", () => {
		createRoot((dispose) => {
			const mockQuery = createMockQueryResult<{ id: string }>({ id: "123" });
			const query = createLazyQuery(() => mockQuery);

			expect(query.loading()).toBe(false);
			expect(query.data()).toBe(null);

			dispose();
		});
	});

	test("executes query when execute is called", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				const mockQuery = createMockQueryResult<{ id: string; name: string }>({
					id: "123",
					name: "John",
				});
				const query = createLazyQuery(() => mockQuery);

				const result = await query.execute();

				expect(result).toEqual({ id: "123", name: "John" });
				expect(query.data()).toEqual({ id: "123", name: "John" });

				dispose();
				resolve();
			});
		});
	});

	test("reset clears query state", async () => {
		await new Promise<void>((resolve) => {
			createRoot(async (dispose) => {
				const mockQuery = createMockQueryResult<{ id: string }>({ id: "123" });
				const query = createLazyQuery(() => mockQuery);

				await query.execute();
				expect(query.data()).not.toBe(null);

				query.reset();

				expect(query.data()).toBe(null);
				expect(query.error()).toBe(null);
				expect(query.loading()).toBe(false);

				dispose();
				resolve();
			});
		});
	});
});
