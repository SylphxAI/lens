/**
 * @sylphx/lens-react - Hooks
 *
 * React hooks for Lens queries and mutations.
 * Works with QueryResult from @sylphx/lens-client.
 *
 * @example
 * ```tsx
 * import { useQuery, useMutation } from '@sylphx/lens-react';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   // Client is automatically injected from context
 *   const { data: user, loading } = useQuery(
 *     (client) => client.user.get,
 *     { id: userId }
 *   );
 *   if (loading) return <Spinner />;
 *   return <h1>{user?.name}</h1>;
 * }
 *
 * function CreatePost() {
 *   const { mutate, loading } = useMutation((client) => client.post.create);
 *   const handleCreate = () => mutate({ title: 'Hello' });
 *   return <button onClick={handleCreate} disabled={loading}>Create</button>;
 * }
 * ```
 */

import type { LensClient, MutationResult, QueryResult } from "@sylphx/lens-client";
import { type DependencyList, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLensClient } from "./context.js";

// =============================================================================
// Types
// =============================================================================

/** Result of useQuery hook */
export interface UseQueryResult<T> {
	/** Query data (null if loading or error) */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the query */
	refetch: () => void;
}

/** Result of useMutation hook */
export interface UseMutationResult<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	/** Mutation is in progress */
	loading: boolean;
	/** Mutation error */
	error: Error | null;
	/** Last mutation result */
	data: TOutput | null;
	/** Reset mutation state */
	reset: () => void;
}

/** Options for useQuery */
export interface UseQueryOptions<TData = unknown, TSelected = TData> {
	/** Skip the query (don't execute) */
	skip?: boolean;
	/** Transform the query result */
	select?: (data: TData) => TSelected;
}

/** Client type for callbacks */
type Client = LensClient<any, any>;

/** Route selector - callback that returns a route function */
export type RouteSelector<TParams, TResult> = (
	client: Client,
) => ((params: TParams) => QueryResult<TResult>) | null;

/** Query accessor selector - callback that returns QueryResult */
export type QuerySelector<TResult> = (client: Client) => QueryResult<TResult> | null | undefined;

/** Mutation selector - callback that returns mutation function */
export type MutationSelector<TInput, TOutput> = (
	client: Client,
) => (input: TInput) => Promise<MutationResult<TOutput>>;

// =============================================================================
// useQuery Hook
// =============================================================================

/**
 * Subscribe to a query with reactive updates.
 * Client is automatically injected from LensProvider context.
 *
 * Two usage patterns:
 *
 * **1. Route + Params (recommended)** - Stable references, no infinite loops
 * ```tsx
 * const { data } = useQuery((client) => client.user.get, { id: userId });
 * ```
 *
 * **2. Accessor + Deps (escape hatch)** - For complex/composed queries
 * ```tsx
 * const { data } = useQuery((client) => client.user.get({ id }), [id]);
 * ```
 *
 * @example
 * ```tsx
 * // Basic usage - Route + Params
 * function UserProfile({ userId }: { userId: string }) {
 *   const { data: user, loading, error } = useQuery(
 *     (client) => client.user.get,
 *     { id: userId }
 *   );
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <h1>{user?.name}</h1>;
 * }
 *
 * // With select transform
 * function UserName({ userId }: { userId: string }) {
 *   const { data: name } = useQuery(
 *     (client) => client.user.get,
 *     { id: userId },
 *     { select: (user) => user.name }
 *   );
 *   return <span>{name}</span>;
 * }
 *
 * // Conditional query (return null to skip)
 * function SessionInfo({ sessionId }: { sessionId: string | null }) {
 *   const { data } = useQuery(
 *     (client) => sessionId ? client.session.get : null,
 *     { id: sessionId ?? '' }
 *   );
 *   return <span>{data?.totalTokens}</span>;
 * }
 *
 * // Skip query with option
 * function ConditionalQuery({ userId, shouldFetch }: { userId: string; shouldFetch: boolean }) {
 *   const { data } = useQuery(
 *     (client) => client.user.get,
 *     { id: userId },
 *     { skip: !shouldFetch }
 *   );
 * }
 *
 * // Complex queries with accessor (escape hatch)
 * function ComplexQuery({ userId }: { userId: string }) {
 *   const { data } = useQuery(
 *     (client) => client.user.get({ id: userId }),
 *     [userId]
 *   );
 * }
 * ```
 */

// Overload 1: Route + Params (recommended)
export function useQuery<TParams, TResult, TSelected = TResult>(
	selector: RouteSelector<TParams, TResult>,
	params: TParams,
	options?: UseQueryOptions<TResult, TSelected>,
): UseQueryResult<TSelected>;

