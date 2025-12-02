/**
 * @sylphx/lens-server - Lens Server
 *
 * Pure executor for Lens operations with optional plugin support.
 *
 * Server modes:
 * - Stateless (default): Server only does getMetadata() and execute()
 * - Stateful (with diffOptimizer plugin): Server tracks state and manages subscriptions
 *
 * For protocol handling, use adapters:
 * - createHTTPAdapter - HTTP/REST
 * - createWSAdapter - WebSocket + subscriptions
 * - createSSEAdapter - Server-Sent Events
 *
 * Adapters are pure delivery mechanisms - all business logic is in server/plugins.
 */

import {
	type ContextValue,
	createEmit,
	type EntityDef,
	type FieldType,
	flattenRouter,
	type InferRouterContext,
	isEntityDef,
	isMutationDef,
	isPipeline,
	isQueryDef,
	type MutationDef,
	type Pipeline,
	type QueryDef,
	type ReconnectMessage,
	type ReconnectResult,
	type ResolverDef,
	type Resolvers,
	type ReturnSpec,
	type RouterDef,
	toResolverMap,
} from "@sylphx/lens-core";
import { createContext, runWithContext } from "../context/index.js";
import {
	createPluginManager,
	type PluginManager,
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "../plugin/types.js";
import { isDiffOptimizerPlugin } from "../plugin/diff-optimizer.js";
import type { GraphStateManager } from "../state/graph-state-manager.js";

// =============================================================================
// Types
// =============================================================================

/** Selection object type for nested field selection */
export interface SelectionObject {
	[key: string]: boolean | SelectionObject | { select: SelectionObject };
}

/** Entity map type */
export type EntitiesMap = Record<string, EntityDef<string, any>>;

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Resolver map type for internal use */
type ResolverMap = Map<string, ResolverDef<any, any, any>>;

/** Operation metadata for handshake */
export interface OperationMeta {
	type: "query" | "mutation" | "subscription";
	optimistic?: unknown;
}

/** Nested operations structure for handshake */
export type OperationsMap = {
	[key: string]: OperationMeta | OperationsMap;
};

/** Logger interface */
export interface LensLogger {
	info?: (message: string, ...args: unknown[]) => void;
	warn?: (message: string, ...args: unknown[]) => void;
	error?: (message: string, ...args: unknown[]) => void;
}

/** Server configuration */
export interface LensServerConfig<
	TContext extends ContextValue = ContextValue,
	TRouter extends RouterDef = RouterDef,
> {
	/** Entity definitions */
	entities?: EntitiesMap | undefined;
	/** Router definition (namespaced operations) */
	router?: TRouter | undefined;
	/** Query definitions (flat) */
	queries?: QueriesMap | undefined;
	/** Mutation definitions (flat) */
	mutations?: MutationsMap | undefined;
	/** Field resolvers array */
	resolvers?: Resolvers | undefined;
	/** Logger for server messages (default: silent) */
	logger?: LensLogger | undefined;
	/** Context factory */
	context?: ((req?: unknown) => TContext | Promise<TContext>) | undefined;
	/** Server version */
	version?: string | undefined;
	/**
	 * Server-level plugins for subscription lifecycle and state management.
	 * Plugins are processed at the server level, not adapter level.
	 *
	 * @example
	 * ```typescript
	 * const server = createServer({
	 *   router,
	 *   plugins: [diffOptimizer()], // Adds stateful diff optimization
	 * });
	 * ```
	 */
	plugins?: ServerPlugin[] | undefined;
}

/** Server metadata for transport handshake */
export interface ServerMetadata {
	version: string;
	operations: OperationsMap;
}

/** Operation for execution */
export interface LensOperation {
	path: string;
	input?: unknown;
}

/** Result from operation execution */
export interface LensResult<T = unknown> {
	data?: T;
	error?: Error;
}

/**
 * Client send function type for subscription updates.
 */
export type ClientSendFn = (message: unknown) => void;

/**
 * Lens server interface
 *
 * Core methods:
 * - getMetadata() - Server metadata for transport handshake
 * - execute() - Execute any operation
 *
 * Subscription support (used by adapters):
 * - addClient() / removeClient() - Client connection management
 * - subscribe() / unsubscribe() - Subscription lifecycle
 * - send() - Send data to client (runs through plugin hooks)
 * - broadcast() - Broadcast to all entity subscribers
 * - handleReconnect() - Handle client reconnection
 *
 * The server handles all business logic including state management (via plugins).
 * Adapters are pure protocol handlers that call these methods.
 */
export interface LensServer {
	/** Get server metadata for transport handshake */
	getMetadata(): ServerMetadata;
	/** Execute operation - auto-detects query vs mutation */
	execute(op: LensOperation): Promise<LensResult>;

	// =========================================================================
	// Subscription Support (Optional - used by WS/SSE adapters)
	// =========================================================================

	/**
	 * Register a client connection.
	 * Call when a client connects via WebSocket/SSE.
	 *
	 * @param clientId - Unique client identifier
	 * @param send - Function to send messages to this client
	 */
	addClient(clientId: string, send: ClientSendFn): Promise<boolean>;

	/**
	 * Remove a client connection.
	 * Call when a client disconnects.
	 *
	 * @param clientId - Client identifier
	 * @param subscriptionCount - Number of active subscriptions at disconnect
	 */
	removeClient(clientId: string, subscriptionCount: number): void;

	/**
	 * Subscribe a client to an entity.
	 * Runs plugin hooks and sets up state tracking (if diffOptimizer is enabled).
	 *
	 * @param ctx - Subscribe context
	 * @returns true if subscription is allowed, false if rejected by plugin
	 */
	subscribe(ctx: SubscribeContext): Promise<boolean>;

	/**
	 * Unsubscribe a client from an entity.
	 * Runs plugin hooks and cleans up state tracking.
	 *
	 * @param ctx - Unsubscribe context
	 */
	unsubscribe(ctx: UnsubscribeContext): void;

	/**
	 * Send data to a client for a specific subscription.
	 * Runs through plugin hooks (beforeSend/afterSend) for optimization.
	 *
	 * This is the primary method for adapters to deliver data.
	 * Plugins can intercept and transform the data (e.g., compute diffs).
	 *
	 * @param clientId - Client identifier
	 * @param subscriptionId - Subscription identifier
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @param data - Entity data
	 * @param isInitial - Whether this is initial subscription data
	 */
	send(
		clientId: string,
		subscriptionId: string,
		entity: string,
		entityId: string,
		data: Record<string, unknown>,
		isInitial: boolean,
	): Promise<void>;

	/**
	 * Broadcast data to all subscribers of an entity.
	 * Runs through plugin hooks for each subscriber.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @param data - Entity data
	 */
	broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void>;

	/**
	 * Handle a reconnection request from a client.
	 * Only works if diffOptimizer plugin is enabled.
	 *
	 * @param message - Reconnection message from client
	 * @returns Reconnection results or null if not supported
	 */
	handleReconnect(message: ReconnectMessage): ReconnectResult[] | null;

	/**
	 * Check if server has state management enabled (diffOptimizer plugin).
	 */
	hasStateManagement(): boolean;

	/**
	 * Get the underlying GraphStateManager (if diffOptimizer is enabled).
	 * Used by adapters that need direct access for advanced operations.
	 */
	getStateManager(): GraphStateManager | undefined;

	/**
	 * Get the plugin manager for direct hook access.
	 */
	getPluginManager(): PluginManager;
}

/** WebSocket interface for adapters */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// DataLoader for N+1 Prevention
// =============================================================================

class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> =
		new Map();
	private scheduled = false;

	constructor(private batchFn: (keys: K[]) => Promise<(V | null)[]>) {}

	async load(key: K): Promise<V | null> {
		return new Promise((resolve, reject) => {
			const existing = this.batch.get(key);
			if (existing) {
				existing.push({ resolve, reject });
			} else {
				this.batch.set(key, [{ resolve, reject }]);
			}

			if (!this.scheduled) {
				this.scheduled = true;
				queueMicrotask(() => this.flush());
			}
		});
	}

	private async flush(): Promise<void> {
		this.scheduled = false;
		const batch = this.batch;
		this.batch = new Map();

		const keys = Array.from(batch.keys());
		if (keys.length === 0) return;

		try {
			const results = await this.batchFn(keys);
			let i = 0;
			for (const [_key, callbacks] of batch) {
				const result = results[i++];
				for (const { resolve } of callbacks) {
					resolve(result);
				}
			}
		} catch (error) {
			for (const [, callbacks] of batch) {
				for (const { reject } of callbacks) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			}
		}
	}
}

