/**
 * @sylphx/lens-server - Lens Server
 *
 * Core server implementation:
 * - Free Operations (query/mutation definitions)
 * - GraphStateManager (per-client state tracking, minimal diffs)
 * - Field-level subscriptions
 * - Entity Resolvers with DataLoader batching
 */

import {
	type ContextValue,
	createContext,
	createEmit,
	createUpdate,
	type EmitCommand,
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
	type ResolverDef,
	type Resolvers,
	type ReturnSpec,
	type RouterDef,
	runWithContext,
	toResolverMap,
	type Update,
} from "@sylphx/lens-core";

/** Selection object type for nested field selection */
export interface SelectionObject {
	[key: string]: boolean | SelectionObject | { select: SelectionObject };
}

import { GraphStateManager } from "../state/graph-state-manager.js";
import { createPluginManager, type PluginManager, type ServerPlugin } from "../plugin/types.js";

// =============================================================================
// Types
// =============================================================================

/** Entity map type */
export type EntitiesMap = Record<string, EntityDef<string, any>>;

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Resolver map type for internal use (uses any to avoid complex variance issues) */
type ResolverMap = Map<string, ResolverDef<any, any, any>>;

/** Operation metadata for handshake */
export interface OperationMeta {
	type: "query" | "mutation" | "subscription";
	optimistic?: unknown; // OptimisticDSL - sent as JSON
}

/** Nested operations structure for handshake */
export type OperationsMap = {
	[key: string]: OperationMeta | OperationsMap;
};

/** Logger interface for server */
export interface LensLogger {
	info?: (message: string, ...args: unknown[]) => void;
	warn?: (message: string, ...args: unknown[]) => void;
	error?: (message: string, ...args: unknown[]) => void;
}

// =============================================================================
// Subscription Transport
// =============================================================================

/**
 * Subscription transport interface.
 * Defines how the server delivers updates to subscribers.
 */
export interface SubscriptionTransport {
	/** Transport name (for debugging) */
	name: string;

	/**
	 * Initialize the transport.
	 * Called once when the server starts.
	 */
	init?(): Promise<void>;

	/**
	 * Publish a message to a channel.
	 * @param channel - Channel name (e.g., "entity:User:123")
	 * @param message - Message payload
	 */
	publish(channel: string, message: unknown): Promise<void>;

	/**
	 * Subscribe a client to a channel.
	 * @param clientId - Client identifier
	 * @param channel - Channel name
	 * @param onMessage - Callback when message is received
	 * @returns Unsubscribe function
	 */
	subscribe(clientId: string, channel: string, onMessage: (message: unknown) => void): () => void;

	/**
	 * Cleanup when transport is closed.
	 */
	close?(): Promise<void>;
}

/**
 * Direct WebSocket transport (default).
 * Messages are sent directly to connected clients.
 */
export function directTransport(): SubscriptionTransport {
	// In-memory pub/sub for direct connections
	const channels = new Map<string, Set<{ clientId: string; callback: (msg: unknown) => void }>>();

	return {
		name: "direct",

		async publish(channel: string, message: unknown): Promise<void> {
			const subscribers = channels.get(channel);
			if (subscribers) {
				for (const { callback } of subscribers) {
					callback(message);
				}
			}
		},

		subscribe(
			clientId: string,
			channel: string,
			onMessage: (message: unknown) => void,
		): () => void {
			let subscribers = channels.get(channel);
			if (!subscribers) {
				subscribers = new Set();
				channels.set(channel, subscribers);
			}

			const sub = { clientId, callback: onMessage };
			subscribers.add(sub);

			return () => {
				subscribers?.delete(sub);
				if (subscribers?.size === 0) {
					channels.delete(channel);
				}
			};
		},

		async close(): Promise<void> {
			channels.clear();
		},
	};
}

/** Server configuration */
export interface LensServerConfig<
	TContext extends ContextValue = ContextValue,
	TRouter extends RouterDef = RouterDef,
> {
	/** Entity definitions */
	entities?: EntitiesMap | undefined;
	/** Router definition (namespaced operations) - context type is inferred */
	router?: TRouter | undefined;
	/** Query definitions (flat, legacy) */
	queries?: QueriesMap | undefined;
	/** Mutation definitions (flat, legacy) */
	mutations?: MutationsMap | undefined;
	/** Field resolvers array (use lens() factory to create) */
	resolvers?: Resolvers | undefined;
	/** Server plugins for extending behavior */
	plugins?: ServerPlugin[] | undefined;
	/**
	 * Transport for delivering subscription updates.
	 * Defaults to directTransport() (in-memory pub/sub).
	 *
	 * For serverless or distributed deployments, use external transports:
	 * - pusher() - Pusher Channels
	 * - redis() - Redis pub/sub
	 *
	 * @example
	 * ```typescript
	 * // Direct (default - WebSocket)
	 * subscriptionTransport: directTransport()
	 *
	 * // Pusher (serverless-friendly)
	 * subscriptionTransport: pusher({ appId: '...', key: '...' })
	 * ```
	 */
	subscriptionTransport?: SubscriptionTransport | undefined;
	/** Logger for server messages (default: silent) */
	logger?: LensLogger | undefined;
	/** Context factory - must return the context type expected by the router */
	context?: ((req?: unknown) => TContext | Promise<TContext>) | undefined;
	/** Server version */
	version?: string | undefined;
}

/** Server metadata for transport handshake */
export interface ServerMetadata {
	/** Server version */
	version: string;
	/** Operations metadata map */
	operations: OperationsMap;
}

/** Operation for in-process transport */
export interface LensOperation {
	/** Operation path (e.g., 'user.get', 'session.create') */
	path: string;
	/** Operation input */
	input?: unknown;
}

/** Result from operation execution */
export interface LensResult<T = unknown> {
	/** Success data */
	data?: T;
	/** Error if operation failed */
	error?: Error;
}

