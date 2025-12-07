/**
 * @sylphx/lens-svelte - Stores
 *
 * Svelte stores that wrap Lens QueryResult for reactive data access.
 * Integrates with Svelte's store contract (subscribe method).
 */

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { type Readable, writable } from "svelte/store";

// =============================================================================
// Query Input Types
// =============================================================================

/** Query input - can be a query, null/undefined, an accessor function, or a Readable store */
export type QueryInput<T> =
	| QueryResult<T>
	| null
	| undefined
	| (() => QueryResult<T> | null | undefined)
	| Readable<QueryResult<T> | null | undefined>;

/** Helper to check if value is a Svelte store */
function isReadable<T>(value: unknown): value is Readable<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		"subscribe" in value &&
		typeof (value as Readable<T>).subscribe === "function" &&
		// Distinguish from QueryResult which also has subscribe
		!("then" in value)
	);
}

/** Helper to resolve query input (handles accessor functions, not stores) */
function resolveQuery<T>(input: QueryInput<T>): QueryResult<T> | null | undefined {
	if (isReadable(input)) return null; // Stores handled separately
	return typeof input === "function" ? input() : input;
}

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
 * Create a reactive store from a QueryResult.
 * Automatically subscribes to query updates.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { query } from '@sylphx/lens-svelte';
 *   import { derived } from 'svelte/store';
 *   import { client } from './client';
 *
 *   // Static query
 *   const userStore = query(client.user.get({ input: { id: '123' } }));
 *
 *   // Reactive query using Svelte's $: syntax (creates new store on change)
 *   export let userId: string;
 *   $: userQuery = query(client.user.get({ input: { id: userId } }));
 *
 *   // Reactive query using derived store (recommended for complex reactivity)
 *   import { writable } from 'svelte/store';
 *   const userIdStore = writable('123');
 *   const reactiveStore = query(
 *     derived(userIdStore, $id => client.user.get({ input: { id: $id } }))
 *   );
 *
 *   // Conditional query (null when condition not met)
 *   $: sessionStore = query(
 *     sessionId ? client.session.get({ input: { id: sessionId } }) : null
 *   );
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
export function query<T>(queryInput: QueryInput<T>, options?: QueryStoreOptions): QueryStore<T> {
	const store = writable<QueryStoreValue<T>>({ data: null, loading: !options?.skip, error: null });

	let queryUnsubscribe: (() => void) | null = null;
	let storeUnsubscribe: (() => void) | null = null;
	let currentQuery: QueryResult<T> | null = null;
	let subscriberCount = 0;

	const executeQuery = (queryResult: QueryResult<T> | null | undefined) => {
		// Cleanup previous query subscription
		if (queryUnsubscribe) {
			queryUnsubscribe();
			queryUnsubscribe = null;
		}

		currentQuery = queryResult ?? null;

		// Handle null/undefined query or skip
		if (options?.skip || queryResult == null) {
			store.set({ data: null, loading: false, error: null });
			return;
		}

		store.set({ data: null, loading: true, error: null });

		// Subscribe to query updates
		queryUnsubscribe = queryResult.subscribe((value) => {
			store.set({ data: value, loading: false, error: null });
		});

		// Handle initial load via promise
		queryResult.then(
			(value) => {
				store.set({ data: value, loading: false, error: null });
			},
			(err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				store.set({ data: null, loading: false, error });
			},
		);
	};

	const refetch = () => {
		if (currentQuery) {
			store.set({ data: null, loading: true, error: null });
			currentQuery.then(
				(value) => {
					store.set({ data: value, loading: false, error: null });
				},
				(err) => {
					const error = err instanceof Error ? err : new Error(String(err));
					store.set({ data: null, loading: false, error });
				},
			);
		}
	};

	// Custom subscribe that handles setup/cleanup
	const subscribe = (run: (value: QueryStoreValue<T>) => void) => {
		subscriberCount++;

		// First subscriber - set up the query
		if (subscriberCount === 1) {
			// Check if input is a Readable store
			if (isReadable<QueryResult<T> | null | undefined>(queryInput)) {
				// Subscribe to the input store for reactive updates
				storeUnsubscribe = queryInput.subscribe(($query) => {
					executeQuery($query);
				});
			} else {
				// Static input or accessor function - resolve once
				const queryResult = resolveQuery(queryInput);
				executeQuery(queryResult);
			}
		}

		// Subscribe to our writable store
		const unsubscribe = store.subscribe(run);

		return () => {
			unsubscribe();
			subscriberCount--;

			// Last subscriber - cleanup
			if (subscriberCount === 0) {
				if (queryUnsubscribe) {
					queryUnsubscribe();
					queryUnsubscribe = null;
				}
				if (storeUnsubscribe) {
					storeUnsubscribe();
					storeUnsubscribe = null;
				}
				currentQuery = null;
			}
		};
	};

	return {
		subscribe,
		refetch,
	};
}

// =============================================================================
// mutation() - Mutation Store
// =============================================================================

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<MutationResult<TOutput>>;

/**
 * Create a store for executing mutations with loading/error state.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { mutation } from '@sylphx/lens-svelte';
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
 *   import { lazyQuery } from '@sylphx/lens-svelte';
 *   import { client } from './client';
 *
 *   let searchTerm = '';
 *
 *   // Lazy query with accessor - reads searchTerm at execute() time
 *   const searchStore = lazyQuery(
 *     () => client.search.users({ input: { query: searchTerm } })
 *   );
 *
 *   async function handleSearch() {
 *     const results = await searchStore.execute();
 *     console.log('Found:', results);
 *   }
 *
 *   // Conditional query (null when condition not met)
 *   const sessionStore = lazyQuery(
 *     () => sessionId ? client.session.get({ input: { id: sessionId } }) : null
 *   );
 * </script>
 *
 * <input bind:value={searchTerm} />
 * <button on:click={handleSearch} disabled={$searchStore.loading}>
 *   Search
 * </button>
 * ```
 */
export function lazyQuery<T>(queryInput: QueryInput<T>): LazyQueryStore<T> {
	const store = writable<QueryStoreValue<T>>({
		data: null,
		loading: false,
		error: null,
	});

	const execute = async (): Promise<T> => {
		const queryResult = resolveQuery(queryInput);

		if (queryResult == null) {
			store.set({ data: null, loading: false, error: null });
			return null as T;
		}

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