// =============================================================================
// Helper Functions
// =============================================================================

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return value != null && typeof value === "object" && Symbol.asyncIterator in value;
}

/** Extract entity type name from return spec */
function getEntityTypeName(returnSpec: ReturnSpec | undefined): string | undefined {
	if (!returnSpec) return undefined;

	if (typeof returnSpec === "object" && "_tag" in returnSpec) {
		if (returnSpec._tag === "entity" && returnSpec.entityDef?._name) {
			return returnSpec.entityDef._name;
		}
		if (returnSpec._tag === "array" && returnSpec.element) {
			return getEntityTypeName(returnSpec.element as ReturnSpec);
		}
	}

	return undefined;
}

/** Get input field names from Zod schema */
function getInputFields(schema: { shape?: Record<string, unknown> } | undefined): string[] {
	if (!schema?.shape) return [];
	return Object.keys(schema.shape);
}

/** Convert sugar syntax to Reify Pipeline */
function sugarToPipeline(
	sugar: string | Pipeline | undefined,
	entityType: string | undefined,
	inputFields: string[],
): Pipeline | undefined {
	if (!sugar) return undefined;
	if (isPipeline(sugar)) return sugar;

	const entity = entityType ?? "Entity";

	switch (sugar) {
		case "merge":
			return [{ type: "merge", target: { entity, id: ["input", "id"] }, fields: inputFields }];
		case "create":
			return [{ type: "add", entity, data: ["output"] }];
		case "delete":
			return [{ type: "remove", entity, id: ["input", "id"] }];
		default:
			return undefined;
	}
}

