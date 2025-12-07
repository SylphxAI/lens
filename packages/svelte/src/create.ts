/**
 * @sylphx/lens-svelte - Create Client
 *
 * Creates a typed Lens client with Svelte stores.
 * Base client methods work in vanilla JS, stores are extensions.
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
 * // Vanilla JS (anywhere - SSR, utilities, event handlers)
 * const user = await client.user.get({ input: { id } });
 * client.user.get({ input: { id } }).subscribe(data => console.log(data));
 *
 * // Svelte stores (in components)
 * const { data, loading } = client.user.get.createQuery({ input: { id } });
 * const { mutate, loading } = client.user.create.createMutation();
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

/** Query store options */
export interface QueryStoreOptions<TInput> {
	/** Query input parameters */
	input?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean;
}

/** Query store result - Svelte store with refetch */
export interface QueryStoreResult<T> extends Readable<QueryStoreValue<T>> {
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation store options */
export interface MutationStoreOptions<TOutput> {
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

/** Mutation store result - Svelte store with mutate/reset */
export interface MutationStoreResult<TInput, TOutput>
	extends Readable<MutationStoreValue<TOutput>> {
	/** Execute the mutation */
	mutate: (options: { input: TInput; select?: SelectionObject }) => Promise<TOutput>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint with Svelte stores */
export interface QueryEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns QueryResult (Promise + Observable) */
	(options?: { input?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

	/** Svelte store for reactive queries */
	createQuery: (
		options?: TInput extends void ? QueryStoreOptions<void> | void : QueryStoreOptions<TInput>,
	) => QueryStoreResult<TOutput>;
}

/** Mutation endpoint with Svelte stores */
export interface MutationEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns Promise */
	(options: { input: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

	/** Svelte store for mutations */
	createMutation: (options?: MutationStoreOptions<TOutput>) => MutationStoreResult<TInput, TOutput>;
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
 * Create createQuery store for a specific endpoint
 */
function createQueryStoreFactory<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => QueryResult<TOutput>,
) {
	return function createQuery(options?: QueryStoreOptions<TInput>): QueryStoreResult<TOutput> {
		const store = writable<QueryStoreValue<TOutput>>({
			data: null,
			loading: !options?.skip,
			error: null,
		});

		let queryUnsubscribe: (() => void) | null = null;
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

			const endpoint = getEndpoint();
			const query = endpoint({ input: options?.input, select: options?.select });

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
				}
			};
		};

		return {
			subscribe,
			refetch,
		};
	};
}

/**
 * Create createMutation store for a specific endpoint
 */
function createMutationStoreFactory<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => Promise<{ data: TOutput }>,
) {
	return function createMutation(
		storeOptions?: MutationStoreOptions<TOutput>,
	): MutationStoreResult<TInput, TOutput> {
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
				const endpoint = getEndpoint();
				const result = await endpoint({ input: options.input, select: options.select });

				store.set({ data: result.data, loading: false, error: null });

				storeOptions?.onSuccess?.(result.data);
				storeOptions?.onSettled?.();

				return result.data;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				store.set({ data: null, loading: false, error: mutationError });

				storeOptions?.onError?.(mutationError);
				storeOptions?.onSettled?.();

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
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for store functions to ensure stable references
const storeCache = new Map<string, unknown>();

/**
 * Create a Lens client with Svelte stores.
 *
 * Base client methods work in vanilla JS (SSR, utilities, event handlers).
 * Svelte stores are available as `.createQuery()` and `.createMutation()`.
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
 * // Vanilla JS (anywhere)
 * const user = await client.user.get({ input: { id } });
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   import { client } from '$lib/client';
 *
 *   export let id: string;
 *
 *   // Query store - auto-subscribes with $
 *   $: userStore = client.user.get.createQuery({ input: { id } });
 *
 *   // Mutation store
 *   const updateUser = client.user.update.createMutation({
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
	// Create base client for transport
	const baseClient = createBaseClient(config as LensClientConfig);

	function createProxy(path: string): unknown {
		const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				// Handle .createQuery() - Svelte store for queries
				if (key === "createQuery") {
					const cacheKey = `${path}:createQuery`;
					if (!storeCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => QueryResult<unknown>;
						};
						storeCache.set(cacheKey, createQueryStoreFactory(getEndpoint));
					}
					return storeCache.get(cacheKey);
				}

				// Handle .createMutation() - Svelte store for mutations
				if (key === "createMutation") {
					const cacheKey = `${path}:createMutation`;
					if (!storeCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => Promise<{ data: unknown }>;
						};
						storeCache.set(cacheKey, createMutationStoreFactory(getEndpoint));
					}
					return storeCache.get(cacheKey);
				}

				if (key === "then") return undefined;
				if (key.startsWith("_")) return undefined;

				const newPath = path ? `${path}.${key}` : key;
				return createProxy(newPath);
			},

			apply(_target, _thisArg, args) {
				// Direct call - delegate to base client (returns QueryResult or Promise)
				const parts = path.split(".");
				let current: unknown = baseClient;
				for (const part of parts) {
					current = (current as Record<string, unknown>)[part];
				}
				const endpoint = current as (options: unknown) => unknown;
				return endpoint(args[0]);
			},
		};

		const proxy = new Proxy((() => {}) as (...args: unknown[]) => unknown, handler);
		return proxy;
	}

	return createProxy("") as TypedClient<TRouter>;
}
