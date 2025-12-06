/**
 * @sylphx/lens-svelte - Create Client
 *
 * Creates a typed Lens client with Svelte stores.
 * Each endpoint can be called directly as a store or via .fetch() for promises.
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-svelte';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // In component
 * const userStore = client.user.get({ input: { id } });
 * $: ({ data, loading, error } = $userStore);
 *
 * // In SSR/load function
 * const user = await client.user.get.fetch({ input: { id } });
 * ```
 */

import {
	createClient as createBaseClient,
	type LensClientConfig,
	type QueryResult,
	type SelectionObject,
	type TypedClientConfig,
} from "@sylphx/lens-client";
import type { MutationDef, QueryDef, RouterDef, RouterRoutes } from "@sylphx/lens-core";
import { type Readable, writable } from "svelte/store";

// =============================================================================
// Types
// =============================================================================

/** Query store value */
export interface QueryStoreValue<T> {
	/** Reactive data */
	data: T | null;
	/** Reactive loading state */
	loading: boolean;
	/** Reactive error state */
	error: Error | null;
}

/** Query hook options */
export interface QueryHookOptions<TInput> {
	/** Query input parameters */
	input?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean;
}

/** Query hook result - Svelte store with refetch */
export interface QueryHookResult<T> extends Readable<QueryStoreValue<T>> {
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation hook options */
export interface MutationHookOptions<TOutput> {
	/** Called on successful mutation */
	onSuccess?: (data: TOutput) => void;
	/** Called on mutation error */
	onError?: (error: Error) => void;
	/** Called when mutation settles (success or error) */
	onSettled?: () => void;
}

/** Mutation store value */
export interface MutationStoreValue<TOutput> {
	/** Reactive last mutation result */
	data: TOutput | null;
	/** Reactive loading state */
	loading: boolean;
	/** Reactive error state */
	error: Error | null;
}

/** Mutation hook result - Svelte store with mutate/reset */
export interface MutationHookResult<TInput, TOutput> extends Readable<MutationStoreValue<TOutput>> {
	/** Execute the mutation */
	mutate: (options: { input: TInput; select?: SelectionObject }) => Promise<TOutput>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint type */
export interface QueryEndpoint<TInput, TOutput> {
	/** Store call (in component) */
	<_TSelect extends SelectionObject = Record<string, never>>(
		options: TInput extends void ? QueryHookOptions<void> | void : QueryHookOptions<TInput>,
	): QueryHookResult<TOutput>;

	/** Promise call (SSR) */
	fetch: <TSelect extends SelectionObject = Record<string, never>>(
		options: TInput extends void
			? { input?: void; select?: TSelect } | void
			: { input: TInput; select?: TSelect },
	) => Promise<TOutput>;
}

/** Mutation endpoint type */
export interface MutationEndpoint<TInput, TOutput> {
	/** Store call (in component) */
	(options?: MutationHookOptions<TOutput>): MutationHookResult<TInput, TOutput>;

