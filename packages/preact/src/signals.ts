/**
 * @sylphx/lens-preact - Signals
 *
 * Signal-based primitives for Preact using @preact/signals.
 * Alternative to hooks for more fine-grained reactivity.
 *
 * @example
 * ```tsx
 * import { useSignals } from '@preact/signals';
 * import { createQuerySignal, createMutationSignal } from '@sylphx/lens-preact/signals';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   useSignals(); // Enable signals in component
 *   const client = useLensClient();
 *   const query = createQuerySignal(() => client.user.get({ id: userId }));
 *
 *   if (query.loading.value) return <Spinner />;
 *   if (query.error.value) return <Error message={query.error.value.message} />;
 *
 *   return <h1>{query.data.value?.name}</h1>;
 * }
 * ```
 */

import { type Signal, effect, signal } from "@preact/signals";
import type { MutationResult, QueryResult } from "@sylphx/lens-client";

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

/** Signal-based query result */
export interface QuerySignal<T> {
	/** Query data signal (null if loading or error) */
	data: Signal<T | null>;
	/** Loading state signal */
	loading: Signal<boolean>;
	/** Error state signal */
	error: Signal<Error | null>;
	/** Refetch the query */
	refetch: () => void;
	/** Dispose subscriptions */
	dispose: () => void;
}

/** Signal-based mutation result */
export interface MutationSignal<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	/** Mutation is in progress */
	loading: Signal<boolean>;
	/** Mutation error */
	error: Signal<Error | null>;
	/** Last mutation result */
	data: Signal<TOutput | null>;
	/** Reset mutation state */
	reset: () => void;
}

/** Signal-based lazy query result */
export interface LazyQuerySignal<T> {
	/** Execute the query */
	execute: () => Promise<T>;
	/** Query data signal (null if not executed or error) */
	data: Signal<T | null>;
	/** Loading state signal */
	loading: Signal<boolean>;
	/** Error state signal */
	error: Signal<Error | null>;
	/** Reset query state */
	reset: () => void;
}

/** Options for createQuerySignal */
export interface QuerySignalOptions {
	/** Skip the query (don't execute) */
	skip?: boolean;
}

// =============================================================================
// createQuerySignal
// =============================================================================

/** Helper to resolve query input (handles accessor functions) */
function resolveQuery<T>(input: QueryInput<T>): QueryResult<T> | null | undefined {
	return typeof input === "function" ? input() : input;
}

/**
 * Create a signal-based query subscription
 *
 * @param queryInput - QueryResult, null/undefined, or accessor function returning QueryResult
 * @param options - Query options
 *
 * @example
 * ```tsx
 * import { useSignals } from '@preact/signals';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   useSignals();
 *   const client = useLensClient();
 *   const query = createQuerySignal(() => client.user.get({ id: userId }));
 *
 *   // Signals auto-track dependencies
 *   if (query.loading.value) return <Spinner />;
 *   if (query.error.value) return <Error message={query.error.value.message} />;
 *
 *   return <h1>{query.data.value?.name}</h1>;
 * }
 *
 * // Conditional query
 * function SessionInfo({ sessionId }: { sessionId: Signal<string | null> }) {
 *   useSignals();
 *   const client = useLensClient();
 *   const query = createQuerySignal(() =>
 *     sessionId.value ? client.session.get({ id: sessionId.value }) : null
 *   );
 *
 *   return <span>{query.data.value?.totalTokens}</span>;
 * }
 * ```
 */