// Overload 2: Accessor + Deps (escape hatch for complex queries)
export function useQuery<TResult, TSelected = TResult>(
	selector: QuerySelector<TResult>,
	deps: DependencyList,
	options?: UseQueryOptions<TResult, TSelected>,
): UseQueryResult<TSelected>;

// Implementation
export function useQuery<TParams, TResult, TSelected = TResult>(
	selector: RouteSelector<TParams, TResult> | QuerySelector<TResult>,
	paramsOrDeps: TParams | DependencyList,
	options?: UseQueryOptions<TResult, TSelected>,
): UseQueryResult<TSelected> {
	const client = useLensClient();

	// Detect which overload is being used
	const isAccessorMode = Array.isArray(paramsOrDeps);

	// Stable params key for Route + Params mode
	const paramsKey = !isAccessorMode ? JSON.stringify(paramsOrDeps) : null;

	// Create query - memoized based on route/params or deps
	const query = useMemo(
		() => {
			if (options?.skip) return null;

			if (isAccessorMode) {
				// Accessor mode: selector returns QueryResult directly
				const querySelector = selector as QuerySelector<TResult>;
				return querySelector(client);
			}
			// Route + Params mode: selector returns route function
			const routeSelector = selector as RouteSelector<TParams, TResult>;
			const route = routeSelector(client);
			if (!route) return null;
			return route(paramsOrDeps as TParams);
		},
		// biome-ignore lint/correctness/useExhaustiveDependencies: Dynamic deps based on overload mode - intentional
		isAccessorMode
			? // eslint-disable-next-line react-hooks/exhaustive-deps
				[client, options?.skip, ...(paramsOrDeps as DependencyList)]
			: // eslint-disable-next-line react-hooks/exhaustive-deps
				[client, selector, paramsKey, options?.skip],
	);

	// Use ref for select to avoid it being a dependency
	const selectRef = useRef(options?.select);
	selectRef.current = options?.select;

	const [data, setData] = useState<TSelected | null>(null);
	const [loading, setLoading] = useState(query != null && !options?.skip);
	const [error, setError] = useState<Error | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	// Store query ref for refetch
	const queryRef = useRef(query);
	queryRef.current = query;

	// Transform helper
	const transform = useCallback((value: TResult): TSelected => {
		return selectRef.current ? selectRef.current(value) : (value as unknown as TSelected);
	}, []);

	// Subscribe to query
	useEffect(() => {
		mountedRef.current = true;

		// Handle null/undefined query
		if (query == null) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		// Track if subscribe has provided data (to avoid duplicate updates from then)
		let hasReceivedData = false;

		// Subscribe to updates - primary data source for streaming
		const unsubscribe = query.subscribe((value) => {
			if (mountedRef.current) {
				hasReceivedData = true;
				setData(transform(value));
				setLoading(false);
			}
		});

		// Handle completion/error via promise
		// Only setData if subscribe hasn't already provided data (one-shot queries)
		query.then(
			(value) => {
				if (mountedRef.current && !hasReceivedData) {
					setData(transform(value));
				}
				if (mountedRef.current) {
					setLoading(false);
				}
			},
			(err) => {
				if (mountedRef.current) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
			},
		);

		return () => {
			mountedRef.current = false;
			unsubscribe();
		};
	}, [query, transform]);

	// Refetch function
	const refetch = useCallback(() => {
		const currentQuery = queryRef.current;
		if (currentQuery == null) return;

		setLoading(true);
		setError(null);

		currentQuery.then(
			(value) => {
				if (mountedRef.current) {
					setData(transform(value));
					setLoading(false);
				}
			},
			(err) => {
				if (mountedRef.current) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
			},
		);
	}, [transform]);

	return { data, loading, error, refetch };
}

// =============================================================================
// useMutation Hook
// =============================================================================

/**
 * Execute mutations with loading/error state.
 * Client is automatically injected from LensProvider context.
 *
 * @param selector - Callback that returns mutation function from client
 *
 * @example
 * ```tsx
 * function CreatePost() {
 *   const { mutate, loading, error, data } = useMutation(
 *     (client) => client.post.create
 *   );
 *
 *   const handleSubmit = async (formData: FormData) => {
 *     try {
 *       const result = await mutate({
 *         title: formData.get('title'),
 *         content: formData.get('content'),
 *       });
 *       console.log('Created:', result.data);
 *     } catch (err) {
 *       console.error('Failed:', err);
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <button type="submit" disabled={loading}>
 *         {loading ? 'Creating...' : 'Create'}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *     </form>
 *   );
 * }
 *
 * // With optimistic updates
 * function UpdatePost({ postId }: { postId: string }) {
 *   const { mutate } = useMutation((client) => client.post.update);
 *
 *   const handleUpdate = async (title: string) => {
 *     const result = await mutate({ id: postId, title });
 *     // result.rollback?.() can undo optimistic update
 *   };
 * }
 * ```
 */
