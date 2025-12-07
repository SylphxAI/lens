/**
 * @sylphx/lens-react - Create Client
 *
 * Creates a typed Lens client with React hooks.
 * Each endpoint can be called directly as a hook or via .fetch() for promises.
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
 * // In component
 * function UserProfile({ id }: { id: string }) {
 *   const { data, loading } = client.user.get({ input: { id } });
 *   return <div>{data?.name}</div>;
 * }
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
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

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

/** Query endpoint type */
export interface QueryEndpoint<TInput, TOutput> {
	/** Hook call (in component) */
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
	/** Hook call (in component) */
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
 * Create a query hook for a specific endpoint
 */
function createQueryHook<TInput, TOutput>(
	baseClient: unknown,
	path: string,
): QueryEndpoint<TInput, TOutput> {
	// Cache for stable hook reference
	let cachedHook: QueryEndpoint<TInput, TOutput> | null = null;

	const getEndpoint = (p: string) => {
		const parts = p.split(".");
		let current: unknown = baseClient;
		for (const part of parts) {
			current = (current as Record<string, unknown>)[part];
		}
		return current as (options: unknown) => QueryResult<TOutput>;
	};

	const useQueryHook = (options?: QueryHookOptions<TInput>): QueryHookResult<TOutput> => {
		const _optionsKey = JSON.stringify(options ?? {});

		// Get query result from base client
		const query = useMemo(() => {
			if (options?.skip) return null;
			const endpoint = getEndpoint(path);
			return endpoint({ input: options?.input, select: options?.select });
		}, [options?.input, options?.select, options?.skip, path]);

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

	// Fetch method for promises (SSR)
	const fetch = async (options?: {
		input?: TInput;
		select?: SelectionObject;
	}): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const queryResult = endpoint({ input: options?.input, select: options?.select });
		return queryResult.then((data) => data);
	};

	// Create the endpoint object with hook + fetch
	const endpoint = useQueryHook as unknown as QueryEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch as QueryEndpoint<TInput, TOutput>["fetch"];

	cachedHook = endpoint;
	return cachedHook;
}

/**
 * Create a mutation hook for a specific endpoint
 */
function createMutationHook<TInput, TOutput>(
	baseClient: unknown,
	path: string,
): MutationEndpoint<TInput, TOutput> {
	let cachedHook: MutationEndpoint<TInput, TOutput> | null = null;

	const getEndpoint = (p: string) => {
		const parts = p.split(".");
		let current: unknown = baseClient;
		for (const part of parts) {
			current = (current as Record<string, unknown>)[part];
		}
		return current as (options: unknown) => QueryResult<{ data: TOutput }>;
	};

	const useMutationHook = (
		hookOptions?: MutationHookOptions<TOutput>,
	): MutationHookResult<TInput, TOutput> => {
		const [loading, setLoading] = React.useState(false);
		const [error, setError] = React.useState<Error | null>(null);
		const [data, setData] = React.useState<TOutput | null>(null);

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
					const endpoint = getEndpoint(path);
					const result = await endpoint({ input: options.input, select: options.select });
					const mutationResult = result as unknown as { data: TOutput };

					if (mountedRef.current) {
						setData(mutationResult.data);
						setLoading(false);
					}

					hookOptionsRef.current?.onSuccess?.(mutationResult.data);
					hookOptionsRef.current?.onSettled?.();

					return mutationResult.data;
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
			[path],
		);

		const reset = useCallback(() => {
			setLoading(false);
			setError(null);
			setData(null);
		}, []);

		return { mutate, loading, error, data, reset };
	};

	// Fetch method for promises (SSR)
	const fetch = async (options: { input: TInput; select?: SelectionObject }): Promise<TOutput> => {
		const endpoint = getEndpoint(path);
		const result = await endpoint({ input: options.input, select: options.select });
		const mutationResult = result as unknown as { data: TOutput };
		return mutationResult.data;
	};

