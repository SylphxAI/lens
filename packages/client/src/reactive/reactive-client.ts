/**
 * @lens/client - ReactiveClient
 *
 * Reactive client with fine-grained field-level reactivity.
 * Returns EntitySignals with field-level signals ($.field) and computed value.
 *
 * Optimistic updates are CORE BEHAVIOR - mutations are optimistic by default.
 */

import type {
	SchemaDefinition,
	InferEntity,
	Select,
	InferSelected,
	CreateInput,
	WhereInput,
	OrderByInput,
	CursorInput,
	CreateManyResult,
	UpdateManyResult,
	DeleteManyResult,
} from "@lens/core";
import { EntitySignal } from "./entity-signal";
import { SubscriptionManager, type SubscriptionTransport } from "./subscription-manager";
import { QueryResolver, type QueryTransport } from "./query-resolver";
import { type Signal, computed } from "../signals/signal";
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

/** Reactive client configuration */
export interface ReactiveClientConfig<S extends SchemaDefinition = SchemaDefinition> {
	/** Links (middleware chain) - last one should be terminal */
	links: Link[];
	/** WebSocket URL for real-time subscriptions */
	subscriptionUrl?: string;
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

/** List query options */
export interface ListOptions<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined = undefined,
> extends QueryOptions<S, E, Sel> {
	where?: WhereInput<S[E]>;
	orderBy?: OrderByInput<S[E]> | OrderByInput<S[E]>[];
	take?: number;
	skip?: number;
	cursor?: CursorInput<S[E]>;
}

/** Infer result type based on select option */
export type InferQueryResult<
	S extends SchemaDefinition,
	E extends keyof S,
	Sel extends Select<S[E], S> | undefined,
> = Sel extends Select<S[E], S>
	? InferSelected<S[E], Sel, S>
	: InferEntity<S[E], S>;

/** Mutation result */
export interface MutationResult<T> {
	data: T;
	rollback?: () => void;
}

/** Entity result with fine-grained reactivity */
export interface EntityResult<T extends Record<string, unknown>> {
	/** Field-level signals - use for fine-grained reactivity */
	$: { readonly [K in keyof T]: Signal<T[K]> };
	/** Full entity value (computed from fields) - use for coarse-grained */
	value: Signal<T>;
	/** Loading state */
	loading: Signal<boolean>;
	/** Error state */
	error: Signal<Error | null>;
	/** Dispose this subscription */
	dispose: () => void;
}

/** List result with fine-grained reactivity */
export interface ListResult<T extends Record<string, unknown>> {
	/** Array of entity signals */
	items: EntityResult<T>[];
	/** Combined list signal */
	list: Signal<T[]>;
	/** Loading state */
	loading: Signal<boolean>;
	/** Error state */
	error: Signal<Error | null>;
	/** Dispose all subscriptions */
	dispose: () => void;
}

/** Reactive entity accessor */
export interface ReactiveEntityAccessor<
	S extends SchemaDefinition,
	E extends keyof S & string,
	Entity extends Record<string, unknown> = InferEntity<S[E], S> & Record<string, unknown>,
> {
	/** Get single entity - returns EntitySignal with fine-grained reactivity */
	get<Sel extends Select<S[E], S> | undefined = undefined>(
		id: string,
		options?: QueryOptions<S, E, Sel>,
	): EntityResult<InferQueryResult<S, E, Sel> & Record<string, unknown>>;

	/** List entities */
	list<Sel extends Select<S[E], S> | undefined = undefined>(
		options?: ListOptions<S, E, Sel>,
	): ListResult<InferQueryResult<S, E, Sel> & Record<string, unknown>>;

	/** Create entity (optimistic by default) */
	create(data: CreateInput<S[E], S>): Promise<MutationResult<Entity>>;

	/** Update entity (optimistic by default) */
	update(
		id: string,
		data: Partial<Omit<CreateInput<S[E], S>, "id">>,
	): Promise<MutationResult<Entity>>;

	/** Delete entity (optimistic by default) */
	delete(id: string): Promise<void>;

	/** Batch create */
	createMany(args: { data: CreateInput<S[E], S>[]; skipDuplicates?: boolean }): Promise<CreateManyResult>;

	/** Batch update */
	updateMany(args: { where: WhereInput<S[E]>; data: Partial<Omit<CreateInput<S[E], S>, "id">> }): Promise<UpdateManyResult>;

	/** Batch delete */
	deleteMany(args: { where: WhereInput<S[E]> }): Promise<DeleteManyResult>;
}

/** Reactive client type */
export type ReactiveClient<S extends SchemaDefinition> = {
	[E in keyof S & string]: ReactiveEntityAccessor<S, E>;
} & {
	/** Subscription manager */
	$subscriptions: SubscriptionManager;
	/** Query resolver */
	$resolver: QueryResolver;
	/** Set real-time transport */
	$setSubscriptionTransport: (transport: SubscriptionTransport) => void;
	/** Execute raw operation */
	$execute: (
		type: "query" | "mutation",
		entity: string,
		op: string,
		input: unknown,
	) => Promise<OperationResult>;
	/** Destroy client and cleanup */
	$destroy: () => void;
};

// =============================================================================
// Optimistic Updates (Core Behavior)
// =============================================================================

interface OptimisticEntry {
	entity: string;
	id: string;
	operation: "create" | "update" | "delete";
	previousData: Record<string, unknown> | null;
}

/** Optimistic update tracking - core behavior, not a plugin */
class OptimisticTracker {
	private pending = new Map<string, OptimisticEntry>();
	private counter = 0;