/** Lens server interface */
export interface LensServer {
	/** Get server metadata for transport handshake */
	getMetadata(): ServerMetadata;
	/** Execute operation - auto-detects query vs mutation from registered operations */
	execute(op: LensOperation): Promise<LensResult>;
	/** Execute a query (one-time) */
	executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput>;
	/** Execute a mutation */
	executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput>;
	/** Handle WebSocket connection */
	handleWebSocket(ws: WebSocketLike): void;
	/** Handle HTTP request */
	handleRequest(req: Request): Promise<Response>;
	/** Get GraphStateManager for external access */
	getStateManager(): GraphStateManager;
	/** Start server */
	listen(port: number): Promise<void>;
	/** Close server */
	close(): Promise<void>;
}

/** WebSocket interface */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Sugar to Reify Pipeline Conversion
// =============================================================================

/**
 * Extract entity type name from return spec.
 * Returns undefined if not an entity.
 */
function getEntityTypeName(returnSpec: ReturnSpec | undefined): string | undefined {
	if (!returnSpec) return undefined;

	// Single entity: EntityDef
	if (isEntityDef(returnSpec)) {
		return returnSpec._name;
	}

	// Array of entities: [EntityDef]
	if (Array.isArray(returnSpec) && returnSpec.length === 1 && isEntityDef(returnSpec[0])) {
		return returnSpec[0]._name;
	}

	return undefined;
}

/**
 * Get input field keys from a Zod-like schema.
 * Falls back to empty array if schema doesn't have shape.
 */
function getInputFields(inputSchema: { shape?: Record<string, unknown> } | undefined): string[] {
	if (!inputSchema?.shape) return [];
	return Object.keys(inputSchema.shape);
}

/**
 * Convert sugar syntax to Reify Pipeline.
 *
 * Sugar syntax:
 * - "merge" → entity.update with input fields merged
 * - "create" → entity.create with temp ID
 * - "delete" → entity.delete by input.id
 * - { merge: {...} } → entity.update with input + extra fields
 *
 * Returns the original value if already a Pipeline or not sugar.
 */
function sugarToPipeline(
	optimistic: unknown,
	entityType: string | undefined,
	inputFields: string[],
): Pipeline | unknown {
	// Already a Pipeline - pass through
	if (isPipeline(optimistic)) {
		return optimistic;
	}

	// No entity type - can't convert sugar
	if (!entityType) {
		return optimistic;
	}

	// "merge" sugar - update entity with input fields
	if (optimistic === "merge") {
		const args: Record<string, unknown> = { type: entityType };
		for (const field of inputFields) {
			args[field] = { $input: field };
		}
		return {
			$pipe: [{ $do: "entity.update", $with: args }],
		};
	}

	// "create" sugar - create entity with temp ID
	if (optimistic === "create") {
		const args: Record<string, unknown> = { type: entityType, id: { $temp: true } };
		for (const field of inputFields) {
			if (field !== "id") {
				args[field] = { $input: field };
			}
		}
		return {
			$pipe: [{ $do: "entity.create", $with: args }],
		};
	}

	// "delete" sugar - delete entity by input.id
	if (optimistic === "delete") {
		return {
			$pipe: [{ $do: "entity.delete", $with: { type: entityType, id: { $input: "id" } } }],
		};
	}

	// { merge: {...} } sugar - update with input + extra fields
	if (
		typeof optimistic === "object" &&
		optimistic !== null &&
		"merge" in optimistic &&
		typeof (optimistic as Record<string, unknown>).merge === "object"
	) {
		const extra = (optimistic as { merge: Record<string, unknown> }).merge;
		const args: Record<string, unknown> = { type: entityType };
		for (const field of inputFields) {
			args[field] = { $input: field };
		}
		// Extra fields override input refs
		for (const [key, value] of Object.entries(extra)) {
			args[key] = value;
		}
		return {
			$pipe: [{ $do: "entity.update", $with: args }],
		};
	}

	// Unknown format - pass through
	return optimistic;
}

// =============================================================================
// Protocol Messages
// =============================================================================

/** Subscribe to operation with field selection */
interface SubscribeMessage {
	type: "subscribe";
	id: string;
	operation: string;
	input?: unknown;
	fields: string[] | "*";
	/** SelectionObject for nested field selection */
	select?: SelectionObject;
}

/** Update subscription fields */
interface UpdateFieldsMessage {
	type: "updateFields";
	id: string;
	addFields?: string[];
	removeFields?: string[];
	/** Replace all fields with these (for 最大原則 downgrade from "*" to specific fields) */
	setFields?: string[];
}

/** Unsubscribe */
interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/** One-time query */
interface QueryMessage {
	type: "query";
	id: string;
	operation: string;
	input?: unknown;
	fields?: string[] | "*";
	/** SelectionObject for nested field selection */
	select?: SelectionObject;
}

/** Mutation */
interface MutationMessage {
	type: "mutation";
	id: string;
	operation: string;
	input: unknown;
}

/** Handshake */
interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage =
	| SubscribeMessage
	| UpdateFieldsMessage
	| UnsubscribeMessage
	| QueryMessage
	| MutationMessage
	| HandshakeMessage
	| ReconnectMessage;

// =============================================================================
// Client Connection
// =============================================================================

interface ClientConnection {
	id: string;
	ws: WebSocketLike;
	subscriptions: Map<string, ClientSubscription>;
}

interface ClientSubscription {
	id: string;
	operation: string;
	input: unknown;
	fields: string[] | "*";
	/** Entity keys this subscription is tracking */
	entityKeys: Set<string>;
	/** Cleanup functions */
	cleanups: (() => void)[];
	/** Last emitted data for diff computation */
	lastData: unknown;
}

