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
	flattenRouter,
	type InferRouterContext,
	isEntityDef,
	isMutationDef,
	isQueryDef,
	type ResolverDef,
	type RouterDef,
	toResolverMap,
} from "@sylphx/lens-core";
import { createContext, runWithContext } from "../context/index.js";
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
import { applySelection } from "./selection.js";
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

	// =========================================================================
	// Query/Mutation Execution
	// =========================================================================

	private async executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput> {
		const queryDef = this.queries[name];
		if (!queryDef) throw new Error(`Query not found: ${name}`);

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
				if (!resolver) throw new Error(`Query ${name} has no resolver`);

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
		if (!mutationDef) throw new Error(`Mutation not found: ${name}`);

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
				if (!resolver) throw new Error(`Mutation ${name} has no resolver`);

				const emit = createEmit(() => {});
				const onCleanup = () => () => {};
				const lensContext = { ...context, emit, onCleanup };

				return (await resolver({ input: input as TInput, ctx: lensContext })) as TOutput;
			});
		} finally {
			this.clearLoaders();
		}
	}

	// =========================================================================
	// Result Processing
	// =========================================================================

	private async processQueryResult<T>(
		_operationName: string,
		data: T,
		select?: SelectionObject,
	): Promise<T> {
		if (!data) return data;

		const processed = await this.resolveEntityFields(data);
		if (select) {
			return applySelection(processed, select) as T;
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

		const resolverDef = this.resolverMap.get(typeName);
		if (!resolverDef) return data;

		const result = { ...obj };

		for (const fieldName of resolverDef.getFieldNames()) {
			const field = String(fieldName);

			// Skip exposed fields
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

/**
 * @deprecated Use `createApp` instead. Will be removed in v1.0.
 */
export const createServer: typeof createApp = createApp;
