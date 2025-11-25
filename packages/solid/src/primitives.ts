/**
 * @lens/solid - Primitives
 *
 * SolidJS reactive primitives for Lens queries and mutations.
 * Uses SolidJS fine-grained reactivity for optimal performance.
 */

import {
	createSignal,
	createEffect,
	onCleanup,
	createMemo,
	type Accessor,
} from "solid-js";
import type { QueryResult, MutationResult } from "@lens/client";

// =============================================================================
// Types
// =============================================================================

/** Query result with reactive signals */
export interface CreateQueryResult<T> {
	/** Reactive data accessor */
	data: Accessor<T | null>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation result with reactive signals */
export interface CreateMutationResult<TInput, TOutput> {
	/** Reactive data accessor */
	data: Accessor<TOutput | null>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	/** Reset state */
	reset: () => void;
}

/** Lazy query result */
export interface CreateLazyQueryResult<T> {
	/** Reactive data accessor */
	data: Accessor<T | null>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Execute the query */
	execute: () => Promise<T>;
	/** Reset state */
	reset: () => void;
}

/** Query options */
export interface CreateQueryOptions {
	/** Skip the query (don't execute) */
	skip?: boolean;
}

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (
	input: TInput,
) => Promise<MutationResult<TOutput>>;

// =============================================================================
// createQuery
// =============================================================================

/**
 * Create a reactive query from a QueryResult.
 * Automatically subscribes to updates and manages cleanup.
 *
 * @example
 * ```tsx
 * import { createQuery } from '@lens/solid';
 *
 * function UserProfile(props: { userId: string }) {
 *   const user = createQuery(() => client.queries.getUser({ id: props.userId }));
 *
 *   return (
 *     <Show when={!user.loading()} fallback={<Spinner />}>
 *       <Show when={user.data()} fallback={<NotFound />}>
 *         {(data) => <h1>{data().name}</h1>}
 *       </Show>
 *     </Show>
 *   );
 * }
 * ```
 */
export function createQuery<T>(
	queryFn: () => QueryResult<T>,
	options?: CreateQueryOptions,
): CreateQueryResult<T> {
	const [data, setData] = createSignal<T | null>(null);
	const [loading, setLoading] = createSignal(!options?.skip);
	const [error, setError] = createSignal<Error | null>(null);

	let unsubscribe: (() => void) | null = null;

	const executeQuery = () => {
		if (options?.skip) {
			setLoading(false);
			return;
		}

		const queryResult = queryFn();

		// Subscribe to updates
		unsubscribe = queryResult.subscribe((value) => {
			setData(() => value);
			setLoading(false);
			setError(null);
		});

		// Handle initial load via promise
		queryResult.then(
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

	// Execute query immediately (not in effect) for initial load
	executeQuery();

	// Cleanup on unmount
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
		executeQuery();
	};

	return {
		data,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// createMutation
// =============================================================================

/**
 * Create a reactive mutation with loading/error state.
 *
 * @example
 * ```tsx
 * import { createMutation } from '@lens/solid';
 *
 * function CreatePostForm() {
 *   const createPost = createMutation(client.mutations.createPost);
 *
 *   const handleSubmit = async (e: Event) => {
 *     e.preventDefault();
 *     try {
 *       const result = await createPost.mutate({ title: 'Hello World' });
 *       console.log('Created:', result.data);
 *     } catch (err) {
 *       console.error('Failed:', err);
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <button type="submit" disabled={createPost.loading()}>
 *         {createPost.loading() ? 'Creating...' : 'Create'}
 *       </button>
 *       <Show when={createPost.error()}>
 *         {(err) => <p class="error">{err().message}</p>}
 *       </Show>
 *     </form>
 *   );
 * }
 * ```
 */
export function createMutation<TInput, TOutput>(
	mutationFn: MutationFn<TInput, TOutput>,
): CreateMutationResult<TInput, TOutput> {
	const [data, setData] = createSignal<TOutput | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<Error | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		setLoading(true);
		setError(null);

		try {
			const result = await mutationFn(input);
			setData(() => result.data);
			setLoading(false);
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			setError(mutationError);
			setLoading(false);
			throw mutationError;
		}
	};

	const reset = () => {
		setData(null);
		setLoading(false);
		setError(null);
	};

	return {
		data,
		loading,
		error,
		mutate,
		reset,
	};
}

// =============================================================================
// createLazyQuery
// =============================================================================

/**
 * Create a lazy query that executes on demand.
 *
 * @example
 * ```tsx
 * import { createLazyQuery } from '@lens/solid';
 *
 * function SearchUsers() {
 *   const [searchTerm, setSearchTerm] = createSignal('');
 *   const search = createLazyQuery(() =>
 *     client.queries.searchUsers({ query: searchTerm() })
 *   );
 *
 *   const handleSearch = async () => {
 *     const results = await search.execute();
 *     console.log('Found:', results);
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         value={searchTerm()}
 *         onInput={(e) => setSearchTerm(e.currentTarget.value)}
 *       />
 *       <button onClick={handleSearch} disabled={search.loading()}>
 *         Search
 *       </button>
 *       <Show when={search.data()}>
 *         {(users) => (
 *           <ul>
 *             <For each={users()}>
 *               {(user) => <li>{user.name}</li>}
 *             </For>
 *           </ul>
 *         )}
 *       </Show>
 *     </div>
 *   );
 * }
 * ```
 */
export function createLazyQuery<T>(
	queryFn: () => QueryResult<T>,
): CreateLazyQueryResult<T> {
	const [data, setData] = createSignal<T | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<Error | null>(null);

	const execute = async (): Promise<T> => {
		setLoading(true);
		setError(null);

		try {
			const queryResult = queryFn();
			const result = await queryResult;
			setData(() => result);
			setLoading(false);
			return result;
		} catch (err) {
			const queryError = err instanceof Error ? err : new Error(String(err));
			setError(queryError);
			setLoading(false);
			throw queryError;
		}
	};

	const reset = () => {
		setData(null);
		setLoading(false);
		setError(null);
	};

	return {
		data,
		loading,
		error,
		execute,
		reset,
	};
}
