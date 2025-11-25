/**
 * @lens/server - Server V2 (Full Reactive Architecture)
 *
 * Server creation with complete support for:
 * - Operations (query/mutation definitions)
 * - Streaming subscriptions (live queries)
 * - Three resolver patterns: return, yield, ctx.emit()
 * - GraphStateManager integration (canonical state + diff)
 * - Per-client subscription tracking
 *
 * @example
 * ```typescript
 * import { createServerV2 } from '@lens/server';
 *
 * const server = createServerV2({
 *   queries: {
 *     // Single value (return)
 *     getUser: query({ ... }).resolve(async ({ input }) => {
 *       return db.user.findUnique({ where: { id: input.id } });
 *     }),
 *
 *     // Streaming (yield)
 *     watchUser: query({ ... }).resolve(async function*({ input }) {
 *       yield await db.user.findUnique({ where: { id: input.id } });
 *       for await (const change of userChanges(input.id)) {
 *         yield change;
 *       }
 *     }),
 *
 *     // Event-based (ctx.emit)
 *     liveUser: query({ ... }).resolve(async ({ input, ctx }) => {
 *       const user = await db.user.findUnique({ where: { id: input.id } });
 *       ctx.emit(user);
 *
 *       const unsubscribe = events.on(`user:${input.id}`, (data) => {
 *         ctx.emit(data);
 *       });
 *       ctx.onCleanup(unsubscribe);
 *     }),
 *   },
 *   mutations,
 *   context: async (req) => ({ db: prisma }),
 * });
 *
 * server.listen(3000);
 * ```
 */

import {
	type QueryDef,
	type MutationDef,
	type EntityResolvers,
	type EntityResolversDefinition,
	type EntityDef,
	type EntityDefinition,
	type RelationDef,
	type RelationTypeWithForeignKey,
	type ContextValue,
	type Update,
	type FieldType,
	isQueryDef,
	isMutationDef,
	isBatchResolver,
	createContext,
	runWithContext,
	createUpdate,
} from "@lens/core";

// =============================================================================
// DataLoader for N+1 Elimination
// =============================================================================

/**
 * Simple DataLoader implementation for batching resolver calls.
 * Collects multiple load() calls in the same tick and batches them.
 */
class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> =
		new Map();
	private scheduled = false;

	constructor(
		private batchFn: (keys: K[]) => Promise<(V | null)[]>,
	) {}

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
				callbacks.forEach(({ resolve }) => resolve(result));
			});
		} catch (error) {
			for (const callbacks of batch.values()) {
				callbacks.forEach(({ reject }) => reject(error as Error));
			}
		}
	}

	clear(): void {
		this.batch.clear();
	}
}

/** Selection object type */
type SelectionObject = Record<string, boolean | SelectionObject | { select: SelectionObject }>;

// =============================================================================
// Types
// =============================================================================

/** Entity definitions map */
export type EntitiesMap = Record<string, EntityDef<string, EntityDefinition>>;

/** Relations array */
export type RelationsArray = RelationDef<EntityDef<string, EntityDefinition>, Record<string, RelationTypeWithForeignKey>>[];

/** Queries map */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Emit context for streaming resolvers */
export interface EmitContext<T = unknown> {
	/**
	 * Emit data to subscribed clients.
	 * Can be called multiple times for streaming updates.
	 *
	 * @param data - Full or partial data
	 * @example
	 * ctx.emit({ content: "Updated content" })  // Partial update
	 * ctx.emit({ id, title, content })          // Full update
	 */
	emit: (data: Partial<T>) => void;

	/**
	 * Register cleanup function called when subscription ends.
	 *
	 * @param fn - Cleanup function
	 * @returns Unregister function
	 * @example
	 * ctx.onCleanup(() => redis.unsubscribe(channel))
	 */
	onCleanup: (fn: () => void) => () => void;
}

/** Server V2 configuration */
export interface ServerV2Config<
	TContext extends ContextValue = ContextValue,
> {
	/** Entity definitions */
	entities?: EntitiesMap;

	/** Relation definitions */
	relations?: RelationsArray;

	/** Query operations */
	queries?: QueriesMap;

	/** Mutation operations */
	mutations?: MutationsMap;

	/** Entity resolvers for nested data */
	resolvers?: EntityResolvers<EntityResolversDefinition>;

	/** Context factory */
	context?: (req?: unknown) => TContext | Promise<TContext>;

	/** Server version */
	version?: string;
}

