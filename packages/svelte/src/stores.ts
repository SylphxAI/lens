/**
 * @lens/svelte - Stores
 *
 * Svelte stores that wrap Lens client for reactive data access.
 * Integrates with Svelte's store contract (subscribe method).
 */

import { readable, type Readable } from "svelte/store";
import type { Client, InferQueryResult } from "@lens/client";
import type { SchemaDefinition, Select } from "@lens/core";
import { getLensClient } from "./context";

// =============================================================================
// Types
// =============================================================================

/** Entity store options */
export interface EntityStoreOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	select?: Sel;
}

/** List store options */
export interface ListStoreOptions<
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

/** Entity store value */
export interface EntityStoreValue<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
}

/** List store value */
export interface ListStoreValue<T> {
	data: T[];
	loading: boolean;
	error: Error | null;
}

/** Entity store type */
export type EntityStore<T> = Readable<EntityStoreValue<T>>;

/** List store type */
export type ListStore<T> = Readable<ListStoreValue<T>>;

// =============================================================================
// entity() - Single Entity Store
// =============================================================================

/**
 * Create a readable store for a single entity.
 * Automatically subscribes to entity changes and updates the store.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { entity } from '@lens/svelte';
 *
 *   const userStore = entity('User', '123', { select: { name: true, email: true } });
 * </script>
 *
 * {#if $userStore.loading}
 *   <p>Loading...</p>
 * {:else if $userStore.error}
 *   <p>Error: {$userStore.error.message}</p>
 * {:else if $userStore.data}
 *   <h1>{$userStore.data.name}</h1>
 *   <p>{$userStore.data.email}</p>
 * {/if}
 * ```
 */
export function entity<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	id: string,
	options?: EntityStoreOptions<S, E, Sel>,
	client?: Client<S>,
): EntityStore<InferQueryResult<S, E, Sel>> {
	type ResultType = InferQueryResult<S, E, Sel>;

	return readable<EntityStoreValue<ResultType>>(
		{ data: null, loading: true, error: null },
		(set) => {
			const lensClient = client ?? getLensClient<S>();
			const accessor = (lensClient as Record<string, unknown>)[entityName] as {
				get: (id: string, options?: { select?: unknown }) => {
					value: { data: ResultType | null; loading: boolean; error: Error | null };
					subscribe: (cb: (value: unknown) => void) => () => void;
				};
			};

			// Get entity signal
			const entitySignal = accessor.get(id, options);

			// Set initial value
			set({
				data: entitySignal.value.data,
				loading: entitySignal.value.loading,
				error: entitySignal.value.error,
			});

			// Subscribe to changes
			const unsubscribe = entitySignal.subscribe((value: unknown) => {
				const state = value as { data: ResultType | null; loading: boolean; error: Error | null };
				set({
					data: state.data,
					loading: state.loading,
					error: state.error,
				});
			});

			// Cleanup
			return () => {
				unsubscribe();
				lensClient.$store.release(entityName, id);
			};
		},
	);
}

// =============================================================================
// list() - Entity List Store
// =============================================================================

/**
 * Create a readable store for an entity list.
 * Automatically subscribes to list changes and updates the store.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { list } from '@lens/svelte';
 *
 *   const usersStore = list('User', {
 *     where: { isActive: true },
 *     orderBy: { name: 'asc' },
 *     take: 10,
 *   });
 * </script>
 *
 * {#if $usersStore.loading}
 *   <p>Loading...</p>
 * {:else}
 *   <ul>
 *     {#each $usersStore.data as user}
 *       <li>{user.name}</li>
 *     {/each}
 *   </ul>
 * {/if}
 * ```
 */
export function list<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Sel extends Select<S[E], S> | undefined = undefined,
>(
	entityName: E,
	options?: ListStoreOptions<S, E, Sel>,
	client?: Client<S>,
): ListStore<InferQueryResult<S, E, Sel>> {
	type ResultType = InferQueryResult<S, E, Sel>;

	return readable<ListStoreValue<ResultType>>(
		{ data: [], loading: true, error: null },
		(set) => {
			const lensClient = client ?? getLensClient<S>();
			const accessor = (lensClient as Record<string, unknown>)[entityName] as {
				list: (options?: unknown) => {
					value: { data: ResultType[] | null; loading: boolean; error: Error | null };
					subscribe: (cb: (value: unknown) => void) => () => void;
				};
			};

			// Get list signal
			const listSignal = accessor.list(options);

			// Set initial value
			set({
				data: listSignal.value.data ?? [],
				loading: listSignal.value.loading,
				error: listSignal.value.error,
			});

			// Subscribe to changes
			const unsubscribe = listSignal.subscribe((value: unknown) => {
				const state = value as { data: ResultType[] | null; loading: boolean; error: Error | null };
				set({
					data: state.data ?? [],
					loading: state.loading,
					error: state.error,
				});
			});

			// Cleanup
			return unsubscribe;
		},
	);
}