	const endpoint = useMutationHook as MutationEndpoint<TInput, TOutput>;
	endpoint.fetch = fetch;

	cachedHook = endpoint;
	return cachedHook;
}

// =============================================================================
// React import for useState (needed in mutation hook)
// =============================================================================

import * as React from "react";

// =============================================================================
// Create Client
// =============================================================================

// Cache for hook functions to ensure stable references
const hookCache = new Map<string, unknown>();

/**
 * Create a Lens client with React hooks.
 *
 * Each endpoint can be called:
 * - Directly as a hook: `client.user.get({ input: { id } })`
 * - Via .fetch() for promises: `await client.user.get.fetch({ input: { id } })`
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
 * // Component usage
 * function UserProfile({ id }: { id: string }) {
 *   // Query hook - auto-subscribes
 *   const { data, loading, error } = client.user.get({
 *     input: { id },
 *     select: { name: true },
 *   });
 *
 *   // Mutation hook - returns mutate function
 *   const { mutate, loading: saving } = client.user.update({
 *     onSuccess: () => toast('Updated!'),
 *   });
 *
 *   if (loading) return <Spinner />;
 *   return (
 *     <div>
 *       <h1>{data?.name}</h1>
 *       <button onClick={() => mutate({ input: { id, name: 'New' } })}>
 *         Update
 *       </button>
 *     </div>
 *   );
 * }
 *
 * // SSR usage
 * async function UserPage({ id }: { id: string }) {
 *   const user = await client.user.get.fetch({ input: { id } });
 *   return <div>{user.name}</div>;
 * }
 * ```
 */
export function createClient<TRouter extends RouterDef>(
	config: LensClientConfig | TypedClientConfig<{ router: TRouter }>,
): TypedClient<TRouter> {
	// Create base client for transport
	const baseClient = createBaseClient(config as LensClientConfig);

	// Track endpoint types (query vs mutation) - determined at runtime via metadata
	// For now, we'll detect based on the operation result
	const _endpointTypes = new Map<string, "query" | "mutation">();

	function createProxy(path: string): unknown {
		const cacheKey = path;

		// Return cached hook if available
		if (hookCache.has(cacheKey)) {
			return hookCache.get(cacheKey);
		}

		const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				// Handle .fetch() method - returns a promise
				if (key === "fetch") {
					return async (options: unknown) => {
						// Navigate to the endpoint in base client
						const parts = path.split(".");
						let current: unknown = baseClient;
						for (const part of parts) {
							current = (current as Record<string, unknown>)[part];
						}
						const endpointFn = current as (opts: unknown) => QueryResult<unknown>;
						const queryResult = endpointFn(options);

						// Await the result
						const result = await queryResult;

						// For mutations, the result is { data: ... }
						// For queries, the result is the data directly
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
				// This is called when the endpoint is invoked as a function
				// Detect query vs mutation based on options shape:
				// - Query: has `input` or `select` or `skip` (QueryHookOptions)
				// - Mutation: has `onSuccess`, `onError`, `onSettled` or no options (MutationHookOptions)

				const options = args[0] as Record<string, unknown> | undefined;

				// Detect based on option keys
				const isQueryOptions =
					options && ("input" in options || "select" in options || "skip" in options);

				const isMutationOptions =
					!options ||
					(!isQueryOptions &&
						(Object.keys(options).length === 0 ||
							"onSuccess" in options ||
							"onError" in options ||
							"onSettled" in options));

				// Check cache - but we need to know the type first
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

				// Fallback to query
				if (!hookCache.has(cacheKeyQuery)) {
					hookCache.set(cacheKeyQuery, createQueryHook(baseClient, path));
				}
				const hook = hookCache.get(cacheKeyQuery) as (opts: unknown) => unknown;
				return hook(options);
			},
		};

		const proxy = new Proxy((() => {}) as (...args: unknown[]) => unknown, handler);
		return proxy;
	}

	return createProxy("") as TypedClient<TRouter>;
}