/** Server V2 instance */
export interface LensServerV2 {
	/** Execute a query by name (single result) */
	executeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): Promise<TOutput>;

	/** Execute a mutation by name */
	executeMutation<TInput, TOutput>(
		name: string,
		input: TInput,
	): Promise<TOutput>;

	/** Subscribe to a query (streaming) - returns async iterable */
	subscribeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): AsyncIterable<TOutput>;

	/** Get query definition by name */
	getQuery(name: string): QueryDef<unknown, unknown> | undefined;

	/** Get mutation definition by name */
	getMutation(name: string): MutationDef<unknown, unknown> | undefined;

	/** Get all query names */
	getQueryNames(): string[];

	/** Get all mutation names */
	getMutationNames(): string[];

	/** Handle WebSocket connection */
	handleWebSocket(ws: WebSocketLike): void;

	/** Handle HTTP request */
	handleRequest(req: Request): Promise<Response>;

	/** Start listening on a port */
	listen(port: number): Promise<void>;

	/** Close the server */
	close(): Promise<void>;

	/** Get stats */
	getStats(): ServerStats;
}

/** Server statistics */
export interface ServerStats {
	/** Number of active WebSocket connections */
	connections: number;
	/** Number of active subscriptions */
	subscriptions: number;
}

/** WebSocket-like interface */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Message Types (V2 Protocol - Full Streaming)
// =============================================================================

/** Client query message (single result) */
interface QueryMessage {
	type: "query";
	id: string;
	name: string;
	input?: unknown;
}

/** Client subscribe message (streaming) */
interface SubscribeMessage {
	type: "subscribe";
	id: string;
	name: string;
	input?: unknown;
}

/** Client unsubscribe message */
interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/** Client mutation message */
interface MutationMessage {
	type: "mutation";
	id: string;
	name: string;
	input: unknown;
}

/** Client handshake message */
interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage = QueryMessage | SubscribeMessage | UnsubscribeMessage | MutationMessage | HandshakeMessage;

/** Server data response (single result for query) */
interface DataResponse {
	type: "data";
	id: string;
	data: unknown;
}

/** Server update response (streaming for subscribe) */
interface UpdateResponse {
	type: "update";
	id: string;
	data: unknown;
	/** Update strategy for efficient sync */
	updates?: Record<string, Update>;
}

/** Server complete response (subscription ended) */
interface CompleteResponse {
	type: "complete";
	id: string;
}

/** Server result response (for mutations) */
interface ResultResponse {
	type: "result";
	id: string;
	data: unknown;
}

/** Server error response */
interface ErrorResponse {
	type: "error";
	id?: string;
	error: {
		code: string;
		message: string;
	};
}

// =============================================================================
// Per-Client State
// =============================================================================

/** Subscription state for a client */
interface ClientSubscription {
	/** Subscription ID */
	id: string;
	/** Query name */
	name: string;
	/** Query input */
	input: unknown;
	/** Last sent data (for diff computation) */
	lastData: unknown;
	/** Cleanup functions */
	cleanups: (() => void)[];
	/** Whether subscription is active */
	active: boolean;
}

/** Per-client connection state */
interface ClientConnection {
	/** Client ID */
	clientId: string;
	/** WebSocket reference */
	ws: WebSocketLike;
	/** Active subscriptions */
	subscriptions: Map<string, ClientSubscription>;
}

// =============================================================================
// Server Implementation
// =============================================================================

class LensServerV2Impl<TContext extends ContextValue> implements LensServerV2 {
	private queries: QueriesMap;
	private mutations: MutationsMap;
	private entities: EntitiesMap;
	private resolvers?: EntityResolvers<EntityResolversDefinition>;
	private contextFactory: (req?: unknown) => TContext | Promise<TContext>;
	private version: string;
	private server: unknown = null;
	private ctx = createContext<TContext>();

	/** DataLoaders for batch resolution (per-request) */
	private loaders = new Map<string, DataLoader<unknown, unknown>>();

	/** Per-client connections */
	private connections = new Map<string, ClientConnection>();
	private connectionCounter = 0;

