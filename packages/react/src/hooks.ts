/**
 * @sylphx/lens-react - Hooks
 *
 * React hooks for Lens queries and mutations.
 * Works with QueryResult from @sylphx/lens-client.
 *
 * @example
 * ```tsx
 * import { useLensClient, useQuery, useMutation } from '@sylphx/lens-react';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useLensClient();
 *   const { data: user, loading } = useQuery(client.user.get({ id: userId }));
 *   if (loading) return <Spinner />;
 *   return <h1>{user?.name}</h1>;
 * }
 *
 * function CreatePost() {
 *   const client = useLensClient();
 *   const { mutate, loading } = useMutation(client.post.create);
 *   const handleCreate = () => mutate({ title: 'Hello' });
 *   return <button onClick={handleCreate} disabled={loading}>Create</button>;
 * }
 * ```
 */

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// =============================================================================
// Query Input Types
// =============================================================================

/** Query input - can be a query, null/undefined, or an accessor function */
export type QueryInput<T> =
	| QueryResult<T>
	| null
	| undefined
	| (() => QueryResult<T> | null | undefined);

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
export interface UseQueryOptions {
	/** Skip the query (don't execute) */
	skip?: boolean;
}

// =============================================================================
// useQuery Hook
// =============================================================================

/** Helper to resolve query input (handles accessor functions) */
function resolveQuery<T>(input: QueryInput<T>): QueryResult<T> | null | undefined {
	return typeof input === "function" ? input() : input;
}

/**
 * Subscribe to a query with reactive updates
 *
 * @param queryInput - QueryResult, null/undefined, or accessor function returning QueryResult
 * @param options - Query options
 *
 * @example
 * ```tsx
 * // Basic usage
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useLensClient();
 *   const { data: user, loading, error } = useQuery(client.user.get({ id: userId }));
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   if (!user) return <NotFound />;
 *
 *   return <h1>{user.name}</h1>;
 * }
 *
 * // Conditional query (null when condition not met)
 * function SessionInfo({ sessionId }: { sessionId: string | null }) {
 *   const client = useLensClient();
 *   const { data } = useQuery(
 *     sessionId ? client.session.get({ id: sessionId }) : null
 *   );
 *   // data is null when sessionId is null
 *   return <span>{data?.totalTokens}</span>;
 * }
 *
 * // Accessor function (reactive inputs)
 * function ReactiveQuery({ sessionId }: { sessionId: Signal<string | null> }) {
 *   const client = useLensClient();
 *   const { data } = useQuery(() =>
 *     sessionId.value ? client.session.get({ id: sessionId.value }) : null
 *   );
 *   return <span>{data?.totalTokens}</span>;
 * }
 *
 * // Skip query conditionally
 * function ConditionalQuery({ shouldFetch }: { shouldFetch: boolean }) {
 *   const client = useLensClient();
 *   const { data } = useQuery(client.user.list(), { skip: !shouldFetch });
 * }
 * ```
 */
export function useQuery<T>(
	queryInput: QueryInput<T>,
	options?: UseQueryOptions,
): UseQueryResult<T> {
	// Resolve query (handles accessor functions)
	const query = useMemo(() => resolveQuery(queryInput), [queryInput]);

	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(!options?.skip && query != null);
	const [error, setError] = useState<Error | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	// Store query ref for refetch
	const queryRef = useRef(query);
	queryRef.current = query;

	// Subscribe to query
	useEffect(() => {
		mountedRef.current = true;

		// Handle null/undefined query
		if (query == null || options?.skip) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		// Subscribe to updates
		const unsubscribe = query.subscribe((value) => {
			if (mountedRef.current) {
				setData(value);
				setLoading(false);
			}
		});

		// Handle initial load via promise (for one-shot queries)
		query.then(
			(value) => {
				if (mountedRef.current) {
					setData(value);
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
	}, [query, options?.skip]);

	// Refetch function
	const refetch = useCallback(() => {
		const currentQuery = queryRef.current;
		if (currentQuery == null || options?.skip) return;

		setLoading(true);
		setError(null);

		currentQuery.then(
			(value) => {
				if (mountedRef.current) {
					setData(value);
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
	}, [options?.skip]);

	return { data, loading, error, refetch };
}

// =============================================================================
// useMutation Hook
// =============================================================================

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<MutationResult<TOutput>>;

/**
 * Execute mutations with loading/error state
 *
 * @param mutationFn - Mutation function from client API
 *
 * @example
 * ```tsx
 * function CreatePost() {
 *   const client = useLensClient();
 *   const { mutate, loading, error, data } = useMutation(client.post.create);
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
 *   const client = useLensClient();
 *   const { mutate } = useMutation(client.post.update);
 *
 *   const handleUpdate = async (title: string) => {
 *     const result = await mutate({ id: postId, title });
 *     // result.rollback?.() can undo optimistic update
 *   };
 * }
 * ```
 */
export function useMutation<TInput, TOutput>(
	mutationFn: MutationFn<TInput, TOutput>,
): UseMutationResult<TInput, TOutput> {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<TOutput | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Mutation wrapper
	const mutate = useCallback(
		async (input: TInput): Promise<MutationResult<TOutput>> => {
			setLoading(true);
			setError(null);

			try {
				const result = await mutationFn(input);

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
		},
		[mutationFn],
	);

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
 * Execute a query on demand (not on mount)
 *
 * @param queryInput - QueryResult, null/undefined, or accessor function returning QueryResult
 *
 * @example
 * ```tsx
 * function SearchUsers() {
 *   const client = useLensClient();
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const { execute, data, loading } = useLazyQuery(
 *     client.user.search({ query: searchTerm })
 *   );
 *
 *   const handleSearch = async () => {
 *     const users = await execute();
 *     console.log('Found:', users);
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         value={searchTerm}
 *         onChange={e => setSearchTerm(e.target.value)}
 *       />
 *       <button onClick={handleSearch} disabled={loading}>
 *         Search
 *       </button>
 *       {data?.map(user => <UserCard key={user.id} user={user} />)}
 *     </div>
 *   );
 * }
 *
 * // With accessor function
 * function LazyReactiveQuery({ sessionId }: { sessionId: Signal<string | null> }) {
 *   const client = useLensClient();
 *   const { execute, data } = useLazyQuery(() =>
 *     sessionId.value ? client.session.get({ id: sessionId.value }) : null
 *   );
 *   return <button onClick={execute}>Load</button>;
 * }
 * ```
 */
export function useLazyQuery<T>(queryInput: QueryInput<T>): UseLazyQueryResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Track mounted state
	const mountedRef = useRef(true);

	// Store queryInput ref for execute (so it uses latest value)
	const queryInputRef = useRef(queryInput);
	queryInputRef.current = queryInput;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Execute function
	const execute = useCallback(async (): Promise<T> => {
		const query = resolveQuery(queryInputRef.current);

		if (query == null) {
			setData(null);
			setLoading(false);
			return null as T;
		}

		setLoading(true);
		setError(null);

		try {
			const result = await query;

			if (mountedRef.current) {
				setData(result);
			}

			return result;
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
	}, []);

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return { execute, data, loading, error, reset };
}
