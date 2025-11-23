/**
 * @lens/client - Client API
 *
 * Type-safe client for accessing schema entities.
 */

import type {
	Schema,
	SchemaDefinition,
	InferEntity,
	Select,
	InferSelected,
	CreateInput,
	UpdateInput,
	DeleteInput,
} from "@lens/core";
import { type Signal, computed } from "../signals/signal";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import type { Transport, TransportConfig } from "../transport/types";
import { WebSocketTransport } from "../transport/websocket";

// =============================================================================
// Types
// =============================================================================

/** Client configuration */
export interface ClientConfig {
	/** WebSocket URL */
	url?: string;
	/** Separate WebSocket URL */
	wsUrl?: string;
	/** HTTP URL for fallback */
	httpUrl?: string;
	/** Custom transport */
	transport?: Transport;
	/** Enable optimistic updates */
	optimistic?: boolean;
}

/** Query options */
export interface QueryOptions<S extends SchemaDefinition, E extends keyof S> {
	/** Field selection */
	select?: Select<S[E], S>;
}

/** List query options */
export interface ListOptions<S extends SchemaDefinition, E extends keyof S>
	extends QueryOptions<S, E> {
	/** Filter conditions */
	where?: Record<string, unknown>;
	/** Sorting */
	orderBy?: Record<string, "asc" | "desc">;
	/** Limit */
	take?: number;
	/** Offset */
	skip?: number;
}

/** Mutation result */
export interface MutationResult<T> {
	data: T;
	optimisticId?: string;
}

/** Entity accessor */
export interface EntityAccessor<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Entity = InferEntity<S[E], S>,
> {
	/** Get single entity by ID */
	get(
		input: { id: string },
		options?: QueryOptions<S, E>,
	): Signal<EntityState<Entity>>;

	/** List entities */
	list(input?: ListOptions<S, E>): Signal<EntityState<Entity[]>>;

	/** Create new entity */
	create(input: CreateInput<S[E], S>): Promise<MutationResult<Entity>>;

	/** Update entity */
	update(input: UpdateInput<S[E], S>): Promise<MutationResult<Entity>>;

	/** Delete entity */
	delete(input: DeleteInput): Promise<void>;
}

/** Client type */
export type Client<S extends SchemaDefinition> = {
	[E in keyof S & string]: EntityAccessor<S, E>;
} & {
	/** Underlying store */
	$store: ReactiveStore;
	/** Underlying transport */
	$transport: Transport;
	/** Connect to server */
	connect(): Promise<void>;
	/** Disconnect from server */
	disconnect(): void;
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
	transport: Transport,
	schema: Schema<S>,
): EntityAccessor<S, E> {
	type Entity = InferEntity<S[E], S>;

	return {
		get(
			input: { id: string },
			options?: QueryOptions<S, E>,
		): Signal<EntityState<Entity>> {
			const { id } = input;

			// Get or create entity signal
			const entitySignal = store.getEntity<Entity>(entityName, id);

			// Subscribe via transport if not already subscribed
			if (entitySignal.value.loading && entitySignal.value.data === null) {
				// Retain reference
				store.retain(entityName, id);

				// Subscribe to entity
				transport
					.subscribe({
						entity: entityName,
						id,
						select: options?.select as Record<string, unknown>,
					})
					.then((data) => {
						store.setEntity(entityName, id, data);
					})
					.catch((error) => {
						store.setEntityError(entityName, id, error);
					});
			}

			return entitySignal;
		},

		list(input?: ListOptions<S, E>): Signal<EntityState<Entity[]>> {
			// Create query key from input
			const queryKey = `${entityName}:list:${JSON.stringify(input ?? {})}`;

			// Get or create list signal
			const listSignal = store.getList<Entity>(queryKey);

			// Fetch if loading
			if (listSignal.value.loading && listSignal.value.data === null) {
				transport
					.query({
						entity: entityName,
						type: "list",
						...input,
					})
					.then((data) => {
						store.setList(queryKey, data as Entity[]);
					})
					.catch((error) => {
						// Handle error
						console.error("List query error:", error);
					});
			}

			return listSignal;
		},

		async create(input: CreateInput<S[E], S>): Promise<MutationResult<Entity>> {
			// Generate temporary ID for optimistic update
			const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
			const optimisticData = { id: tempId, ...input } as Entity & { id: string };

			// Apply optimistic update
			const optimisticId = store.applyOptimistic(entityName, "create", optimisticData);

			try {
				// Send mutation to server
				const result = await transport.mutate({
					entity: entityName,
					operation: "create",
					input,
				});

				// Confirm with server data (includes real ID)
				store.confirmOptimistic(optimisticId, result);

				// Remove temp entry, add real one
				store.removeEntity(entityName, tempId);
				const realData = result as Entity & { id: string };
				store.setEntity(entityName, realData.id, realData);

				return { data: realData, optimisticId };
			} catch (error) {
				// Rollback on error
				store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},

		async update(input: UpdateInput<S[E], S>): Promise<MutationResult<Entity>> {
			// Apply optimistic update
			const optimisticId = store.applyOptimistic(entityName, "update", input as Partial<Entity> & { id: string });

			try {
				// Send mutation to server
				const result = await transport.mutate({
					entity: entityName,
					operation: "update",
					input,
				});

				// Confirm with server data
				store.confirmOptimistic(optimisticId, result);

				return { data: result as Entity, optimisticId };
			} catch (error) {
				// Rollback on error
				store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},

		async delete(input: DeleteInput): Promise<void> {
			const { id } = input;

			// Apply optimistic update
			const optimisticId = store.applyOptimistic(entityName, "delete", { id });

			try {
				// Send mutation to server
				await transport.mutate({
					entity: entityName,
					operation: "delete",
					input,
				});

				// Confirm deletion
				store.confirmOptimistic(optimisticId);
				store.removeEntity(entityName, id);
			} catch (error) {
				// Rollback on error
				store.rollbackOptimistic(optimisticId);
				throw error;
			}
		},
	};
}

/**
 * Create a typed client from schema
 *
 * @example
 * ```typescript
 * const api = createClient<typeof schema>({
 *   url: 'ws://localhost:3000',
 * });
 *
 * // Type-safe entity access
 * const user = api.user.get({ id: '123' });
 * console.log(user.value?.name);
 *
 * // Mutations with optimistic updates
 * await api.user.update({ id: '123', name: 'New Name' });
 * ```
 */
export function createClient<S extends SchemaDefinition>(
	config: ClientConfig,
	schema?: Schema<S>,
): Client<S> {
	// Create store
	const store = new ReactiveStore({
		optimistic: config.optimistic ?? true,
	});

	// Create transport
	const transport: Transport =
		config.transport ??
		new WebSocketTransport({
			url: config.url ?? config.wsUrl ?? "ws://localhost:3000",
			httpUrl: config.httpUrl,
		});

	// Create client object
	const client = {
		$store: store,
		$transport: transport,
		connect: () => transport.connect(),
		disconnect: () => transport.disconnect(),
	} as Client<S>;

	// Create entity accessors using Proxy
	return new Proxy(client, {
		get(target, prop: string) {
			// Return internal properties
			if (prop.startsWith("$") || prop === "connect" || prop === "disconnect") {
				return target[prop as keyof typeof target];
			}

			// Create entity accessor on demand
			return createEntityAccessor(prop, store, transport, schema as Schema<S>);
		},
	});
}