	constructor(private subscriptions: SubscriptionManager) {}

	/** Apply optimistic update immediately */
	apply(
		entity: string,
		id: string,
		operation: "create" | "update" | "delete",
		data: Record<string, unknown>,
	): string {
		const optId = `opt_${++this.counter}`;

		// Get current data for rollback
		const signal = this.subscriptions.getSignal(entity, id);
		const previousData = signal?.value.value ?? null;

		// Store for potential rollback
		this.pending.set(optId, { entity, id, operation, previousData });

		// Apply optimistic update to subscription
		if (operation === "delete") {
			// Mark as deleted (signal will show null)
			const sub = this.subscriptions.getOrCreateSubscription(entity, id, {});
			sub.signal.setFields({ __deleted: true } as Record<string, unknown>);
		} else {
			// Create or update
			const sub = this.subscriptions.getOrCreateSubscription(entity, id, data);
			if (operation === "update" && previousData) {
				// Merge update into existing data
				sub.signal.setFields({ ...previousData, ...data });
			} else {
				sub.signal.setFields(data);
			}
		}

		return optId;
	}

	/** Confirm optimistic update with server response */
	confirm(optId: string, serverData?: Record<string, unknown>): void {
		const entry = this.pending.get(optId);
		if (!entry) return;

		// Update with authoritative server data
		if (serverData && entry.operation !== "delete") {
			const sub = this.subscriptions.getOrCreateSubscription(entry.entity, entry.id, serverData);
			sub.signal.setFields(serverData);
		}

		this.pending.delete(optId);
	}