// =============================================================================
// DataLoader
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
			this.scheduleDispatch();
		});
	}

	private scheduleDispatch(): void {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => this.dispatch());
	}

	private async dispatch(): Promise<void> {
		this.scheduled = false;
		const batch = this.batch;
		this.batch = new Map();

		const keys = Array.from(batch.keys());
		if (keys.length === 0) return;

		try {
			const results = await this.batchFn(keys);
			keys.forEach((key, index) => {
				const callbacks = batch.get(key)!;
				const result = results[index] ?? null;
				for (const { resolve } of callbacks) resolve(result);
			});
		} catch (error) {
			for (const callbacks of batch.values()) {
				for (const { reject } of callbacks) reject(error as Error);
			}
		}
	}

	clear(): void {
		this.batch.clear();
	}
}

// =============================================================================
// Lens Server Implementation
// =============================================================================

/** No-op logger (default - silent) */
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

	/** GraphStateManager for per-client state tracking */
	private stateManager: GraphStateManager;

	/** Plugin manager for lifecycle hooks */
	private pluginManager: PluginManager;

	/** DataLoaders for N+1 batching (per-request) */
	private loaders = new Map<string, DataLoader<unknown, unknown>>();

	/** Client connections */
	private connections = new Map<string, ClientConnection>();
	private connectionCounter = 0;

	/** Server instance */
	private server: unknown = null;

	constructor(config: LensServerConfig<TContext> & { queries?: Q; mutations?: M }) {
		// Start with flat queries/mutations (legacy)
		const queries: QueriesMap = { ...(config.queries ?? {}) };
		const mutations: MutationsMap = { ...(config.mutations ?? {}) };

		// Flatten router into queries/mutations (if provided)
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
		// Normalize resolvers input (array or registry) to internal map
		this.resolverMap = config.resolvers ? toResolverMap(config.resolvers) : undefined;
		this.contextFactory = config.context ?? (() => ({}) as TContext);
		this.version = config.version ?? "1.0.0";
		this.logger = config.logger ?? noopLogger;

		// Inject entity names from keys (if not already set)
		for (const [name, def] of Object.entries(this.entities)) {
			if (def && typeof def === "object" && !def._name) {
				(def as { _name?: string })._name = name;
			}
		}

		// Inject mutation names and auto-derive optimistic from naming convention
		for (const [name, def] of Object.entries(this.mutations)) {
			if (def && typeof def === "object") {
				// Inject name
				(def as { _name?: string })._name = name;

				// Auto-derive optimistic from naming convention if not explicitly set
				// For namespaced routes (e.g., "user.create"), check the last segment
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

		// Initialize GraphStateManager
		this.stateManager = new GraphStateManager({
			onEntityUnsubscribed: (_entity, _id) => {
				// Optional: cleanup when entity has no subscribers
			},
		});

		// Initialize plugin manager
		this.pluginManager = createPluginManager();
		for (const plugin of config.plugins ?? []) {
			this.pluginManager.register(plugin);
		}

		// Validate queries and mutations
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

	getStateManager(): GraphStateManager {
		return this.stateManager;
	}

	/**
	 * Get server metadata for transport handshake.
	 * Used by inProcess transport for direct access.
	 */
	getMetadata(): ServerMetadata {
		return {
			version: this.version,
			operations: this.buildOperationsMap(),
		};
	}

	/**
	 * Execute operation - auto-detects query vs mutation from registered operations.
	 * Used by inProcess transport for direct server calls.
	 */
	async execute(op: LensOperation): Promise<LensResult> {
		const { path, input } = op;

		try {
			// Check if it's a query
			if (this.queries[path]) {
				const data = await this.executeQuery(path, input);
				return { data };
			}

			// Check if it's a mutation
			if (this.mutations[path]) {
				const data = await this.executeMutation(path, input);
				return { data };
			}

			// Operation not found
			return { error: new Error(`Operation not found: ${path}`) };
		} catch (error) {
			return { error: error instanceof Error ? error : new Error(String(error)) };
		}
	}

	/**
	 * Build nested operations map for handshake response
	 * Converts flat "user.get", "user.create" into nested { user: { get: {...}, create: {...} } }
	 */
	private buildOperationsMap(): OperationsMap {
		const result: OperationsMap = {};

		// Helper to set nested value
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

		// Add queries
		for (const [name, _def] of Object.entries(this.queries)) {
			setNested(name, { type: "query" });
		}

		// Add mutations with optimistic config (convert sugar to Reify Pipeline)
		for (const [name, def] of Object.entries(this.mutations)) {
			const meta: OperationMeta = { type: "mutation" };
			if (def._optimistic) {
				// Convert sugar syntax to Reify Pipeline
				const entityType = getEntityTypeName(def._output);
				const inputFields = getInputFields(def._input as { shape?: Record<string, unknown> });
				meta.optimistic = sugarToPipeline(def._optimistic, entityType, inputFields);
			}
			setNested(name, meta);
		}

		return result;
	}

	// ===========================================================================
	// WebSocket Handling
	// ===========================================================================

	handleWebSocket(ws: WebSocketLike): void {
		const clientId = `client_${++this.connectionCounter}`;

		const conn: ClientConnection = {
			id: clientId,
			ws,
			subscriptions: new Map(),
		};

		this.connections.set(clientId, conn);

		// Register with GraphStateManager
		this.stateManager.addClient({
			id: clientId,
			send: (msg) => {
				ws.send(JSON.stringify(msg));
			},
		});

		// Run onConnect hooks (async but we don't await - fire and forget for WS)
		this.pluginManager.runOnConnect({ clientId }).then((allowed) => {
			if (!allowed) {
				ws.close();
				this.handleDisconnect(conn);
			}
		});

		ws.onmessage = (event) => {
			this.handleMessage(conn, event.data as string);
		};

		ws.onclose = () => {
			this.handleDisconnect(conn);
		};
	}

	private handleMessage(conn: ClientConnection, data: string): void {
		try {
			const message = JSON.parse(data) as ClientMessage;

			switch (message.type) {
				case "handshake":
					this.handleHandshake(conn, message);
					break;
				case "subscribe":
					this.handleSubscribe(conn, message);
					break;
				case "updateFields":
					this.handleUpdateFields(conn, message);
					break;
				case "unsubscribe":
					this.handleUnsubscribe(conn, message);
					break;
				case "query":
					this.handleQuery(conn, message);
					break;
				case "mutation":
					this.handleMutation(conn, message);
					break;
				case "reconnect":
					this.handleReconnect(conn, message);
					break;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: { code: "PARSE_ERROR", message: String(error) },
				}),
			);
		}
	}

	private handleHandshake(conn: ClientConnection, message: HandshakeMessage): void {
		conn.ws.send(
			JSON.stringify({
				type: "handshake",
				id: message.id,
				version: this.version,
				operations: this.buildOperationsMap(),
			}),
		);
	}

	private handleReconnect(conn: ClientConnection, message: ReconnectMessage): void {
		const startTime = Date.now();

		try {
			// Re-register client with GraphStateManager (may have been cleaned up)
			if (!this.stateManager.hasClient(conn.id)) {
				this.stateManager.addClient({
					id: conn.id,
					send: (msg) => {
						conn.ws.send(JSON.stringify(msg));
					},
				});
			}

			// Process reconnection through GraphStateManager
			const results = this.stateManager.handleReconnect(message.subscriptions);

			// Re-establish subscriptions in local connection state
			for (const sub of message.subscriptions) {
				// Find or create subscription entry
				let clientSub = conn.subscriptions.get(sub.id);
				if (!clientSub) {
					clientSub = {
						id: sub.id,
						operation: "", // Will be set by subsequent subscribe if needed
						input: sub.input,
						fields: sub.fields,
						entityKeys: new Set([`${sub.entity}:${sub.entityId}`]),
						cleanups: [],
						lastData: null,
					};
					conn.subscriptions.set(sub.id, clientSub);
				}

				// Re-subscribe to entity in GraphStateManager
				this.stateManager.subscribe(conn.id, sub.entity, sub.entityId, sub.fields);
			}

			// Send reconnect acknowledgment
			conn.ws.send(
				JSON.stringify({
					type: "reconnect_ack",
					results,
					serverTime: Date.now(),
					reconnectId: message.reconnectId,
					processingTime: Date.now() - startTime,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "RECONNECT_ERROR",
						message: String(error),
						reconnectId: message.reconnectId,
					},
				}),
			);
		}
	}

	private async handleSubscribe(conn: ClientConnection, message: SubscribeMessage): Promise<void> {
		const { id, operation, input, fields } = message;

		// Run onSubscribe hooks
		const allowed = await this.pluginManager.runOnSubscribe({
			clientId: conn.id,
			subscriptionId: id,
			operation,
			input,
			fields,
		});

		if (!allowed) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "SUBSCRIPTION_REJECTED", message: "Subscription rejected by plugin" },
				}),
			);
			return;
		}

		// Create subscription
		const sub: ClientSubscription = {
			id,
			operation,
			input,
			fields,
			entityKeys: new Set(),
			cleanups: [],
			lastData: null,
		};

		conn.subscriptions.set(id, sub);

		// Execute query and start streaming
		try {
			await this.executeSubscription(conn, sub);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private async executeSubscription(
		conn: ClientConnection,
		sub: ClientSubscription,
	): Promise<void> {
		const queryDef = this.queries[sub.operation];
		if (!queryDef) {
			throw new Error(`Query not found: ${sub.operation}`);
		}

		// Validate input
		if (queryDef._input && sub.input !== undefined) {
			const result = queryDef._input.safeParse(sub.input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();
		let isFirstUpdate = true;

		// Create emit function that integrates with GraphStateManager
		const emitData = (data: unknown) => {
			if (!data) return;

			// Extract entity info from data
			const entityName = this.getEntityNameFromOutput(queryDef._output);
			const entities = this.extractEntities(entityName, data);

			// Register entities with GraphStateManager and track in subscription
			for (const { entity, id, entityData } of entities) {
				const entityKey = `${entity}:${id}`;
				sub.entityKeys.add(entityKey);

				// Subscribe client to this entity in GraphStateManager
				this.stateManager.subscribe(conn.id, entity, id, sub.fields);

				// Emit to GraphStateManager (it will compute diffs and send to client)
				this.stateManager.emit(entity, id, entityData);
			}

			// Also send operation-level response for first data
			if (isFirstUpdate) {
				conn.ws.send(
					JSON.stringify({
						type: "data",
						id: sub.id,
						data,
					}),
				);
				isFirstUpdate = false;
				sub.lastData = data;
			} else {
				// Compute operation-level diff for subsequent updates
				const updates = this.computeUpdates(sub.lastData, data);
				if (updates && Object.keys(updates).length > 0) {
					conn.ws.send(
						JSON.stringify({
							type: "update",
							id: sub.id,
							updates,
						}),
					);
				}
				sub.lastData = data;
			}
		};

		// Execute resolver
		await runWithContext(this.ctx, context, async () => {
			const resolver = queryDef._resolve;
			if (!resolver) {
				throw new Error(`Query ${sub.operation} has no resolver`);
			}

			// Create emit API for this subscription
			const emit = createEmit((command: EmitCommand) => {
				// Route emit commands to appropriate handler
				const entityName = this.getEntityNameFromOutput(queryDef._output);
				if (entityName) {
					// For entity-typed outputs, use GraphStateManager
					const entities = this.extractEntities(
						entityName,
						command.type === "full" ? command.data : {},
					);
					for (const { entity, id } of entities) {
						this.stateManager.processCommand(entity, id, command);
					}
				}
				// Also emit the raw data for operation-level updates
				if (command.type === "full") {
					emitData(command.data);
				}
			});

			// Create onCleanup function
			const onCleanup = (fn: () => void) => {
				sub.cleanups.push(fn);
				return () => {
					const idx = sub.cleanups.indexOf(fn);
					if (idx >= 0) sub.cleanups.splice(idx, 1);
				};
			};

			// Merge Lens extensions (emit, onCleanup) into user context
			const lensContext = {
				...context,
				emit,
				onCleanup,
			};

			const result = resolver({
				input: sub.input,
				ctx: lensContext,
			});

			if (isAsyncIterable(result)) {
				// Async generator - stream all values
				for await (const value of result) {
					emitData(value);
				}
			} else {
				// Single value
				const value = await result;
				emitData(value);
			}
		});
	}

	private handleUpdateFields(conn: ClientConnection, message: UpdateFieldsMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		// Handle 最大原則 (Maximum Principle) transitions:

		// 1. Upgrade to full subscription ("*")
		if (message.addFields?.includes("*")) {
			sub.fields = "*";
			// Update GraphStateManager subscriptions for all tracked entities
			for (const entityKey of sub.entityKeys) {
				const [entity, id] = entityKey.split(":");
				this.stateManager.updateSubscription(conn.id, entity, id, "*");
			}
			return;
		}

		// 2. Downgrade from "*" to specific fields (setFields)
		if (message.setFields !== undefined) {
			sub.fields = message.setFields;
			// Update GraphStateManager subscriptions for all tracked entities
			for (const entityKey of sub.entityKeys) {
				const [entity, id] = entityKey.split(":");
				this.stateManager.updateSubscription(conn.id, entity, id, sub.fields);
			}
			return;
		}

		// 3. Already subscribing to all fields - no-op for regular add/remove
		if (sub.fields === "*") {
			return;
		}

		// 4. Normal field add/remove
		const fields = new Set(sub.fields);

		if (message.addFields) {
			for (const field of message.addFields) {
				fields.add(field);
			}
		}

		if (message.removeFields) {
			for (const field of message.removeFields) {
				fields.delete(field);
			}
		}

		sub.fields = Array.from(fields);

		// Update GraphStateManager subscriptions for all tracked entities
		for (const entityKey of sub.entityKeys) {
			const [entity, id] = entityKey.split(":");
			this.stateManager.updateSubscription(conn.id, entity, id, sub.fields);
		}
	}

	private handleUnsubscribe(conn: ClientConnection, message: UnsubscribeMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		// Cleanup
		for (const cleanup of sub.cleanups) {
			try {
				cleanup();
			} catch (e) {
				this.logger.error?.("Cleanup error:", e);
			}
		}

		// Unsubscribe from all tracked entities in GraphStateManager
		for (const entityKey of sub.entityKeys) {
			const [entity, id] = entityKey.split(":");
			this.stateManager.unsubscribe(conn.id, entity, id);
		}

		conn.subscriptions.delete(message.id);

		// Run onUnsubscribe hooks
		this.pluginManager.runOnUnsubscribe({
			clientId: conn.id,
			subscriptionId: message.id,
			operation: sub.operation,
			entityKeys: Array.from(sub.entityKeys),
		});
	}

	private async handleQuery(conn: ClientConnection, message: QueryMessage): Promise<void> {
		try {
			// If select is provided, inject it into input for executeQuery to process
			let input = message.input;
			if (message.select) {
				input = { ...((message.input as object) || {}), $select: message.select };
			}

			const result = await this.executeQuery(message.operation, input);

			// Apply field selection if specified (for backward compatibility with simple field lists)
			const selected =
				message.fields && !message.select ? this.applySelection(result, message.fields) : result;

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: selected,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private async handleMutation(conn: ClientConnection, message: MutationMessage): Promise<void> {
		try {
			const result = await this.executeMutation(message.operation, message.input);

			// After mutation, emit to GraphStateManager to notify all subscribers
			const entityName = this.getEntityNameFromMutation(message.operation);
			const entities = this.extractEntities(entityName, result);

			for (const { entity, id, entityData } of entities) {
				this.stateManager.emit(entity, id, entityData);
			}

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: result,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private handleDisconnect(conn: ClientConnection): void {
		const subscriptionCount = conn.subscriptions.size;

		// Cleanup all subscriptions
		for (const sub of conn.subscriptions.values()) {
			for (const cleanup of sub.cleanups) {
				try {
					cleanup();
				} catch (e) {
					this.logger.error?.("Cleanup error:", e);
				}
			}
		}

		// Remove from GraphStateManager
		this.stateManager.removeClient(conn.id);

		// Remove connection
		this.connections.delete(conn.id);

		// Run onDisconnect hooks
		this.pluginManager.runOnDisconnect({
			clientId: conn.id,
			subscriptionCount,
		});
	}

	// ===========================================================================
	// Query/Mutation Execution
	// ===========================================================================

	async executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput> {
		const queryDef = this.queries[name];
		if (!queryDef) {
			throw new Error(`Query not found: ${name}`);
		}

		// Extract $select from input if present
		let select: SelectionObject | undefined;
		let cleanInput = input;
		if (input && typeof input === "object" && "$select" in input) {
			const { $select, ...rest } = input as Record<string, unknown>;
			select = $select as SelectionObject;
			cleanInput = (Object.keys(rest).length > 0 ? rest : undefined) as TInput;
		}

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

				// Create no-op emit for one-shot queries (emit is only meaningful in subscriptions)
				const emit = createEmit(() => {});
				const onCleanup = () => () => {};

				// Merge Lens extensions (emit, onCleanup) into user context
				const lensContext = {
					...context,
					emit,
					onCleanup,
				};

				const result = resolver({
					input: cleanInput as TInput,
					ctx: lensContext,
				});

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

				// Process with entity resolvers and selection
				return this.processQueryResult(name, data, select);
			});
		} finally {
			this.clearLoaders();
		}
	}

	async executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
		const mutationDef = this.mutations[name];
		if (!mutationDef) {
			throw new Error(`Mutation not found: ${name}`);
		}

		if (mutationDef._input) {
			const result = mutationDef._input.safeParse(input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		// Run beforeMutation hooks
		const startTime = Date.now();
		const allowed = await this.pluginManager.runBeforeMutation({ name, input });
		if (!allowed) {
			throw new Error(`Mutation ${name} rejected by plugin`);
		}

		const context = await this.contextFactory();

		try {
			const result = await runWithContext(this.ctx, context, async () => {
				const resolver = mutationDef._resolve;
				if (!resolver) {
					throw new Error(`Mutation ${name} has no resolver`);
				}

				// Create no-op emit for mutations (emit is primarily for subscriptions)
				const emit = createEmit(() => {});
				const onCleanup = () => () => {};

				// Merge Lens extensions (emit, onCleanup) into user context
				const lensContext = {
					...context,
					emit,
					onCleanup,
				};

				const mutationResult = await resolver({
					input: input as TInput,
					ctx: lensContext,
				});

				// Emit to GraphStateManager
				const entityName = this.getEntityNameFromMutation(name);
				const entities = this.extractEntities(entityName, mutationResult);

				for (const { entity, id, entityData } of entities) {
					this.stateManager.emit(entity, id, entityData);
				}

				return mutationResult as TOutput;
			});

			// Run afterMutation hooks
			const duration = Date.now() - startTime;
			await this.pluginManager.runAfterMutation({ name, input, result, duration });

			return result;
		} finally {
			this.clearLoaders();
		}
	}

	// ===========================================================================
	// HTTP Handler
	// ===========================================================================

	async handleRequest(req: Request): Promise<Response> {
		const url = new URL(req.url);

		// GET /__lens/metadata - Return operations metadata for client transport handshake
		if (req.method === "GET" && url.pathname.endsWith("/__lens/metadata")) {
			return new Response(JSON.stringify(this.getMetadata()), {
				headers: { "Content-Type": "application/json" },
			});
		}

		if (req.method === "POST") {
			try {
				const body = (await req.json()) as { operation: string; input?: unknown };

				// Auto-detect operation type from server's registered operations
				// Client doesn't need to know if it's a query or mutation
				if (this.queries[body.operation]) {
					const result = await this.executeQuery(body.operation, body.input);
					return new Response(JSON.stringify({ data: result }), {
						headers: { "Content-Type": "application/json" },
					});
				}

				if (this.mutations[body.operation]) {
					const result = await this.executeMutation(body.operation, body.input);
					return new Response(JSON.stringify({ data: result }), {
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response(JSON.stringify({ error: `Operation not found: ${body.operation}` }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ error: String(error) }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		return new Response("Method not allowed", { status: 405 });
	}

	// ===========================================================================
	// Server Lifecycle
	// ===========================================================================

	async listen(port: number): Promise<void> {
		this.server = Bun.serve({
			port,
			fetch: (req, server) => {
				if (server.upgrade(req)) {
					return;
				}
				return this.handleRequest(req);
			},
			websocket: {
				message: (ws, message) => {
					const conn = this.findConnectionByWs(ws);
					if (conn) {
						this.handleMessage(conn, String(message));
					}
				},
				close: (ws) => {
					const conn = this.findConnectionByWs(ws);
					if (conn) {
						this.handleDisconnect(conn);
					}
				},
			},
		});

		this.logger.info?.(`Lens server listening on port ${port}`);
	}

	async close(): Promise<void> {
		if (this.server && typeof (this.server as { stop?: () => void }).stop === "function") {
			(this.server as { stop: () => void }).stop();
		}
		this.server = null;
	}

	private findConnectionByWs(ws: unknown): ClientConnection | undefined {
		for (const conn of this.connections.values()) {
			if (conn.ws === ws) {
				return conn;
			}
		}
		return undefined;
	}

	// ===========================================================================
	// Helper Methods
	// ===========================================================================

	private getEntityNameFromOutput(output: unknown): string {
		if (!output) return "unknown";
		if (typeof output === "object" && output !== null) {
			// Check for _name (new API) or name (backward compat)
			if ("_name" in output) {
				return (output as { _name: string })._name;
			}
			if ("name" in output) {
				return (output as { name: string }).name;
			}
		}
		if (Array.isArray(output) && output.length > 0) {
			const first = output[0];
			if (typeof first === "object" && first !== null) {
				if ("_name" in first) {
					return (first as { _name: string })._name;
				}
				if ("name" in first) {
					return (first as { name: string }).name;
				}
			}
		}
		return "unknown";
	}

	private getEntityNameFromMutation(name: string): string {
		const mutationDef = this.mutations[name];
		if (!mutationDef) return "unknown";
		return this.getEntityNameFromOutput(mutationDef._output);
	}

	private extractEntities(
		entityName: string,
		data: unknown,
	): Array<{ entity: string; id: string; entityData: Record<string, unknown> }> {
		const results: Array<{ entity: string; id: string; entityData: Record<string, unknown> }> = [];

		if (!data) return results;

		if (Array.isArray(data)) {
			for (const item of data) {
				if (item && typeof item === "object" && "id" in item) {
					results.push({
						entity: entityName,
						id: String((item as { id: unknown }).id),
						entityData: item as Record<string, unknown>,
					});
				}
			}
		} else if (typeof data === "object" && "id" in data) {
			results.push({
				entity: entityName,
				id: String((data as { id: unknown }).id),
				entityData: data as Record<string, unknown>,
			});
		}

		return results;
	}

	private applySelection(data: unknown, fields: string[] | "*" | SelectionObject): unknown {
		if (fields === "*" || !data) return data;

		if (Array.isArray(data)) {
			return data.map((item) => this.applySelectionToObject(item, fields));
		}

		return this.applySelectionToObject(data, fields);
	}

	private applySelectionToObject(
		data: unknown,
		fields: string[] | SelectionObject,
	): Record<string, unknown> | null {
		if (!data || typeof data !== "object") return null;

		const result: Record<string, unknown> = {};
		const obj = data as Record<string, unknown>;

		// Always include id
		if ("id" in obj) {
			result.id = obj.id;
		}

		// Handle string array (simple field list)
		if (Array.isArray(fields)) {
			for (const field of fields) {
				if (field in obj) {
					result[field] = obj[field];
				}
			}
			return result;
		}

		// Handle SelectionObject (nested selection)
		for (const [key, value] of Object.entries(fields)) {
			if (value === false) continue;

			const dataValue = obj[key];

			if (value === true) {
				// Simple field selection
				result[key] = dataValue;
			} else if (typeof value === "object" && value !== null) {
				// Nested selection (relations or nested select)
				const nestedSelect = (value as { select?: SelectionObject }).select ?? value;

				if (Array.isArray(dataValue)) {
					// HasMany relation
					result[key] = dataValue.map((item) =>
						this.applySelectionToObject(item, nestedSelect as SelectionObject),
					);
				} else if (dataValue !== null && typeof dataValue === "object") {
					// HasOne/BelongsTo relation
					result[key] = this.applySelectionToObject(dataValue, nestedSelect as SelectionObject);
				} else {
					result[key] = dataValue;
				}
			}
		}

		return result;
	}

	// ===========================================================================
	// Entity Resolver Execution
	// ===========================================================================

	/**
	 * Execute entity resolvers for nested data.
	 * Processes the selection object and resolves relation fields using new resolver() pattern.
	 */
	private async executeEntityResolvers<T>(
		entityName: string,
		data: T,
		select?: SelectionObject,
	): Promise<T> {
		if (!data || !select || !this.resolverMap) return data;

		// Get resolver for this entity
		const resolverDef = this.resolverMap.get(entityName);
		if (!resolverDef) return data;

		const result = { ...(data as Record<string, unknown>) };
		const context = await this.contextFactory();

		for (const [fieldName, fieldSelect] of Object.entries(select)) {
			if (fieldSelect === false || fieldSelect === true) continue;

			// Check if this field has a resolver
			if (!resolverDef.hasField(fieldName)) continue;

			// Extract field args from selection
			const fieldArgs =
				typeof fieldSelect === "object" && fieldSelect !== null && "args" in fieldSelect
					? ((fieldSelect as { args?: Record<string, unknown> }).args ?? {})
					: {};

			// Execute field resolver with args
			result[fieldName] = await resolverDef.resolveField(
				fieldName,
				data as any,
				fieldArgs,
				context as any,
			);

			// Recursively resolve nested selections
			const nestedSelect = (fieldSelect as { select?: SelectionObject }).select;
			if (nestedSelect && result[fieldName]) {
				const relationData = result[fieldName];
				// Get target entity name from the entity definition if available
				const targetEntity = this.getRelationTargetEntity(entityName, fieldName);

				if (Array.isArray(relationData)) {
					result[fieldName] = await Promise.all(
						relationData.map((item) =>
							this.executeEntityResolvers(targetEntity, item, nestedSelect),
						),
					);
				} else {
					result[fieldName] = await this.executeEntityResolvers(
						targetEntity,
						relationData,
						nestedSelect,
					);
				}
			}
		}

		return result as T;
	}

	/**
	 * Get target entity name for a relation field.
	 */
	private getRelationTargetEntity(entityName: string, fieldName: string): string {
		const entityDef = this.entities[entityName];
		if (!entityDef) return fieldName; // Fallback to field name

		// EntityDef has 'fields' property
		const fields = (entityDef as { fields?: Record<string, FieldType> }).fields;
		if (!fields) return fieldName;

		const fieldDef = fields[fieldName];
		if (!fieldDef) return fieldName;

		// Check if it's a relation type
		if (
			fieldDef._type === "hasMany" ||
			fieldDef._type === "hasOne" ||
			fieldDef._type === "belongsTo"
		) {
			return (fieldDef as unknown as { _target: string })._target ?? fieldName;
		}

		return fieldName;
	}

	/**
	 * Serialize entity data for transport.
	 * Auto-calls serialize() on field types (Date → ISO string, etc.)
	 */
	private serializeEntity(
		entityName: string,
		data: Record<string, unknown> | null,
	): Record<string, unknown> | null {
		if (data === null) return null;

		const entityDef = this.entities[entityName];
		if (!entityDef) return data;

		// EntityDef has 'fields' property
		const fields = (entityDef as { fields?: Record<string, FieldType> }).fields;
		if (!fields) return data;

		const result: Record<string, unknown> = {};

		for (const [fieldName, value] of Object.entries(data)) {
			const fieldType = fields[fieldName];

			if (!fieldType) {
				// Field not in schema (extra data from resolver)
				result[fieldName] = value;
				continue;
			}

			// Handle null values
			if (value === null || value === undefined) {
				result[fieldName] = value;
				continue;
			}

			// Relations: recursively serialize
			if (
				fieldType._type === "hasMany" ||
				fieldType._type === "belongsTo" ||
				fieldType._type === "hasOne"
			) {
				const targetEntity = (fieldType as { _target?: string })._target;
				if (targetEntity && Array.isArray(value)) {
					result[fieldName] = value.map((item) =>
						this.serializeEntity(targetEntity, item as Record<string, unknown>),
					);
				} else if (targetEntity && typeof value === "object") {
					result[fieldName] = this.serializeEntity(targetEntity, value as Record<string, unknown>);
				} else {
					result[fieldName] = value;
				}
				continue;
			}

			// Scalar field - call serialize() if method exists
			if (typeof (fieldType as { serialize?: (v: unknown) => unknown }).serialize === "function") {
				try {
					result[fieldName] = (fieldType as { serialize: (v: unknown) => unknown }).serialize(
						value,
					);
				} catch (error) {
					this.logger.warn?.(`Failed to serialize field ${entityName}.${fieldName}:`, error);
					result[fieldName] = value;
				}
			} else {
				result[fieldName] = value;
			}
		}

		return result;
	}

	/**
	 * Process query result: execute entity resolvers, apply selection, serialize
	 */
	private async processQueryResult<T>(
		queryName: string,
		data: T,
		select?: SelectionObject,
	): Promise<T> {
		if (data === null || data === undefined) return data;

		// Determine entity name from query definition's _output
		const queryDef = this.queries[queryName];
		const entityName = this.getEntityNameFromOutput(queryDef?._output);

		// Handle array results - process each item
		if (Array.isArray(data)) {
			const processedItems = await Promise.all(
				data.map(async (item) => {
					let result = item;

					// Execute entity resolvers for nested data
					if (select && this.resolverMap) {
						result = await this.executeEntityResolvers(entityName, item, select);
					}

					// Apply field selection
					if (select) {
						result = this.applySelection(result, select);
					}

					// Serialize for transport
					if (entityName) {
						return this.serializeEntity(entityName, result as Record<string, unknown>);
					}

					return result;
				}),
			);
			return processedItems as T;
		}

		// Single object result
		let result: T = data;

		// Execute entity resolvers for nested data
		if (select && this.resolverMap) {
			result = (await this.executeEntityResolvers(entityName, data, select)) as T;
		}

		// Apply field selection
		if (select) {
			result = this.applySelection(result, select) as T;
		}

		// Serialize for transport
		if (entityName && typeof result === "object" && result !== null) {
			return this.serializeEntity(entityName, result as Record<string, unknown>) as T;
		}

		return result;
	}

	private computeUpdates(oldData: unknown, newData: unknown): Record<string, Update> | null {
		if (!oldData || !newData) return null;
		if (typeof oldData !== "object" || typeof newData !== "object") return null;

		const updates: Record<string, Update> = {};
		const oldObj = oldData as Record<string, unknown>;
		const newObj = newData as Record<string, unknown>;

		for (const key of Object.keys(newObj)) {
			const oldValue = oldObj[key];
			const newValue = newObj[key];

			if (!this.deepEqual(oldValue, newValue)) {
				updates[key] = createUpdate(oldValue, newValue);
			}
		}

		return Object.keys(updates).length > 0 ? updates : null;
	}

	private deepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a !== "object" || a === null || b === null) return false;

		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;

		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);

		if (aKeys.length !== bKeys.length) return false;

		for (const key of aKeys) {
			if (!this.deepEqual(aObj[key], bObj[key])) return false;
		}

		return true;
	}

	private clearLoaders(): void {
		for (const loader of this.loaders.values()) {
			loader.clear();
		}
		this.loaders.clear();
	}
}

// =============================================================================
// Utility
// =============================================================================

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return value !== null && typeof value === "object" && Symbol.asyncIterator in value;
}

// =============================================================================
// Type Inference Utilities (tRPC-style)
// =============================================================================

/**
 * Infer input type from a query/mutation definition
 */
export type InferInput<T> =
	T extends QueryDef<infer I, unknown>
		? I extends void
			? void
			: I
		: T extends MutationDef<infer I, unknown>
			? I
			: never;

/**
 * Infer output type from a query/mutation definition
 */
export type InferOutput<T> =
	T extends QueryDef<unknown, infer O> ? O : T extends MutationDef<unknown, infer O> ? O : never;

/**
 * API type for client inference
 * Export this type for client-side type safety
 *
 * @example
 * ```typescript
 * // Server
 * const server = createLensServer({ queries, mutations });
 * export type Api = InferApi<typeof server>;
 *
 * // Client (only imports TYPE)
 * import type { Api } from './server';
 * const client = createClient<Api>({ links: [...] });
 * ```
 */
export type InferApi<T> = T extends { _types: infer Types } ? Types : never;

// =============================================================================
// Factory
// =============================================================================

/**
 * Config helper type that infers context from router
 */
export type ServerConfigWithInferredContext<
	TRouter extends RouterDef,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	entities?: EntitiesMap;
	router: TRouter;
	queries?: Q;
	mutations?: M;
	/** Field resolvers array */
	resolvers?: Resolvers;
	/** Context factory - type is inferred from router's procedures */
	context?: (req?: unknown) => InferRouterContext<TRouter> | Promise<InferRouterContext<TRouter>>;
	version?: string;
};

/**
 * Config without router (legacy flat queries/mutations)
 */
export type ServerConfigLegacy<
	TContext extends ContextValue = ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	entities?: EntitiesMap;
	router?: undefined;
	queries?: Q;
	mutations?: M;
	/** Field resolvers array */
	resolvers?: Resolvers;
	context?: (req?: unknown) => TContext | Promise<TContext>;
	version?: string;
};

/**
 * Create Lens server with Operations API + Optimization Layer
 *
 * When using a router with typed context (from initLens), the context
 * function's return type is automatically enforced to match.
 *
 * @example
 * ```typescript
 * // Context type is inferred from router's procedures
 * const server = createServer({
 *   router: appRouter,  // RouterDef with MyContext
 *   context: () => ({
 *     db: prisma,
 *     user: null,
 *   }),  // Must match MyContext!
 * })
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
	// Attach type marker for inference (stripped at runtime)
	return server as unknown as LensServer & {
		_types: { queries: Q; mutations: M; context: TContext };
	};
}