	constructor(config: ServerV2Config<TContext>) {
		this.queries = config.queries ?? {};
		this.mutations = config.mutations ?? {};
		this.entities = config.entities ?? {};
		this.resolvers = config.resolvers;
		this.contextFactory = config.context ?? (() => ({} as TContext));
		this.version = config.version ?? "2.0.0";

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

	// ===========================================================================
	// Field Selection & Entity Resolution
	// ===========================================================================

	/**
	 * Apply field selection to result data.
	 * Filters the data object to only include selected fields.
	 */
	private applySelection<T>(
		data: T | null,
		select?: SelectionObject,
	): T | null {
		if (data === null || !select) return data;

		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(select)) {
			if (value === false) continue;

			const dataValue = (data as Record<string, unknown>)[key];

			if (value === true) {
				// Simple field selection
				result[key] = dataValue;
			} else if (typeof value === "object" && value !== null) {
				// Nested selection (relations or nested select)
				const nestedSelect = (value as { select?: SelectionObject }).select ?? value;

				if (Array.isArray(dataValue)) {
					// HasMany relation
					result[key] = dataValue.map((item) =>
						this.applySelection(item as Record<string, unknown>, nestedSelect as SelectionObject),
					);
				} else if (dataValue !== null && typeof dataValue === "object") {
					// HasOne/BelongsTo relation
					result[key] = this.applySelection(
						dataValue as Record<string, unknown>,
						nestedSelect as SelectionObject,
					);
				} else {
					result[key] = dataValue;
				}
			}
		}

		// Always include id if present in data (unless explicitly excluded)
		if ("id" in (data as Record<string, unknown>) && !("id" in select)) {
			result.id = (data as Record<string, unknown>).id;
		}

		return result as T;
	}

	/**
	 * Execute entity resolvers for nested data.
	 * Processes the selection object and resolves relation fields.
	 */
	private async executeEntityResolvers<T>(
		entityName: string,
		data: T,
		select?: SelectionObject,
	): Promise<T> {
		if (!data || !select || !this.resolvers) return data;

		const result = { ...(data as Record<string, unknown>) };

		for (const [fieldName, fieldSelect] of Object.entries(select)) {
			if (fieldSelect === false || fieldSelect === true) continue;

			// Check if this field has an entity resolver
			const resolver = this.resolvers.getResolver(entityName, fieldName);
			if (!resolver) continue;

			// Execute resolver (with batching if available)
			if (isBatchResolver(resolver)) {
				// Use DataLoader for batching
				const loaderKey = `${entityName}.${fieldName}`;
				if (!this.loaders.has(loaderKey)) {
					this.loaders.set(
						loaderKey,
						new DataLoader(async (parents: unknown[]) => {
							return resolver.batch(parents);
						}),
					);
				}
				const loader = this.loaders.get(loaderKey)!;
				result[fieldName] = await loader.load(data);
			} else {
				// Simple resolver
				result[fieldName] = await resolver(data);
			}

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
		if (fieldDef._type === "hasMany" || fieldDef._type === "hasOne" || fieldDef._type === "belongsTo") {
			return (fieldDef as { _target: string })._target ?? fieldName;
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
			if (fieldType._type === "hasMany" || fieldType._type === "belongsTo" || fieldType._type === "hasOne") {
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
					result[fieldName] = (fieldType as { serialize: (v: unknown) => unknown }).serialize(value);
				} catch (error) {
					console.warn(`Failed to serialize field ${entityName}.${fieldName}:`, error);
					result[fieldName] = value;
				}
			} else {
				result[fieldName] = value;
			}
		}

		return result;
	}

	/**
	 * Clear DataLoaders (call at end of request)
	 */
	private clearLoaders(): void {
		for (const loader of this.loaders.values()) {
			loader.clear();
		}
		this.loaders.clear();
	}

	// ===========================================================================
	// Query Execution (Single Result)
	// ===========================================================================