// =============================================================================
// Server Implementation
// =============================================================================

const noopLogger: LensLogger = {};

class LensServerImpl<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
	TContext extends ContextValue = ContextValue,
> implements LensServer
{
	private queries: Q;
	private mutations: M;
	private entities: EntitiesMap;
	private resolverMap?: ResolverMap | undefined;
	private contextFactory: (req?: unknown) => TContext | Promise<TContext>;
	private version: string;
	private logger: LensLogger;
	private ctx = createContext<TContext>();
	private loaders = new Map<string, DataLoader<unknown, unknown>>();

	// Plugin system
	private pluginManager: PluginManager;
	private stateManager: GraphStateManager | undefined;
	private clientSendFns = new Map<string, ClientSendFn>();

	// Subscription tracking: clientId → subscriptionId → { entity, entityId, fields }
	private subscriptions = new Map<
		string,
		Map<string, { entity: string; entityId: string; fields: string[] | "*" }>
	>();
	// Entity subscribers: entityKey → Set<{ clientId, subscriptionId }>
	private entitySubscribers = new Map<string, Set<{ clientId: string; subscriptionId: string }>>();

	constructor(config: LensServerConfig<TContext> & { queries?: Q; mutations?: M }) {
		const queries: QueriesMap = { ...(config.queries ?? {}) };
		const mutations: MutationsMap = { ...(config.mutations ?? {}) };

		// Flatten router into queries/mutations
		if (config.router) {
			const flattened = flattenRouter(config.router);
			for (const [path, procedure] of flattened) {
				if (isQueryDef(procedure)) {
					queries[path] = procedure;
				} else if (isMutationDef(procedure)) {
					mutations[path] = procedure;
				}
			}
		}

		this.queries = queries as Q;
		this.mutations = mutations as M;
		this.entities = config.entities ?? {};
		this.resolverMap = config.resolvers ? toResolverMap(config.resolvers) : undefined;
		this.contextFactory = config.context ?? (() => ({}) as TContext);
		this.version = config.version ?? "1.0.0";
		this.logger = config.logger ?? noopLogger;

		// Initialize plugin system
		this.pluginManager = createPluginManager();
		for (const plugin of config.plugins ?? []) {
			this.pluginManager.register(plugin);
			// Extract stateManager from diffOptimizer plugin if present
			if (isDiffOptimizerPlugin(plugin)) {
				this.stateManager = plugin.getStateManager();
			}
		}

		// Inject entity names
		for (const [name, def] of Object.entries(this.entities)) {
			if (def && typeof def === "object" && !def._name) {
				(def as { _name?: string })._name = name;
			}
		}

		// Inject mutation names and auto-derive optimistic
		for (const [name, def] of Object.entries(this.mutations)) {
			if (def && typeof def === "object") {
				(def as { _name?: string })._name = name;
				const lastSegment = name.includes(".") ? name.split(".").pop()! : name;
				if (!def._optimistic) {
					if (lastSegment.startsWith("update")) {
						(def as { _optimistic?: string })._optimistic = "merge";
					} else if (lastSegment.startsWith("create") || lastSegment.startsWith("add")) {
						(def as { _optimistic?: string })._optimistic = "create";
					} else if (lastSegment.startsWith("delete") || lastSegment.startsWith("remove")) {
						(def as { _optimistic?: string })._optimistic = "delete";
					}
				}
			}
		}

		// Inject query names
		for (const [name, def] of Object.entries(this.queries)) {
			if (def && typeof def === "object") {
				(def as { _name?: string })._name = name;
			}
		}

		// Validate definitions
		for (const [name, def] of Object.entries(this.queries)) {
			if (!isQueryDef(def)) {
				throw new Error(`Invalid query definition: ${name}`);
			}
		}
		for (const [name, def] of Object.entries(this.mutations)) {
			if (!isMutationDef(def)) {
				throw new Error(`Invalid mutation definition: ${name}`);
			}
		}
	}

	getMetadata(): ServerMetadata {
		return {
			version: this.version,
			operations: this.buildOperationsMap(),
		};
	}

	async execute(op: LensOperation): Promise<LensResult> {
		const { path, input } = op;

		try {
			if (this.queries[path]) {
				const data = await this.executeQuery(path, input);
				return { data };
			}

			if (this.mutations[path]) {
				const data = await this.executeMutation(path, input);
				return { data };
			}

			return { error: new Error(`Operation not found: ${path}`) };
		} catch (error) {
			return { error: error instanceof Error ? error : new Error(String(error)) };
		}
	}

	private buildOperationsMap(): OperationsMap {
		const result: OperationsMap = {};

		const setNested = (path: string, meta: OperationMeta) => {
			const parts = path.split(".");
			let current: OperationsMap = result;

			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!current[part] || "type" in current[part]) {
					current[part] = {};
				}
				current = current[part] as OperationsMap;
			}

			current[parts[parts.length - 1]] = meta;
		};

		for (const [name, _def] of Object.entries(this.queries)) {
			setNested(name, { type: "query" });
		}

		for (const [name, def] of Object.entries(this.mutations)) {
			const meta: OperationMeta = { type: "mutation" };
			if (def._optimistic) {
				const entityType = getEntityTypeName(def._output);
				const inputFields = getInputFields(def._input as { shape?: Record<string, unknown> });
				meta.optimistic = sugarToPipeline(def._optimistic, entityType, inputFields);
			}
			setNested(name, meta);
		}

		return result;
	}

	private async executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput> {
		const queryDef = this.queries[name];
		if (!queryDef) {
			throw new Error(`Query not found: ${name}`);
		}

		// Extract $select from input
		let select: SelectionObject | undefined;
		let cleanInput = input;
		if (input && typeof input === "object" && "$select" in input) {
			const { $select, ...rest } = input as Record<string, unknown>;
			select = $select as SelectionObject;
			cleanInput = (Object.keys(rest).length > 0 ? rest : undefined) as TInput;
		}

		// Validate input
		if (queryDef._input && cleanInput !== undefined) {
			const result = queryDef._input.safeParse(cleanInput);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();

		try {
			return await runWithContext(this.ctx, context, async () => {
				const resolver = queryDef._resolve;
				if (!resolver) {
					throw new Error(`Query ${name} has no resolver`);
				}

				const emit = createEmit(() => {});
				const onCleanup = () => () => {};
				const lensContext = { ...context, emit, onCleanup };

				const result = resolver({ input: cleanInput as TInput, ctx: lensContext });

				let data: TOutput;
				if (isAsyncIterable(result)) {
					for await (const value of result) {
						data = value as TOutput;
						break;
					}
					if (data! === undefined) {
						throw new Error(`Query ${name} returned empty stream`);
					}
				} else {
					data = (await result) as TOutput;
				}

				return this.processQueryResult(name, data, select);
			});
		} finally {
			this.clearLoaders();
		}
	}

	private async executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
		const mutationDef = this.mutations[name];
		if (!mutationDef) {
			throw new Error(`Mutation not found: ${name}`);
		}

		// Validate input
		if (mutationDef._input) {
			const result = mutationDef._input.safeParse(input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();

		try {
			return await runWithContext(this.ctx, context, async () => {
				const resolver = mutationDef._resolve;
				if (!resolver) {
					throw new Error(`Mutation ${name} has no resolver`);
				}

				const emit = createEmit(() => {});
				const onCleanup = () => () => {};
				const lensContext = { ...context, emit, onCleanup };

				return (await resolver({ input: input as TInput, ctx: lensContext })) as TOutput;
			});
		} finally {
			this.clearLoaders();
		}
	}

	private async processQueryResult<T>(
		_operationName: string,
		data: T,
		select?: SelectionObject,
	): Promise<T> {
		if (!data) return data;

		// Apply entity resolvers if available
		const processed = await this.resolveEntityFields(data);

		// Apply selection if provided
		if (select) {
			return this.applySelection(processed, select) as T;
		}

		return processed as T;
	}

	private async resolveEntityFields<T>(data: T): Promise<T> {
		if (!data || !this.resolverMap) return data;

		if (Array.isArray(data)) {
			return Promise.all(data.map((item) => this.resolveEntityFields(item))) as Promise<T>;
		}

		if (typeof data !== "object") return data;

		const obj = data as Record<string, unknown>;
		const typeName = this.getTypeName(obj);

		if (!typeName) return data;

		// Get resolver for this entity type
		const resolverDef = this.resolverMap.get(typeName);
		if (!resolverDef) return data;

		const result = { ...obj };

		// Get fields that need to be resolved (not exposed)
		for (const fieldName of resolverDef.getFieldNames()) {
			const field = String(fieldName);

			// Skip exposed fields (they just pass through)
			if (resolverDef.isExposed(field)) continue;

			// Skip if value already exists
			const existingValue = result[field];
			if (existingValue !== undefined) {
				result[field] = await this.resolveEntityFields(existingValue);
				continue;
			}

			// Resolve the field
			const loaderKey = `${typeName}.${field}`;
			const loader = this.getOrCreateLoaderForField(loaderKey, resolverDef, field);
			result[field] = await loader.load(obj);
			result[field] = await this.resolveEntityFields(result[field]);
		}

		return result as T;
	}

	private getTypeName(obj: Record<string, unknown>): string | undefined {
		if ("__typename" in obj) return obj.__typename as string;
		if ("_type" in obj) return obj._type as string;

		for (const [name, def] of Object.entries(this.entities)) {
			if (isEntityDef(def) && this.matchesEntity(obj, def)) {
				return name;
			}
		}

		return undefined;
	}

	private matchesEntity(obj: Record<string, unknown>, entityDef: EntityDef<string, any>): boolean {
		const idField = entityDef._idField ?? "id";
		return idField in obj;
	}

	private getOrCreateLoaderForField(
		loaderKey: string,
		resolverDef: ResolverDef<any, any, any>,
		fieldName: string,
	): DataLoader<unknown, unknown> {
		let loader = this.loaders.get(loaderKey);
		if (!loader) {
			loader = new DataLoader(async (parents: unknown[]) => {
				const results: unknown[] = [];
				for (const parent of parents) {
					try {
						const result = await resolverDef.resolveField(fieldName, parent, {}, {});
						results.push(result);
					} catch {
						results.push(null);
					}
				}
				return results;
			});
			this.loaders.set(loaderKey, loader);
		}
		return loader;
	}

	private clearLoaders(): void {
		this.loaders.clear();
	}

	private applySelection(data: unknown, select: SelectionObject): unknown {
		if (!data) return data;

		if (Array.isArray(data)) {
			return data.map((item) => this.applySelection(item, select));
		}

		if (typeof data !== "object") return data;

		const obj = data as Record<string, unknown>;
		const result: Record<string, unknown> = {};

		// Always include id
		if ("id" in obj) result.id = obj.id;

		for (const [key, value] of Object.entries(select)) {
			if (!(key in obj)) continue;

			if (value === true) {
				result[key] = obj[key];
			} else if (typeof value === "object" && value !== null) {
				const nestedSelect = "select" in value ? value.select : value;
				result[key] = this.applySelection(obj[key], nestedSelect as SelectionObject);
			}
		}

		return result;
	}

	// =========================================================================
	// Subscription Support Methods
	// =========================================================================

	async addClient(clientId: string, send: ClientSendFn): Promise<boolean> {
		// Store client send function
		this.clientSendFns.set(clientId, send);

		// Register with state manager if available
		if (this.stateManager) {
			this.stateManager.addClient({
				id: clientId,
				send: (msg) => send(msg),
			});
		}

		// Run plugin hooks
		const allowed = await this.pluginManager.runOnConnect({ clientId });
		if (!allowed) {
			this.removeClient(clientId, 0);
			return false;
		}

		return true;
	}

	removeClient(clientId: string, subscriptionCount: number): void {
		// Clean up subscription tracking
		const clientSubs = this.subscriptions.get(clientId);
		if (clientSubs) {
			for (const [subscriptionId, { entity, entityId }] of clientSubs) {
				const entityKey = `${entity}:${entityId}`;
				const subscribers = this.entitySubscribers.get(entityKey);
				if (subscribers) {
					for (const sub of subscribers) {
						if (sub.clientId === clientId && sub.subscriptionId === subscriptionId) {
							subscribers.delete(sub);
							break;
						}
					}
					if (subscribers.size === 0) {
						this.entitySubscribers.delete(entityKey);
					}
				}
			}
			this.subscriptions.delete(clientId);
		}

		// Remove from state manager if available
		if (this.stateManager) {
			this.stateManager.removeClient(clientId);
		}

		// Remove stored send function
		this.clientSendFns.delete(clientId);

		// Run plugin hooks
		this.pluginManager.runOnDisconnect({ clientId, subscriptionCount });
	}

	async subscribe(ctx: SubscribeContext): Promise<boolean> {
		// Run plugin hooks - any plugin can reject
		const allowed = await this.pluginManager.runOnSubscribe(ctx);
		if (!allowed) {
			return false;
		}

		// Track subscription
		if (ctx.entity && ctx.entityId) {
			// Add to client's subscriptions
			let clientSubs = this.subscriptions.get(ctx.clientId);
			if (!clientSubs) {
				clientSubs = new Map();
				this.subscriptions.set(ctx.clientId, clientSubs);
			}
			clientSubs.set(ctx.subscriptionId, {
				entity: ctx.entity,
				entityId: ctx.entityId,
				fields: ctx.fields,
			});

			// Add to entity subscribers
			const entityKey = `${ctx.entity}:${ctx.entityId}`;
			let subscribers = this.entitySubscribers.get(entityKey);
			if (!subscribers) {
				subscribers = new Set();
				this.entitySubscribers.set(entityKey, subscribers);
			}
			subscribers.add({ clientId: ctx.clientId, subscriptionId: ctx.subscriptionId });

			// If state management is enabled, register subscription
			if (this.stateManager) {
				this.stateManager.subscribe(ctx.clientId, ctx.entity, ctx.entityId, ctx.fields);
			}
		}

		return true;
	}

	unsubscribe(ctx: UnsubscribeContext): void {
		// Clean up subscription tracking
		const clientSubs = this.subscriptions.get(ctx.clientId);
		if (clientSubs) {
			clientSubs.delete(ctx.subscriptionId);
		}

		// Clean up entity subscribers
		for (const entityKey of ctx.entityKeys) {
			const subscribers = this.entitySubscribers.get(entityKey);
			if (subscribers) {
				for (const sub of subscribers) {
					if (sub.clientId === ctx.clientId && sub.subscriptionId === ctx.subscriptionId) {
						subscribers.delete(sub);
						break;
					}
				}
				if (subscribers.size === 0) {
					this.entitySubscribers.delete(entityKey);
				}
			}

			// Unsubscribe from state manager
			if (this.stateManager) {
				const [entity, id] = entityKey.split(":");
				this.stateManager.unsubscribe(ctx.clientId, entity, id);
			}
		}

		// Run plugin hooks
		this.pluginManager.runOnUnsubscribe(ctx);
	}

	async send(
		clientId: string,
		subscriptionId: string,
		entity: string,
		entityId: string,
		data: Record<string, unknown>,
		isInitial: boolean,
	): Promise<void> {
		const sendFn = this.clientSendFns.get(clientId);
		if (!sendFn) return;

		// Get subscription fields
		const clientSubs = this.subscriptions.get(clientId);
		const subInfo = clientSubs?.get(subscriptionId);
		const fields = subInfo?.fields ?? "*";

		// Run beforeSend hooks (plugins can transform data)
		const ctx = {
			clientId,
			subscriptionId,
			entity,
			entityId,
			data,
			isInitial,
			fields,
		};
		const optimizedData = await this.pluginManager.runBeforeSend(ctx);

		// Deliver to client
		sendFn({
			type: "data",
			id: subscriptionId,
			data: optimizedData,
		});

		// Run afterSend hooks
		await this.pluginManager.runAfterSend({
			...ctx,
			data: optimizedData,
			timestamp: Date.now(),
		});
	}

	async broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void> {
		const entityKey = `${entity}:${entityId}`;
		const subscribers = this.entitySubscribers.get(entityKey);
		if (!subscribers) return;

		// Send to all subscribers
		for (const { clientId, subscriptionId } of subscribers) {
			await this.send(clientId, subscriptionId, entity, entityId, data, false);
		}
	}

	handleReconnect(message: ReconnectMessage): ReconnectResult[] | null {
		// Only handle reconnection if state management is enabled
		if (!this.stateManager) {
			return null;
		}

		return this.stateManager.handleReconnect(message.subscriptions);
	}

	hasStateManagement(): boolean {
		return this.stateManager !== undefined;
	}

	getStateManager(): GraphStateManager | undefined {
		return this.stateManager;
	}

	getPluginManager(): PluginManager {
		return this.pluginManager;
	}
}

// =============================================================================
// Type Inference
// =============================================================================

export type InferInput<T> =
	T extends QueryDef<infer I, any> ? I : T extends MutationDef<infer I, any> ? I : never;

export type InferOutput<T> =
	T extends QueryDef<any, infer O>
		? O
		: T extends MutationDef<any, infer O>
			? O
			: T extends FieldType<infer F>
				? F
				: never;

export type InferApi<T> = T extends { _types: infer Types } ? Types : never;

export type ServerConfigWithInferredContext<
	TRouter extends RouterDef,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	router: TRouter;
	entities?: EntitiesMap;
	queries?: Q;
	mutations?: M;
	resolvers?: Resolvers;
	logger?: LensLogger;
	context?: () => InferRouterContext<TRouter> | Promise<InferRouterContext<TRouter>>;
	version?: string;
	/** Server-level plugins (diffOptimizer, etc.) */
	plugins?: ServerPlugin[];
};

