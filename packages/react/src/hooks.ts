/**
 * @lens/react - Hooks
 *
 * React hooks for accessing Lens entities and mutations.
 */

import { useEffect, useMemo, useCallback, useState } from "react";
import { useSignal, useComputed } from "@preact/signals-react";
import type { Signal, EntityState, Client, ListOptions, InferQueryResult } from "@lens/client";
import type {
	SchemaDefinition,
	InferEntity,
	CreateInput,
	Select,
	WhereInput,
	CreateManyResult,
	UpdateManyResult,
	DeleteManyResult,
} from "@lens/core";
import { useLensClient } from "./context";

// =============================================================================
// Types
// =============================================================================

/** Entity query input */
export interface EntityInput {
	id: string;
}

/** Select options for queries (type-safe) */
export interface QueryOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	select?: Sel;
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
 * Subscribe to a single entity by ID (with type-safe select inference)
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
 *
 * // With select (return type inferred from select!)
 * function UserName({ userId }: { userId: string }) {
 *   const { data } = useEntity('User', { id: userId }, {
 *     select: { id: true, name: true }
 *   });
 *   // data is { id: string, name: string } | null
 *   return <span>{data?.name}</span>;
 * }
 * ```
 */
export function useEntity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	input: EntityInput,
	options?: QueryOptions<S, E, Sel>,
): UseEntityResult<InferQueryResult<S, E, Sel>> {
	const client = useLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		get: (id: string, options?: { select?: unknown }) => Signal<EntityState<InferQueryResult<S, E, Sel>>>;
	};

	// Subscribe to entity signal
	const entitySignal = useMemo(
		() => accessor.get(input.id, options),
		[entityName, input.id, JSON.stringify(options?.select)],
	);

	// Track signal value with useState for React re-renders
	const [state, setState] = useState<EntityState<InferQueryResult<S, E, Sel>>>(entitySignal.value);

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
		accessor.get(input.id, options);
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
 * Subscribe to a list of entities (with type-safe filtering and select inference)
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const { data: users, loading } = useList('User', {
 *     where: { isActive: true },  // Type-safe where!
 *     orderBy: { name: 'asc' },   // Type-safe orderBy!
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
 *
 * // With select (return type inferred!)
 * function UserNames() {
 *   const { data } = useList('User', {
 *     select: { id: true, name: true },
 *     where: { isActive: true },
 *   });
 *   // data is { id: string, name: string }[]
 *   return data.map(u => <span key={u.id}>{u.name}</span>);
 * }
 * ```
 */
export function useList<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: ListOptions<S, E, Sel>,
): UseListResult<InferQueryResult<S, E, Sel>> {
	const client = useLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		list: (options?: ListOptions<S, E, Sel>) => Signal<EntityState<InferQueryResult<S, E, Sel>[]>>;
	};

	// Subscribe to list signal
	const listSignal = useMemo(
		() => accessor.list(options),
		[entityName, JSON.stringify(options)],
	);

	// Track signal value with useState for React re-renders
	const [state, setState] = useState<EntityState<InferQueryResult<S, E, Sel>[]>>(listSignal.value);

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

/** Update input type for mutations */
export type UpdateMutationInput<S extends SchemaDefinition, E extends keyof S> = {
	id: string;
	data: Partial<Omit<CreateInput<S[E], S>, "id">>;
};

/** Delete input type */
export type DeleteMutationInput = {
	id: string;
};

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
 *   return <button onClick={() => createUser(data)} disabled={loading}>Create</button>;
 * }
 *
 * function UpdateUser({ userId }: { userId: string }) {
 *   const { mutate: updateUser } = useMutation('User', 'update');
 *
 *   // Update takes { id, data } format
 *   await updateUser({ id: userId, data: { name: 'New Name' } });
 * }
 *
 * function DeleteUser({ userId }: { userId: string }) {
 *   const { mutate: deleteUser } = useMutation('User', 'delete');
 *   await deleteUser({ id: userId });
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
			? UpdateMutationInput<S, E>
			: DeleteMutationInput,
	Op extends "delete" ? void : InferEntity<S[E], S>
> {
	const client = useLensClient<S>();

	// Mutation state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<InferEntity<S[E], S> | null>(null);

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		create: (data: CreateInput<S[E], S>) => Promise<{ data: InferEntity<S[E], S> }>;
		update: (id: string, data: unknown) => Promise<{ data: InferEntity<S[E], S> }>;
		delete: (id: string) => Promise<void>;
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

					case "update": {
						const { id, data: updateData } = input as UpdateMutationInput<S, E>;
						result = await accessor.update(id, updateData);
						setData((result as { data: InferEntity<S[E], S> }).data);
						return (result as { data: InferEntity<S[E], S> }).data;
					}

					case "delete": {
						const { id } = input as DeleteMutationInput;
						await accessor.delete(id);
						setData(null);
						return undefined;
					}
				}
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				setError(mutationError);
				throw mutationError;
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
				? UpdateMutationInput<S, E>
				: DeleteMutationInput,
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
