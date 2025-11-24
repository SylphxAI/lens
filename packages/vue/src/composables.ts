/**
 * @lens/vue - Composables
 *
 * Vue composables for accessing Lens entities and mutations.
 * Integrates with Vue's Composition API and reactivity system.
 */

import { ref, onUnmounted, watch, type Ref } from "vue";
import type { Client, InferQueryResult } from "@lens/client";
import type { SchemaDefinition, Select, InferEntity, CreateInput } from "@lens/core";
import { useLensClient } from "./plugin";

// =============================================================================
// Types
// =============================================================================

/** Entity query input */
export interface EntityInput {
	id: string;
}

/** Entity composable options */
export interface UseEntityOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	select?: Sel;
}

/** List composable options */
export interface UseListOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	where?: Record<string, unknown>;
	orderBy?: Record<string, "asc" | "desc">;
	take?: number;
	skip?: number;
	select?: Sel;
}

/** Entity composable result */
export interface UseEntityResult<T> {
	/** Entity data */
	data: Ref<T | null>;
	/** Loading state */
	loading: Ref<boolean>;
	/** Error state */
	error: Ref<Error | null>;
	/** Refetch the entity */
	refetch: () => void;
}

/** List composable result */
export interface UseListResult<T> {
	/** List data */
	data: Ref<T[]>;
	/** Loading state */
	loading: Ref<boolean>;
	/** Error state */
	error: Ref<Error | null>;
	/** Refetch the list */
	refetch: () => void;
}

/** Update input type */
export type UpdateMutationInput<S extends SchemaDefinition, E extends keyof S> = {
	id: string;
	data: Partial<Omit<CreateInput<S[E], S>, "id">>;
};

/** Delete input type */
export type DeleteMutationInput = {
	id: string;
};

/** Mutation composable result */
export interface UseMutationResult<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<TOutput>;
	/** Mutation is in progress */
	loading: Ref<boolean>;
	/** Mutation error */
	error: Ref<Error | null>;
	/** Last mutation result */
	data: Ref<TOutput | null>;
	/** Reset mutation state */
	reset: () => void;
}

// =============================================================================
// useEntity() - Single Entity Composable
// =============================================================================

/**
 * Composable for fetching and subscribing to a single entity.
 * Automatically manages subscriptions and cleanup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useEntity } from '@lens/vue';
 *
 * const { data: user, loading, error } = useEntity('User', { id: '123' });
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <div v-else-if="error">Error: {{ error.message }}</div>
 *   <div v-else-if="user">
 *     <h1>{{ user.name }}</h1>
 *     <p>{{ user.email }}</p>
 *   </div>
 * </template>
 * ```
 */
