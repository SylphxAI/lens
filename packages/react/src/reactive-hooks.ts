/**
 * @lens/react - Reactive Hooks
 *
 * React hooks with fine-grained field-level reactivity.
 * Uses EntitySignal for minimal re-renders.
 */

import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import type {
	Signal,
	ReactiveClient,
	EntityResult,
	ListResult,
	ReactiveQueryOptions,
	ReactiveListOptions,
	ReactiveInferQueryResult,
} from "@lens/client";
import type {
	SchemaDefinition,
	InferEntity,
	CreateInput,
	Select,
	WhereInput,
} from "@lens/core";
import { useReactiveLensClient } from "./reactive-context";

// =============================================================================
// Types
// =============================================================================

/** Entity query input */
export interface EntityInput {
	id: string;
}

/** Result of useReactiveEntity hook - with field-level signals */
export interface UseReactiveEntityResult<T extends Record<string, unknown>> {
	/** Field-level signals - ONLY re-renders when specific field changes */
	$: { readonly [K in keyof T]: Signal<T[K]> };
	/** Full entity value (computed) - re-renders when ANY field changes */
	value: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the entity */
	refetch: () => void;
}

/** Result of useReactiveList hook */
export interface UseReactiveListResult<T extends Record<string, unknown>> {
	/** Array of entity results with field-level signals */
	items: UseReactiveEntityResult<T>[];
	/** Combined list data */
	data: T[];
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the list */
	refetch: () => void;
}

/** Mutation result */
export interface UseMutationResult<TInput, TOutput> {
	mutate: (input: TInput) => Promise<TOutput>;
	loading: boolean;
	error: Error | null;
	data: TOutput | null;
	reset: () => void;
}

// =============================================================================
// useReactiveEntity Hook
// =============================================================================

/**
 * Subscribe to a single entity with fine-grained field-level reactivity.
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const user = useReactiveEntity('User', { id: userId });
 *
 *   if (user.loading) return <Spinner />;
 *   if (user.error) return <Error message={user.error.message} />;
 *
 *   // Fine-grained: ONLY re-renders when name changes
 *   return <UserName $name={user.$.name} />;
 * }
 *
 * // This component only re-renders when name changes, not bio/email/etc
 * function UserName({ $name }: { $name: Signal<string> }) {
 *   const name = useSignalValue($name);
 *   return <h1>{name}</h1>;
 * }
 *
 * // Or use the value for coarse-grained updates
 * function UserCard({ userId }: { userId: string }) {
 *   const { value: user } = useReactiveEntity('User', { id: userId });
 *   // Re-renders when ANY field changes
 *   return <div>{user?.name} - {user?.bio}</div>;
 * }
 * ```
 */
