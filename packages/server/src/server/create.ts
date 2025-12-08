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
	type EmitCommand,
	type EntityDef,
	flattenRouter,
	type InferRouterContext,
	isEntityDef,
	isMutationDef,
	isQueryDef,
	type Observable,
	type ResolverDef,
	type RouterDef,
	toResolverMap,
	valuesEqual,
} from "@sylphx/lens-core";
import { createContext, runWithContext, tryUseContext } from "../context/index.js";
import {
	createPluginManager,
	type PluginManager,
	type ReconnectContext,
	type ReconnectHookResult,
	type SubscribeContext,
	type UnsubscribeContext,
	type UpdateFieldsContext,
} from "../plugin/types.js";
import { DataLoader } from "./dataloader.js";
import { applySelection, extractNestedInputs } from "./selection.js";
import type {
	ClientSendFn,
	EntitiesMap,
	LensLogger,
	LensOperation,
	LensResult,
	LensServer,
	LensServerConfig,
	MutationsMap,
	OperationMeta,
	OperationsMap,
	QueriesMap,
	SelectionObject,
	ServerConfigLegacy,
	ServerConfigWithInferredContext,
	ServerMetadata,
} from "./types.js";

// Re-export types
export type {
	ClientSendFn,
	EntitiesMap,
	InferApi,
	InferInput,
	InferOutput,
	LensLogger,
	LensOperation,
	LensResult,
	LensServer,
	LensServerConfig,
	MutationsMap,
	OperationMeta,
	OperationsMap,
	QueriesMap,
	SelectionObject,
	ServerConfigLegacy,
	ServerConfigWithInferredContext,
	ServerMetadata,
	WebSocketLike,
} from "./types.js";

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

