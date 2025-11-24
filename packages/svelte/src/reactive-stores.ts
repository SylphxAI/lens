/**
 * @lens/svelte - Reactive Stores
 *
 * Svelte stores with fine-grained field-level reactivity using EntitySignal.
 * Provides minimal re-renders by tracking individual field subscriptions.
 */

import { readable, type Readable } from "svelte/store";
import type {
	ReactiveClient,
	Signal,
	EntityResult,
	ListResult,
	ReactiveInferQueryResult,
} from "@lens/client";
import type { SchemaDefinition, Select } from "@lens/core";
import { getReactiveLensClient } from "./context";

// =============================================================================
// Types
// =============================================================================

/** Reactive entity store options */
export interface ReactiveEntityStoreOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	select?: Sel;
}

/** Reactive list store options */
export interface ReactiveListStoreOptions<
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

/** Reactive entity store value - with field-level signals */
export interface ReactiveEntityStoreValue<T extends Record<string, unknown>> {
	/** Field-level signals for fine-grained reactivity */
	$: { readonly [K in keyof T]: Signal<T[K]> };
	/** Full entity value (computed from field signals) */
	value: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
}

/** Reactive list store value */
export interface ReactiveListStoreValue<T extends Record<string, unknown>> {
	/** Array of items with field-level signals */
	items: Array<{
		$: { readonly [K in keyof T]: Signal<T[K]> };
		value: T;
	}>;
	/** Combined list data */
	data: T[];
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
}

/** Reactive entity store type */
export type ReactiveEntityStore<T extends Record<string, unknown>> =
	Readable<ReactiveEntityStoreValue<T>>;

/** Reactive list store type */
export type ReactiveListStore<T extends Record<string, unknown>> =
	Readable<ReactiveListStoreValue<T>>;

// =============================================================================
// reactiveEntity() - Fine-grained Entity Store
// =============================================================================

/**
 * Create a readable store for a single entity with field-level reactivity.
 * Components can subscribe to individual fields to minimize re-renders.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { reactiveEntity } from '@lens/svelte';
 *
 *   const userStore = reactiveEntity('User', '123');
 *
 *   // Subscribe to specific field - only re-renders when name changes
 *   $: name = $userStore.$.name.value;
 *
 *   // Or use full value - re-renders when any field changes
 *   $: user = $userStore.value;
 * </script>
 *
 * <!-- Only re-renders when name changes -->
 * <h1>{name}</h1>
 *
 * <!-- Re-renders when any field changes -->
 * <p>{user?.email}</p>
 * ```
 */
export function reactiveEntity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	id: string,
	options?: ReactiveEntityStoreOptions<S, E, Sel>,
): ReactiveEntityStore<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	return readable<ReactiveEntityStoreValue<ResultType>>(
		{
			$: {} as { readonly [K in keyof ResultType]: Signal<ResultType[K]> },
			value: null,
			loading: true,
			error: null,
		},
		(set) => {
			const client = getReactiveLensClient<S>();
			const accessor = (client as Record<string, unknown>)[entityName] as {
				get: (id: string, options?: { select?: unknown }) => EntityResult<ResultType>;
			};

			// Get entity result
			const entityResult = accessor.get(id, options);

			// Set initial value
			set({
				$: entityResult.$,
				value: entityResult.value.value,
				loading: entityResult.loading.value,
				error: entityResult.error.value,
			});

			// Subscribe to metadata changes
			const unsubValue = entityResult.value.subscribe((value) => {
				set({
					$: entityResult.$,
					value,
					loading: entityResult.loading.value,
					error: entityResult.error.value,
				});
			});

			const unsubLoading = entityResult.loading.subscribe((loading) => {
				set({
					$: entityResult.$,
					value: entityResult.value.value,
					loading,
					error: entityResult.error.value,
				});
			});

			const unsubError = entityResult.error.subscribe((error) => {
				set({
					$: entityResult.$,
					value: entityResult.value.value,
					loading: entityResult.loading.value,
					error,
				});
			});

			// Cleanup
			return () => {
				unsubValue();
				unsubLoading();
				unsubError();
				entityResult.dispose();
			};
		},
	);
}

// =============================================================================
// reactiveList() - Fine-grained List Store
// =============================================================================

/**
 * Create a readable store for an entity list with fine-grained reactivity.
 * Each item has field-level signals for minimal re-renders.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { reactiveList } from '@lens/svelte';
 *
 *   const usersStore = reactiveList('User', {
 *     where: { isActive: true },
 *     take: 10,
 *   });
 * </script>
 *
 * {#each $usersStore.items as user}
 *   <!-- Each item only re-renders when its own fields change -->
 *   <div>
 *     <h2>{user.$.name.value}</h2>
 *     <p>{user.$.email.value}</p>
 *   </div>
 * {/each}
 * ```
 */
export function reactiveList<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: ReactiveListStoreOptions<S, E, Sel>,
): ReactiveListStore<ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>> {
	type ResultType = ReactiveInferQueryResult<S, E, Sel> & Record<string, unknown>;

	return readable<ReactiveListStoreValue<ResultType>>(
		{
			items: [],
			data: [],
			loading: true,
			error: null,
		},
		(set) => {
			const client = getReactiveLensClient<S>();
			const accessor = (client as Record<string, unknown>)[entityName] as {
				list: (options?: unknown) => ListResult<ResultType>;
			};

			// Get list result
			const listResult = accessor.list(options);

			// Set initial value
			set({
				items: listResult.items.map((item) => ({
					$: item.$,
					value: item.value.value,
				})),
				data: listResult.list.value,
				loading: listResult.loading.value,
				error: listResult.error.value,
			});

			// Subscribe to list changes
			const unsubList = listResult.list.subscribe((data) => {
				set({
					items: listResult.items.map((item) => ({
						$: item.$,
						value: item.value.value,
					})),
					data,
					loading: listResult.loading.value,
					error: listResult.error.value,
				});
			});

			const unsubLoading = listResult.loading.subscribe((loading) => {
				set({
					items: listResult.items.map((item) => ({
						$: item.$,
						value: item.value.value,
					})),
					data: listResult.list.value,
					loading,
					error: listResult.error.value,
				});
			});

			const unsubError = listResult.error.subscribe((error) => {
				set({
					items: listResult.items.map((item) => ({
						$: item.$,
						value: item.value.value,
					})),
					data: listResult.list.value,
					loading: listResult.loading.value,
					error,
				});
			});

			// Cleanup
			return () => {
				unsubList();
				unsubLoading();
				unsubError();
				listResult.dispose();
			};
		},
	);
}