export function useReactiveEntity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	input: EntityInput,
	options?: ReactiveQueryOptions<S, E, Sel>,
): UseReactiveEntityResult<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	const client = useReactiveLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		get: (id: string, options?: { select?: unknown }) => EntityResult<ResultType>;
	};

	// Store entity result ref for cleanup
	const entityResultRef = useRef<EntityResult<ResultType> | null>(null);

	// Get entity result (memoized by id and select)
	const entityResult = useMemo(() => {
		// Cleanup previous
		if (entityResultRef.current) {
			entityResultRef.current.dispose();
		}

		const result = accessor.get(input.id, options);
		entityResultRef.current = result;
		return result;
	}, [entityName, input.id, JSON.stringify(options?.select)]);

	// Track loading/error state with useState for React re-renders
	const [loading, setLoading] = useState(entityResult.loading.value);
	const [error, setError] = useState(entityResult.error.value);
	const [value, setValue] = useState<ResultType | null>(
		entityResult.loading.value ? null : entityResult.value.value,
	);

	// Subscribe to metadata changes
	useEffect(() => {
		setLoading(entityResult.loading.value);
		setError(entityResult.error.value);
		setValue(entityResult.loading.value ? null : entityResult.value.value);

		const unsubLoading = entityResult.loading.subscribe((v) => setLoading(v));
		const unsubError = entityResult.error.subscribe((v) => setError(v));
		const unsubValue = entityResult.value.subscribe((v) => setValue(v));

		return () => {
			unsubLoading();
			unsubError();
			unsubValue();
		};
	}, [entityResult]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (entityResultRef.current) {
				entityResultRef.current.dispose();
				entityResultRef.current = null;
			}
		};
	}, []);

	// Refetch function
	const refetch = useCallback(() => {
		// Re-fetch by getting a new entity result
		const result = accessor.get(input.id, options);
		entityResultRef.current = result;
	}, [entityName, input.id, options]);

	return {
		$: entityResult.$,
		value,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// useReactiveList Hook
// =============================================================================

/**
 * Subscribe to a list of entities with fine-grained reactivity.
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const users = useReactiveList('User', {
 *     where: { isActive: true },
 *     orderBy: { name: 'asc' },
 *     take: 10,
 *   });
 *
 *   if (users.loading) return <Spinner />;
 *
 *   return (
 *     <ul>
 *       {users.items.map((user, i) => (
 *         // Each UserItem only re-renders when its own fields change
 *         <UserItem key={i} $name={user.$.name} $bio={user.$.bio} />
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useReactiveList<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: ReactiveListOptions<S, E, Sel>,
): UseReactiveListResult<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	const client = useReactiveLensClient<S>();

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		list: (options?: unknown) => ListResult<ResultType>;
	};

	// Store list result ref for cleanup
	const listResultRef = useRef<ListResult<ResultType> | null>(null);

	// Get list result
	const listResult = useMemo(() => {
		// Cleanup previous
		if (listResultRef.current) {
			listResultRef.current.dispose();
		}

		const result = accessor.list(options);
		listResultRef.current = result;
		return result;
	}, [entityName, JSON.stringify(options)]);

	// Track state
	const [loading, setLoading] = useState(listResult.loading.value);
	const [error, setError] = useState(listResult.error.value);
	const [data, setData] = useState<ResultType[]>(listResult.list.value);

	// Subscribe to changes
	useEffect(() => {
		setLoading(listResult.loading.value);
		setError(listResult.error.value);
		setData(listResult.list.value);

		const unsubLoading = listResult.loading.subscribe((v) => setLoading(v));
		const unsubError = listResult.error.subscribe((v) => setError(v));
		const unsubList = listResult.list.subscribe((v) => setData(v));

		return () => {
			unsubLoading();
			unsubError();
			unsubList();
		};
	}, [listResult]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (listResultRef.current) {
				listResultRef.current.dispose();
				listResultRef.current = null;
			}
		};
	}, []);

	// Convert items to hook result format
	const items = useMemo(
		() =>
			listResult.items.map((item) => ({
				$: item.$,
				value: item.value.value,
				loading: false,
				error: null,
				refetch: () => {},
			})),
		[listResult.items],
	);

	// Refetch function
	const refetch = useCallback(() => {
		const result = accessor.list(options);
		listResultRef.current = result;
	}, [entityName, options]);

	return {
		items,
		data,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// useFieldSignal Hook
// =============================================================================

/**
 * Subscribe to a single field signal value.
 * Component only re-renders when this specific field changes.
 *
 * @example
 * ```tsx
 * function UserName({ $name }: { $name: Signal<string> }) {
 *   const name = useFieldSignal($name);
 *   return <span>{name}</span>;
 * }
 * ```
 */
export function useFieldSignal<T>(signal: Signal<T>): T {
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
// useReactiveMutation Hook
// =============================================================================

/** Update input type */
export type UpdateMutationInput<S extends SchemaDefinition, E extends keyof S> = {
	id: string;
	data: Partial<Omit<CreateInput<S[E], S>, "id">>;
};

/** Delete input type */
export type DeleteMutationInput = {
	id: string;
};

/**
 * Execute mutations with the reactive client.
 *
 * @example
 * ```tsx
 * function UpdateUserName({ userId }: { userId: string }) {
 *   const { mutate: updateUser, loading } = useReactiveMutation('User', 'update');
 *
 *   const handleUpdate = async () => {
 *     await updateUser({ id: userId, data: { name: 'New Name' } });
 *   };
 *
 *   return <button onClick={handleUpdate} disabled={loading}>Update</button>;
 * }
 * ```
 */
export function useReactiveMutation<
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
	const client = useReactiveLensClient<S>();

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<InferEntity<S[E], S> | null>(null);

	// Get entity accessor
	const accessor = (client as Record<string, unknown>)[entityName] as {
		create: (data: CreateInput<S[E], S>) => Promise<{ data: InferEntity<S[E], S> }>;
		update: (id: string, data: unknown) => Promise<{ data: InferEntity<S[E], S> }>;
		delete: (id: string) => Promise<void>;
	};

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
