/**
 * @lens/vue - Reactive Composables
 *
 * Vue composables with fine-grained field-level reactivity using EntitySignal.
 * Provides minimal re-renders by tracking individual field subscriptions.
 */

import { ref, onUnmounted, shallowRef, type Ref, type ShallowRef } from "vue";
import type {
	ReactiveClient,
	Signal,
	EntityResult,
	ListResult,
	ReactiveInferQueryResult,
} from "@lens/client";
import type { SchemaDefinition, Select } from "@lens/core";
import { useReactiveLensClient } from "./plugin";

// =============================================================================
// Types
// =============================================================================

/** Reactive entity composable options */
export interface UseReactiveEntityOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	select?: Sel;
}

/** Reactive list composable options */
export interface UseReactiveListOptions<
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

/** Reactive entity composable result */
export interface UseReactiveEntityResult<T extends Record<string, unknown>> {
	/** Field-level signals for fine-grained reactivity */
	$: ShallowRef<{ readonly [K in keyof T]: Signal<T[K]> }>;
	/** Full entity value */
	value: Ref<T | null>;
	/** Loading state */
	loading: Ref<boolean>;
	/** Error state */
	error: Ref<Error | null>;
}

/** Reactive list composable result */
export interface UseReactiveListResult<T extends Record<string, unknown>> {
	/** Array of items with field-level signals */
	items: ShallowRef<
		Array<{
			$: { readonly [K in keyof T]: Signal<T[K]> };
			value: T;
		}>
	>;
	/** Combined list data */
	data: Ref<T[]>;
	/** Loading state */
	loading: Ref<boolean>;
	/** Error state */
	error: Ref<Error | null>;
}

// =============================================================================
// useReactiveEntity() - Fine-grained Entity Composable
// =============================================================================

/**
 * Composable for a single entity with field-level reactivity.
 * Components can access individual fields to minimize re-renders.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useReactiveEntity } from '@lens/vue';
 *
 * const user = useReactiveEntity('User', '123');
 *
 * // Access specific field - only re-renders when name changes
 * const name = computed(() => user.$.value.name.value);
 *
 * // Or use full value - re-renders when any field changes
 * const fullUser = user.value;
 * </script>
 *
 * <template>
 *   <!-- Only re-renders when name changes -->
 *   <h1>{{ user.$.name.value }}</h1>
 *
 *   <!-- Re-renders when any field changes -->
 *   <p>{{ user.value?.email }}</p>
 * </template>
 * ```
 */
export function useReactiveEntity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	id: string,
	options?: UseReactiveEntityOptions<S, E, Sel>,
	client?: ReactiveClient<S>,
): UseReactiveEntityResult<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	const lensClient = client ?? useReactiveLensClient<S>();
	const accessor = (lensClient as Record<string, unknown>)[entityName] as {
		get: (id: string, options?: { select?: unknown }) => EntityResult<ResultType>;
	};

	// Get entity result
	const entityResult = accessor.get(id, options);

	const $ = shallowRef(entityResult.$);
	const value = ref<ResultType | null>(entityResult.value.value);
	const loading = ref(entityResult.loading.value);
	const error = ref<Error | null>(entityResult.error.value);

	// Subscribe to metadata changes
	const unsubValue = entityResult.value.subscribe((v) => {
		value.value = v;
	});

	const unsubLoading = entityResult.loading.subscribe((v) => {
		loading.value = v;
	});

	const unsubError = entityResult.error.subscribe((v) => {
		error.value = v;
	});

	// Cleanup on unmount
	onUnmounted(() => {
		unsubValue();
		unsubLoading();
		unsubError();
		entityResult.dispose();
	});

	return {
		$,
		value,
		loading,
		error,
	};
}

// =============================================================================
// useReactiveList() - Fine-grained List Composable
// =============================================================================

/**
 * Composable for an entity list with fine-grained reactivity.
 * Each item has field-level signals for minimal re-renders.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useReactiveList } from '@lens/vue';
 *
 * const users = useReactiveList('User', {
 *   where: { isActive: true },
 *   take: 10,
 * });
 * </script>
 *
 * <template>
 *   <!-- Each item only re-renders when its own fields change -->
 *   <div v-for="user in users.items.value" :key="user.value.id">
 *     <h2>{{ user.$.name.value }}</h2>
 *     <p>{{ user.$.email.value }}</p>
 *   </div>
 * </template>
 * ```
 */
export function useReactiveList<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: UseReactiveListOptions<S, E, Sel>,
	client?: ReactiveClient<S>,
): UseReactiveListResult<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	const lensClient = client ?? useReactiveLensClient<S>();
	const accessor = (lensClient as Record<string, unknown>)[entityName] as {
		list: (options?: unknown) => ListResult<ResultType>;
	};

	// Get list result
	const listResult = accessor.list(options);

	const items = shallowRef(
		listResult.items.map((item) => ({
			$: item.$,
			value: item.value.value,
		})),
	);
	const data = ref<ResultType[]>(listResult.list.value);
	const loading = ref(listResult.loading.value);
	const error = ref<Error | null>(listResult.error.value);

	// Subscribe to list changes
	const unsubList = listResult.list.subscribe((v) => {
		data.value = v;
		items.value = listResult.items.map((item) => ({
			$: item.$,
			value: item.value.value,
		}));
	});

	const unsubLoading = listResult.loading.subscribe((v) => {
		loading.value = v;
	});

	const unsubError = listResult.error.subscribe((v) => {
		error.value = v;
	});

	// Cleanup on unmount
	onUnmounted(() => {
		unsubList();
		unsubLoading();
		unsubError();
		listResult.dispose();
	});

	return {
		items,
		data,
		loading,
		error,
	};
}