/** Resolver map type for internal use */
type ResolverMap = Map<string, ResolverDef<any, any, any>>;

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
		this.resolverMap = config.resolvers ? toResolverMap(config.resolvers) : undefined;

		// Build entities map: explicit config + auto-extracted from resolvers
		const entities: EntitiesMap = { ...(config.entities ?? {}) };
		if (config.resolvers) {
			for (const resolver of config.resolvers) {
				const entityName = resolver.entity._name;
				if (entityName && !entities[entityName]) {
					entities[entityName] = resolver.entity;
				}
			}
		}
		this.entities = entities;
		this.contextFactory = config.context ?? (() => ({}) as TContext);
		this.version = config.version ?? "1.0.0";
		this.logger = config.logger ?? noopLogger;

		// Initialize plugin system
		this.pluginManager = createPluginManager();
		for (const plugin of config.plugins ?? []) {
			this.pluginManager.register(plugin);
		}

		// Inject names into definitions
		this.injectNames();
		this.validateDefinitions();
	}

	private injectNames(): void {
		for (const [name, def] of Object.entries(this.entities)) {
			if (def && typeof def === "object" && !def._name) {
				(def as { _name?: string })._name = name;
			}
		}
		for (const [name, def] of Object.entries(this.mutations)) {
			if (def && typeof def === "object") {
				(def as { _name?: string })._name = name;
			}
		}
		for (const [name, def] of Object.entries(this.queries)) {
			if (def && typeof def === "object") {
				(def as { _name?: string })._name = name;
			}
		}
	}

	private validateDefinitions(): void {
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

	// =========================================================================
	// Core Methods
	// =========================================================================

	getMetadata(): ServerMetadata {
		return {
			version: this.version,
			operations: this.buildOperationsMap(),
		};
	}

	/**
	 * Execute operation and return Observable.
	 *
	 * Always returns Observable<LensResult>:
	 * - One-shot: emits once, then completes
	 * - Streaming: emits multiple times (AsyncIterable or emit-based)
	 */
	execute(op: LensOperation): Observable<LensResult> {
		const { path, input } = op;

		// Check if operation exists
		const isQuery = !!this.queries[path];
		const isMutation = !!this.mutations[path];

		if (!isQuery && !isMutation) {
			return {
				subscribe: (observer) => {
					observer.next?.({ error: new Error(`Operation not found: ${path}`) });
					observer.complete?.();
					return { unsubscribe: () => {} };
				},
			};
		}

		return this.executeAsObservable(path, input, isQuery);
	}

	/**
	 * Execute operation and return Observable.
	 * Observable allows streaming for AsyncIterable resolvers and emit-based updates.
	 */
	private executeAsObservable(
		path: string,
		input: unknown,
		isQuery: boolean,
	): Observable<LensResult> {
		return {
			subscribe: (observer) => {
				let cancelled = false;
				let currentState: unknown;
				let lastEmittedResult: unknown;
				const cleanups: (() => void)[] = [];

				// Helper to emit only if value changed
				const emitIfChanged = (data: unknown) => {
					if (cancelled) return;
					if (valuesEqual(data, lastEmittedResult)) return;
					lastEmittedResult = data;
					observer.next?.({ data });
				};

				// Run the operation
				(async () => {
					try {
						const def = isQuery ? this.queries[path] : this.mutations[path];
						if (!def) {
							observer.next?.({ error: new Error(`Operation not found: ${path}`) });
							observer.complete?.();
							return;
						}

						// Extract $select from input for queries
						let select: SelectionObject | undefined;
						let cleanInput = input;
						if (isQuery && input && typeof input === "object" && "$select" in input) {
							const { $select, ...rest } = input as Record<string, unknown>;
							select = $select as SelectionObject;
							cleanInput = Object.keys(rest).length > 0 ? rest : undefined;
						}

						// Validate input
						if (def._input && cleanInput !== undefined) {
							const result = def._input.safeParse(cleanInput);
							if (!result.success) {
								observer.next?.({
									error: new Error(`Invalid input: ${JSON.stringify(result.error)}`),
								});
								observer.complete?.();
								return;
							}
						}

						const context = await this.contextFactory();

						await runWithContext(this.ctx, context, async () => {
							const resolver = def._resolve;
							if (!resolver) {
								observer.next?.({ error: new Error(`Operation ${path} has no resolver`) });
								observer.complete?.();
								return;
							}

							// Create emit handler with async queue processing
							// Emit commands are queued and processed through processQueryResult
							// to ensure field resolvers run on every emit
							let emitProcessing = false;
							const emitQueue: EmitCommand[] = [];

							const processEmitQueue = async () => {
								if (emitProcessing || cancelled) return;
								emitProcessing = true;

								while (emitQueue.length > 0 && !cancelled) {
									const command = emitQueue.shift()!;
									currentState = this.applyEmitCommand(command, currentState);

									// Process through field resolvers (unlike before where we bypassed this)
									// Note: createFieldEmit is created after this function but used lazily
									const fieldEmitFactory = isQuery
										? this.createFieldEmitFactory(
												() => currentState,
												(state) => {
													currentState = state;
												},
												emitIfChanged,
												select,
												context,
												onCleanup,
											)
										: undefined;

									const processed = isQuery
										? await this.processQueryResult(
												path,
												currentState,
												select,
												context,
												onCleanup,
												fieldEmitFactory,
											)
										: currentState;

									emitIfChanged(processed);
								}

								emitProcessing = false;
							};

							const emitHandler = (command: EmitCommand) => {
								if (cancelled) return;
								emitQueue.push(command);
								// Fire async processing (don't await - emit should be sync from caller's perspective)
								processEmitQueue().catch((err) => {
									if (!cancelled) {
										observer.next?.({ error: err instanceof Error ? err : new Error(String(err)) });
									}
								});
							};

							// Detect array output type: [EntityDef] is stored as single-element array
							const isArrayOutput = Array.isArray(def._output);
							const emit = createEmit(emitHandler, isArrayOutput);
							const onCleanup = (fn: () => void) => {
								cleanups.push(fn);
								return () => {
									const idx = cleanups.indexOf(fn);
									if (idx >= 0) cleanups.splice(idx, 1);
								};
							};

							// Create field emit factory for field-level live queries
							const createFieldEmit = isQuery
								? this.createFieldEmitFactory(
										() => currentState,
										(state) => {
											currentState = state;
										},
										emitIfChanged,
										select,
										context,
										onCleanup,
									)
								: undefined;

							const lensContext = { ...context, emit, onCleanup };
							const result = resolver({ input: cleanInput, ctx: lensContext });

							if (isAsyncIterable(result)) {
								// Streaming: emit each yielded value
								for await (const value of result) {
									if (cancelled) break;
									currentState = value;
									const processed = await this.processQueryResult(
										path,
										value,
										select,
										context,
										onCleanup,
										createFieldEmit,
									);
									emitIfChanged(processed);
								}
								if (!cancelled) {
									observer.complete?.();
								}
							} else {
								// One-shot: emit single value
								const value = await result;
								currentState = value;
								const processed = isQuery
									? await this.processQueryResult(
											path,
											value,
											select,
											context,
											onCleanup,
											createFieldEmit,
										)
									: value;
								emitIfChanged(processed);
								// Don't complete immediately - stay open for potential emit calls
								// For true one-shot, client can unsubscribe after first value
							}
						});
					} catch (error) {
						if (!cancelled) {
							observer.next?.({ error: error instanceof Error ? error : new Error(String(error)) });
							observer.complete?.();
						}
					} finally {
						this.clearLoaders();
					}
				})();

				return {
					unsubscribe: () => {
						cancelled = true;
						for (const fn of cleanups) {
							fn();
						}
					},
				};
			},
		};
	}

	/**
	 * Apply emit command to current state.
	 */
	private applyEmitCommand(command: EmitCommand, state: unknown): unknown {
		switch (command.type) {
			case "full":
				if (command.replace) {
					return command.data;
				}
				// Merge mode
				if (state && typeof state === "object" && typeof command.data === "object") {
					return { ...state, ...(command.data as Record<string, unknown>) };
				}
				return command.data;

			case "field":
				if (state && typeof state === "object") {
					return {
						...(state as Record<string, unknown>),
						[command.field]: command.update.data,
					};
				}
				return { [command.field]: command.update.data };

			case "batch":
				if (state && typeof state === "object") {
					const result = { ...(state as Record<string, unknown>) };
					for (const update of command.updates) {
						result[update.field] = update.update.data;
					}
					return result;
				}
				return state;

			case "array": {
				// Array operations - simplified handling
				const arr = Array.isArray(state) ? [...state] : [];
				const op = command.operation;
				switch (op.op) {
					case "push":
						return [...arr, op.item];
					case "unshift":
						return [op.item, ...arr];
					case "insert":
						arr.splice(op.index, 0, op.item);
						return arr;
					case "remove":
						arr.splice(op.index, 1);
						return arr;
					case "update":
						arr[op.index] = op.item;
						return arr;
					default:
						return arr;
				}
			}

			default:
				return state;
		}
	}

	// =========================================================================
	// Result Processing
	// =========================================================================

	/**
	 * Factory type for creating field-level emit handlers.
	 * Each field gets its own emit that updates just that field path.
	 */
	private createFieldEmitFactory(
		getCurrentState: () => unknown,
		setCurrentState: (state: unknown) => void,
		notifyObserver: (data: unknown) => void,
		select: SelectionObject | undefined,
		context: TContext | undefined,
		onCleanup: ((fn: () => void) => void) | undefined,
	): (fieldPath: string) => ((value: unknown) => void) | undefined {
		return (fieldPath: string) => {
			if (!fieldPath) return undefined;

			return (newValue: unknown) => {
				// Get current state and update the field at the given path
				const state = getCurrentState();
				if (!state || typeof state !== "object") return;

				const updatedState = this.setFieldByPath(
					state as Record<string, unknown>,
					fieldPath,
					newValue,
				);
				setCurrentState(updatedState);

				// Resolve nested fields on the new value and notify observer
				(async () => {
					try {
						const nestedInputs = select ? extractNestedInputs(select) : undefined;
						const processed = await this.resolveEntityFields(
							updatedState,
							nestedInputs,
							context,
							"",
							onCleanup,
							this.createFieldEmitFactory(
								getCurrentState,
								setCurrentState,
								notifyObserver,
								select,
								context,
								onCleanup,
							),
						);
						const result = select ? applySelection(processed, select) : processed;
						notifyObserver(result);
					} catch (err) {
						// Field emit errors are logged but don't break the stream
						console.error(`Field emit error at path "${fieldPath}":`, err);
					}
				})();
			};
		};
	}

	/**
	 * Set a value at a nested path in an object.
	 * Creates a shallow copy at each level.
	 */
	private setFieldByPath(
		obj: Record<string, unknown>,
		path: string,
		value: unknown,
	): Record<string, unknown> {
		const parts = path.split(".");
		if (parts.length === 1) {
			return { ...obj, [path]: value };
		}

		const [first, ...rest] = parts;
		const nested = obj[first];
		if (nested && typeof nested === "object") {
			return {
				...obj,
				[first]: this.setFieldByPath(nested as Record<string, unknown>, rest.join("."), value),
			};
		}
		return obj;
	}

	private async processQueryResult<T>(
		_operationName: string,
		data: T,
		select?: SelectionObject,
		context?: TContext,
		onCleanup?: (fn: () => void) => void,
		createFieldEmit?: (fieldPath: string) => ((value: unknown) => void) | undefined,
	): Promise<T> {
		if (!data) return data;

		// Extract nested inputs from selection for field resolver args
		const nestedInputs = select ? extractNestedInputs(select) : undefined;

		const processed = await this.resolveEntityFields(
			data,
			nestedInputs,
			context,
			"",
			onCleanup,
			createFieldEmit,
		);
		if (select) {
			return applySelection(processed, select) as T;
		}
		return processed as T;
	}

	/**
	 * Resolve entity fields using field resolvers.
	 * Supports nested inputs for field-level arguments (like GraphQL).
	 *
	 * @param data - The data to resolve
	 * @param nestedInputs - Map of field paths to their input args (from extractNestedInputs)
	 * @param context - Request context to pass to field resolvers
	 * @param fieldPath - Current path for nested field resolution
	 * @param onCleanup - Cleanup registration for live query subscriptions
	 * @param createFieldEmit - Factory for creating field-specific emit handlers
	 */
	private async resolveEntityFields<T>(
		data: T,
		nestedInputs?: Map<string, Record<string, unknown>>,
		context?: TContext,
		fieldPath = "",
		onCleanup?: (fn: () => void) => void,
		createFieldEmit?: (fieldPath: string) => ((value: unknown) => void) | undefined,
	): Promise<T> {
		if (!data || !this.resolverMap) return data;

		if (Array.isArray(data)) {
			return Promise.all(
				data.map((item) =>
					this.resolveEntityFields(
						item,
						nestedInputs,
						context,
						fieldPath,
						onCleanup,
						createFieldEmit,
					),
				),
			) as Promise<T>;
		}

		if (typeof data !== "object") return data;

		const obj = data as Record<string, unknown>;
		const typeName = this.getTypeName(obj);
		if (!typeName) return data;

		const resolverDef = this.resolverMap.get(typeName);
		if (!resolverDef) return data;

		const result = { ...obj };

		for (const fieldName of resolverDef.getFieldNames()) {
			const field = String(fieldName);

			// Skip exposed fields
			if (resolverDef.isExposed(field)) continue;

			// Calculate the path for this field (for nested input lookup)
			const currentPath = fieldPath ? `${fieldPath}.${field}` : field;

			// Get args for this field from nested inputs
			const args = nestedInputs?.get(currentPath) ?? {};
			const hasArgs = Object.keys(args).length > 0;

			// Skip if value already exists
			const existingValue = result[field];
			if (existingValue !== undefined) {
				result[field] = await this.resolveEntityFields(
					existingValue,
					nestedInputs,
					context,
					currentPath,
					onCleanup,
					createFieldEmit,
				);
				continue;
			}

			// Resolve the field
			if (hasArgs || context) {
				// Direct resolution when we have args or context (skip DataLoader)
				try {
					// Build extended context with emit and onCleanup
					// Lens is a live query library - these are always available
					const extendedCtx = {
						...(context ?? {}),
						emit: createFieldEmit!(currentPath),
						onCleanup: onCleanup!,
					};
					result[field] = await resolverDef.resolveField(field, obj, args, extendedCtx);
				} catch {
					result[field] = null;
				}
			} else {
				// Use DataLoader for batching when no args (default case)
				const loaderKey = `${typeName}.${field}`;
				const loader = this.getOrCreateLoaderForField(loaderKey, resolverDef, field);
				result[field] = await loader.load(obj);
			}

			// Recursively resolve nested fields
			result[field] = await this.resolveEntityFields(
				result[field],
				nestedInputs,
				context,
				currentPath,
				onCleanup,
				createFieldEmit,
			);
		}

		return result as T;
	}

	/**
	 * Get the type name for an object by matching against entity definitions.
	 *
	 * Matching priority:
	 * 1. Explicit __typename or _type property
	 * 2. Best matching entity (highest field overlap score)
	 *
	 * Requires at least 50% field match to avoid false positives.
	 */
	private getTypeName(obj: Record<string, unknown>): string | undefined {
		// Priority 1: Explicit type marker
		if ("__typename" in obj) return obj.__typename as string;
		if ("_type" in obj) return obj._type as string;

		// Priority 2: Find best matching entity by field overlap
		let bestMatch: { name: string; score: number } | undefined;

		for (const [name, def] of Object.entries(this.entities)) {
			if (!isEntityDef(def)) continue;

			const score = this.getEntityMatchScore(obj, def);
			// Require at least 50% field match to avoid false positives
			if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
				bestMatch = { name, score };
			}
		}

		return bestMatch?.name;
	}

	/**
	 * Calculate how well an object matches an entity definition.
	 *
	 * @returns Score between 0 and 1 (1 = perfect match, all entity fields present)
	 */
	private getEntityMatchScore(
		obj: Record<string, unknown>,
		entityDef: EntityDef<string, any>,
	): number {
		const fieldNames = Object.keys(entityDef.fields);
		if (fieldNames.length === 0) return 0;

		const matchingFields = fieldNames.filter((field) => field in obj);
		return matchingFields.length / fieldNames.length;
	}

	private getOrCreateLoaderForField(
		loaderKey: string,
		resolverDef: ResolverDef<any, any, any>,
		fieldName: string,
	): DataLoader<unknown, unknown> {
		let loader = this.loaders.get(loaderKey);
		if (!loader) {
			loader = new DataLoader(async (parents: unknown[]) => {
				// Get context from AsyncLocalStorage - maintains request context in batched calls
				const context = tryUseContext<TContext>() ?? ({} as TContext);
				const results: unknown[] = [];
				for (const parent of parents) {
					try {
						const result = await resolverDef.resolveField(
							fieldName,
							parent as Record<string, unknown>,
							{},
							context,
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

	// =========================================================================
	// Operations Map
	// =========================================================================

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

	// =========================================================================
	// Subscription Support (Plugin Passthrough)
	// =========================================================================

	async addClient(clientId: string, send: ClientSendFn): Promise<boolean> {
		const allowed = await this.pluginManager.runOnConnect({
			clientId,
			send: (msg) => send(msg as { type: string; id?: string; data?: unknown }),
		});
		return allowed;
	}

	removeClient(clientId: string, subscriptionCount: number): void {
		this.pluginManager.runOnDisconnect({ clientId, subscriptionCount });
	}

	async subscribe(ctx: SubscribeContext): Promise<boolean> {
		return this.pluginManager.runOnSubscribe(ctx);
	}

	unsubscribe(ctx: UnsubscribeContext): void {
		this.pluginManager.runOnUnsubscribe(ctx);
	}

	async broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void> {
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
		const transformedData = await this.pluginManager.runBeforeSend({
			clientId,
			subscriptionId,
			entity,
			entityId,
			data,
			isInitial,
			fields: "*",
		});

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
		return this.pluginManager.runOnReconnect(ctx);
	}

	async updateFields(ctx: UpdateFieldsContext): Promise<void> {
		await this.pluginManager.runOnUpdateFields(ctx);
	}

	getPluginManager(): PluginManager {
		return this.pluginManager;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Lens server with optional plugin support.
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