	async executeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): Promise<TOutput> {
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

		// Validate input if schema provided
		if (queryDef._input && cleanInput !== undefined) {
			const result = queryDef._input.safeParse(cleanInput);
			if (!result.success) {
				throw new Error(`Invalid input for query ${name}: ${JSON.stringify(result.error)}`);
			}
		}

		// Execute resolver with context
		const context = await this.contextFactory();
		try {
			return await runWithContext(this.ctx, context, async () => {
				const resolver = queryDef._resolve;
				if (!resolver) {
					throw new Error(`Query ${name} has no resolver`);
				}

				// Create emit context (for single query, emit does nothing)
				const emitCtx: EmitContext<TOutput> = {
					emit: () => {},
					onCleanup: () => () => {},
				};

				const result = resolver({ input: cleanInput as TInput, ctx: emitCtx });

				// Handle async generator (get first value only)
				if (isAsyncIterable(result)) {
					for await (const value of result) {
						return this.processQueryResult(name, value as TOutput, select);
					}
					throw new Error(`Query ${name} returned empty stream`);
				}

				// Handle promise
				const value = await result;
				return this.processQueryResult(name, value as TOutput, select);
			});
		} finally {
			this.clearLoaders();
		}
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
					if (select && this.resolvers) {
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
		let result = data;

		// Execute entity resolvers for nested data
		if (select && this.resolvers) {
			result = await this.executeEntityResolvers(entityName, data, select);
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

	/**
	 * Get entity name from query output definition
	 */
	private getEntityNameFromOutput(output: unknown): string {
		if (!output) return "unknown";

		// Check if it's an EntityDef
		if (typeof output === "object" && output !== null && "name" in output) {
			return (output as { name: string }).name;
		}

		// Check if it's an array of EntityDef
		if (Array.isArray(output) && output.length > 0) {
			const first = output[0];
			if (typeof first === "object" && first !== null && "name" in first) {
				return (first as { name: string }).name;
			}
		}

		return "unknown";
	}

	// ===========================================================================
	// Query Subscription (Streaming)
	// ===========================================================================

	async *subscribeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): AsyncIterable<TOutput> {
		// Use internal method with null subscription (for direct API usage)
		yield* this.subscribeQueryWithCleanup<TInput, TOutput>(name, input, null);
	}

	/**
	 * Internal subscription method that properly handles cleanup registration.
	 * When sub is provided, cleanup functions are registered to sub.cleanups.
	 */
	private async *subscribeQueryWithCleanup<TInput, TOutput>(
		name: string,
		input: TInput | undefined,
		sub: ClientSubscription | null,
	): AsyncIterable<TOutput> {
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

		// Validate input
		if (queryDef._input && cleanInput !== undefined) {
			const result = queryDef._input.safeParse(cleanInput);
			if (!result.success) {
				throw new Error(`Invalid input for query ${name}: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();

		// Create channel for emit-based updates
		const channel = createChannel<TOutput>();

		// Track cleanup functions - register to sub.cleanups if available
		const localCleanups: (() => void)[] = [];

		// Helper to process and send data through the channel
		const processAndSend = async (data: TOutput) => {
			const processed = await this.processQueryResult(name, data, select);
			channel.send(processed);
		};

		const emitCtx: EmitContext<TOutput> = {
			emit: (data) => {
				// Process emitted data asynchronously
				processAndSend(data as TOutput).catch((error) => {
					console.error(`Error processing emitted data:`, error);
				});
			},
			onCleanup: (fn) => {
				// Register to subscription's cleanups if available (WebSocket mode)
				if (sub) {
					sub.cleanups.push(fn);
					return () => {
						const idx = sub.cleanups.indexOf(fn);
						if (idx >= 0) sub.cleanups.splice(idx, 1);
					};
				}
				// Otherwise register to local cleanups (direct API mode)
				localCleanups.push(fn);
				channel.onClose(fn);
				return () => {
					const idx = localCleanups.indexOf(fn);
					if (idx >= 0) localCleanups.splice(idx, 1);
				};
			},
		};

		// Execute resolver with emit context
		const resolverPromise = runWithContext(this.ctx, context, async () => {
			const resolver = queryDef._resolve;
			if (!resolver) {
				throw new Error(`Query ${name} has no resolver`);
			}

			const result = resolver({ input: cleanInput as TInput, ctx: emitCtx });

			// Handle async generator
			if (isAsyncIterable(result)) {
				for await (const value of result) {
					await processAndSend(value as TOutput);
				}
				channel.close();
				return;
			}

			// Handle single return value
			const value = await result;
			if (value !== undefined) {
				await processAndSend(value as TOutput);
			}
			// Don't close - resolver might use ctx.emit() later
		});

		// Handle resolver errors
		resolverPromise.catch((error) => {
			channel.error(error);
		});

		// Yield values from channel
		yield* channel;
	}

	// ===========================================================================
	// Mutation Execution
	// ===========================================================================

	async executeMutation<TInput, TOutput>(
		name: string,
		input: TInput,
	): Promise<TOutput> {
		const mutationDef = this.mutations[name];
		if (!mutationDef) {
			throw new Error(`Mutation not found: ${name}`);
		}

		// Validate input
		const result = mutationDef._input.safeParse(input);
		if (!result.success) {
			throw new Error(`Invalid input for mutation ${name}: ${JSON.stringify(result.error)}`);
		}

		// Execute resolver with context
		const context = await this.contextFactory();
		return runWithContext(this.ctx, context, async () => {
			const resolver = mutationDef._resolve;
			const resolverResult = resolver({ input: input as TInput });

			// Handle async generator (get first value)
			if (isAsyncIterable(resolverResult)) {
				for await (const value of resolverResult) {
					return value as TOutput;
				}
				throw new Error(`Mutation ${name} returned empty stream`);
			}

			return resolverResult as TOutput;
		});
	}

	// ===========================================================================
	// Definition Accessors
	// ===========================================================================

	getQuery(name: string): QueryDef<unknown, unknown> | undefined {
		return this.queries[name];
	}

	getMutation(name: string): MutationDef<unknown, unknown> | undefined {
		return this.mutations[name];
	}

	getQueryNames(): string[] {
		return Object.keys(this.queries);
	}

	getMutationNames(): string[] {
		return Object.keys(this.mutations);
	}

	// ===========================================================================
	// WebSocket Handling
	// ===========================================================================

	handleWebSocket(ws: WebSocketLike): void {
		const clientId = `client_${++this.connectionCounter}`;
		const connection: ClientConnection = {
			clientId,
			ws,
			subscriptions: new Map(),
		};
		this.connections.set(clientId, connection);

		ws.onmessage = async (event) => {
			try {
				const message = JSON.parse(event.data) as ClientMessage;
				await this.handleMessage(connection, message);
			} catch (error) {
				ws.send(
					JSON.stringify({
						type: "error",
						error: { code: "PARSE_ERROR", message: "Failed to parse message" },
					} satisfies ErrorResponse),
				);
			}
		};

		ws.onclose = () => {
			this.cleanupConnection(connection);
		};
	}

	private async handleMessage(conn: ClientConnection, message: ClientMessage): Promise<void> {
		switch (message.type) {
			case "handshake":
				conn.ws.send(
					JSON.stringify({
						type: "handshake",
						id: message.id,
						version: this.version,
						queries: this.getQueryNames(),
						mutations: this.getMutationNames(),
					}),
				);
				break;

			case "query":
				await this.handleQuery(conn, message);
				break;

			case "subscribe":
				await this.handleSubscribe(conn, message);
				break;

			case "unsubscribe":
				this.handleUnsubscribe(conn, message);
				break;

			case "mutation":
				await this.handleMutation(conn, message);
				break;
		}
	}

	private async handleQuery(conn: ClientConnection, message: QueryMessage): Promise<void> {
		try {
			const data = await this.executeQuery(message.name, message.input);
			conn.ws.send(
				JSON.stringify({
					type: "data",
					id: message.id,
					data,
				} satisfies DataResponse),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: {
						code: "QUERY_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				} satisfies ErrorResponse),
			);
		}
	}

	private async handleSubscribe(conn: ClientConnection, message: SubscribeMessage): Promise<void> {
		const sub: ClientSubscription = {
			id: message.id,
			name: message.name,
			input: message.input,
			lastData: null,
			cleanups: [],
			active: true,
		};
		conn.subscriptions.set(message.id, sub);

		try {
			// Start streaming - pass sub reference for cleanup registration
			const stream = this.subscribeQueryWithCleanup(message.name, message.input, sub);

			// Process stream in background
			(async () => {
				try {
					let isFirstUpdate = true;

					for await (const data of stream) {
						if (!sub.active) break;

						if (isFirstUpdate) {
							// First update: send full data
							conn.ws.send(
								JSON.stringify({
									type: "update",
									id: message.id,
									data,
								} satisfies UpdateResponse),
							);
							sub.lastData = data;
							isFirstUpdate = false;
						} else {
							// Subsequent updates: send only diff (minimum transfer)
							const updates = this.computeUpdates(sub.lastData, data);
							sub.lastData = data;

							// Only send if there are actual changes
							if (updates && Object.keys(updates).length > 0) {
								conn.ws.send(
									JSON.stringify({
										type: "update",
										id: message.id,
										updates,
									} satisfies UpdateResponse),
								);
							}
						}
					}

					// Stream completed
					if (sub.active) {
						conn.ws.send(
							JSON.stringify({
								type: "complete",
								id: message.id,
							} satisfies CompleteResponse),
						);
					}
				} catch (error) {
					if (sub.active) {
						conn.ws.send(
							JSON.stringify({
								type: "error",
								id: message.id,
								error: {
									code: "SUBSCRIPTION_ERROR",
									message: error instanceof Error ? error.message : "Unknown error",
								},
							} satisfies ErrorResponse),
						);
					}
				} finally {
					this.cleanupSubscription(conn, message.id);
				}
			})();
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: {
						code: "SUBSCRIBE_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				} satisfies ErrorResponse),
			);
			conn.subscriptions.delete(message.id);
		}
	}

	private handleUnsubscribe(conn: ClientConnection, message: UnsubscribeMessage): void {
		this.cleanupSubscription(conn, message.id);
	}

	private async handleMutation(conn: ClientConnection, message: MutationMessage): Promise<void> {
		try {
			const data = await this.executeMutation(message.name, message.input);
			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data,
				} satisfies ResultResponse),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: {
						code: "MUTATION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				} satisfies ErrorResponse),
			);
		}
	}

	// ===========================================================================
	// Diff Computation
	// ===========================================================================

	private computeUpdates(oldData: unknown, newData: unknown): Record<string, Update> | undefined {
		if (oldData === null || oldData === undefined) {
			return undefined; // Send full data on first update
		}

		if (typeof oldData !== "object" || typeof newData !== "object") {
			return undefined;
		}

		const updates: Record<string, Update> = {};
		const oldObj = oldData as Record<string, unknown>;
		const newObj = newData as Record<string, unknown>;

		for (const key of Object.keys(newObj)) {
			const oldValue = oldObj[key];
			const newValue = newObj[key];

			// Use deep equality check for objects
			if (!this.isDeepEqual(oldValue, newValue)) {
				updates[key] = createUpdate(oldValue, newValue);
			}
		}

		return Object.keys(updates).length > 0 ? updates : undefined;
	}

	private isDeepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;

		if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
			return false;
		}

		// For objects/arrays, use JSON comparison
		try {
			return JSON.stringify(a) === JSON.stringify(b);
		} catch {
			return a === b;
		}
	}

	// ===========================================================================
	// Cleanup
	// ===========================================================================

	private cleanupSubscription(conn: ClientConnection, subscriptionId: string): void {
		const sub = conn.subscriptions.get(subscriptionId);
		if (sub) {
			sub.active = false;
			for (const cleanup of sub.cleanups) {
				try {
					cleanup();
				} catch (e) {
					// Ignore cleanup errors
				}
			}
			conn.subscriptions.delete(subscriptionId);
		}
	}

	private cleanupConnection(conn: ClientConnection): void {
		for (const subId of conn.subscriptions.keys()) {
			this.cleanupSubscription(conn, subId);
		}
		this.connections.delete(conn.clientId);
	}

	// ===========================================================================
	// HTTP Handler
	// ===========================================================================

	async handleRequest(req: Request): Promise<Response> {
		if (req.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			const body = (await req.json()) as {
				type: "query" | "mutation";
				name: string;
				input?: unknown;
			};

			let data: unknown;

			if (body.type === "query") {
				data = await this.executeQuery(body.name, body.input);
			} else if (body.type === "mutation") {
				data = await this.executeMutation(body.name, body.input);
			} else {
				return new Response("Invalid operation type", { status: 400 });
			}

			return new Response(JSON.stringify({ data }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: {
						code: "EXECUTION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	// ===========================================================================
	// Server Lifecycle
	// ===========================================================================

	async listen(port: number): Promise<void> {
		this.server = Bun.serve({
			port,
			fetch: (req, server) => {
				if (req.headers.get("upgrade") === "websocket") {
					const success = server.upgrade(req);
					if (success) {
						return undefined as unknown as Response;
					}
				}
				return this.handleRequest(req);
			},
			websocket: {
				message: (ws, message) => {
					const wsLike = this.createWsLike(ws);
					wsLike.onmessage?.({ data: message.toString() });
				},
				open: (ws) => {
					const wsLike = this.createWsLike(ws);
					this.handleWebSocket(wsLike);
				},
				close: (ws) => {
					// Find and cleanup connection
					for (const conn of this.connections.values()) {
						// Check if this is the right connection (Bun doesn't give us identity)
						// In production, use a proper session ID
						this.cleanupConnection(conn);
						break;
					}
				},
			},
		});

		console.log(`Lens server V2 listening on port ${port}`);
	}

	private createWsLike(ws: unknown): WebSocketLike {
		const bunWs = ws as { send: (data: string) => void; close: () => void };
		return {
			send: (data) => bunWs.send(data),
			close: () => bunWs.close(),
		};
	}

	async close(): Promise<void> {
		// Cleanup all connections
		for (const conn of this.connections.values()) {
			this.cleanupConnection(conn);
		}

		if (this.server && typeof (this.server as { stop?: () => void }).stop === "function") {
			(this.server as { stop: () => void }).stop();
		}
	}

	getStats(): ServerStats {
		let subscriptions = 0;
		for (const conn of this.connections.values()) {
			subscriptions += conn.subscriptions.size;
		}
		return {
			connections: this.connections.size,
			subscriptions,
		};
	}
}

// =============================================================================
// Channel Utility (for emit-based streaming)
// =============================================================================

interface Channel<T> extends AsyncIterable<T> {
	send(value: T): void;
	error(err: Error): void;
	close(): void;
	onClose(fn: () => void): void;
}

function createChannel<T>(): Channel<T> {
	const queue: T[] = [];
	const waiters: Array<{
		resolve: (result: IteratorResult<T>) => void;
		reject: (err: Error) => void;
	}> = [];
	let closed = false;
	let errorValue: Error | null = null;
	const closeCallbacks: (() => void)[] = [];

	return {
		send(value: T) {
			if (closed) return;

			if (waiters.length > 0) {
				const waiter = waiters.shift()!;
				waiter.resolve({ value, done: false });
			} else {
				queue.push(value);
			}
		},

		error(err: Error) {
			if (closed) return;
			errorValue = err;
			closed = true;

			for (const waiter of waiters) {
				waiter.reject(err);
			}
			waiters.length = 0;

			for (const fn of closeCallbacks) {
				try { fn(); } catch {}
			}
		},

		close() {
			if (closed) return;
			closed = true;

			for (const waiter of waiters) {
				waiter.resolve({ value: undefined as T, done: true });
			}
			waiters.length = 0;

			for (const fn of closeCallbacks) {
				try { fn(); } catch {}
			}
		},

		onClose(fn: () => void) {
			if (closed) {
				try { fn(); } catch {}
			} else {
				closeCallbacks.push(fn);
			}
		},

		[Symbol.asyncIterator]() {
			return {
				next(): Promise<IteratorResult<T>> {
					if (errorValue) {
						return Promise.reject(errorValue);
					}

					if (queue.length > 0) {
						return Promise.resolve({ value: queue.shift()!, done: false });
					}

					if (closed) {
						return Promise.resolve({ value: undefined as T, done: true });
					}

					return new Promise((resolve, reject) => {
						waiters.push({ resolve, reject });
					});
				},
			};
		},
	};
}

// =============================================================================
// Utilities
// =============================================================================

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		Symbol.asyncIterator in value
	);
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Lens server V2 with full reactive architecture.
 *
 * @example
 * ```typescript
 * const server = createServerV2({
 *   queries,
 *   mutations,
 *   context: async (req) => ({ db: prisma, currentUser }),
 * });
 *
 * server.listen(3000);
 * ```
 */
export function createServerV2<TContext extends ContextValue = ContextValue>(
	config: ServerV2Config<TContext>,
): LensServerV2 {
	return new LensServerV2Impl(config);
}
