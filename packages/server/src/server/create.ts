/**
 * @sylphx/lens-server - Lens Server
 *
 * Pure executor for Lens operations with optional plugin support.
 *
 * Server modes:
 * - Stateless (default): Server only does getMetadata() and execute()
 * - Stateful (with clientState plugin): Server tracks per-client state
 *
 * For protocol handling, use handlers:
 * - createHTTPHandler - HTTP/REST
 * - createWSHandler - WebSocket + subscriptions
 * - createSSEHandler - Server-Sent Events
 *
 * Handlers are pure delivery mechanisms - all business logic is in server/plugins.
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
	isQueryDef,
	type MutationDef,
	type OptimisticDSL,
	type QueryDef,
	type ResolverDef,
	type Resolvers,
	type RouterDef,
	toResolverMap,
} from "@sylphx/lens-core";
import { createContext, runWithContext } from "../context/index.js";
import {
	createPluginManager,
	type PluginManager,
	type ReconnectContext,
	type ReconnectHookResult,
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
	type UpdateFieldsContext,
} from "../plugin/types.js";

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
	optimistic?: OptimisticDSL;
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
	 * const server = createApp({
	 *   router,
	 *   plugins: [clientState()], // Enables per-client state tracking
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
 * Handlers are pure protocol translators that call these methods.
 */
export interface LensServer {
	/** Get server metadata for transport handshake */
	getMetadata(): ServerMetadata;
	/** Execute operation - auto-detects query vs mutation */
	execute(op: LensOperation): Promise<LensResult>;

	// =========================================================================
	// Subscription Support (Optional - used by WS/SSE handlers)
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
	 * Runs plugin hooks and sets up state tracking (if clientState is enabled).
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
	 * Uses plugin hooks (onReconnect) for reconnection logic.
	 *
	 * @param ctx - Reconnection context with client state
	 * @returns Reconnection results or null if no plugin handles it
	 */
	handleReconnect(ctx: ReconnectContext): Promise<ReconnectHookResult[] | null>;

	/**
	 * Update subscribed fields for a client's subscription.
	 * Runs plugin hooks (onUpdateFields) to sync state.
	 *
	 * @param ctx - Update fields context
	 */
	updateFields(ctx: UpdateFieldsContext): Promise<void>;

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

