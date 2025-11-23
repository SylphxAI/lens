/**
 * @lens/client - Client API
 *
 * Type-safe client for accessing schema entities.
 * Uses Links (tRPC-style middleware) for transport.
 */

import type {
	Schema,
	SchemaDefinition,
	EntityDefinition,
	InferEntity,
	Select,
	InferSelected,
	CreateInput,
	WhereInput,
	OrderByInput,
} from "@lens/core";
import { type Signal } from "../signals/signal";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import {
	type Link,
	type LinkFn,
	type OperationResult,
	composeLinks,
	createOperationContext,
} from "../links";

// =============================================================================
// Types
// =============================================================================

/** Client configuration */
export interface ClientConfig<S extends SchemaDefinition = SchemaDefinition> {
	/** Schema definition */
	schema?: Schema<S>;
	/** Links (middleware chain) - last one should be terminal */
	links: Link[];
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/** Query options with optional select */
export interface QueryOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> {
	/** Field selection (return type inferred from this) */
	select?: Sel;
}

/** List query options with type-safe filtering */
export interface ListOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> extends QueryOptions<S, E, Sel> {
	/** Filter conditions (type-safe) */
	where?: WhereInput<S[E]>;
	/** Sorting (type-safe) */
	orderBy?: OrderByInput<S[E]> | OrderByInput<S[E]>[];
	/** Limit */
	take?: number;
	/** Offset */
	skip?: number;
	/** Cursor for cursor-based pagination */
	cursor?: { id: string };
}

/** Infer result type based on select option */
export type InferQueryResult<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined,
> = Sel extends Select<S[E], S>
	? InferSelected<S[E], Sel, S>
	: InferEntity<S[E], S>;

/** Mutation options */
export interface MutationOptions {
	/** Enable optimistic update (default: true) */
	optimistic?: boolean;
}

/** Mutation result */
export interface MutationResult<T> {
	/** Result data */
	data: T;
	/** Rollback function (only if optimistic) */
	rollback?: () => void;
}

/** Entity accessor with type-safe select inference */
export interface EntityAccessor<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Entity = InferEntity<S[E], S>,
> {
	/** Get single entity by ID (return type inferred from select) */
	get<Sel extends Select<S[E], S> | undefined = undefined>(
		id: string,
		options?: QueryOptions<S, E, Sel>,
	): Signal<EntityState<InferQueryResult<S, E, Sel>>>;

	/** List entities (return type inferred from select) */
	list<Sel extends Select<S[E], S> | undefined = undefined>(
		options?: ListOptions<S, E, Sel>,
	): Signal<EntityState<InferQueryResult<S, E, Sel>[]>>;

	/** Create new entity */
	create(
		data: CreateInput<S[E], S>,
		options?: MutationOptions,
	): Promise<MutationResult<Entity>>;

	/** Update entity */
	update(
		id: string,
		data: Partial<Omit<CreateInput<S[E], S>, "id">>,
		options?: MutationOptions,
	): Promise<MutationResult<Entity>>;

	/** Delete entity */
	delete(id: string, options?: MutationOptions): Promise<void>;

	/** Subscribe to entity updates */
	subscribe(id: string, callback: (data: Entity) => void): () => void;
}

/** Client type */
export type Client<S extends SchemaDefinition> = {
	[E in keyof S & string]: EntityAccessor<S, E>;
} & {
	/** Underlying store */
	$store: ReactiveStore;
	/** Execute raw operation */
	$execute: (
		type: "query" | "mutation",
		entity: string,
		op: string,
		input: unknown,
	) => Promise<OperationResult>;
};

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * Create entity accessor for a specific entity type
 */
function createEntityAccessor<
	S extends SchemaDefinition,
	E extends keyof S & string,
>(
	entityName: E,
	store: ReactiveStore,
	execute: (
		type: "query" | "mutation",
		op: string,
		input: unknown,
	) => Promise<OperationResult>,
	optimisticEnabled: boolean,
): EntityAccessor<S, E> {
	type Entity = InferEntity<S[E], S>;

	// Implementation uses Entity type, interface provides generic inference
	const accessor = {
		get(id: string, options?: { select?: unknown }): Signal<EntityState<Entity>> {
			// Get or create entity signal
			const entitySignal = store.getEntity<Entity>(entityName, id);

			// Fetch if loading
			if (entitySignal.value.loading && entitySignal.value.data === null) {
				store.retain(entityName, id);

				execute("query", "get", { id, select: options?.select })
					.then((result) => {
						if (result.error) {
							store.setEntityError(entityName, id, result.error);
						} else {
							store.setEntity(entityName, id, result.data);
						}
					})
					.catch((error) => {
						store.setEntityError(entityName, id, error);
					});
			}

			return entitySignal;
		},

		list(options?: { select?: unknown; where?: unknown; orderBy?: unknown; take?: number; skip?: number; cursor?: unknown }): Signal<EntityState<Entity[]>> {
			const queryKey = `${entityName}:list:${JSON.stringify(options ?? {})}`;
			const listSignal = store.getList<Entity>(queryKey);

			if (listSignal.value.loading && listSignal.value.data === null) {
				execute("query", "list", options ?? {})
					.then((result) => {
						if (result.error) {
							console.error("List query error:", result.error);
						} else {
							store.setList(queryKey, result.data as Entity[]);
						}
					})
					.catch((error) => {
						console.error("List query error:", error);
					});
			}

			return listSignal;
		},

		async create(
			data: CreateInput<S[E], S>,
			options?: MutationOptions,
		): Promise<MutationResult<Entity>> {
			const useOptimistic = options?.optimistic ?? optimisticEnabled;

			// Optimistic update
			let optimisticId: string | undefined;
			let tempId: string | undefined;

			if (useOptimistic) {
				tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
				const optimisticData = { id: tempId, ...data } as Entity & { id: string };
				optimisticId = store.applyOptimistic(entityName, "create", optimisticData);
			}

			try {
				const result = await execute("mutation", "create", { data });

				if (result.error) {
					if (optimisticId) store.rollbackOptimistic(optimisticId);
					throw result.error;
				}

				const realData = result.data as Entity & { id: string };

				if (optimisticId) {
					store.confirmOptimistic(optimisticId, realData);
					if (tempId) store.removeEntity(entityName, tempId);
					store.setEntity(entityName, realData.id, realData);
				}

				return {
					data: realData,
					rollback: optimisticId
						? () => store.rollbackOptimistic(optimisticId!)
						: undefined,
				};
			} catch (error) {
				if (optimisticId) store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},

		async update(
			id: string,
			data: Partial<Omit<CreateInput<S[E], S>, "id">>,
			options?: MutationOptions,
		): Promise<MutationResult<Entity>> {
			const useOptimistic = options?.optimistic ?? optimisticEnabled;

			let optimisticId: string | undefined;

			if (useOptimistic) {
				optimisticId = store.applyOptimistic(entityName, "update", {
					id,
					...data,
				} as Partial<Entity> & { id: string });
			}

			try {
				const result = await execute("mutation", "update", { id, ...data });

				if (result.error) {
					if (optimisticId) store.rollbackOptimistic(optimisticId);
					throw result.error;
				}

				if (optimisticId) {
					store.confirmOptimistic(optimisticId, result.data);
				}

				return {
					data: result.data as Entity,
					rollback: optimisticId
						? () => store.rollbackOptimistic(optimisticId!)
						: undefined,
				};
			} catch (error) {
				if (optimisticId) store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},

		async delete(id: string, options?: MutationOptions): Promise<void> {
			const useOptimistic = options?.optimistic ?? optimisticEnabled;

			let optimisticId: string | undefined;

			if (useOptimistic) {
				optimisticId = store.applyOptimistic(entityName, "delete", { id });
			}

			try {
				const result = await execute("mutation", "delete", { id });

				if (result.error) {
					if (optimisticId) store.rollbackOptimistic(optimisticId);
					throw result.error;
				}

				if (optimisticId) {
					store.confirmOptimistic(optimisticId);
				}
				store.removeEntity(entityName, id);
			} catch (error) {
				if (optimisticId) store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},

		subscribe(id: string, callback: (data: Entity) => void): () => void {
			const signal = this.get(id);

			// Watch for changes
			let prevData = signal.value.data;
			const checkChange = () => {
				const newData = signal.value.data;
				if (newData && newData !== prevData) {
					prevData = newData;
					callback(newData);
				}
			};

			// Initial call if data exists
			if (signal.value.data) {
				callback(signal.value.data);
			}

			// Poll for changes (in a real app, use effect or signal subscription)
			const interval = setInterval(checkChange, 100);

			return () => {
				clearInterval(interval);
				store.release(entityName, id);
			};
		},
	};

	// Cast to interface type which provides generic inference
	return accessor as EntityAccessor<S, E>;
}

/**
 * Create a typed client from schema
 *
 * @example
 * ```typescript
 * import { createClient, loggerLink, httpLink } from "@lens/client";
 *
 * const client = createClient({
 *   schema,
 *   links: [
 *     loggerLink(),
 *     httpLink({ url: "http://localhost:3000/api" }),
 *   ],
 * });
 *
 * // Type-safe entity access
 * const userSignal = client.User.get("123");
 * console.log(userSignal.value.data?.name);
 *
 * // Mutations with optimistic updates
 * const { data, rollback } = await client.User.update("123", { name: "New" });
 * ```
 */
export function createClient<S extends SchemaDefinition>(
	config: ClientConfig<S>,
): Client<S> {
	const { links, optimistic = true } = config;

	// Validate links
	if (!links || links.length === 0) {
		throw new Error("At least one link is required");
	}

	// Initialize links
	const initializedLinks: LinkFn[] = links.map((link) => link());

	// Create store
	const store = new ReactiveStore({ optimistic });

	// Compose link chain (last link is terminal, doesn't call next)
	const terminalLink = initializedLinks[initializedLinks.length - 1];
	const middlewareLinks = initializedLinks.slice(0, -1);

	const executeChain = composeLinks(middlewareLinks, async (op) => {
		const result = terminalLink(op, () => Promise.resolve({ error: new Error("No next link") }));
		return result instanceof Promise ? result : Promise.resolve(result);
	});

	// Execute function
	const execute = async (
		type: "query" | "mutation",
		entity: string,
		op: string,
		input: unknown,
	): Promise<OperationResult> => {
		const context = createOperationContext(type, entity, op, input);
		return executeChain(context);
	};

	// Create client object
	const client = {
		$store: store,
		$execute: (type: "query" | "mutation", entity: string, op: string, input: unknown) =>
			execute(type, entity, op, input),
	} as Client<S>;

	// Create entity accessors using Proxy
	return new Proxy(client, {
		get(target, prop: string) {
			// Return internal properties
			if (prop.startsWith("$")) {
				return target[prop as keyof typeof target];
			}

			// Create entity accessor on demand
			return createEntityAccessor(
				prop,
				store,
				(type, op, input) => execute(type, prop, op, input),
				optimistic,
			);
		},
	});
}
