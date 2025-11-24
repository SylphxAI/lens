/**
 * @lens/client - ReactiveClient
 *
 * New reactive client that uses EntitySignals for fine-grained reactivity.
 * Returns EntitySignals with field-level signals ($.field) and computed value.
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
import { OptimisticManager, type OptimisticManagerConfig } from "./optimistic-manager";
import { type Signal, computed } from "../signals/signal";
import {
	type Link,
	type LinkFn,
	type OperationResult,
	composeLinks,
	createOperationContext,
} from "../links";
import {
	createPluginManager,
	type Plugin,
	type PluginManager,
	type PluginContext,
} from "../plugins";

// =============================================================================
// Types
// =============================================================================

/** Plugin registration entry */
export interface PluginEntry<T = unknown> {
	plugin: Plugin<T>;
	config?: T;
}

/** Reactive client configuration */
export interface ReactiveClientConfig<S extends SchemaDefinition = SchemaDefinition> {
	/** Links (middleware chain) - last one should be terminal */
	links: Link[];
	/** WebSocket URL for real-time subscriptions */
	subscriptionUrl?: string;
	/** Optimistic update configuration */
	optimistic?: OptimisticManagerConfig;
	/** Plugins to register */
	plugins?: Array<Plugin | PluginEntry>;
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

	/** Create entity */
	create(data: CreateInput<S[E], S>): Promise<MutationResult<Entity>>;

	/** Update entity */
	update(
		id: string,
		data: Partial<Omit<CreateInput<S[E], S>, "id">>,
	): Promise<MutationResult<Entity>>;

	/** Delete entity */
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
	/** Optimistic update manager */
	$optimistic: OptimisticManager;
	/** Plugin manager */
	$plugins: PluginManager & { [name: string]: unknown };
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
	optimistic: OptimisticManager,
	execute: (type: "query" | "mutation", op: string, input: unknown) => Promise<OperationResult>,
	pluginManager?: PluginManager,
	pluginContext?: PluginContext,
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

			// Call plugin hook
			if (pluginManager && pluginContext) {
				pluginManager.callHook(
					"onBeforeMutation",
					pluginContext,
					entityName,
					"create",
					data,
				);
			}

			// Apply optimistic update if we have an ID
			let optId = "";
			if (id) {
				optId = optimistic.applyOptimistic(entityName, id, "create", entityData);
			}

			try {
				const result = await execute("mutation", "create", { data });
				if (result.error) throw result.error;

				const entity = result.data as Entity;
				const serverId = (entity as { id?: string }).id;

				// Confirm optimistic update
				if (optId) {
					optimistic.confirm(optId, entity);
				} else if (serverId) {
					// No optimistic update, just update subscription
					const sub = subscriptions.getOrCreateSubscription(entityName, serverId, entity);
					sub.signal.setFields(entity);
				}

				// Call plugin hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onAfterMutation",
						pluginContext,
						entityName,
						"create",
						result,
						{},
					);
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
				// Call plugin error hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onMutationError",
						pluginContext,
						entityName,
						"create",
						error as Error,
						{},
					);
				}
				throw error;
			}
		},

		async update(
			id: string,
			data: Partial<Omit<CreateInput<S[E], S>, "id">>,
		): Promise<MutationResult<Entity>> {
			// Call plugin hook
			if (pluginManager && pluginContext) {
				pluginManager.callHook(
					"onBeforeMutation",
					pluginContext,
					entityName,
					"update",
					{ id, data },
				);
			}

			// Apply optimistic update
			const optId = optimistic.applyOptimistic(entityName, id, "update", data as Partial<Entity>);

			try {
				const result = await execute("mutation", "update", { id, ...data });
				if (result.error) throw result.error;

				const entity = result.data as Entity;

				// Confirm optimistic update with server data
				optimistic.confirm(optId, entity);

				// Call plugin hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onAfterMutation",
						pluginContext,
						entityName,
						"update",
						result,
						{},
					);
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
				// Call plugin error hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onMutationError",
						pluginContext,
						entityName,
						"update",
						error as Error,
						{},
					);
				}
				throw error;
			}
		},

		async delete(id: string): Promise<void> {
			// Call plugin hook
			if (pluginManager && pluginContext) {
				pluginManager.callHook(
					"onBeforeMutation",
					pluginContext,
					entityName,
					"delete",
					{ id },
				);
			}

			// Apply optimistic delete
			const optId = optimistic.applyOptimistic(entityName, id, "delete", {});

			try {
				const result = await execute("mutation", "delete", { id });
				if (result.error) throw result.error;

				// Confirm optimistic delete
				optimistic.confirm(optId);

				// Call plugin hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onAfterMutation",
						pluginContext,
						entityName,
						"delete",
						result,
						{},
					);
				}
			} catch (error) {
				// Rollback on failure
				if (optId) {
					optimistic.rollback(optId);
				}
				// Call plugin error hook
				if (pluginManager && pluginContext) {
					pluginManager.callHook(
						"onMutationError",
						pluginContext,
						entityName,
						"delete",
						error as Error,
						{},
					);
				}
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
	const { links, plugins: pluginConfigs } = config;

	// Validate links
	if (!links || links.length === 0) {
		throw new Error("At least one link is required");
	}

	// Initialize links
	const initializedLinks: LinkFn[] = links.map((link) => link());

	// Create subscription manager, query resolver, and optimistic manager
	const subscriptions = new SubscriptionManager();
	const resolver = new QueryResolver(subscriptions);
	const optimisticManager = new OptimisticManager(subscriptions, config.optimistic);

	// Create plugin manager
	const pluginManager = createPluginManager();

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

	// Create plugin context
	const pluginContext: PluginContext = {
		subscriptions,
		resolver,
		execute,
	};

	// Register plugins
	if (pluginConfigs) {
		for (const entry of pluginConfigs) {
			if ("plugin" in entry) {
				// PluginEntry with config
				pluginManager.register(entry.plugin, entry.config);
			} else {
				// Just a Plugin
				pluginManager.register(entry);
			}
		}
	}

	// Create $plugins proxy that exposes plugin APIs
	const pluginsProxy = new Proxy(pluginManager as PluginManager & { [name: string]: unknown }, {
		get(target, prop: string) {
			// Forward manager methods
			if (prop in target) {
				return target[prop as keyof PluginManager];
			}
			// Get plugin API by name
			return target.get(prop);
		},
	});

	// Create client object
	const client = {
		$subscriptions: subscriptions,
		$resolver: resolver,
		$optimistic: optimisticManager,
		$plugins: pluginsProxy,
		$setSubscriptionTransport: (transport: SubscriptionTransport) => {
			subscriptions.setTransport(transport);
			// Notify plugins of connection
			pluginManager.callHook("onConnect", pluginContext);
		},
		$execute: execute,
		$destroy: () => {
			pluginManager.callHook("onDestroy", pluginContext);
			pluginManager.destroy();
			subscriptions.destroy();
		},
	} as ReactiveClient<S>;

	// Initialize plugins asynchronously
	pluginManager.init(pluginContext).catch((error) => {
		console.error("Failed to initialize plugins:", error);
	});

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
				optimisticManager,
				(type, op, input) => execute(type, prop, op, input),
				pluginManager,
				pluginContext,
			);
		},
	});
}