	// Plugin system (handles all subscription state)
	private pluginManager: PluginManager;

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
		}

		// Inject entity names
		for (const [name, def] of Object.entries(this.entities)) {
			if (def && typeof def === "object" && !def._name) {
				(def as { _name?: string })._name = name;
			}
		}

		// Inject mutation names
		for (const [name, def] of Object.entries(this.mutations)) {
			if (def && typeof def === "object") {
				(def as { _name?: string })._name = name;
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

		for (const [name, def] of Object.entries(this.queries)) {
			const meta: OperationMeta = { type: "query" };
			// Let plugins enhance metadata
			this.pluginManager.runEnhanceOperationMeta({
				path: name,
				type: "query",
				meta: meta as unknown as Record<string, unknown>,
				definition: def,
			});
			setNested(name, meta);
		}

		for (const [name, def] of Object.entries(this.mutations)) {
			const meta: OperationMeta = { type: "mutation" };
			// Let plugins enhance metadata (e.g., optimisticPlugin adds optimistic config)
			this.pluginManager.runEnhanceOperationMeta({
				path: name,
				type: "mutation",
				meta: meta as unknown as Record<string, unknown>,
				definition: def,
			});
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
		// Check if object has an "id" field (common convention) or entity name field
		return "id" in obj || entityDef._name! in obj;
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
						const result = await resolverDef.resolveField(
							fieldName,
							parent as Record<string, unknown>,
							{},
							{},
						);
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
	// Subscription Support Methods (Pure Plugin Passthrough - Stateless)
	// =========================================================================

	async addClient(clientId: string, send: ClientSendFn): Promise<boolean> {
		// Pure passthrough to plugins - plugins handle their own state
		const allowed = await this.pluginManager.runOnConnect({
			clientId,
			send: (msg) => send(msg as { type: string; id?: string; data?: unknown }),
		});
		return allowed;
	}

	removeClient(clientId: string, subscriptionCount: number): void {
		// Pure passthrough to plugins
		this.pluginManager.runOnDisconnect({ clientId, subscriptionCount });
	}

	async subscribe(ctx: SubscribeContext): Promise<boolean> {
		// Pure passthrough to plugins
		return this.pluginManager.runOnSubscribe(ctx);
	}

	unsubscribe(ctx: UnsubscribeContext): void {
		// Pure passthrough to plugins
		this.pluginManager.runOnUnsubscribe(ctx);
	}

	async broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void> {
		// Delegate to plugins - if no plugin handles it, no-op (stateless mode)
		await this.pluginManager.runOnBroadcast({ entity, entityId, data });
	}

	async send(
		clientId: string,
		subscriptionId: string,
		entity: string,
		entityId: string,
		data: Record<string, unknown>,
		isInitial: boolean,
	): Promise<void> {
		// Pure passthrough to plugins
		// Plugins that need to send data store the send function from onConnect
		// and use it within their beforeSend/afterSend hooks

		// Run beforeSend hooks - plugins may transform data and trigger sends
		const transformedData = await this.pluginManager.runBeforeSend({
			clientId,
			subscriptionId,
			entity,
			entityId,
			data,
			isInitial,
			fields: "*", // Plugins track actual fields
		});

		// Run afterSend hooks for tracking/logging
		await this.pluginManager.runAfterSend({
			clientId,
			subscriptionId,
			entity,
			entityId,
			data: transformedData,
			isInitial,
			fields: "*",
			timestamp: Date.now(),
		});
	}

	async handleReconnect(ctx: ReconnectContext): Promise<ReconnectHookResult[] | null> {
		// Pure passthrough to plugins - plugins handle their own state
		return this.pluginManager.runOnReconnect(ctx);
	}

	async updateFields(ctx: UpdateFieldsContext): Promise<void> {
		// Pure passthrough to plugins
		await this.pluginManager.runOnUpdateFields(ctx);
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
	/** Server-level plugins (clientState, etc.) */
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
	/** Server-level plugins (clientState, etc.) */
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
 * - **Stateful** (with clientState plugin): Tracks per-client state, sends diffs
 *
 * Core methods:
 * - getMetadata() - Server metadata for transport handshake
 * - execute() - Execute any operation
 *
 * Subscription support (for WS/SSE handlers):
 * - addClient() / removeClient() - Client connection lifecycle
 * - subscribe() / unsubscribe() - Subscription management
 * - emit() - Push updates to clients (stateful mode only)
 * - handleReconnect() - Handle client reconnection (stateful mode only)
 *
 * Handlers are pure protocol translators - they call server methods and deliver responses.
 * All business logic (state management, diff computation) is handled by server/plugins.
 *
 * @example
 * ```typescript
 * // Stateless mode (default)
 * const app = createApp({ router });
 * createWSHandler(app); // Sends full data on each update
 *
 * // Stateful mode (with clientState)
 * const app = createApp({
 *   router,
 *   plugins: [clientState()], // Enables per-client state tracking
 * });
 * createWSHandler(app); // Sends minimal diffs
 * ```
 */
export function createApp<
	TRouter extends RouterDef,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(
	config: ServerConfigWithInferredContext<TRouter, Q, M>,
): LensServer & {
	_types: { router: TRouter; queries: Q; mutations: M; context: InferRouterContext<TRouter> };
};

export function createApp<
	TContext extends ContextValue = ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(
	config: ServerConfigLegacy<TContext, Q, M>,
): LensServer & { _types: { queries: Q; mutations: M; context: TContext } };

export function createApp<
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

/**
 * @deprecated Use `createApp` instead. Will be removed in v1.0.
 */
export const createServer: typeof createApp = createApp;