	/** Promise call (SSR) */
	fetch: <TSelect extends SelectionObject = Record<string, never>>(options: {
		input: TInput;
		select?: TSelect;
	}) => Promise<TOutput>;
}

/** Infer client type from router routes */
type InferTypedClient<TRoutes extends RouterRoutes> = {
	[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
		? InferTypedClient<TNestedRoutes>
		: TRoutes[K] extends QueryDef<infer TInput, infer TOutput>
			? QueryEndpoint<TInput, TOutput>
			: TRoutes[K] extends MutationDef<infer TInput, infer TOutput>
				? MutationEndpoint<TInput, TOutput>
				: never;
};

/** Typed client from router */
export type TypedClient<TRouter extends RouterDef> =
	TRouter extends RouterDef<infer TRoutes> ? InferTypedClient<TRoutes> : never;

// =============================================================================
// Store Factories
// =============================================================================

/**
 * Create a query store for a specific endpoint
 */
function createQueryStore<TInput, TOutput>(
	baseClient: unknown,
	path: string,
): QueryEndpoint<TInput, TOutput> {
	const getEndpoint = (p: string) => {
		const parts = p.split(".");
		let current: unknown = baseClient;
		for (const part of parts) {
			current = (current as Record<string, unknown>)[part];
		}
		return current as (options: unknown) => QueryResult<TOutput>;
	};

	const useQueryStore = (options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> => {
		const store = writable<QueryStoreValue<TOutput>>({
			data: null,
			loading: !options?.skip,
			error: null,
		});

		let queryUnsubscribe: (() => void) | null = null;
		let _currentQuery: QueryResult<TOutput> | null = null;
		let subscriberCount = 0;

		const executeQuery = () => {
			// Cleanup previous subscription
			if (queryUnsubscribe) {
				queryUnsubscribe();
				queryUnsubscribe = null;
			}

			if (options?.skip) {
				store.set({ data: null, loading: false, error: null });
				return;
			}

			const endpoint = getEndpoint(path);
			const query = endpoint({ input: options?.input, select: options?.select });
			_currentQuery = query;

			store.set({ data: null, loading: true, error: null });

			// Subscribe to query updates
			queryUnsubscribe = query.subscribe((value) => {
				store.set({ data: value, loading: false, error: null });
			});

			// Handle initial load via promise
			query.then(
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
			if (queryUnsubscribe) {
				queryUnsubscribe();
				queryUnsubscribe = null;
			}
			executeQuery();
		};

		// Custom subscribe that handles setup/cleanup
		const subscribe = (run: (value: QueryStoreValue<TOutput>) => void) => {
			subscriberCount++;

			// First subscriber - execute the query
			if (subscriberCount === 1) {
				executeQuery();
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
					_currentQuery = null;
				}
			};
		};

		return {
			subscribe,
			refetch,
		};
	};

	// Fetch method for promises (SSR)
	const fetch = async (options?: {
		input?: TInput;
		select?: SelectionObject;
	}): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const queryResult = endpoint({ input: options?.input, select: options?.select });
		return queryResult.then((data) => data);
	};

	const endpoint = useQueryStore as QueryEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch;

	return endpoint;
}

/**
 * Create a mutation store for a specific endpoint
 */
function createMutationStore<TInput, TOutput>(
	baseClient: unknown,
	path: string,
): MutationEndpoint<TInput, TOutput> {
	const getEndpoint = (p: string) => {
		const parts = p.split(".");
		let current: unknown = baseClient;
		for (const part of parts) {
			current = (current as Record<string, unknown>)[part];
		}
		return current as (options: unknown) => QueryResult<{ data: TOutput }>;
	};

	const useMutationStore = (
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> => {
		const store = writable<MutationStoreValue<TOutput>>({
			data: null,
			loading: false,
			error: null,
		});

		const mutate = async (options: {
			input: TInput;
			select?: SelectionObject;
		}): Promise<TOutput> => {
			store.set({ data: null, loading: true, error: null });

			try {
				const endpoint = getEndpoint(path);
				const result = await endpoint({ input: options.input, select: options.select });
				const mutationResult = result as unknown as { data: TOutput };

				store.set({ data: mutationResult.data, loading: false, error: null });

				hookOptions?.onSuccess?.(mutationResult.data);
				hookOptions?.onSettled?.();

				return mutationResult.data;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				store.set({ data: null, loading: false, error: mutationError });

				hookOptions?.onError?.(mutationError);
				hookOptions?.onSettled?.();

				throw mutationError;
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
	};

	// Fetch method for promises (SSR)
	const fetch = async (options: { input: TInput; select?: SelectionObject }): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const result = await endpoint({ input: options.input, select: options.select });
		const mutationResult = result as unknown as { data: TOutput };
		return mutationResult.data;
	};

	const endpoint = useMutationStore as MutationEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch;

	return endpoint;
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for store functions to ensure stable references
const storeCache = new Map<string, unknown>();

/**
 * Create a Lens client with Svelte stores.
 *
 * Each endpoint can be called:
 * - Directly as a store: `client.user.get({ input: { id } })`
 * - Via .fetch() for promises: `await client.user.get.fetch({ input: { id } })`
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-svelte';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   import { client } from '$lib/client';
 *
 *   export let id: string;
 *
 *   // Query store - auto-subscribes with $
 *   $: userStore = client.user.get({ input: { id } });
 *
 *   // Mutation store
 *   const updateUser = client.user.update({
 *     onSuccess: () => console.log('Updated!'),
 *   });
 *
 *   async function handleUpdate() {
 *     await updateUser.mutate({ input: { id, name: 'New' } });
 *   }
 * </script>
 *
 * {#if $userStore.loading}
 *   <p>Loading...</p>
 * {:else if $userStore.error}
 *   <p>Error: {$userStore.error.message}</p>
 * {:else if $userStore.data}
 *   <h1>{$userStore.data.name}</h1>
 *   <button on:click={handleUpdate} disabled={$updateUser.loading}>
 *     Update
 *   </button>
 * {/if}
 * ```
 */
export function createClient<TRouter extends RouterDef>(
	config: LensClientConfig | TypedClientConfig<{ router: TRouter }>,
): TypedClient<TRouter> {
	const baseClient = createBaseClient(config as LensClientConfig);

	function createProxy(path: string): unknown {
		const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				// Handle .fetch() method
				if (key === "fetch") {
					return async (options: unknown) => {
						const parts = path.split(".");
						let current: unknown = baseClient;
						for (const part of parts) {
							current = (current as Record<string, unknown>)[part];
						}
						const endpointFn = current as (opts: unknown) => QueryResult<unknown>;
						const queryResult = endpointFn(options);
						const result = await queryResult;

						if (
							result &&
							typeof result === "object" &&
							"data" in result &&
							Object.keys(result).length === 1
						) {
							return (result as { data: unknown }).data;
						}
						return result;
					};
				}

				if (key === "then") return undefined;
				if (key.startsWith("_")) return undefined;

				const newPath = path ? `${path}.${key}` : key;
				return createProxy(newPath);
			},

			apply(_target, _thisArg, args) {
				const options = args[0] as Record<string, unknown> | undefined;

				const isQueryOptions =
					options && ("input" in options || "select" in options || "skip" in options);

				const isMutationOptions =
					!options ||
					(!isQueryOptions &&
						(Object.keys(options).length === 0 ||
							"onSuccess" in options ||
							"onError" in options ||
							"onSettled" in options));

				const cacheKeyQuery = `${path}:query`;
				const cacheKeyMutation = `${path}:mutation`;

				if (isQueryOptions) {
					if (!storeCache.has(cacheKeyQuery)) {
						storeCache.set(cacheKeyQuery, createQueryStore(baseClient, path));
					}
					const store = storeCache.get(cacheKeyQuery) as (opts: unknown) => unknown;
					return store(options);
				}

				if (isMutationOptions) {
					if (!storeCache.has(cacheKeyMutation)) {
						storeCache.set(cacheKeyMutation, createMutationStore(baseClient, path));
					}
					const store = storeCache.get(cacheKeyMutation) as (opts: unknown) => unknown;
					return store(options);
				}

				if (!storeCache.has(cacheKeyQuery)) {
					storeCache.set(cacheKeyQuery, createQueryStore(baseClient, path));
				}
				const store = storeCache.get(cacheKeyQuery) as (opts: unknown) => unknown;
				return store(options);
			},
		};

		return new Proxy((() => {}) as (...args: unknown[]) => unknown, handler);
	}

	return createProxy("") as TypedClient<TRouter>;
}