export type ServerConfigLegacy<
	TContext extends ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	router?: RouterDef | undefined;
	entities?: EntitiesMap;
	queries?: Q;
	mutations?: M;
	resolvers?: Resolvers;
	logger?: LensLogger;
	context?: () => TContext | Promise<TContext>;
	version?: string;
	/** Server-level plugins (diffOptimizer, etc.) */
	plugins?: ServerPlugin[];
};

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Lens server with optional plugin support.
 *
 * Server modes:
 * - **Stateless** (default): Pure executor, sends full data on each response
 * - **Stateful** (with diffOptimizer plugin): Tracks state, sends minimal diffs
 *
 * Core methods:
 * - getMetadata() - Server metadata for transport handshake
 * - execute() - Execute any operation
 *
 * Subscription support (for WS/SSE adapters):
 * - addClient() / removeClient() - Client connection lifecycle
 * - subscribe() / unsubscribe() - Subscription management
 * - emit() - Push updates to clients (stateful mode only)
 * - handleReconnect() - Handle client reconnection (stateful mode only)
 *
 * Adapters are pure protocol handlers - they call server methods and deliver responses.
 * All business logic (state management, diff computation) is handled by server/plugins.
 *
 * @example
 * ```typescript
 * // Stateless mode (default)
 * const server = createServer({ router });
 * createWSAdapter(server); // Sends full data on each update
 *
 * // Stateful mode (with diffOptimizer)
 * const server = createServer({
 *   router,
 *   plugins: [diffOptimizer()], // Enables state tracking & diffs
 * });
 * createWSAdapter(server); // Sends minimal diffs
 * ```
 */
export function createServer<
	TRouter extends RouterDef,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(
	config: ServerConfigWithInferredContext<TRouter, Q, M>,
): LensServer & {
	_types: { router: TRouter; queries: Q; mutations: M; context: InferRouterContext<TRouter> };
};

export function createServer<
	TContext extends ContextValue = ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(
	config: ServerConfigLegacy<TContext, Q, M>,
): LensServer & { _types: { queries: Q; mutations: M; context: TContext } };

export function createServer<
	TContext extends ContextValue = ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(
	config: LensServerConfig<TContext> & { queries?: Q; mutations?: M },
): LensServer & { _types: { queries: Q; mutations: M; context: TContext } } {
	const server = new LensServerImpl(config) as LensServerImpl<Q, M, TContext>;
	return server as unknown as LensServer & {
		_types: { queries: Q; mutations: M; context: TContext };
	};
}
