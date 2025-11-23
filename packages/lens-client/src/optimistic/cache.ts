/**
 * Normalized Cache - Entity-based cache indexed by ID
 *
 * Similar to Apollo Client's normalized cache, but simpler.
 * Stores entities by type and ID, enabling automatic merge of optimistic updates.
 */

/**
 * Cache key: `${entityType}:${id}`
 */
type CacheKey = string;

/**
 * Cache entry with optimistic layers
 */
interface CacheEntry {
	/** Base server data */
	base: Record<string, any>;
	/** Optimistic updates (layered by mutation ID) */
	optimistic: Map<string, Record<string, any>>;
}

/**
 * Normalized cache for entity data
 *
 * Features:
 * - Entity-based storage (indexed by type:id)
 * - Optimistic layer support (stackable updates)
 * - Automatic merging (base + optimistic layers)
 * - Type-safe entity access
 */
export class NormalizedCache {
	/** Internal cache storage */
	private cache = new Map<CacheKey, CacheEntry>();

	/**
	 * Generate cache key from entity type and ID
	 */
	private getCacheKey(entityType: string, id: string | number): CacheKey {
		return `${entityType}:${id}`;
	}

	/**
	 * Get entity from cache (merged with optimistic layers)
	 *
	 * @param entityType - Entity type (e.g., 'Session', 'Message')
	 * @param id - Entity ID
	 * @returns Merged entity data (base + optimistic), or undefined if not found
	 */
	get(entityType: string, id: string | number): Record<string, any> | undefined {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// Merge base + all optimistic layers
		let merged = { ...entry.base };
		for (const optimisticData of entry.optimistic.values()) {
			merged = { ...merged, ...optimisticData };
		}

		return merged;
	}

	/**
	 * Get base entity from cache (without optimistic layers)
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @returns Base entity data, or undefined if not found
	 */
	getBase(entityType: string, id: string | number): Record<string, any> | undefined {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);
		return entry ? { ...entry.base } : undefined;
	}

	/**
	 * Set base entity data (replaces existing base)
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @param data - Entity data
	 */
	setBase(entityType: string, id: string | number, data: Record<string, any>): void {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (entry) {
			entry.base = { ...data };
		} else {
			this.cache.set(key, {
				base: { ...data },
				optimistic: new Map(),
			});
		}
	}

	/**
	 * Merge data into base entity (shallow merge)
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @param data - Partial data to merge
	 */
	mergeBase(entityType: string, id: string | number, data: Record<string, any>): void {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (entry) {
			entry.base = { ...entry.base, ...data };
		} else {
			this.cache.set(key, {
				base: { ...data },
				optimistic: new Map(),
			});
		}
	}

	/**
	 * Apply optimistic update (creates new optimistic layer)
	 *
	 * @param mutationId - Unique mutation ID
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @param data - Optimistic data to merge
	 */
	applyOptimistic(
		mutationId: string,
		entityType: string,
		id: string | number,
		data: Record<string, any>,
	): void {
		const key = this.getCacheKey(entityType, id);
		let entry = this.cache.get(key);

		// Create entry if it doesn't exist
		if (!entry) {
			entry = {
				base: {},
				optimistic: new Map(),
			};
			this.cache.set(key, entry);
		}

		// Add optimistic layer
		entry.optimistic.set(mutationId, { ...data });
	}

	/**
	 * Confirm optimistic update (merge into base, remove optimistic layer)
	 *
	 * @param mutationId - Unique mutation ID
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 */
	confirmOptimistic(mutationId: string, entityType: string, id: string | number): void {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (!entry) return;

		// Get optimistic data
		const optimisticData = entry.optimistic.get(mutationId);
		if (!optimisticData) return;

		// Merge into base
		entry.base = { ...entry.base, ...optimisticData };

		// Remove optimistic layer
		entry.optimistic.delete(mutationId);
	}

	/**
	 * Rollback optimistic update (remove optimistic layer)
	 *
	 * @param mutationId - Unique mutation ID
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 */
	rollbackOptimistic(mutationId: string, entityType: string, id: string | number): void {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (!entry) return;

		// Remove optimistic layer
		entry.optimistic.delete(mutationId);
	}

	/**
	 * Get all optimistic mutations for an entity
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @returns Array of mutation IDs
	 */
	getOptimisticMutations(entityType: string, id: string | number): string[] {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (!entry) return [];

		return Array.from(entry.optimistic.keys());
	}

	/**
	 * Check if entity has any optimistic updates
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 * @returns True if entity has pending optimistic updates
	 */
	hasOptimistic(entityType: string, id: string | number): boolean {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		return entry ? entry.optimistic.size > 0 : false;
	}

	/**
	 * Clear all optimistic updates for an entity
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 */
	clearOptimistic(entityType: string, id: string | number): void {
		const key = this.getCacheKey(entityType, id);
		const entry = this.cache.get(key);

		if (entry) {
			entry.optimistic.clear();
		}
	}

	/**
	 * Remove entity from cache entirely
	 *
	 * @param entityType - Entity type
	 * @param id - Entity ID
	 */
	remove(entityType: string, id: string | number): void {
		const key = this.getCacheKey(entityType, id);
		this.cache.delete(key);
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		totalEntities: number;
		entitiesWithOptimistic: number;
		totalOptimisticLayers: number;
	} {
		let entitiesWithOptimistic = 0;
		let totalOptimisticLayers = 0;

		for (const entry of this.cache.values()) {
			if (entry.optimistic.size > 0) {
				entitiesWithOptimistic++;
				totalOptimisticLayers += entry.optimistic.size;
			}
		}

		return {
			totalEntities: this.cache.size,
			entitiesWithOptimistic,
			totalOptimisticLayers,
		};
	}
}