export function useEntity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	input: EntityInput | Ref<EntityInput>,
	options?: UseEntityOptions<S, E, Sel>,
	client?: Client<S>,
): UseEntityResult<InferQueryResult<S, E, Sel>> {
	type ResultType = InferQueryResult<S, E, Sel>;

	const lensClient = client ?? useLensClient<S>();
	const accessor = (lensClient as Record<string, unknown>)[entityName] as {
		get: (id: string, options?: { select?: unknown }) => {
			value: { data: ResultType | null; loading: boolean; error: Error | null };
			subscribe: (cb: (value: unknown) => void) => () => void;
		};
	};

	const data = ref<ResultType | null>(null) as Ref<ResultType | null>;
	const loading = ref(true);
	const error = ref<Error | null>(null);

	let unsubscribe: (() => void) | null = null;

	const subscribe = (id: string) => {
		// Clean up previous subscription
		if (unsubscribe) {
			unsubscribe();
			lensClient.$store.release(entityName, id);
		}

		// Get entity signal
		const entitySignal = accessor.get(id, options);

		// Set initial value
		data.value = entitySignal.value.data;
		loading.value = entitySignal.value.loading;
		error.value = entitySignal.value.error;

		// Subscribe to changes
		unsubscribe = entitySignal.subscribe((value: unknown) => {
			const state = value as { data: ResultType | null; loading: boolean; error: Error | null };
			data.value = state.data;
			loading.value = state.loading;
			error.value = state.error;
		});
	};

	// Watch for ID changes
	if ("value" in input) {
		watch(
			() => input.value.id,
			(id) => subscribe(id),
			{ immediate: true },
		);
	} else {
		subscribe(input.id);
	}

	// Cleanup on unmount
	onUnmounted(() => {
		if (unsubscribe) {
			unsubscribe();
			const id = "value" in input ? input.value.id : input.id;
			lensClient.$store.release(entityName, id);
		}
	});

	const refetch = () => {
		const id = "value" in input ? input.value.id : input.id;
		lensClient.$store.setEntityLoading(entityName, id, true);
		accessor.get(id, options);
	};

	return {
		data,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// useList() - Entity List Composable
// =============================================================================

/**
 * Composable for fetching and subscribing to a list of entities.
 * Automatically manages subscriptions and cleanup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useList } from '@lens/vue';
 *
 * const { data: users, loading } = useList('User', {
 *   where: { isActive: true },
 *   orderBy: { name: 'asc' },
 *   take: 10,
 * });
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <ul v-else>
 *     <li v-for="user in users" :key="user.id">
 *       {{ user.name }}
 *     </li>
 *   </ul>
 * </template>
 * ```
 */
export function useList<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: UseListOptions<S, E, Sel>,
	client?: Client<S>,
): UseListResult<InferQueryResult<S, E, Sel>> {
	type ResultType = InferQueryResult<S, E, Sel>;

	const lensClient = client ?? useLensClient<S>();
	const accessor = (lensClient as Record<string, unknown>)[entityName] as {
		list: (options?: unknown) => {
			value: { data: ResultType[] | null; loading: boolean; error: Error | null };
			subscribe: (cb: (value: unknown) => void) => () => void;
		};
	};

	const data = ref<ResultType[]>([]) as Ref<ResultType[]>;
	const loading = ref(true);
	const error = ref<Error | null>(null);

	// Get list signal
	const listSignal = accessor.list(options);

	// Set initial value
	data.value = listSignal.value.data ?? [];
	loading.value = listSignal.value.loading;
	error.value = listSignal.value.error;

	// Subscribe to changes
	const unsubscribe = listSignal.subscribe((value: unknown) => {
		const state = value as { data: ResultType[] | null; loading: boolean; error: Error | null };
		data.value = state.data ?? [];
		loading.value = state.loading;
		error.value = state.error;
	});

	// Cleanup on unmount
	onUnmounted(() => {
		unsubscribe();
	});

	const refetch = () => {
		accessor.list(options);
	};

	return {
		data,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// useMutation() - Mutation Composable
// =============================================================================

/**
 * Composable for executing mutations.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useMutation } from '@lens/vue';
 *
 * const { mutate: createUser, loading, error } = useMutation('User', 'create');
 *
 * const handleCreate = async () => {
 *   await createUser({ name: 'John', email: 'john@example.com' });
 * };
 * </script>
 *
 * <template>
 *   <button @click="handleCreate" :disabled="loading">
 *     Create User
 *   </button>
 * </template>
 * ```
 */
export function useMutation<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Op extends "create" | "update" | "delete",
>(
	entityName: E,
	operation: Op,
	client?: Client<S>,
): UseMutationResult<
	Op extends "create"
		? CreateInput<S[E], S>
		: Op extends "update"
			? UpdateMutationInput<S, E>
			: DeleteMutationInput,
	Op extends "delete" ? void : InferEntity<S[E], S>
> {
	const lensClient = client ?? useLensClient<S>();
	const accessor = (lensClient as Record<string, unknown>)[entityName] as {
		create: (data: CreateInput<S[E], S>) => Promise<{ data: InferEntity<S[E], S> }>;
		update: (id: string, data: unknown) => Promise<{ data: InferEntity<S[E], S> }>;
		delete: (id: string) => Promise<void>;
	};

	const loading = ref(false);
	const error = ref<Error | null>(null);
	const data = ref<InferEntity<S[E], S> | null>(null) as Ref<InferEntity<S[E], S> | null>;

	const mutate = async (input: unknown) => {
		loading.value = true;
		error.value = null;

		try {
			let result: unknown;

			switch (operation) {
				case "create":
					result = await accessor.create(input as CreateInput<S[E], S>);
					data.value = (result as { data: InferEntity<S[E], S> }).data;
					return (result as { data: InferEntity<S[E], S> }).data;

				case "update": {
					const { id, data: updateData } = input as UpdateMutationInput<S, E>;
					result = await accessor.update(id, updateData);
					data.value = (result as { data: InferEntity<S[E], S> }).data;
					return (result as { data: InferEntity<S[E], S> }).data;
				}

				case "delete": {
					const { id } = input as DeleteMutationInput;
					await accessor.delete(id);
					data.value = null;
					return undefined;
				}
			}
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
