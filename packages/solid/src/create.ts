/**
 * @sylphx/lens-solid - Create Client
 *
 * Creates a typed Lens client with SolidJS primitives.
 * Each endpoint can be called directly as a primitive or via .fetch() for promises.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-solid';
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
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

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
	skip?: boolean;
}

/** Query hook result */
export interface QueryHookResult<T> {
	/** Reactive data accessor */
	data: Accessor<T | null>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
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
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Reactive last mutation result */
	data: Accessor<TOutput | null>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint type */
export interface QueryEndpoint<TInput, TOutput> {
	/** Primitive call (in component) */
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
	/** Primitive call (in component) */
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
 * Create a query primitive for a specific endpoint
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

	const useQueryPrimitive = (options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> => {
		const [data, setData] = createSignal<TOutput | null>(null);
		const [loading, setLoading] = createSignal(!options?.skip);
		const [error, setError] = createSignal<Error | null>(null);

		let unsubscribe: (() => void) | null = null;

		const executeQuery = () => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}

			if (options?.skip) {
				setData(null);
				setLoading(false);
				setError(null);
				return;
			}

			const endpoint = getEndpoint(path);
			const query = endpoint({ input: options?.input, select: options?.select });

			setLoading(true);
			setError(null);

			unsubscribe = query.subscribe((value) => {
				setData(() => value);
				setLoading(false);
				setError(null);
			});

			query.then(
				(value) => {
					setData(() => value);
					setLoading(false);
					setError(null);
				},
				(err) => {
					const queryError = err instanceof Error ? err : new Error(String(err));
					setError(queryError);
					setLoading(false);
				},
			);
		};

		// Execute initial query synchronously
		executeQuery();

		// Use createEffect for reactive updates when options change
		createEffect(() => {
			// Access options to track them (Solid will re-run when they change)
			const _ = JSON.stringify(options);
			executeQuery();
		});

		onCleanup(() => {
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
			setLoading(true);
			setError(null);
			const endpoint = getEndpoint(path);
			const query = endpoint({ input: options?.input, select: options?.select });
			if (query) {
				unsubscribe = query.subscribe((value) => {
					setData(() => value);
					setLoading(false);
					setError(null);
				});
				query.then(
					(value) => {
						setData(() => value);
						setLoading(false);
					},
					(err) => {
						const queryError = err instanceof Error ? err : new Error(String(err));
						setError(queryError);
						setLoading(false);
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

	// Attach fetch method to the hook function
	useQueryPrimitive.fetch = fetch;

	return useQueryPrimitive as unknown as QueryEndpoint<TInput, TOutput>;
}

/**
 * Create a mutation primitive for a specific endpoint
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

	const useMutationPrimitive = (
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> => {
		const [data, setData] = createSignal<TOutput | null>(null);
		const [loading, setLoading] = createSignal(false);
		const [error, setError] = createSignal<Error | null>(null);

		const mutate = async (options: {
			input: TInput;
			select?: SelectionObject;
		}): Promise<TOutput> => {
			setLoading(true);
			setError(null);

			try {
				const endpoint = getEndpoint(path);
				const result = await endpoint({ input: options.input, select: options.select });
				const mutationResult = result as unknown as { data: TOutput };

				setData(() => mutationResult.data);
				setLoading(false);

				hookOptions?.onSuccess?.(mutationResult.data);
				hookOptions?.onSettled?.();

				return mutationResult.data;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				setError(mutationError);
				setLoading(false);

				hookOptions?.onError?.(mutationError);
				hookOptions?.onSettled?.();

				throw mutationError;
			}
		};

		const reset = () => {
			setData(null);
			setLoading(false);
			setError(null);
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

	// Attach fetch method to the hook function
	useMutationPrimitive.fetch = fetch;

	return useMutationPrimitive as unknown as MutationEndpoint<TInput, TOutput>;
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for hook functions
const hookCache = new Map<string, unknown>();

/**
 * Create a Lens client with SolidJS primitives.
 *
 * Each endpoint can be called:
 * - Directly as a primitive: `client.user.get({ input: { id } })`
 * - Via .fetch() for promises: `await client.user.get.fetch({ input: { id } })`
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-solid';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Component usage
 * function UserProfile(props: { id: string }) {
 *   const { data, loading, error } = client.user.get({
 *     input: { id: props.id },
 *     select: { name: true },
 *   });
 *
 *   const { mutate, loading: saving } = client.user.update({
 *     onSuccess: () => console.log('Updated!'),
 *   });
 *
 *   return (
 *     <Show when={!loading()} fallback={<Spinner />}>
 *       <h1>{data()?.name}</h1>
 *       <button
 *         onClick={() => mutate({ input: { id: props.id, name: 'New' } })}
 *         disabled={saving()}
 *       >
 *         Update
 *       </button>
 *     </Show>
 *   );
 * }
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
