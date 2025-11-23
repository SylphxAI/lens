/**
 * @lens/react - Hooks
 *
 * React hooks for accessing Lens entities and mutations.
 */

import { useEffect, useMemo, useCallback, useState } from "react";
import { useSignal, useComputed } from "@preact/signals-react";
import type { Signal, EntityState, Client, ListOptions } from "@lens/client";
import type { SchemaDefinition, InferEntity, CreateInput, UpdateInput, DeleteInput } from "@lens/core";
import { useLensClient } from "./context";

// =============================================================================
// Types
// =============================================================================

/** Entity query input */
export interface EntityInput {
	id: string;
}

/** Select options for queries */
export interface SelectOptions<S extends SchemaDefinition, E extends keyof S> {
	select?: Record<string, unknown>;
}

/** Result of useEntity hook */
export interface UseEntityResult<T> {
	/** Entity data (null if loading or error) */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the entity */
	refetch: () => void;
}

/** Result of useList hook */
export interface UseListResult<T> {
	/** List data (empty array if loading or error) */
	data: T[];
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the list */
	refetch: () => void;
}

/** Result of useMutation hook */
export interface UseMutationResult<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<TOutput>;
	/** Mutation is in progress */
	loading: boolean;
	/** Mutation error */
	error: Error | null;
	/** Last mutation result */
	data: TOutput | null;
	/** Reset mutation state */
	reset: () => void;
}

// =============================================================================
// useEntity Hook
// =============================================================================

/**
 * Subscribe to a single entity by ID
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const { data: user, loading, error } = useEntity('User', { id: userId });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   if (!user) return <NotFound />;
 *
 *   return <h1>{user.name}</h1>;
 * }
 * ```
 */
export function useEntity<S extends SchemaDefinition, E extends keyof S & string>(
	entityName: E,
	input: EntityInput,
	options?: SelectOptions<S, E>,
): UseEntityResult<InferEntity<S[E], S>> {
	const client = useLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		get: (input: EntityInput, options?: SelectOptions<S, E>) => Signal<EntityState<InferEntity<S[E], S>>>;
	};

	// Subscribe to entity signal
	const entitySignal = useMemo(
		() => accessor.get(input, options),
		[entityName, input.id, JSON.stringify(options?.select)],
	);

	// Track signal value with useState for React re-renders
	const [state, setState] = useState<EntityState<InferEntity<S[E], S>>>(entitySignal.value);

	// Subscribe to signal changes
	useEffect(() => {
		// Update immediately
		setState(entitySignal.value);

		// Subscribe to future changes
		const unsubscribe = entitySignal.subscribe((value) => {
			setState(value);
		});

		// Release subscription on unmount
		return () => {
			unsubscribe();
			client.$store.release(entityName, input.id);
		};
	}, [entitySignal, entityName, input.id]);

	// Refetch function
	const refetch = useCallback(() => {
		client.$store.setEntityLoading(entityName, input.id, true);
		// Re-trigger subscription
		accessor.get(input, options);
	}, [entityName, input.id, options]);

	return {
		data: state.data,
		loading: state.loading,
		error: state.error,
		refetch,
	};
}

// =============================================================================
// useList Hook
// =============================================================================

