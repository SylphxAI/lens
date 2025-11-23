/**
 * DataLoader Integration
 *
 * Automatic request batching and caching for resources.
 * Eliminates N+1 queries by batching multiple loads into single queries.
 *
 * @module @sylphx/lens-core/loader
 */

import type { Resource, QueryContext } from "../resource/types";
import { getRegistry } from "../resource/registry";

/**
 * Batch loader function
 *
 * Receives array of keys, returns array of results in same order.
 */
export type BatchLoadFn<K, V> = (keys: readonly K[]) => Promise<(V | Error)[]>;

/**
 * DataLoader options
 */
export interface DataLoaderOptions {
	/** Enable caching (default: true) */
	cache?: boolean;

	/** Batch window in milliseconds (default: 0 = next tick) */
	batchWindowMs?: number;

	/** Maximum batch size (default: Infinity) */
	maxBatchSize?: number;
}

/**
 * Simple DataLoader implementation
 *
 * Batches requests and caches results to eliminate N+1 queries.
 * Inspired by Facebook's DataLoader.
 */
export class DataLoader<K = any, V = any> {
	private batchLoadFn: BatchLoadFn<K, V>;
	private options: Required<DataLoaderOptions>;
	private cache: Map<K, Promise<V>> = new Map();
	private queue: Array<{
		key: K;
		resolve: (value: V) => void;
		reject: (error: Error) => void;
	}> = [];
	private batchScheduled = false;

	constructor(batchLoadFn: BatchLoadFn<K, V>, options: DataLoaderOptions = {}) {
		this.batchLoadFn = batchLoadFn;
		this.options = {
			cache: options.cache ?? true,
			batchWindowMs: options.batchWindowMs ?? 0,
			maxBatchSize: options.maxBatchSize ?? Infinity,
		};
	}

	/**
	 * Load a value by key
	 *
	 * Batches with other loads in the same tick.
	 *
	 * @param key - Key to load
	 * @returns Promise resolving to value
	 */
	async load(key: K): Promise<V> {
		// Check cache first
		if (this.options.cache) {
			const cached = this.cache.get(key);
			if (cached) return cached;
		}

		// Create promise for this key
		const promise = new Promise<V>((resolve, reject) => {
			this.queue.push({ key, resolve, reject });

			// Schedule batch if not already scheduled
			if (!this.batchScheduled) {
				this.batchScheduled = true;
				this.scheduleBatch();
			}
		});

		// Cache promise
		if (this.options.cache) {
			this.cache.set(key, promise);
		}

		return promise;
	}

	/**
	 * Load multiple values by keys
	 *
	 * @param keys - Keys to load
	 * @returns Promise resolving to array of values
	 */
	async loadMany(keys: readonly K[]): Promise<(V | Error)[]> {
		return Promise.all(keys.map((key) => this.load(key).catch((error) => error)));
	}

	/**
	 * Clear cache for a key
	 *
	 * @param key - Key to clear
	 */
	clear(key: K): void {
		this.cache.delete(key);
	}

	/**
	 * Clear all cache
	 */
	clearAll(): void {
		this.cache.clear();
	}

	/**
	 * Prime cache with a value
	 *
	 * @param key - Key to prime
	 * @param value - Value to cache
	 */
	prime(key: K, value: V): void {
		if (!this.options.cache) return;
		this.cache.set(key, Promise.resolve(value));
	}

	/**
	 * Schedule batch execution
	 */
	private scheduleBatch(): void {
		const execute = () => {
			this.batchScheduled = false;
			this.executeBatch();
		};

		if (this.options.batchWindowMs === 0) {
			// Next tick
			queueMicrotask(execute);
		} else {
			// Delayed batch
			setTimeout(execute, this.options.batchWindowMs);
		}
	}

	/**
	 * Execute current batch
	 */
	private async executeBatch(): Promise<void> {
		const queue = this.queue;
		this.queue = [];

		if (queue.length === 0) return;

		// Split into batches if needed
		const batches: typeof queue[] = [];
		for (let i = 0; i < queue.length; i += this.options.maxBatchSize) {
			batches.push(queue.slice(i, i + this.options.maxBatchSize));
		}

		// Execute batches
		for (const batch of batches) {
			const keys = batch.map((item) => item.key);

			try {
				const results = await this.batchLoadFn(keys);

				// Resolve promises
				for (let i = 0; i < batch.length; i++) {
					const result = results[i];
					if (result instanceof Error) {
						batch[i].reject(result);
						// Remove from cache on error
						if (this.options.cache) {
							this.cache.delete(batch[i].key);
						}
					} else {
						batch[i].resolve(result);
					}
				}
			} catch (error) {
				// Reject all promises in batch
				for (const item of batch) {
					item.reject(
						error instanceof Error ? error : new Error(String(error)),
					);
					// Remove from cache on error
					if (this.options.cache) {
						this.cache.delete(item.key);
					}
				}
			}
		}
	}
}

/**
 * Resource-specific DataLoader factory
 *
 * Creates DataLoaders for resource queries with proper batching.
 */
export class ResourceDataLoaderFactory {
	private loaders: Map<string, DataLoader> = new Map();

