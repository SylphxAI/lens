/**
 * @sylphx/lens-vue - Composables
 *
 * Vue composables for Lens queries and mutations.
 * Uses Vue's Composition API for reactive state management.
 */

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { onUnmounted, type Ref, ref, type ShallowRef, shallowRef, watch } from "vue";

// =============================================================================
// Query Input Types
// =============================================================================

/** Query input - can be a query, null/undefined, or an accessor function */
export type QueryInput<T> =
	| QueryResult<T>
	| null
	| undefined
	| (() => QueryResult<T> | null | undefined);

/** Helper to resolve query input (handles accessor functions) */
function resolveQuery<T>(input: QueryInput<T>): QueryResult<T> | null | undefined {
	return typeof input === "function" ? input() : input;
}

// =============================================================================
// Types
// =============================================================================

/** Query result with reactive refs */
export interface UseQueryResult<T> {
	/** Reactive data ref */
	data: ShallowRef<T | null>;
	/** Reactive loading state */
	loading: Ref<boolean>;
	/** Reactive error state */
	error: ShallowRef<Error | null>;
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation result with reactive refs */
export interface UseMutationResult<TInput, TOutput> {
	/** Reactive data ref */
	data: ShallowRef<TOutput | null>;
	/** Reactive loading state */
	loading: Ref<boolean>;
	/** Reactive error state */
	error: ShallowRef<Error | null>;
	/** Execute the mutation */
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	/** Reset state */
	reset: () => void;
}

/** Lazy query result */
export interface UseLazyQueryResult<T> {
	/** Reactive data ref */
	data: ShallowRef<T | null>;
	/** Reactive loading state */
	loading: Ref<boolean>;
	/** Reactive error state */
	error: ShallowRef<Error | null>;
	/** Execute the query */
	execute: () => Promise<T>;
	/** Reset state */
	reset: () => void;
}

/** Query options */
export interface UseQueryOptions {
	/** Skip the query (don't execute) */
	skip?: boolean | Ref<boolean>;
}

/** Mutation function type */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<MutationResult<TOutput>>;

// =============================================================================
// useQuery
// =============================================================================

/**
 * Create a reactive query from a QueryResult.
 * Automatically subscribes to updates and manages cleanup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useQuery } from '@sylphx/lens-vue';
 *
 * const props = defineProps<{ userId: string }>();
 * const { data, loading, error } = useQuery(
 *   () => client.queries.getUser({ id: props.userId })
 * );
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <div v-else-if="error">Error: {{ error.message }}</div>
 *   <h1 v-else>{{ data?.name }}</h1>
 * </template>
 *
 * // Conditional query (null when condition not met)
 * const { data } = useQuery(
 *   () => sessionId.value ? client.session.get({ id: sessionId.value }) : null
 * );
 * ```
 */
export function useQuery<T>(
	queryInput: QueryInput<T>,
	options?: UseQueryOptions,
): UseQueryResult<T> {
	const data = shallowRef<T | null>(null);
	const loading = ref(true);
	const error = shallowRef<Error | null>(null);

	let unsubscribe: (() => void) | null = null;

	const executeQuery = () => {
		const skip = typeof options?.skip === "object" ? options.skip.value : options?.skip;
		const query = resolveQuery(queryInput);

		// Handle null/undefined query or skip
		if (skip || query == null) {
			data.value = null;
			loading.value = false;
			error.value = null;
			return;
		}

		loading.value = true;
		error.value = null;

		// Subscribe to updates
		unsubscribe = query.subscribe((value) => {
			data.value = value;
			loading.value = false;
			error.value = null;
		});

		// Handle initial load via promise
		query.then(
			(value) => {
				data.value = value;
				loading.value = false;
				error.value = null;
			},
			(err) => {
				error.value = err instanceof Error ? err : new Error(String(err));
				loading.value = false;
			},
		);
	};

	// Execute immediately
	executeQuery();

	// Watch for skip changes
	if (options?.skip && typeof options.skip === "object") {
		watch(options.skip, (newSkip, oldSkip) => {
			if (oldSkip && !newSkip) {
				// Was skipped, now should execute
				if (unsubscribe) {
					unsubscribe();
					unsubscribe = null;
				}
				executeQuery();
			}
		});
	}

	// Cleanup on unmount
	onUnmounted(() => {
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
// useMutation
// =============================================================================

/**
 * Create a reactive mutation with loading/error state.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useMutation } from '@sylphx/lens-vue';
 *
 * const { mutate, loading, error } = useMutation(client.mutations.createPost);
 *
 * async function handleSubmit() {
 *   try {
 *     const result = await mutate({ title: 'Hello World' });
 *     console.log('Created:', result.data);
 *   } catch (err) {
 *     console.error('Failed:', err);
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button @click="handleSubmit" :disabled="loading">
 *     {{ loading ? 'Creating...' : 'Create' }}
 *   </button>
 *   <p v-if="error" class="error">{{ error.message }}</p>
 * </template>
 * ```
 */
export function useMutation<TInput, TOutput>(
	mutationFn: MutationFn<TInput, TOutput>,
): UseMutationResult<TInput, TOutput> {
	const data = shallowRef<TOutput | null>(null);
	const loading = ref(false);
	const error = shallowRef<Error | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		loading.value = true;
		error.value = null;

		try {
			const result = await mutationFn(input);
			data.value = result.data;
			loading.value = false;
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			error.value = mutationError;
			loading.value = false;
			throw mutationError;
		}
	};

	const reset = () => {
		data.value = null;
		loading.value = false;
		error.value = null;
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
// useLazyQuery
// =============================================================================

/**
 * Create a lazy query that executes on demand.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { useLazyQuery } from '@sylphx/lens-vue';
 *
 * const searchTerm = ref('');
 * const { data, loading, execute } = useLazyQuery(
 *   () => client.queries.searchUsers({ query: searchTerm.value })
 * );
 *
 * async function handleSearch() {
 *   const results = await execute();
 *   console.log('Found:', results);
 * }
 * </script>
 *
 * <template>
 *   <input v-model="searchTerm" />
 *   <button @click="handleSearch" :disabled="loading">Search</button>
 *   <ul v-if="data">
 *     <li v-for="user in data" :key="user.id">{{ user.name }}</li>
 *   </ul>
 * </template>
 *
 * // Conditional query (null when condition not met)
 * const { execute, data } = useLazyQuery(
 *   () => sessionId.value ? client.session.get({ id: sessionId.value }) : null
 * );
 * ```
 */
export function useLazyQuery<T>(queryInput: QueryInput<T>): UseLazyQueryResult<T> {
	const data = shallowRef<T | null>(null);
	const loading = ref(false);
	const error = shallowRef<Error | null>(null);

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
			loading.value = false;
			return result;
		} catch (err) {
			const queryError = err instanceof Error ? err : new Error(String(err));
			error.value = queryError;
			loading.value = false;
			throw queryError;
		}
	};

	const reset = () => {
		data.value = null;
		loading.value = false;
		error.value = null;
	};

	return {
		data,
		loading,
		error,
		execute,
		reset,
	};
}
