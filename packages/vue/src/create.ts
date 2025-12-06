/**
 * @sylphx/lens-vue - Create Client
 *
 * Creates a typed Lens client with Vue composables.
 * Each endpoint can be called directly as a composable or via .fetch() for promises.
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
 * // In component
 * const { data, loading } = client.user.get({ input: { id } });
 *
 * // In SSR
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
import { onUnmounted, type Ref, ref, type ShallowRef, shallowRef, watchEffect } from "vue";

// =============================================================================
// Types
// =============================================================================

/** Query hook options */
export interface QueryHookOptions<TInput> {
	/** Query input parameters */
	input?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean | Ref<boolean>;
}

/** Query hook result */
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

/** Mutation hook options */
export interface MutationHookOptions<TOutput> {
	/** Called on successful mutation */
	onSuccess?: (data: TOutput) => void;
	/** Called on mutation error */
	onError?: (error: Error) => void;
	/** Called when mutation settles (success or error) */
	onSettled?: () => void;
}

/** Mutation hook result */
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

/** Query endpoint type */
export interface QueryEndpoint<TInput, TOutput> {
	/** Composable call (in component) */
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
	/** Composable call (in component) */
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
// Hook Factories
// =============================================================================

/**
 * Create a query composable for a specific endpoint
 */
function createQueryHook<TInput, TOutput>(
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

	const useQueryComposable = (options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> => {
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

			const endpoint = getEndpoint(path);
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
			const endpoint = getEndpoint(path);
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

	// Fetch method for promises (SSR)
	const fetch = async (options?: {
		input?: TInput;
		select?: SelectionObject;
	}): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const queryResult = endpoint({ input: options?.input, select: options?.select });
		return queryResult.then((data) => data);
	};

	const endpoint = useQueryComposable as QueryEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch;

	return endpoint;
}

/**
 * Create a mutation composable for a specific endpoint
 */
function createMutationHook<TInput, TOutput>(
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

	const useMutationComposable = (
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> => {
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
				const endpoint = getEndpoint(path);
				const result = await endpoint({ input: options.input, select: options.select });
				const mutationResult = result as unknown as { data: TOutput };

				data.value = mutationResult.data;
				loading.value = false;

				hookOptions?.onSuccess?.(mutationResult.data);
				hookOptions?.onSettled?.();

				return mutationResult.data;
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

	// Fetch method for promises (SSR)
	const fetch = async (options: { input: TInput; select?: SelectionObject }): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const result = await endpoint({ input: options.input, select: options.select });
		const mutationResult = result as unknown as { data: TOutput };
		return mutationResult.data;
	};

	const endpoint = useMutationComposable as MutationEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch;

	return endpoint;
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for hook functions to ensure stable references
const hookCache = new Map<string, unknown>();

/**
 * Create a Lens client with Vue composables.
 *
 * Each endpoint can be called:
 * - Directly as a composable: `client.user.get({ input: { id } })`
 * - Via .fetch() for promises: `await client.user.get.fetch({ input: { id } })`
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
 * ```
 *
 * ```vue
 * <script setup lang="ts">
 * import { client } from '@/lib/client';
 *
 * const props = defineProps<{ id: string }>();
 *
 * // Query composable - auto-subscribes
 * const { data, loading, error } = client.user.get({
 *   input: { id: props.id },
 *   select: { name: true },
 * });
 *
 * // Mutation composable - returns mutate function
 * const { mutate, loading: saving } = client.user.update({
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
					if (!hookCache.has(cacheKeyQuery)) {
						hookCache.set(cacheKeyQuery, createQueryHook(baseClient, path));
					}
					const hook = hookCache.get(cacheKeyQuery) as (opts: unknown) => unknown;
					return hook(options);
				}

				if (isMutationOptions) {
					if (!hookCache.has(cacheKeyMutation)) {
						hookCache.set(cacheKeyMutation, createMutationHook(baseClient, path));
					}
					const hook = hookCache.get(cacheKeyMutation) as (opts: unknown) => unknown;
					return hook(options);
				}

				if (!hookCache.has(cacheKeyQuery)) {
					hookCache.set(cacheKeyQuery, createQueryHook(baseClient, path));
				}
				const hook = hookCache.get(cacheKeyQuery) as (opts: unknown) => unknown;
				return hook(options);
			},
		};

		return new Proxy((() => {}) as (...args: unknown[]) => unknown, handler);
	}

	return createProxy("") as TypedClient<TRouter>;
}
