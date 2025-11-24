/**
 * @lens/server - Execution Engine
 *
 * Executes resolvers with field selection and batching.
 * Supports reactive execution with GraphStateManager integration.
 */

import type { SchemaDefinition, InferEntity, Select, Schema, FieldType } from "@lens/core";
import type {
	Resolvers,
	BaseContext,
	ListInput,
	PaginatedResult,
	PageInfo,
	EmitContext,
	ResolverContext,
} from "../resolvers/types";
import type { GraphStateManager } from "../state/graph-state-manager";

// =============================================================================
// DataLoader for N+1 Elimination
// =============================================================================

/**
 * Simple DataLoader implementation for batching
 */
export class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> =
		new Map();
	private scheduled = false;

	constructor(
		private batchFn: (keys: K[]) => Promise<(V | null)[]>,
		private options: { maxBatchSize?: number } = {},
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

		// Schedule for next microtask
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

			// Resolve each promise with corresponding result
			keys.forEach((key, index) => {
				const callbacks = batch.get(key)!;
				const result = results[index] ?? null;
				callbacks.forEach(({ resolve }) => resolve(result));
			});
		} catch (error) {
			// Reject all on error
			for (const callbacks of batch.values()) {
				callbacks.forEach(({ reject }) => reject(error as Error));
			}
		}
	}

	clear(): void {
		this.batch.clear();
	}
}

// =============================================================================
// Execution Engine Configuration
// =============================================================================

export interface ExecutionEngineConfig<S extends SchemaDefinition, Ctx extends BaseContext> {
	/** Schema (for field serialization) */
	schema: Schema<S>;
	/** Function to create user context */
	createContext: () => Ctx;
	/** Optional GraphStateManager for reactive updates */
	stateManager?: GraphStateManager;
}

// =============================================================================
// Reactive Subscription Handle
// =============================================================================

export interface ReactiveSubscription {
	/** Unique subscription ID */
	id: string;
	/** Entity type */
	entity: string;
	/** Entity ID */
	entityId: string;
	/** Unsubscribe and cleanup */
	unsubscribe: () => void;
}

// =============================================================================
// Execution Engine
// =============================================================================

/**
 * Execution engine for running queries with optional reactive support.
 *
 * @example
 * ```typescript
 * // Basic usage (no streaming)
 * const engine = new ExecutionEngine(resolvers, { createContext: () => ({}) });
 * const post = await engine.executeGet("Post", "123");
 *
 * // Reactive usage (with GraphStateManager)
 * const stateManager = new GraphStateManager();
 * const engine = new ExecutionEngine(resolvers, { createContext: () => ({}), stateManager });
 * const sub = await engine.executeReactive("Post", "123", ["title", "content"]);
 * // Updates automatically flow to subscribed clients via stateManager
 * ```
 */
export class ExecutionEngine<S extends SchemaDefinition, Ctx extends BaseContext> {
	private schema: Schema<S>;
	private loaders = new Map<string, DataLoader<string, unknown>>();
	private resolvers: Resolvers<S, Ctx>;
	private createContext: () => Ctx;
	private stateManager?: GraphStateManager;
	private activeSubscriptions = new Map<string, { cleanup: () => void }>();
	private subscriptionCounter = 0;

	constructor(resolvers: Resolvers<S, Ctx>, config: ExecutionEngineConfig<S, Ctx> | (() => Ctx)) {
		this.resolvers = resolvers;
		if (typeof config === "function") {
			// Legacy: direct createContext function (no serialization support)
			this.createContext = config;
			// Create a minimal schema placeholder (won't have serialization)
			this.schema = {} as Schema<S>;
		} else {
			this.schema = config.schema;
			this.createContext = config.createContext;
			this.stateManager = config.stateManager;
		}
	}