/**
 * Subscribe to a list of entities
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const { data: users, loading } = useList('User', {
 *     where: { active: true },
 *     orderBy: { name: 'asc' },
 *     take: 10,
 *   });
 *
 *   if (loading) return <Spinner />;
 *
 *   return (
 *     <ul>
 *       {users.map(user => (
 *         <li key={user.id}>{user.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useList<S extends SchemaDefinition, E extends keyof S & string>(
	entityName: E,
	options?: ListOptions<S, E>,
): UseListResult<InferEntity<S[E], S>> {
	const client = useLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		list: (options?: ListOptions<S, E>) => Signal<EntityState<InferEntity<S[E], S>[]>>;
	};

	// Subscribe to list signal
	const listSignal = useMemo(
		() => accessor.list(options),
		[entityName, JSON.stringify(options)],
	);

	// Track signal value with useState for React re-renders
	const [state, setState] = useState<EntityState<InferEntity<S[E], S>[]>>(listSignal.value);

	// Subscribe to signal changes
	useEffect(() => {
		// Update immediately
		setState(listSignal.value);

		// Subscribe to future changes
		const unsubscribe = listSignal.subscribe((value) => {
			setState(value);
		});

		return () => {
			unsubscribe();
		};
	}, [listSignal]);

	// Refetch function
	const refetch = useCallback(() => {
		accessor.list(options);
	}, [entityName, options]);

	return {
		data: state.data ?? [],
		loading: state.loading,
		error: state.error,
		refetch,
	};
}

// =============================================================================
// useMutation Hook
// =============================================================================

/**
 * Execute mutations with loading/error state
 *
 * @example
 * ```tsx
 * function CreateUser() {
 *   const { mutate: createUser, loading } = useMutation('User', 'create');
 *
 *   const handleSubmit = async (data: UserInput) => {
 *     try {
 *       const user = await createUser(data);
 *       console.log('Created:', user);
 *     } catch (error) {
 *       console.error('Failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <button disabled={loading}>
 *         {loading ? 'Creating...' : 'Create User'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useMutation<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Op extends "create" | "update" | "delete",
>(
	entityName: E,
	operation: Op,
): UseMutationResult<
	Op extends "create"
		? CreateInput<S[E], S>
		: Op extends "update"
			? UpdateInput<S[E], S>
			: DeleteInput,
	Op extends "delete" ? void : InferEntity<S[E], S>
> {
	const client = useLensClient<S>();

	// Mutation state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<InferEntity<S[E], S> | null>(null);

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		create: (input: CreateInput<S[E], S>) => Promise<{ data: InferEntity<S[E], S> }>;
		update: (input: UpdateInput<S[E], S>) => Promise<{ data: InferEntity<S[E], S> }>;
		delete: (input: DeleteInput) => Promise<void>;
	};

	// Mutation function
	const mutate = useCallback(
		async (input: unknown) => {
			setLoading(true);
			setError(null);

			try {
				let result: unknown;

				switch (operation) {
					case "create":
						result = await accessor.create(input as CreateInput<S[E], S>);
						setData((result as { data: InferEntity<S[E], S> }).data);
						return (result as { data: InferEntity<S[E], S> }).data;

					case "update":
						result = await accessor.update(input as UpdateInput<S[E], S>);
						setData((result as { data: InferEntity<S[E], S> }).data);
						return (result as { data: InferEntity<S[E], S> }).data;

					case "delete":
						await accessor.delete(input as DeleteInput);
						setData(null);
						return undefined;
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[entityName, operation],
	) as (input: unknown) => Promise<unknown>;

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return {
		mutate,
		loading,
		error,
		data,
		reset,
	} as UseMutationResult<
		Op extends "create"
			? CreateInput<S[E], S>
			: Op extends "update"
				? UpdateInput<S[E], S>
				: DeleteInput,
		Op extends "delete" ? void : InferEntity<S[E], S>
	>;
}

// =============================================================================
// useSignalValue Hook
// =============================================================================

/**
 * Subscribe to a raw signal value
 *
 * @example
 * ```tsx
 * function Counter({ countSignal }: { countSignal: Signal<number> }) {
 *   const count = useSignalValue(countSignal);
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function useSignalValue<T>(signal: Signal<T>): T {
	const [value, setValue] = useState<T>(signal.value);

	useEffect(() => {
		setValue(signal.value);

		const unsubscribe = signal.subscribe((newValue) => {
			setValue(newValue);
		});

		return unsubscribe;
	}, [signal]);

	return value;
}

// =============================================================================
// useLensComputed Hook
// =============================================================================

/**
 * Create a computed value that updates when dependencies change
 *
 * @example
 * ```tsx
 * function UserFullName({ userId }: { userId: string }) {
 *   const { data: user } = useEntity('User', { id: userId });
 *
 *   const fullName = useLensComputed(
 *     () => user ? `${user.firstName} ${user.lastName}` : '',
 *     [user]
 *   );
 *
 *   return <span>{fullName}</span>;
 * }
 * ```
 */
export function useLensComputed<T>(compute: () => T, deps: unknown[]): T {
	return useMemo(compute, deps);
}