export function createQuerySignal<T>(
	queryInput: QueryInput<T>,
	options?: QuerySignalOptions,
): QuerySignal<T> {
	const data = signal<T | null>(null);
	const loading = signal(!options?.skip && resolveQuery(queryInput) != null);
	const error = signal<Error | null>(null);

	let currentUnsubscribe: (() => void) | null = null;

	// Function to setup subscription
	const setupSubscription = () => {
		// Cleanup previous subscription
		if (currentUnsubscribe) {
			currentUnsubscribe();
			currentUnsubscribe = null;
		}

		const query = resolveQuery(queryInput);

		// Handle null/undefined query or skip
		if (query == null || options?.skip) {
			data.value = null;
			loading.value = false;
			error.value = null;
			return;
		}

		loading.value = true;
		error.value = null;

		// Subscribe to updates
		currentUnsubscribe = query.subscribe((value) => {
			data.value = value;
			loading.value = false;
		});

		// Handle initial load via promise
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
	};

	// Initial setup
	setupSubscription();

	// If queryInput is an accessor, use effect to track changes
	if (typeof queryInput === "function") {
		const disposeEffect = effect(() => {
			// Reading queryInput inside effect tracks it
			const _ = resolveQuery(queryInput);
			setupSubscription();
		});

		return {
			data,
			loading,
			error,
			refetch: setupSubscription,
			dispose: () => {
				disposeEffect();
				if (currentUnsubscribe) currentUnsubscribe();
			},
		};
	}

	return {
		data,
		loading,
		error,
		refetch: setupSubscription,
		dispose: () => {
			if (currentUnsubscribe) currentUnsubscribe();
		},
	};
}

// =============================================================================
// createMutationSignal
// =============================================================================

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<MutationResult<TOutput>>;

/**
 * Create a signal-based mutation
 *
 * @param mutationFn - Mutation function from client API
 *
 * @example
 * ```tsx
 * import { useSignals } from '@preact/signals';
 *
 * function CreatePost() {
 *   useSignals();
 *   const client = useLensClient();
 *   const mutation = createMutationSignal(client.post.create);
 *
 *   const handleSubmit = async (formData: FormData) => {
 *     try {
 *       const result = await mutation.mutate({
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
 *       <button type="submit" disabled={mutation.loading.value}>
 *         {mutation.loading.value ? 'Creating...' : 'Create'}
 *       </button>
 *       {mutation.error.value && <p className="error">{mutation.error.value.message}</p>}
 *     </form>
 *   );
 * }
 * ```
 */
export function createMutationSignal<TInput, TOutput>(
	mutationFn: MutationFn<TInput, TOutput>,
): MutationSignal<TInput, TOutput> {
	const loading = signal(false);
	const error = signal<Error | null>(null);
	const data = signal<TOutput | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		loading.value = true;
		error.value = null;

		try {
			const result = await mutationFn(input);
			data.value = result.data;
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			error.value = mutationError;
			throw mutationError;
		} finally {
			loading.value = false;
		}
	};

	const reset = () => {
		loading.value = false;
		error.value = null;
		data.value = null;
	};

	return { mutate, loading, error, data, reset };
}

// =============================================================================
// createLazyQuerySignal
// =============================================================================

/**
 * Create a signal-based lazy query (executed on demand)
 *
 * @param queryInput - QueryResult, null/undefined, or accessor function returning QueryResult
 *
 * @example
 * ```tsx
 * import { useSignals } from '@preact/signals';
 * import { signal } from '@preact/signals';
 *
 * function SearchUsers() {
 *   useSignals();
 *   const client = useLensClient();
 *   const searchTerm = signal('');
 *   const query = createLazyQuerySignal(() =>
 *     client.user.search({ query: searchTerm.value })
 *   );
 *
 *   const handleSearch = async () => {
 *     const users = await query.execute();
 *     console.log('Found:', users);
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         value={searchTerm.value}
 *         onInput={e => searchTerm.value = (e.target as HTMLInputElement).value}
 *       />
 *       <button onClick={handleSearch} disabled={query.loading.value}>
 *         Search
 *       </button>
 *       {query.data.value?.map(user => <UserCard key={user.id} user={user} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function createLazyQuerySignal<T>(queryInput: QueryInput<T>): LazyQuerySignal<T> {
	const data = signal<T | null>(null);
	const loading = signal(false);
	const error = signal<Error | null>(null);

	const execute = async (): Promise<T> => {
		const query = resolveQuery(queryInput);

		if (query == null) {
			data.value = null;
			loading.value = false;
			return null as T;
		}

		loading.value = true;
		error.value = null;

		try {
			const result = await query;
			data.value = result;
			return result;
		} catch (err) {
			const queryError = err instanceof Error ? err : new Error(String(err));
			error.value = queryError;
			throw queryError;
		} finally {
			loading.value = false;
		}
	};

	const reset = () => {
		loading.value = false;
		error.value = null;
		data.value = null;
	};

	return { execute, data, loading, error, reset };
}