	/**
	 * Execute a single entity query
	 */
	async executeGet<K extends keyof S & string>(
		entityName: K,
		id: string,
		select?: Select<S[K], S>,
	): Promise<InferEntity<S[K], S> | null> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver) {
			throw new ExecutionError(`No resolver found for entity: ${entityName}`);
		}

		// Try batch resolver first if available
		const batchResolver = this.resolvers.getBatchResolver(entityName);
		if (batchResolver) {
			const loader = this.getOrCreateLoader(entityName, batchResolver, ctx);
			const result = await loader.load(id);
			const selected = this.applySelection(result, select);
			return this.serializeEntity(entityName, selected as Record<string, unknown>) as InferEntity<S[K], S> | null;
		}

		// Fall back to single resolver
		const resolveResult = resolver.resolve(id, ctx);

		// Handle async generator (streaming)
		if (isAsyncIterable(resolveResult)) {
			// For now, just get the first value
			// TODO: Support streaming
			for await (const value of resolveResult) {
				const selected = this.applySelection(value, select);
				return this.serializeEntity(entityName, selected as Record<string, unknown>) as InferEntity<S[K], S> | null;
			}
			return null;
		}

		// Handle promise
		const result = await resolveResult;
		const selected = this.applySelection(result, select);
		return this.serializeEntity(entityName, selected as Record<string, unknown>) as InferEntity<S[K], S> | null;
	}

	/**
	 * Execute a list query
	 */
	async executeList<K extends keyof S & string>(
		entityName: K,
		input?: ListInput,
		select?: Select<S[K], S>,
	): Promise<InferEntity<S[K], S>[]> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.list) {
			throw new ExecutionError(`No list resolver found for entity: ${entityName}`);
		}

		const results = await resolver.list(input ?? {}, ctx);
		return results.map((r) => {
			const selected = this.applySelection(r, select);
			return this.serializeEntity(entityName, selected as Record<string, unknown>);
		}) as InferEntity<S[K], S>[];
	}

	/**
	 * Execute a paginated list query with cursor support
	 */
	async executeListPaginated<K extends keyof S & string>(
		entityName: K,
		input?: ListInput,
		select?: Select<S[K], S>,
	): Promise<PaginatedResult<InferEntity<S[K], S>>> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		// Try paginated resolver first
		if (resolver?.listPaginated) {
			const result = await resolver.listPaginated(input ?? {}, ctx);
			return {
				...result,
				data: result.data.map((r) => {
					const selected = this.applySelection(r, select);
					return this.serializeEntity(entityName, selected as Record<string, unknown>);
				}) as InferEntity<S[K], S>[],
			};
		}

		// Fall back to regular list resolver with synthetic pagination
		if (!resolver?.list) {
			throw new ExecutionError(`No list resolver found for entity: ${entityName}`);
		}

		// Request one extra to determine hasNextPage
		const take = input?.take ?? 20;
		const inputWithExtra = { ...input, take: take + 1 };
		const results = await resolver.list(inputWithExtra, ctx);
		const hasNextPage = results.length > take;
		const data = hasNextPage ? results.slice(0, take) : results;

		const pageInfo: PageInfo = {
			startCursor: data.length > 0 ? this.getCursor(data[0]) : null,
			endCursor: data.length > 0 ? this.getCursor(data[data.length - 1]) : null,
			hasPreviousPage: !!(input?.skip && input.skip > 0) || !!input?.cursor,
			hasNextPage,
		};

		return {
			data: data.map((r) => {
				const selected = this.applySelection(r, select);
				return this.serializeEntity(entityName, selected as Record<string, unknown>);
			}) as InferEntity<S[K], S>[],
			pageInfo,
		};
	}

	/**
	 * Get cursor from entity (uses id by default)
	 */
	private getCursor(entity: unknown): string {
		if (entity && typeof entity === "object" && "id" in entity) {
			return String((entity as Record<string, unknown>).id);
		}
		return "";
	}

	/**
	 * Execute a create mutation
	 */
	async executeCreate<K extends keyof S & string>(
		entityName: K,
		input: Partial<InferEntity<S[K], S>>,
	): Promise<InferEntity<S[K], S>> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.create) {
			throw new ExecutionError(`No create resolver found for entity: ${entityName}`);
		}

		const result = await resolver.create(input, ctx);
		this.invalidateLoaders(entityName);
		return this.serializeEntity(entityName, result as Record<string, unknown>) as InferEntity<S[K], S>;
	}

	/**
	 * Execute an update mutation
	 */
	async executeUpdate<K extends keyof S & string>(
		entityName: K,
		input: Partial<InferEntity<S[K], S>> & { id: string },
	): Promise<InferEntity<S[K], S>> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.update) {
			throw new ExecutionError(`No update resolver found for entity: ${entityName}`);
		}

		const result = await resolver.update(input, ctx);
		this.invalidateLoaders(entityName);
		return this.serializeEntity(entityName, result as Record<string, unknown>) as InferEntity<S[K], S>;
	}

	/**
	 * Execute a delete mutation
	 */
	async executeDelete<K extends keyof S & string>(
		entityName: K,
		id: string,
	): Promise<boolean> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.delete) {
			throw new ExecutionError(`No delete resolver found for entity: ${entityName}`);
		}

		const result = await resolver.delete(id, ctx);
		this.invalidateLoaders(entityName);
		return result;
	}

	/**
	 * Subscribe to entity updates (streaming via AsyncIterable)
	 */
	async *subscribe<K extends keyof S & string>(
		entityName: K,
		id: string,
		select?: Select<S[K], S>,
	): AsyncIterable<InferEntity<S[K], S> | null> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver) {
			throw new ExecutionError(`No resolver found for entity: ${entityName}`);
		}

		const resolveResult = resolver.resolve(id, ctx);

		// Handle async generator (streaming)
		if (isAsyncIterable(resolveResult)) {
			for await (const value of resolveResult) {
				const selected = this.applySelection(value, select);
				yield this.serializeEntity(entityName, selected as Record<string, unknown>) as InferEntity<S[K], S> | null;
			}
			return;
		}

		// Handle single promise (emit once)
		const result = await resolveResult;
		const selected = this.applySelection(result, select);
		yield this.serializeEntity(entityName, selected as Record<string, unknown>) as InferEntity<S[K], S> | null;
	}

	// ===========================================================================
	// Reactive Execution (GraphStateManager Integration)
	// ===========================================================================

	/**
	 * Execute a reactive query that streams updates to GraphStateManager.
	 *
	 * Three resolver patterns are supported:
	 * 1. `return value` - emit once, resolver completes
	 * 2. `yield* values` - emit multiple times via async generator
	 * 3. `ctx.emit(data)` - emit from anywhere (callbacks, events)
	 *
	 * @param entityName - Entity type
	 * @param id - Entity ID
	 * @param fields - Fields to track (array or "*" for all)
	 * @returns Subscription handle with unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * // Start reactive execution
	 * const sub = await engine.executeReactive("Post", "123", ["title", "content"]);
	 *
	 * // Later: stop receiving updates
	 * sub.unsubscribe();
	 * ```
	 */
	async executeReactive<K extends keyof S & string>(
		entityName: K,
		id: string,
		fields: string[] | "*" = "*",
	): Promise<ReactiveSubscription> {
		if (!this.stateManager) {
			throw new ExecutionError(
				"executeReactive requires a GraphStateManager. " +
					"Pass stateManager in ExecutionEngine config.",
			);
		}

		const resolver = this.resolvers.getResolver(entityName);
		if (!resolver) {
			throw new ExecutionError(`No resolver found for entity: ${entityName}`);
		}

		// Generate unique subscription ID
		const subscriptionId = `${entityName}:${id}:${++this.subscriptionCounter}`;

		// Track cleanup functions from ctx.onCleanup()
		const cleanupFns: (() => void)[] = [];
		let isActive = true;

		// Create emit-enabled context
		const emitContext: EmitContext<InferEntity<S[K], S>> = {
			emit: (data) => {
				if (!isActive) return;
				this.stateManager!.emit(entityName, id, data as Record<string, unknown>);
			},
			onCleanup: (fn) => {
				cleanupFns.push(fn);
				return () => {
					const idx = cleanupFns.indexOf(fn);
					if (idx >= 0) cleanupFns.splice(idx, 1);
				};
			},
		};

		// Merge user context with emit context
		const userCtx = this.createContext();
		const ctx = { ...userCtx, ...emitContext } as ResolverContext<InferEntity<S[K], S>, Ctx>;

		// Execute resolver
		const resolveResult = resolver.resolve(id, ctx as Ctx);

		// Process resolver result
		if (isAsyncIterable(resolveResult)) {
			// Async generator: loop all yields through emit
			this.processAsyncIterable(entityName, id, resolveResult, subscriptionId, () => isActive);
		} else {
			// Single promise: emit once
			resolveResult.then((value) => {
				if (isActive && value) {
					this.stateManager!.emit(entityName, id, value as Record<string, unknown>);
				}
			});
		}

		// Cleanup function
		const cleanup = () => {
			isActive = false;
			cleanupFns.forEach((fn) => fn());
			this.activeSubscriptions.delete(subscriptionId);
		};

		this.activeSubscriptions.set(subscriptionId, { cleanup });

		return {
			id: subscriptionId,
			entity: entityName,
			entityId: id,
			unsubscribe: cleanup,
		};
	}

	/**
	 * Process async iterable, emitting each value to state manager
	 */
	private async processAsyncIterable<K extends keyof S & string>(
		entityName: K,
		id: string,
		iterable: AsyncIterable<InferEntity<S[K], S>>,
		subscriptionId: string,
		isActive: () => boolean,
	): Promise<void> {
		try {
			for await (const value of iterable) {
				if (!isActive()) break;
				if (value) {
					this.stateManager!.emit(entityName, id, value as Record<string, unknown>);
				}
			}
		} catch (error) {
			// Log error but don't throw - subscription just ends
			console.error(`[ExecutionEngine] Error in reactive resolver ${subscriptionId}:`, error);
		}
	}

	/**
	 * Cancel a reactive subscription
	 */
	cancelSubscription(subscriptionId: string): boolean {
		const sub = this.activeSubscriptions.get(subscriptionId);
		if (sub) {
			sub.cleanup();
			return true;
		}
		return false;
	}

	/**
	 * Get count of active subscriptions
	 */
	getActiveSubscriptionCount(): number {
		return this.activeSubscriptions.size;
	}

	/**
	 * Get or create a DataLoader for an entity
	 */
	private getOrCreateLoader<K extends keyof S & string>(
		entityName: K,
		batchFn: (ids: string[], ctx: Ctx) => Promise<(InferEntity<S[K], S> | null)[]>,
		ctx: Ctx,
	): DataLoader<string, InferEntity<S[K], S>> {
		if (!this.loaders.has(entityName)) {
			this.loaders.set(
				entityName,
				new DataLoader((ids) => batchFn(ids, ctx)) as DataLoader<string, unknown>,
			);
		}
		return this.loaders.get(entityName) as DataLoader<string, InferEntity<S[K], S>>;
	}

	/**
	 * Invalidate loaders for an entity (after mutations)
	 */
	private invalidateLoaders(entityName: string): void {
		this.loaders.get(entityName)?.clear();
	}

	/**
	 * Apply field selection to result
	 *
	 * Filters the data object to only include selected fields.
	 * Supports nested selection for relations.
	 */
	/**
	 * Serialize entity data for transport
	 * Auto-calls serialize() on field types (Date → ISO string, Decimal → string, etc.)
	 *
	 * Note: Only serializes scalar fields. Relations are left as-is (not recursively serialized)
	 * to avoid circular reference issues. Nested relation data will be serialized when
	 * fetched through their own queries.
	 */
	private serializeEntity<K extends keyof S & string>(
		entityName: K,
		data: Record<string, unknown> | null,
	): Record<string, unknown> | null {
		if (data === null) return null;

		const entityDef = this.schema.definition[entityName];
		if (!entityDef) return data;

		const result: Record<string, unknown> = {};

		// Serialize each field according to its type
		for (const [fieldName, value] of Object.entries(data)) {
			const fieldType = entityDef[fieldName] as FieldType | undefined;

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

			// Relations: Don't recursively serialize to avoid circular references
			// The nested data will be serialized when fetched through its own query
			if (fieldType._type === "hasMany" || fieldType._type === "belongsTo" || fieldType._type === "hasOne") {
				result[fieldName] = value;
				continue;
			}

			// Handle arrays of scalar values
			if (Array.isArray(value) && fieldType._type === "array") {
				// For now, just pass through array values
				// TODO: If itemType has serialization, apply it
				result[fieldName] = value;
				continue;
			}

			// Handle object fields (not relations)
			if (typeof value === "object" && value !== null && fieldType._type === "object") {
				// Regular object field - pass through
				result[fieldName] = value;
				continue;
			}

			// Scalar field - call serialize() if method exists
			if (typeof fieldType.serialize === "function") {
				try {
					result[fieldName] = fieldType.serialize(value);
				} catch (error) {
					// If serialization fails, log warning and use original value
					console.warn(`Failed to serialize field ${String(entityName)}.${fieldName}:`, error);
					result[fieldName] = value;
				}
			} else {
				result[fieldName] = value;
			}
		}

		return result;
	}

	private applySelection<T>(data: T | null, select?: Record<string, unknown>): T | null {
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
				const nestedSelect = (value as { select?: Record<string, unknown> }).select ?? value;

				if (Array.isArray(dataValue)) {
					// HasMany relation
					result[key] = dataValue.map((item) =>
						this.applySelection(item as Record<string, unknown>, nestedSelect as Record<string, unknown>),
					);
				} else if (dataValue !== null && typeof dataValue === "object") {
					// HasOne/BelongsTo relation
					result[key] = this.applySelection(
						dataValue as Record<string, unknown>,
						nestedSelect as Record<string, unknown>,
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
// Errors
// =============================================================================

export class ExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionError";
	}
}
