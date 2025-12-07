/**
 * @sylphx/lens-vue - Create Client
 *
 * Creates a typed Lens client with Vue composables.
 * Base client methods work in vanilla JS, composables are extensions.
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-vue';
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
 * // Vue composables (in components)
 * const { data, loading } = client.user.get.useQuery({ input: { id } });
 * const { mutate, loading } = client.user.create.useMutation();
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
import { onUnmounted, type Ref, ref, type ShallowRef, shallowRef, watchEffect } from "vue";

// =============================================================================
// Types
// =============================================================================

/** Query composable options */
export interface QueryHookOptions<TInput> {
	/** Query input parameters */
	input?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean | Ref<boolean>;
}

/** Query composable result */
export interface QueryHookResult<T> {
	/** Reactive data ref */
	data: ShallowRef<T | null>;
	/** Reactive loading state */
	loading: Ref<boolean>;
	/** Reactive error state */
	error: ShallowRef<Error | null>;
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation composable options */
export interface MutationHookOptions<TOutput> {
	/** Called on successful mutation */
	onSuccess?: (data: TOutput) => void;
	/** Called on mutation error */
	onError?: (error: Error) => void;
	/** Called when mutation settles (success or error) */
	onSettled?: () => void;
}

/** Mutation composable result */
export interface MutationHookResult<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (options: { input: TInput; select?: SelectionObject }) => Promise<TOutput>;
	/** Reactive loading state */
	loading: Ref<boolean>;
	/** Reactive error state */
	error: ShallowRef<Error | null>;
	/** Reactive last mutation result */
	data: ShallowRef<TOutput | null>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint with Vue composables */
export interface QueryEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns QueryResult (Promise + Observable) */
	(options?: { input?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

	/** Vue composable for reactive queries */
	useQuery: (
		options?: TInput extends void ? QueryHookOptions<void> | void : QueryHookOptions<TInput>,
	) => QueryHookResult<TOutput>;
}

/** Mutation endpoint with Vue composables */
export interface MutationEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns Promise */
	(options: { input: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

	/** Vue composable for mutations */
	useMutation: (options?: MutationHookOptions<TOutput>) => MutationHookResult<TInput, TOutput>;
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
// Composable Factories
// =============================================================================

/**
 * Create useQuery composable for a specific endpoint
 */
function createUseQueryComposable<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => QueryResult<TOutput>,
) {
	return function useQuery(options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> {
		const data = shallowRef<TOutput | null>(null);
		const loading = ref(true);
		const error = shallowRef<Error | null>(null);

		let unsubscribe: (() => void) | null = null;

		const stopWatch = watchEffect((onCleanup) => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}

			const skip = typeof options?.skip === "object" ? options.skip.value : options?.skip;

			if (skip) {
				data.value = null;
				loading.value = false;
				error.value = null;
				return;
			}

			const endpoint = getEndpoint();
			const query = endpoint({ input: options?.input, select: options?.select });

			loading.value = true;
			error.value = null;

			unsubscribe = query.subscribe((value) => {
				data.value = value;
				loading.value = false;
				error.value = null;
			});

			query.then(
				(value) => {
					data.value = value;
					loading.value = false;
					error.value = null;
				},
				(err) => {
					error.value = err instanceof Error ? err : new Error(String(err));
					loading.value = false;
				},
			);

			onCleanup(() => {
				if (unsubscribe) {
					unsubscribe();
					unsubscribe = null;
				}
			});
		});

		onUnmounted(() => {
			stopWatch();
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		});

		const refetch = () => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			loading.value = true;
			const endpoint = getEndpoint();
			const query = endpoint({ input: options?.input, select: options?.select });
			if (query) {
				unsubscribe = query.subscribe((value) => {
					data.value = value;
					loading.value = false;
					error.value = null;
				});
				query.then(
					(value) => {
						data.value = value;
						loading.value = false;
					},
					(err) => {
						error.value = err instanceof Error ? err : new Error(String(err));
						loading.value = false;
					},
				);
			}
		};

		return { data, loading, error, refetch };
	};
}

/**
 * Create useMutation composable for a specific endpoint
 */
function createUseMutationComposable<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => Promise<{ data: TOutput }>,
) {
	return function useMutation(
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> {
		const data = shallowRef<TOutput | null>(null);
		const loading = ref(false);
		const error = shallowRef<Error | null>(null);

		const mutate = async (options: {
			input: TInput;
			select?: SelectionObject;
		}): Promise<TOutput> => {
			loading.value = true;
			error.value = null;

			try {
				const endpoint = getEndpoint();
				const result = await endpoint({ input: options.input, select: options.select });

				data.value = result.data;
				loading.value = false;

				hookOptions?.onSuccess?.(result.data);
				hookOptions?.onSettled?.();

				return result.data;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				error.value = mutationError;
				loading.value = false;

				hookOptions?.onError?.(mutationError);
				hookOptions?.onSettled?.();

				throw mutationError;
			}
		};

		const reset = () => {
			data.value = null;
			loading.value = false;
			error.value = null;
		};

		return { mutate, loading, error, data, reset };
	};
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for composable functions to ensure stable references
const composableCache = new Map<string, unknown>();

/**
 * Create a Lens client with Vue composables.
 *
 * Base client methods work in vanilla JS (SSR, utilities, event handlers).
 * Vue composables are available as `.useQuery()` and `.useMutation()`.
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-vue';
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
 * ```vue
 * <script setup lang="ts">
 * import { client } from '@/lib/client';
 *
 * const props = defineProps<{ id: string }>();
 *
 * // Query composable - auto-subscribes
 * const { data, loading, error } = client.user.get.useQuery({
 *   input: { id: props.id },
 * });
 *
 * // Mutation composable - returns mutate function
 * const { mutate, loading: saving } = client.user.update.useMutation({
 *   onSuccess: () => console.log('Updated!'),
 * });
 *
 * const handleUpdate = async () => {
 *   await mutate({ input: { id: props.id, name: 'New' } });
 * };
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <div v-else>
 *     <h1>{{ data?.name }}</h1>
 *     <button @click="handleUpdate" :disabled="saving">Update</button>
 *   </div>
 * </template>
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

				// Handle .useQuery() - Vue composable for queries
				if (key === "useQuery") {
					const cacheKey = `${path}:useQuery`;
					if (!composableCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => QueryResult<unknown>;
						};
						composableCache.set(cacheKey, createUseQueryComposable(getEndpoint));
					}
					return composableCache.get(cacheKey);
				}

				// Handle .useMutation() - Vue composable for mutations
				if (key === "useMutation") {
					const cacheKey = `${path}:useMutation`;
					if (!composableCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => Promise<{ data: unknown }>;
						};
						composableCache.set(cacheKey, createUseMutationComposable(getEndpoint));
					}
					return composableCache.get(cacheKey);
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