	/**
	 * Create or get entity loader
	 *
	 * Creates a DataLoader for fetching entities by ID with automatic batching.
	 *
	 * @param resource - Resource to load
	 * @param ctx - Query context with database access
	 * @returns DataLoader for entity lookups
	 */
	entity<T = any>(resource: Resource, ctx: QueryContext): DataLoader<string, T> {
		const loaderKey = `${resource.name}:entity`;

		if (!this.loaders.has(loaderKey)) {
			const loader = new DataLoader<string, T>(async (ids) => {
				const results = await this.batchLoadById(resource, ids as string[], ctx);
				return results;
			});

			this.loaders.set(loaderKey, loader);
		}

		return this.loaders.get(loaderKey) as DataLoader<string, T>;
	}

	/**
	 * Create or get relationship loader
	 *
	 * Creates a DataLoader for fetching related entities with automatic batching.
	 *
	 * @param resource - Source resource
	 * @param relationName - Relationship name
	 * @param ctx - Query context
	 * @returns DataLoader for relationship lookups
	 */
	relation<T = any>(
		resource: Resource,
		relationName: string,
		ctx: QueryContext,
	): DataLoader<string, T[]> {
		const loaderKey = `${resource.name}:${relationName}`;

		if (!this.loaders.has(loaderKey)) {
			const relationship = resource.definition.relationships?.[relationName];
			if (!relationship) {
				throw new Error(
					`Relationship '${relationName}' not found on resource '${resource.name}'`,
				);
			}

			const loader = new DataLoader<string, T[]>(async (parentIds) => {
				const results = await this.batchLoadRelated(
					resource,
					relationName,
					parentIds as string[],
					ctx,
				);
				return results;
			});

			this.loaders.set(loaderKey, loader);
		}

		return this.loaders.get(loaderKey) as DataLoader<string, T[]>;
	}

	/**
	 * Batch load entities by IDs
	 *
	 * This is a placeholder that should be implemented by database adapter.
	 *
	 * @param resource - Resource to load
	 * @param ids - Entity IDs
	 * @param ctx - Query context
	 * @returns Array of entities or errors
	 */
	private async batchLoadById<T = any>(
		resource: Resource,
		ids: readonly string[],
		ctx: QueryContext,
	): Promise<(T | Error)[]> {
		if (!ctx.db) {
			return ids.map(() => new Error("Database not available in context"));
		}

		// This should be implemented by the database adapter
		// For now, return placeholder
		const tableName = resource.definition.tableName || `${resource.name}s`;

		try {
			// Placeholder: Assume ctx.db has a method to batch load
			// Real implementation depends on database (Postgres, SQLite, etc.)
			const entities = await ctx.db.batchLoadByIds?.(tableName, ids);

			if (!entities) {
				throw new Error(`Database adapter does not support batchLoadByIds`);
			}

			// Return entities in same order as IDs
			return ids.map((id) => {
				const entity = entities.find((e: any) => e.id === id);
				return entity || new Error(`Entity not found: ${id}`);
			});
		} catch (error) {
			return ids.map(() =>
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Batch load related entities
	 *
	 * This is a placeholder that should be implemented by database adapter.
	 *
	 * @param resource - Source resource
	 * @param relationName - Relationship name
	 * @param parentIds - Parent entity IDs
	 * @param ctx - Query context
	 * @returns Array of related entity arrays
	 */
	private async batchLoadRelated<T = any>(
		resource: Resource,
		relationName: string,
		parentIds: readonly string[],
		ctx: QueryContext,
	): Promise<(T[] | Error)[]> {
		if (!ctx.db) {
			return parentIds.map(() => new Error("Database not available in context"));
		}

		const relationship = resource.definition.relationships?.[relationName];
		if (!relationship) {
			return parentIds.map(
				() =>
					new Error(
						`Relationship '${relationName}' not found on resource '${resource.name}'`,
					),
			);
		}

		const registry = getRegistry();
		const targetResource = registry.get(relationship.target);
		if (!targetResource) {
			return parentIds.map(
				() => new Error(`Target resource '${relationship.target}' not found`),
			);
		}

		try {
			// Placeholder: Assume ctx.db has a method to batch load relationships
			const targetTableName =
				targetResource.definition.tableName || `${targetResource.name}s`;

			const relatedEntities = await ctx.db.batchLoadRelated?.(
				targetTableName,
				relationship.foreignKey,
				parentIds,
			);

			if (!relatedEntities) {
				throw new Error(`Database adapter does not support batchLoadRelated`);
			}

			// Return related entities grouped by parent ID, in same order as parentIds
			return parentIds.map((parentId) => {
				const related = relatedEntities.filter(
					(e: any) => e[relationship.foreignKey] === parentId,
				);
				return related || [];
			});
		} catch (error) {
			return parentIds.map(() =>
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Clear all loaders
	 */
	clearAll(): void {
		for (const loader of this.loaders.values()) {
			loader.clearAll();
		}
		this.loaders.clear();
	}

	/**
	 * Clear loader for specific resource
	 *
	 * @param resource - Resource to clear
	 */
	clearResource(resource: Resource): void {
		const prefix = `${resource.name}:`;
		for (const [key, loader] of this.loaders.entries()) {
			if (key.startsWith(prefix)) {
				loader.clearAll();
				this.loaders.delete(key);
			}
		}
	}
}

/**
 * Create DataLoader factory for a query context
 *
 * Should be created once per request/query context.
 *
 * @returns New DataLoader factory
 */
export function createDataLoaderFactory(): ResourceDataLoaderFactory {
	return new ResourceDataLoaderFactory();
}
