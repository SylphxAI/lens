/**
 * @lens/svelte - Stores
 *
 * Svelte stores that wrap Lens QueryResult for reactive data access.
 * Integrates with Svelte's store contract (subscribe method).
 */

import { readable, writable, type Readable, type Writable } from "svelte/store";
import type { QueryResult, MutationResult } from "@lens/client";

// =============================================================================
// Types
// =============================================================================

/** Query store value */
export interface QueryStoreValue<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
}

/** Mutation store value */
export interface MutationStoreValue<TOutput> {
	data: TOutput | null;
	loading: boolean;
	error: Error | null;
}

/** Query store type */
export type QueryStore<T> = Readable<QueryStoreValue<T>> & {
	refetch: () => void;
};

/** Mutation store type */
export type MutationStore<TInput, TOutput> = Readable<MutationStoreValue<TOutput>> & {
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	reset: () => void;
};

/** Query store options */
export interface QueryStoreOptions {
	/** Skip the query (don't execute) */
	skip?: boolean;
}

// =============================================================================
// query() - Query Store
// =============================================================================

/**
 * Create a readable store from a QueryResult.
 * Automatically subscribes to query updates.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { query } from '@lens/svelte';
 *   import { client } from './client';
 *
 *   const userStore = query(client.queries.getUser({ id: '123' }));
 * </script>
 *
 * {#if $userStore.loading}
 *   <p>Loading...</p>
 * {:else if $userStore.error}
 *   <p>Error: {$userStore.error.message}</p>
 * {:else if $userStore.data}
 *   <h1>{$userStore.data.name}</h1>
 * {/if}
 * ```
 */
export function query<T>(
	queryResult: QueryResult<T>,
	options?: QueryStoreOptions,
): QueryStore<T> {
	let refetchFn: (() => void) | null = null;

	const store = readable<QueryStoreValue<T>>(
		{ data: null, loading: !options?.skip, error: null },
		(set) => {
			if (options?.skip) {
				set({ data: null, loading: false, error: null });
				return () => {};
			}

			// Subscribe to query updates
			const unsubscribe = queryResult.subscribe((value) => {
				set({ data: value, loading: false, error: null });
			});

			// Handle initial load via promise
			queryResult.then(
				(value) => {
					set({ data: value, loading: false, error: null });
				},
				(err) => {
					const error = err instanceof Error ? err : new Error(String(err));
					set({ data: null, loading: false, error });
				},
			);

			// Refetch function
			refetchFn = () => {
				set({ data: null, loading: true, error: null });
				queryResult.then(
					(value) => {
						set({ data: value, loading: false, error: null });
					},
					(err) => {
						const error = err instanceof Error ? err : new Error(String(err));
						set({ data: null, loading: false, error });
					},
				);
			};

			return () => {
				unsubscribe();
				refetchFn = null;
			};
		},
	);

	return {
		subscribe: store.subscribe,
		refetch: () => refetchFn?.(),
	};
}

// =============================================================================
// mutation() - Mutation Store
// =============================================================================

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (
	input: TInput,
) => Promise<MutationResult<TOutput>>;

/**
 * Create a store for executing mutations with loading/error state.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { mutation } from '@lens/svelte';
 *   import { client } from './client';
 *
 *   const createPost = mutation(client.mutations.createPost);
 *
 *   async function handleSubmit() {
 *     try {
 *       const result = await createPost.mutate({ title: 'Hello' });
 *       console.log('Created:', result.data);
 *     } catch (err) {
 *       console.error('Failed:', err);
 *     }
 *   }
 * </script>
 *
 * <button on:click={handleSubmit} disabled={$createPost.loading}>
 *   {$createPost.loading ? 'Creating...' : 'Create'}
 * </button>
 * {#if $createPost.error}
 *   <p class="error">{$createPost.error.message}</p>
 * {/if}
 * ```
 */
export function mutation<TInput, TOutput>(
	mutationFn: MutationFn<TInput, TOutput>,
): MutationStore<TInput, TOutput> {
	const store = writable<MutationStoreValue<TOutput>>({
		data: null,
		loading: false,
		error: null,
	});

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		store.set({ data: null, loading: true, error: null });

		try {
			const result = await mutationFn(input);
			store.set({ data: result.data, loading: false, error: null });
			return result;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			store.set({ data: null, loading: false, error });
			throw error;
		}
	};

	const reset = () => {
		store.set({ data: null, loading: false, error: null });
	};

	return {
		subscribe: store.subscribe,
		mutate,
		reset,
	};
}

// =============================================================================
// lazyQuery() - Lazy Query Store
// =============================================================================

/** Lazy query store type */
export type LazyQueryStore<T> = Readable<QueryStoreValue<T>> & {
	execute: () => Promise<T>;
	reset: () => void;
};

/**
 * Create a store for executing queries on demand.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { lazyQuery } from '@lens/svelte';
 *   import { client } from './client';
 *
 *   let searchTerm = '';
 *   const searchStore = lazyQuery(client.queries.searchUsers({ query: searchTerm }));
 *
 *   async function handleSearch() {
 *     const results = await searchStore.execute();
 *     console.log('Found:', results);
 *   }
 * </script>
 *
 * <input bind:value={searchTerm} />
 * <button on:click={handleSearch} disabled={$searchStore.loading}>
 *   Search
 * </button>
 * ```
 */
export function lazyQuery<T>(queryResult: QueryResult<T>): LazyQueryStore<T> {
	const store = writable<QueryStoreValue<T>>({
		data: null,
		loading: false,
		error: null,
	});

	const execute = async (): Promise<T> => {
		store.set({ data: null, loading: true, error: null });

		try {
			const result = await queryResult;
			store.set({ data: result, loading: false, error: null });
			return result;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			store.set({ data: null, loading: false, error });
			throw error;
		}
	};

	const reset = () => {
		store.set({ data: null, loading: false, error: null });
	};

	return {
		subscribe: store.subscribe,
		execute,
		reset,
	};
}