export function useMutation<TInput, TOutput>(
	selector: MutationSelector<TInput, TOutput>,
): UseMutationResult<TInput, TOutput> {
	const client = useLensClient();
	const mutationFn = selector(client);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<TOutput | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	// Store mutation ref for latest version
	const mutationRef = useRef(mutationFn);
	mutationRef.current = mutationFn;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Mutation wrapper
	const mutate = useCallback(async (input: TInput): Promise<MutationResult<TOutput>> => {
		setLoading(true);
		setError(null);

		try {
			const result = await mutationRef.current(input);

			if (mountedRef.current) {
				setData(result.data);
			}

			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			if (mountedRef.current) {
				setError(mutationError);
			}
			throw mutationError;
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
	}, []);

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return { mutate, loading, error, data, reset };
}

// =============================================================================
// useLazyQuery Hook
// =============================================================================

/** Result of useLazyQuery hook */
export interface UseLazyQueryResult<T> {
	/** Execute the query */
	execute: () => Promise<T>;
	/** Query data (null if not executed or error) */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Reset query state */
	reset: () => void;
}

/**
 * Execute a query on demand (not on mount).
 * Client is automatically injected from LensProvider context.
 *
 * @example
 * ```tsx
 * // Route + Params pattern
 * function SearchUsers() {
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const { execute, data, loading } = useLazyQuery(
 *     (client) => client.user.search,
 *     { query: searchTerm }
 *   );
 *
 *   return (
 *     <div>
 *       <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
 *       <button onClick={execute} disabled={loading}>Search</button>
 *       {data?.map(user => <UserCard key={user.id} user={user} />)}
 *     </div>
 *   );
 * }
 *
 * // Accessor pattern
 * function LazyComplexQuery({ userId }: { userId: string }) {
 *   const { execute, data } = useLazyQuery(
 *     (client) => client.user.get({ id: userId }),
 *     [userId]
 *   );
 *   return <button onClick={execute}>Load</button>;
 * }
 * ```
 */

// Overload 1: Route + Params
export function useLazyQuery<TParams, TResult, TSelected = TResult>(
	selector: RouteSelector<TParams, TResult>,
	params: TParams,
	options?: UseQueryOptions<TResult, TSelected>,
): UseLazyQueryResult<TSelected>;

// Overload 2: Accessor + Deps
export function useLazyQuery<TResult, TSelected = TResult>(
	selector: QuerySelector<TResult>,
	deps: DependencyList,
	options?: UseQueryOptions<TResult, TSelected>,
): UseLazyQueryResult<TSelected>;

// Implementation
export function useLazyQuery<TParams, TResult, TSelected = TResult>(
	selector: RouteSelector<TParams, TResult> | QuerySelector<TResult>,
	paramsOrDeps: TParams | DependencyList,
	options?: UseQueryOptions<TResult, TSelected>,
): UseLazyQueryResult<TSelected> {
	const client = useLensClient();

	const [data, setData] = useState<TSelected | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	// Detect which overload
	const isAccessorMode = Array.isArray(paramsOrDeps);

	// Store refs for execute (so it uses latest values)
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	const paramsOrDepsRef = useRef(paramsOrDeps);
	paramsOrDepsRef.current = paramsOrDeps;

	const selectRef = useRef(options?.select);
	selectRef.current = options?.select;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Execute function
	const execute = useCallback(async (): Promise<TSelected> => {
		let query: QueryResult<TResult> | null | undefined;

		if (isAccessorMode) {
			const querySelector = selectorRef.current as QuerySelector<TResult>;
			query = querySelector(client);
		} else {
			const routeSelector = selectorRef.current as RouteSelector<TParams, TResult>;
			const route = routeSelector(client);
			if (route) {
				query = route(paramsOrDepsRef.current as TParams);
			}
		}

		if (query == null) {
			setData(null);
			setLoading(false);
			return null as TSelected;
		}

		setLoading(true);
		setError(null);

		try {
			const result = await query;
			const selected = selectRef.current
				? selectRef.current(result)
				: (result as unknown as TSelected);

			if (mountedRef.current) {
				setData(selected);
			}

			return selected;
		} catch (err) {
			const queryError = err instanceof Error ? err : new Error(String(err));
			if (mountedRef.current) {
				setError(queryError);
			}
			throw queryError;
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
	}, [client, isAccessorMode]);

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return { execute, data, loading, error, reset };
}