	/** Rollback optimistic update on failure */
	rollback(optId: string): void {
		const entry = this.pending.get(optId);
		if (!entry) return;

		// Restore previous data
		if (entry.previousData) {
			const sub = this.subscriptions.getOrCreateSubscription(entry.entity, entry.id, entry.previousData);
			sub.signal.setFields(entry.previousData);
		} else if (entry.operation === "create") {
			// Was a create - remove the optimistic entity
			// TODO: Add method to remove from subscription manager
		}

		this.pending.delete(optId);
	}
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create reactive entity accessor
 */
function createReactiveEntityAccessor<
	S extends SchemaDefinition,
	E extends keyof S & string,
>(
	entityName: E,
	subscriptions: SubscriptionManager,
	resolver: QueryResolver,
	optimistic: OptimisticTracker,
	execute: (type: "query" | "mutation", op: string, input: unknown) => Promise<OperationResult>,
): ReactiveEntityAccessor<S, E> {
	type Entity = InferEntity<S[E], S> & Record<string, unknown>;

	// Track active subscriptions for cleanup
	const activeQueries = new Map<string, EntitySignal<Record<string, unknown>>>();

	return {
		get<Sel extends Select<S[E], S> | undefined = undefined>(
			id: string,
			options?: QueryOptions<S, E, Sel>,
		): EntityResult<InferQueryResult<S, E, Sel> & Record<string, unknown>> {
			type ResultType = InferQueryResult<S, E, Sel> & Record<string, unknown>;

			// Extract field names from select
			const fields = options?.select ? Object.keys(options.select) : undefined;

			// Resolve query (may derive from existing or fetch)
			const queryPromise = resolver.resolveEntity<ResultType>(entityName, id, fields);

			// Create loading signal while we resolve
			let entitySignal: EntitySignal<ResultType> | null = null;
			let queryKey: string | null = null;

			// Handle async resolution
			queryPromise
				.then((result) => {
					entitySignal = result.signal;
					queryKey = result.key;
					activeQueries.set(queryKey, result.signal as EntitySignal<Record<string, unknown>>);
				})
				.catch((error) => {
					console.error(`Failed to resolve entity ${entityName}:${id}`, error);
				});

			// For synchronous API, check if already cached
			const existingSignal = subscriptions.getSignal<ResultType>(entityName, id);
			if (existingSignal) {
				entitySignal = existingSignal;
			} else {
				// Create placeholder signal - will be updated when query resolves
				const placeholderData = {} as ResultType;
				const sub = subscriptions.getOrCreateSubscription<ResultType>(
					entityName,
					id,
					placeholderData,
				);
				entitySignal = sub.signal;
				entitySignal.loading.value = true;

				// Subscribe to fields
				if (fields) {
					for (const field of fields) {
						subscriptions.subscribeField(entityName, id, field);
					}
				} else {
					subscriptions.subscribeFullEntity(entityName, id);
				}

				// Fetch data
				execute("query", "get", { id, select: options?.select })
					.then((result) => {
						if (result.error) {
							entitySignal!.error.value = result.error;
						} else {
							const data = result.data as ResultType;
							entitySignal!.setFields(data);
						}
					})
					.catch((error) => {
						entitySignal!.error.value = error;
					})
					.finally(() => {
						entitySignal!.loading.value = false;
					});
			}

			return {
				$: entitySignal.$,
				value: entitySignal.value,
				loading: entitySignal.loading,
				error: entitySignal.error,
				dispose: () => {
					if (queryKey) {
						resolver.releaseQuery(queryKey);
						activeQueries.delete(queryKey);
					} else if (fields) {
						for (const field of fields) {
							subscriptions.unsubscribeField(entityName, id, field);
						}
					} else {
						subscriptions.unsubscribeFullEntity(entityName, id);
					}
				},
			};
		},

		list<Sel extends Select<S[E], S> | undefined = undefined>(
			options?: ListOptions<S, E, Sel>,
		): ListResult<InferQueryResult<S, E, Sel> & Record<string, unknown>> {
			type ResultType = InferQueryResult<S, E, Sel> & Record<string, unknown>;

			const items: EntityResult<ResultType>[] = [];
			const loadingSignal = { value: true } as Signal<boolean>;
			const errorSignal = { value: null } as Signal<Error | null>;

			// Resolve list query
			const queryPromise = resolver.resolveList<ResultType>(entityName, {
				where: options?.where as Record<string, unknown>,
				orderBy: options?.orderBy as Record<string, "asc" | "desc">,
				take: options?.take,
				skip: options?.skip,
				fields: options?.select ? Object.keys(options.select) : undefined,
			});

			queryPromise
				.then((result) => {
					// Create EntityResult for each signal
					for (const signal of result.signals) {
						items.push({
							$: signal.$,
							value: signal.value,
							loading: signal.loading,
							error: signal.error,
							dispose: () => {
								const data = signal.value.value;
								const id = (data as { id?: string }).id;
								if (id) {
									subscriptions.unsubscribeFullEntity(entityName, id);
								}
							},
						});
					}
					(loadingSignal as { value: boolean }).value = false;
				})
				.catch((error) => {
					(errorSignal as { value: Error | null }).value = error;
					(loadingSignal as { value: boolean }).value = false;
				});

			// Create combined list signal
			const list = computed(() => items.map((item) => item.value.value));

			return {
				items,
				list,
				loading: loadingSignal,
				error: errorSignal,
				dispose: () => {
					for (const item of items) {
						item.dispose();
					}
				},
			};
		},

		async create(data: CreateInput<S[E], S>): Promise<MutationResult<Entity>> {
			const entityData = data as unknown as Entity;
			const id = (entityData as { id?: string }).id;

			// Apply optimistic update if we have an ID (core behavior)
			let optId = "";
			if (id) {
				optId = optimistic.apply(entityName, id, "create", entityData);
			}

			try {
				const result = await execute("mutation", "create", { data });
				if (result.error) throw result.error;

				const entity = result.data as Entity;
				const serverId = (entity as { id?: string }).id;

				// Confirm optimistic update with server data
				if (optId) {
					optimistic.confirm(optId, entity);
				} else if (serverId) {
					// No optimistic update, just update subscription
					const sub = subscriptions.getOrCreateSubscription(entityName, serverId, entity);
					sub.signal.setFields(entity);
				}

				return {
					data: entity,
					rollback: optId ? () => optimistic.rollback(optId) : undefined,
				};
			} catch (error) {
				// Rollback on failure
				if (optId) {
					optimistic.rollback(optId);
				}
				throw error;
			}
		},

		async update(
			id: string,
			data: Partial<Omit<CreateInput<S[E], S>, "id">>,
		): Promise<MutationResult<Entity>> {
			// Apply optimistic update (core behavior)
			const optId = optimistic.apply(entityName, id, "update", data as Record<string, unknown>);

			try {
				const result = await execute("mutation", "update", { id, ...data });
				if (result.error) throw result.error;

				const entity = result.data as Entity;

				// Confirm optimistic update with server data (server is authoritative)
				optimistic.confirm(optId, entity);

				return {
					data: entity,
					rollback: () => optimistic.rollback(optId),
				};
			} catch (error) {
				// Rollback on failure
				optimistic.rollback(optId);
				throw error;
			}
		},

		async delete(id: string): Promise<void> {
			// Apply optimistic delete (core behavior)
			const optId = optimistic.apply(entityName, id, "delete", {});

			try {
				const result = await execute("mutation", "delete", { id });
				if (result.error) throw result.error;

				// Confirm optimistic delete
				optimistic.confirm(optId);
			} catch (error) {
				// Rollback on failure
				optimistic.rollback(optId);
				throw error;
			}
		},

		async createMany(args: { data: CreateInput<S[E], S>[]; skipDuplicates?: boolean }): Promise<CreateManyResult> {
			const result = await execute("mutation", "createMany", args);
			if (result.error) throw result.error;
			return result.data as CreateManyResult;
		},

		async updateMany(args: { where: WhereInput<S[E]>; data: Partial<Omit<CreateInput<S[E], S>, "id">> }): Promise<UpdateManyResult> {
			const result = await execute("mutation", "updateMany", args);
			if (result.error) throw result.error;
			return result.data as UpdateManyResult;
		},

		async deleteMany(args: { where: WhereInput<S[E]> }): Promise<DeleteManyResult> {
			const result = await execute("mutation", "deleteMany", args);
			if (result.error) throw result.error;
			return result.data as DeleteManyResult;
		},
	} as ReactiveEntityAccessor<S, E>;
}

/**
 * Create reactive client with fine-grained field-level reactivity
 *
 * @example
 * ```typescript
 * const client = createReactiveClient({
 *   links: [loggerLink(), httpLink({ url: "/api" })],
 * });
 *
 * // Get user with fine-grained reactivity
 * const user = client.User.get("123");
 *
 * // Coarse-grained (re-renders when ANY field changes)
 * <div>{user.value.value.name}</div>
 *
 * // Fine-grained (re-renders ONLY when name changes)
 * <div>{user.$.name.value}</div>
 *
 * // Partial select (only subscribes to selected fields)
 * const userName = client.User.get("123", { select: { name: true } });
 * <div>{userName.$.name.value}</div>
 * ```
 */
export function createReactiveClient<S extends SchemaDefinition>(
	config: ReactiveClientConfig<S>,
): ReactiveClient<S> {
	const { links } = config;

	// Validate links
	if (!links || links.length === 0) {
		throw new Error("At least one link is required");
	}

	// Initialize links
	const initializedLinks: LinkFn[] = links.map((link) => link());

	// Create subscription manager and query resolver
	const subscriptions = new SubscriptionManager();
	const resolver = new QueryResolver(subscriptions);

	// Create optimistic tracker (core behavior, not a plugin)
	const optimistic = new OptimisticTracker(subscriptions);

	// Compose link chain
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

	// Set up query transport
	const queryTransport: QueryTransport = {
		async fetch(entityName, entityId, fields) {
			const result = await execute("query", entityName, "get", {
				id: entityId,
				select: fields ? Object.fromEntries(fields.map((f) => [f, true])) : undefined,
			});
			if (result.error) throw result.error;
			return result.data as Record<string, unknown>;
		},
		async fetchList(entityName, options) {
			const result = await execute("query", entityName, "list", options ?? {});
			if (result.error) throw result.error;
			return result.data as Record<string, unknown>[];
		},
	};

	resolver.setTransport(queryTransport);

	// Create client object
	const client = {
		$subscriptions: subscriptions,
		$resolver: resolver,
		$setSubscriptionTransport: (transport: SubscriptionTransport) => {
			subscriptions.setTransport(transport);
		},
		$execute: execute,
		$destroy: () => {
			subscriptions.destroy();
		},
	} as ReactiveClient<S>;

	// Create entity accessors using Proxy
	return new Proxy(client, {
		get(target, prop: string) {
			// Return internal properties
			if (prop.startsWith("$")) {
				return target[prop as keyof typeof target];
			}

			// Create entity accessor on demand
			return createReactiveEntityAccessor(
				prop,
				subscriptions,
				resolver,
				optimistic,
				(type, op, input) => execute(type, prop, op, input),
			);
		},
	});
}
