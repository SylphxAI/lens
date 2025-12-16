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
	collectModelsFromOperations,
	collectModelsFromRouter,
	createEmit,
	createResolverFromEntity,
	type Emit,
	type EmitCommand,
	flattenRouter,
	hashValue,
	hasInlineResolvers,
	type InferRouterContext,
	isLiveQueryDef,
	isModelDef,
	isMutationDef,
	isQueryDef,
	type LiveQueryDef,
	type Message,
	type ModelDef,
	mergeModelCollections,
	type Observable,
	type ResolverDef,
	type RouterDef,
	toOps,
	valuesEqual,
} from "@sylphx/lens-core";
import { createContext, runWithContext } from "../context/index.js";
import { createPluginManager, type PluginManager } from "../plugin/types.js";
import { DataLoader } from "./dataloader.js";
import { applySelection, extractNestedInputs } from "./selection.js";
import type {
	EntitiesMap,
	EntitiesMetadata,
	EntityFieldMetadata,
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
	EntitiesMetadata,
	EntityFieldMetadata,
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

		// Build entities map (priority: explicit config > router > resolvers)
		// Auto-track models from router return types (new behavior)
		const autoCollected = config.router
			? collectModelsFromRouter(config.router)
			: collectModelsFromOperations(queries, mutations);

		// Merge: explicit entities override auto-collected
		const entitiesFromConfig = config.entities ?? {};
		const mergedModels = mergeModelCollections(autoCollected, entitiesFromConfig);

		// Also extract from explicit resolvers (legacy)
		if (config.resolvers) {
			for (const resolver of config.resolvers) {
				const entityName = resolver.entity._name;
				if (entityName && !mergedModels.has(entityName)) {
					mergedModels.set(entityName, resolver.entity);
				}
			}
		}

		// Convert Map to Record for entities
		const entities: EntitiesMap = {};
		for (const [name, model] of mergedModels) {
			if (isModelDef(model)) {
				entities[name] = model as ModelDef<string, any>;
			}
		}
		this.entities = entities;

		// Build resolver map: explicit resolvers + auto-converted from entities with inline resolvers
		// Unified Entity Definition (ADR-001): entities can have inline .resolve()/.subscribe() methods
		// These are automatically converted to resolvers, no need to call createResolverFromEntity() manually
		this.resolverMap = this.buildResolverMap(config.resolvers, entities);
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

	/**
	 * Build resolver map from explicit resolvers and entities with inline resolvers.
	 *
	 * Unified Entity Definition (ADR-001): Entities can have inline .resolve()/.subscribe() methods.
	 * These are automatically converted to resolvers - no manual createResolverFromEntity() needed.
	 *
	 * Priority: explicit resolvers > auto-converted from entities
	 */
	private buildResolverMap(
		explicitResolvers: import("@sylphx/lens-core").Resolvers | undefined,
		entities: EntitiesMap,
	): ResolverMap | undefined {
		const resolverMap: ResolverMap = new Map();

		// 1. Add explicit resolvers first (takes priority)
		if (explicitResolvers) {
			for (const resolver of explicitResolvers) {
				const entityName = resolver.entity._name;
				if (entityName) {
					resolverMap.set(entityName, resolver);
				}
			}
		}

		// 2. Auto-convert models with inline resolvers (if not already in map)
		for (const [name, entity] of Object.entries(entities)) {
			if (!isModelDef(entity)) continue;
			if (resolverMap.has(name)) continue; // Explicit resolver takes priority

			// Check if entity/model has inline resolvers
			if (hasInlineResolvers(entity)) {
				const resolver = createResolverFromEntity(entity);
				resolverMap.set(name, resolver);
			}
		}

		return resolverMap.size > 0 ? resolverMap : undefined;
	}

	// =========================================================================
	// Core Methods
	// =========================================================================

	getMetadata(): ServerMetadata {
		return {
			version: this.version,
			operations: this.buildOperationsMap(),
			entities: this.buildEntitiesMetadata(),
		};
	}

	/**
	 * Build entities metadata for client-side transport routing.
	 * Maps each entity to its field modes (exposed/resolve/subscribe).
	 */
	private buildEntitiesMetadata(): EntitiesMetadata {
		const result: EntitiesMetadata = {};

		if (!this.resolverMap) return result;

		for (const [entityName, resolver] of this.resolverMap) {
			const fieldMetadata: EntityFieldMetadata = {};

			for (const fieldName of resolver.getFieldNames()) {
				const mode = resolver.getFieldMode(String(fieldName));
				if (mode) {
					fieldMetadata[String(fieldName)] = mode;
				}
			}

			if (Object.keys(fieldMetadata).length > 0) {
				result[entityName] = fieldMetadata;
			}
		}

		return result;
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
					observer.next?.({
						$: "error",
						error: `Operation not found: ${path}`,
						code: "NOT_FOUND",
					} as Message);
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
				let lastEmittedResult: unknown;
				let lastEmittedHash: string | undefined;
				const cleanups: (() => void)[] = [];

				// Helper to emit only if value changed
				// Uses cached hash for O(1) comparison after first call
				const emitIfChanged = (data: unknown) => {
					if (cancelled) return;
					const dataHash = hashValue(data);
					if (
						lastEmittedHash !== undefined &&
						valuesEqual(data, lastEmittedResult, dataHash, lastEmittedHash)
					) {
						return;
					}
					lastEmittedResult = data;
					lastEmittedHash = dataHash;
					// Emit snapshot message
					observer.next?.({ $: "snapshot", data } as Message);
				};

				// Run the operation
				(async () => {
					try {
						const def = isQuery ? this.queries[path] : this.mutations[path];
						if (!def) {
							observer.next?.({
								$: "error",
								error: `Operation not found: ${path}`,
								code: "NOT_FOUND",
							} as Message);
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
									$: "error",
									error: `Invalid input: ${JSON.stringify(result.error)}`,
									code: "VALIDATION_ERROR",
								} as Message);
								observer.complete?.();
								return;
							}
						}

						const context = await this.contextFactory();

						await runWithContext(this.ctx, context, async () => {
							const resolver = def._resolve;
							if (!resolver) {
								observer.next?.({
									$: "error",
									error: `Operation ${path} has no resolver`,
									code: "NO_RESOLVER",
								} as Message);
								observer.complete?.();
								return;
							}

							// Create emit handler with async queue processing
							// STATELESS ARCHITECTURE: Server forwards emit commands as ops directly to client.
							// Client is responsible for applying updates to local state.
							// This enables serverless deployments and minimal wire transfer.
							const emitHandler = (command: EmitCommand) => {
								if (cancelled) return;
								// Convert command to ops and send - no state maintained on server
								const ops = toOps(command);
								observer.next?.({ $: "ops", ops } as Message);
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

							// Create field emit factory for field-level live queries (STATELESS)
							const createFieldEmit = isQuery
								? this.createFieldEmitFactory((command) => {
										const ops = toOps(command);
										observer.next?.({ $: "ops", ops } as Message);
									})
								: undefined;

							const lensContext = { ...context, emit, onCleanup };
							const result = resolver({ args: cleanInput, input: cleanInput, ctx: lensContext });

							if (isAsyncIterable(result)) {
								// Streaming: emit each yielded value
								for await (const value of result) {
									if (cancelled) break;
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

								// LiveQueryDef: Call _subscriber for live updates (Publisher pattern)
								// ADR-002: .resolve().subscribe() pattern for operation-level live queries
								if (isQuery && isLiveQueryDef(def) && !cancelled) {
									const liveQuery = def as LiveQueryDef<unknown, unknown, TContext>;
									if (liveQuery._subscriber) {
										try {
											// Get publisher function from subscriber
											const publisher = liveQuery._subscriber({
												args: cleanInput as never, // Preferred parameter name
												input: cleanInput as never, // Deprecated alias for backwards compatibility
												ctx: context as TContext,
											});
											// Call publisher with emit/onCleanup callbacks
											if (publisher) {
												publisher({ emit, onCleanup });
											}
										} catch (err) {
											if (!cancelled) {
												const errMsg = err instanceof Error ? err.message : String(err);
												observer.next?.({
													$: "error",
													error: errMsg,
													code: "SUBSCRIBE_ERROR",
												} as Message);
											}
										}
									}
								}

								// Mutations complete immediately - they're truly one-shot
								// Queries stay open for potential emit calls from field resolvers
								if (!isQuery && !cancelled) {
									observer.complete?.();
								}
							}
						});
					} catch (error) {
						if (!cancelled) {
							const errMsg = error instanceof Error ? error.message : String(error);
							observer.next?.({ $: "error", error: errMsg, code: "INTERNAL_ERROR" } as Message);
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

	// =========================================================================
	// Result Processing
	// =========================================================================

	/**
	 * Factory for creating field-level emit handlers (STATELESS).
	 * Each field gets its own emit that forwards commands to the observer with the field path.
	 * Client is responsible for applying updates to local state.
	 */
	private createFieldEmitFactory(
		sendUpdate: (command: EmitCommand) => void,
	): (fieldPath: string, resolvedValue?: unknown) => Emit<unknown> | undefined {
		return (fieldPath: string, resolvedValue?: unknown) => {
			if (!fieldPath) return undefined;

			// Determine emit type: array, scalar, or object
			let outputType: "array" | "object" | "scalar" = "object";
			if (Array.isArray(resolvedValue)) {
				outputType = "array";
			} else if (
				resolvedValue === null ||
				typeof resolvedValue === "string" ||
				typeof resolvedValue === "number" ||
				typeof resolvedValue === "boolean"
			) {
				outputType = "scalar";
			}

			// STATELESS: Forward command with field path prefix to client
			const emitHandler = (command: EmitCommand) => {
				// Transform command to include field path
				const prefixedCommand = this.prefixCommandPath(command, fieldPath);
				sendUpdate(prefixedCommand);
			};

			return createEmit<unknown>(emitHandler, outputType);
		};
	}

	/**
	 * Prefix a command's field path for nested field emits.
	 */
	private prefixCommandPath(command: EmitCommand, prefix: string): EmitCommand {
		switch (command.type) {
			case "full":
				// Full replacement at field path
				return {
					type: "field",
					field: prefix,
					update: { strategy: "value", data: command.data },
				};
			case "field":
				// Nested field path
				return {
					type: "field",
					field: command.field ? `${prefix}.${command.field}` : prefix,
					update: command.update,
				};
			case "batch":
				// Prefix all fields in batch
				return {
					type: "batch",
					updates: command.updates.map((u) => ({
						field: `${prefix}.${u.field}`,
						update: u.update,
					})),
				};
			case "array":
				// Array operations at field path - preserve as array command with field
				return {
					type: "array",
					operation: command.operation,
					field: prefix,
				};
			default:
				return command;
		}
	}

	private async processQueryResult<T>(
		_operationName: string,
		data: T,
		select?: SelectionObject,
		context?: TContext,
		onCleanup?: (fn: () => void) => void,
		createFieldEmit?: (fieldPath: string, resolvedValue?: unknown) => Emit<unknown> | undefined,
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
			new Set(), // Cycle detection for circular entity references (type:id)
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
	 * @param visited - Set of "type:id" keys to track visited entities and prevent circular reference infinite loops
	 */
	private async resolveEntityFields<T>(
		data: T,
		nestedInputs?: Map<string, Record<string, unknown>>,
		context?: TContext,
		fieldPath = "",
		onCleanup?: (fn: () => void) => void,
		createFieldEmit?: (fieldPath: string, resolvedValue?: unknown) => Emit<unknown> | undefined,
		visited: Set<string> = new Set(),
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
						visited,
					),
				),
			) as Promise<T>;
		}

		if (typeof data !== "object") return data;

		const obj = data as Record<string, unknown>;
		const typeName = this.getTypeName(obj);
		if (!typeName) return data;

		// Cycle detection using entity type + ID to prevent infinite loops
		// This handles circular entity references like User.posts -> Post.author -> User
		const entityId = obj.id ?? obj._id ?? obj.uuid;
		if (entityId !== undefined) {
			const entityKey = `${typeName}:${entityId}`;
			if (visited.has(entityKey)) {
				return data; // Already resolved this entity, return as-is
			}
			visited.add(entityKey);
		}

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

			// Resolve the field based on mode
			// ADR-002: Two-Phase Field Resolution
			const fieldMode = resolverDef.getFieldMode(field);

			if (fieldMode === "live") {
				// LIVE MODE: Two-phase resolution
				// Phase 1: Run resolver for initial value (batchable)
				// Phase 2: Run subscriber for live updates (fire-and-forget)
				try {
					// Phase 1: Get initial value (no emit/onCleanup needed)
					if (hasArgs) {
						// Direct resolution with args
						result[field] = await resolverDef.resolveField(field, obj, args, context ?? {});
					} else {
						// Use DataLoader for batching
						const loaderKey = `${typeName}.${field}`;
						const loader = this.getOrCreateLoaderForField(
							loaderKey,
							resolverDef,
							field,
							context ?? ({} as TContext),
						);
						result[field] = await loader.load(obj);
					}

					// Phase 2: Set up subscription (fire-and-forget)
					// Publisher pattern: get publisher function and call with callbacks
					const publisher = resolverDef.subscribeField(field, obj, args, context ?? {});
					if (publisher && createFieldEmit && onCleanup) {
						try {
							// Pass resolved value to determine correct emit type (array/object/scalar)
							const fieldEmit = createFieldEmit(currentPath, result[field]);
							if (fieldEmit) {
								publisher({
									emit: fieldEmit,
									onCleanup: (fn) => {
										onCleanup(fn);
										return fn;
									},
								});
							}
						} catch {
							// Subscription errors are handled via emit, ignore here
						}
					}
				} catch {
					result[field] = null;
				}
			} else if (fieldMode === "subscribe") {
				// SUBSCRIBE MODE (legacy): Call resolver with ctx.emit/ctx.onCleanup
				// Legacy mode - resolver handles both initial value and updates via ctx.emit
				try {
					result[field] = null;
					if (createFieldEmit && onCleanup) {
						try {
							const fieldEmit = createFieldEmit(currentPath);
							if (fieldEmit) {
								// Build legacy ctx with emit/onCleanup
								const legacyCtx = {
									...(context ?? {}),
									emit: fieldEmit,
									onCleanup: (fn: () => void) => {
										onCleanup(fn);
										return fn;
									},
								};
								// Call legacy subscription method
								resolverDef.subscribeFieldLegacy(field, obj, args, legacyCtx);
							}
						} catch {
							// Subscription errors are handled via emit, ignore here
						}
					}
				} catch {
					result[field] = null;
				}
			} else {
				// RESOLVE MODE: One-shot resolution (batchable)
				try {
					if (hasArgs) {
						// Direct resolution with args (no batching)
						result[field] = await resolverDef.resolveField(field, obj, args, context ?? {});
					} else {
						// Use DataLoader for batching
						const loaderKey = `${typeName}.${field}`;
						const loader = this.getOrCreateLoaderForField(
							loaderKey,
							resolverDef,
							field,
							context ?? ({} as TContext),
						);
						result[field] = await loader.load(obj);
					}
				} catch {
					result[field] = null;
				}
			}

			// Recursively resolve nested fields
			result[field] = await this.resolveEntityFields(
				result[field],
				nestedInputs,
				context,
				currentPath,
				onCleanup,
				createFieldEmit,
				visited,
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
			if (!isModelDef(def)) continue;

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
		entityDef: ModelDef<string, any>,
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
		context: TContext,
	): DataLoader<unknown, unknown> {
		let loader = this.loaders.get(loaderKey);
		if (!loader) {
			// Capture context at loader creation time
			// This ensures the batch function has access to request context
			loader = new DataLoader(async (parents: unknown[]) => {
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

		// Helper to extract return type name from output definition
		const getReturnTypeName = (output: unknown): string | undefined => {
			if (!output) return undefined;
			// Handle array output: [EntityDef] → extract from first element
			if (Array.isArray(output) && output.length > 0) {
				const element = output[0];
				if (element && typeof element === "object" && "_name" in element) {
					return element._name as string;
				}
			}
			// Handle direct entity output
			if (typeof output === "object" && "_name" in output) {
				return (output as { _name?: string })._name;
			}
			return undefined;
		};

		for (const [name, def] of Object.entries(this.queries)) {
			// Auto-detect subscription: if resolver is AsyncGeneratorFunction → subscription
			const isSubscription =
				def._resolve?.constructor?.name === "AsyncGeneratorFunction" ||
				def._resolve?.constructor?.name === "GeneratorFunction";
			const opType = isSubscription ? "subscription" : "query";
			const returnType = getReturnTypeName(def._output);
			const meta: OperationMeta = { type: opType };
			if (returnType) {
				meta.returnType = returnType;
			}
			this.pluginManager.runEnhanceOperationMeta({
				path: name,
				type: opType,
				meta: meta as unknown as Record<string, unknown>,
				definition: def,
			});
			setNested(name, meta);
		}

		for (const [name, def] of Object.entries(this.mutations)) {
			const returnType = getReturnTypeName(def._output);
			const meta: OperationMeta = { type: "mutation" };
			if (returnType) {
				meta.returnType = returnType;
			}
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
	// Plugin Access
	// =========================================================================

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
