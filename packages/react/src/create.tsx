/**
 * @sylphx/lens-react - Create Client
 *
 * Creates a typed Lens client with React hooks.
 * Base client methods work in vanilla JS, hooks are extensions.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-react';
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
 * // React hooks (in components)
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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

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
	/** Query data (null if loading or error) */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
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
	/** Mutation is in progress */
	loading: boolean;
	/** Mutation error */
	error: Error | null;
	/** Last mutation result */
	data: TOutput | null;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint with React hooks */
export interface QueryEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns QueryResult (Promise + Observable) */
	(options?: { input?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

	/** React hook for reactive queries */
	useQuery: (
		options?: TInput extends void ? QueryHookOptions<void> | void : QueryHookOptions<TInput>,
	) => QueryHookResult<TOutput>;
}

/** Mutation endpoint with React hooks */
export interface MutationEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns Promise */
	(options: { input: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

	/** React hook for mutations */
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
// Query State Reducer
// =============================================================================

interface QueryState<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
}

type QueryAction<T> =
	| { type: "RESET" }
	| { type: "START" }
	| { type: "SUCCESS"; data: T }
	| { type: "ERROR"; error: Error }
	| { type: "LOADING_DONE" };

function queryReducer<T>(state: QueryState<T>, action: QueryAction<T>): QueryState<T> {
	switch (action.type) {
		case "RESET":
			return { data: null, loading: false, error: null };
		case "START":
			return { ...state, loading: true, error: null };
		case "SUCCESS":
			return { data: action.data, loading: false, error: null };
		case "ERROR":
			return { ...state, loading: false, error: action.error };
		case "LOADING_DONE":
			return { ...state, loading: false };
		default:
			return state;
	}
}

// =============================================================================
// Hook Factories
// =============================================================================

/**
 * Create useQuery hook for a specific endpoint
 */
function createUseQueryHook<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => QueryResult<TOutput>,
) {
	return function useQuery(options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> {
		// Get query result from base client
		const query = useMemo(() => {
			if (options?.skip) return null;
			const endpoint = getEndpoint();
			return endpoint({ input: options?.input, select: options?.select });
		}, [options?.input, options?.select, options?.skip, getEndpoint]);

		// State management
		const initialState: QueryState<TOutput> = {
			data: null,
			loading: query != null && !options?.skip,
			error: null,
		};
		const [state, dispatch] = useReducer(queryReducer<TOutput>, initialState);

		// Track mounted state
		const mountedRef = useRef(true);
		const queryRef = useRef(query);
		queryRef.current = query;

		// Subscribe to query
		useEffect(() => {
			mountedRef.current = true;

			if (query == null) {
				dispatch({ type: "RESET" });
				return;
			}

			dispatch({ type: "START" });

			let hasReceivedData = false;

			const unsubscribe = query.subscribe((value) => {
				if (mountedRef.current) {
					hasReceivedData = true;
					dispatch({ type: "SUCCESS", data: value });
				}
			});

			query.then(
				(value) => {
					if (mountedRef.current) {
						if (!hasReceivedData) {
							dispatch({ type: "SUCCESS", data: value });
						} else {
							dispatch({ type: "LOADING_DONE" });
						}
					}
				},
				(err) => {
					if (mountedRef.current) {
						dispatch({
							type: "ERROR",
							error: err instanceof Error ? err : new Error(String(err)),
						});
					}
				},
			);

			return () => {
				mountedRef.current = false;
				unsubscribe();
			};
		}, [query]);

		// Refetch function
		const refetch = useCallback(() => {
			const currentQuery = queryRef.current;
			if (currentQuery == null) return;

			dispatch({ type: "START" });

			currentQuery.then(
				(value) => {
					if (mountedRef.current) {
						dispatch({ type: "SUCCESS", data: value });
					}
				},
				(err) => {
					if (mountedRef.current) {
						dispatch({
							type: "ERROR",
							error: err instanceof Error ? err : new Error(String(err)),
						});
					}
				},
			);
		}, []);

		return { data: state.data, loading: state.loading, error: state.error, refetch };
	};
}

/**
 * Create useMutation hook for a specific endpoint
 */
function createUseMutationHook<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => Promise<{ data: TOutput }>,
) {
	return function useMutation(
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> {
		const [loading, setLoading] = useState(false);
		const [error, setError] = useState<Error | null>(null);
		const [data, setData] = useState<TOutput | null>(null);

		const mountedRef = useRef(true);
		const hookOptionsRef = useRef(hookOptions);
		hookOptionsRef.current = hookOptions;

		useEffect(() => {
			mountedRef.current = true;
			return () => {
				mountedRef.current = false;
			};
		}, []);

		const mutate = useCallback(
			async (options: { input: TInput; select?: SelectionObject }): Promise<TOutput> => {
				setLoading(true);
				setError(null);

				try {
					const endpoint = getEndpoint();
					const result = await endpoint({ input: options.input, select: options.select });

					if (mountedRef.current) {
						setData(result.data);
						setLoading(false);
					}

					hookOptionsRef.current?.onSuccess?.(result.data);
					hookOptionsRef.current?.onSettled?.();

					return result.data;
				} catch (err) {
					const mutationError = err instanceof Error ? err : new Error(String(err));

					if (mountedRef.current) {
						setError(mutationError);
						setLoading(false);
					}

					hookOptionsRef.current?.onError?.(mutationError);
					hookOptionsRef.current?.onSettled?.();

					throw mutationError;
				}
			},
			[getEndpoint],
		);

		const reset = useCallback(() => {
			setLoading(false);
			setError(null);
			setData(null);
		}, []);

		return { mutate, loading, error, data, reset };
	};
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for hook functions to ensure stable references
const hookCache = new Map<string, unknown>();

/**
 * Create a Lens client with React hooks.
 *
 * Base client methods work in vanilla JS (SSR, utilities, event handlers).
 * React hooks are available as `.useQuery()` and `.useMutation()`.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-react';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Vanilla JS (anywhere)
 * const user = await client.user.get({ input: { id } });
 *
 * // React component
 * function UserProfile({ id }: { id: string }) {
 *   const { data, loading } = client.user.get.useQuery({ input: { id } });
 *   const { mutate } = client.user.update.useMutation();
 *
 *   return (
 *     <div>
 *       <h1>{data?.name}</h1>
 *       <button onClick={() => mutate({ input: { id, name: 'New' } })}>
 *         Update
 *       </button>
 *     </div>
 *   );
 * }
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

				// Handle .useQuery() - React hook for queries
				if (key === "useQuery") {
					const cacheKey = `${path}:useQuery`;
					if (!hookCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => QueryResult<unknown>;
						};
						hookCache.set(cacheKey, createUseQueryHook(getEndpoint));
					}
					return hookCache.get(cacheKey);
				}

				// Handle .useMutation() - React hook for mutations
				if (key === "useMutation") {
					const cacheKey = `${path}:useMutation`;
					if (!hookCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => Promise<{ data: unknown }>;
						};
						hookCache.set(cacheKey, createUseMutationHook(getEndpoint));
					}
					return hookCache.get(cacheKey);
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
