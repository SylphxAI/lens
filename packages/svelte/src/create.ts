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
 * const user = await client.user.get({ args: { id } });
 * client.user.get({ args: { id } }).subscribe(data => console.log(data));
 *
 * // Svelte stores (in components)
 * const { data, loading } = client.user.get.createQuery({ args: { id } });
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

/**
 * Debug callbacks for query stores.
 * @internal For debugging purposes only - not recommended for production use.
 */
export interface QueryDebugOptions<T> {
	/** Called when data is received */
	onData?: (data: T) => void;
	/** Called when an error occurs */
	onError?: (error: Error) => void;
	/** Called when subscription starts */
	onSubscribe?: () => void;
	/** Called when subscription ends */
	onUnsubscribe?: () => void;
}

/** Query store options */
export interface QueryStoreOptions<TInput, TOutput = unknown> {
	/** Query args parameters */
	args?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean;
	/**
	 * Debug callbacks for development.
	 * @internal For debugging purposes only - not recommended for production use.
	 */
	debug?: QueryDebugOptions<TOutput>;
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
	mutate: (options: { args: TInput; select?: SelectionObject }) => Promise<TOutput>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint with Svelte stores */
export interface QueryEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns QueryResult (Promise + Observable) */
	(options?: { args?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

	/** Svelte store for reactive queries */
	createQuery: (
		options?: TInput extends void
			? QueryStoreOptions<void, TOutput> | void
			: QueryStoreOptions<TInput, TOutput>,
	) => QueryStoreResult<TOutput>;
}

/** Mutation endpoint with Svelte stores */
export interface MutationEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns Promise */
	(options: { args: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

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
	// Cache stores by args key to prevent unnecessary re-creation
	// when args object reference changes but content is the same
	const storeCache = new Map<string, QueryStoreResult<TOutput>>();

	return function createQuery(
		options?: QueryStoreOptions<TInput, TOutput>,
	): QueryStoreResult<TOutput> {
		// Use JSON.stringify for stable key comparison
		const cacheKey = JSON.stringify({
			args: options?.args,
			select: options?.select,
			skip: options?.skip,
		});

		// Return cached store if input hasn't changed
		const cached = storeCache.get(cacheKey);
		if (cached) {
			return cached;
		}

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
				options?.debug?.onUnsubscribe?.();
				queryUnsubscribe = null;
			}

			if (options?.skip) {
				store.set({ data: null, loading: false, error: null });
				return;
			}

			const endpoint = getEndpoint();
			const query = endpoint({ args: options?.args, select: options?.select });

			store.set({ data: null, loading: true, error: null });
			options?.debug?.onSubscribe?.();

			// Subscribe to query updates
			queryUnsubscribe = query.subscribe((value) => {
				store.set({ data: value, loading: false, error: null });
				options?.debug?.onData?.(value);
			});

			// Handle initial load via promise
			query.then(
				(value) => {
					store.set({ data: value, loading: false, error: null });
					options?.debug?.onData?.(value);
				},
				(err) => {
					const error = err instanceof Error ? err : new Error(String(err));
					store.set({ data: null, loading: false, error });
					options?.debug?.onError?.(error);
				},
			);
		};

		const refetch = () => {
			if (queryUnsubscribe) {
				queryUnsubscribe();
				options?.debug?.onUnsubscribe?.();
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
						options?.debug?.onUnsubscribe?.();
						queryUnsubscribe = null;
					}
				}
			};
		};

		const result: QueryStoreResult<TOutput> = {
			subscribe,
			refetch,
		};

		// Cache the store for reuse
		storeCache.set(cacheKey, result);

		return result;
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
			args: TInput;
			select?: SelectionObject;
		}): Promise<TOutput> => {
			store.set({ data: null, loading: true, error: null });

			try {
				const endpoint = getEndpoint();
				const result = await endpoint({ args: options.args, select: options.select });

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
 * const user = await client.user.get({ args: { id } });
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   import { client } from '$lib/client';
 *
 *   export let id: string;
 *
 *   // Query store - auto-subscribes with $
 *   $: userStore = client.user.get.createQuery({ args: { id } });
 *
 *   // Mutation store
 *   const updateUser = client.user.update.createMutation({
 *     onSuccess: () => console.log('Updated!'),
 *   });
 *
 *   async function handleUpdate() {
 *     await updateUser.mutate({ args: { id, name: 'New' } });
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
