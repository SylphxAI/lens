/**
 * @lens/client - Reactive Store
 *
 * Manages entity signals, caching, and optimistic updates.
 */

import type { Update, EntityKey } from "@lens/core";
import { applyUpdate, makeEntityKey } from "@lens/core";
import { signal, type WritableSignal, type Signal, batch } from "../signals/signal";

// Re-export for convenience
export type { EntityKey };

/** Entity state with metadata */
export interface EntityState<T = unknown> {
	/** The entity data */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Whether data is stale */
	stale: boolean;
	/** Subscription reference count */
	refCount: number;
	/** Cache timestamp */
	cachedAt?: number;
	/** Cache tags for invalidation */
	tags?: string[];
}

/** Optimistic update entry */
export interface OptimisticEntry {
	id: string;
	entityName: string;
	entityId: string;
	type: "create" | "update" | "delete";
	originalData: unknown;
	optimisticData: unknown;
	timestamp: number;
}

/** Store configuration */
export interface StoreConfig {
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
	/** Cache TTL in milliseconds (default: 5 minutes) */
	cacheTTL?: number;
	/** Maximum cache size (default: 1000) */
	maxCacheSize?: number;
	/** Cascade invalidation rules */
	cascadeRules?: CascadeRule[];
}

/** Cascade invalidation rule */
export interface CascadeRule {
	/** Source entity type that triggers invalidation */
	source: string;
	/** Operation types that trigger cascade (default: all) */
	operations?: ("create" | "update" | "delete")[];
	/** Target entities to invalidate */
	targets: string[];
}

/** Invalidation options */
export interface InvalidationOptions {
	/** Invalidate by tag */
	tags?: string[];
	/** Invalidate by entity type pattern (glob-like) */
	pattern?: string;
	/** Cascade to related entities */
	cascade?: boolean;
}

// =============================================================================
// Reactive Store
// =============================================================================

/**
 * Reactive store for managing entity state
 */
export class ReactiveStore {
	/** Entity signals by key */
	private entities = new Map<EntityKey, WritableSignal<EntityState>>();

	/** List signals by query key */
	private lists = new Map<string, WritableSignal<EntityState<unknown[]>>>();

	/** Optimistic updates pending confirmation */
	private optimisticUpdates = new Map<string, OptimisticEntry>();

	/** Configuration */
	private config: Required<Omit<StoreConfig, "cascadeRules">> & { cascadeRules: CascadeRule[] };

	/** Tag to entity keys mapping */
	private tagIndex = new Map<string, Set<EntityKey>>();

	constructor(config: StoreConfig = {}) {
		this.config = {
			optimistic: config.optimistic ?? true,
			cacheTTL: config.cacheTTL ?? 5 * 60 * 1000,
			maxCacheSize: config.maxCacheSize ?? 1000,
			cascadeRules: config.cascadeRules ?? [],
		};
	}

	// ===========================================================================
	// Entity Management
	// ===========================================================================

	/**
	 * Get or create entity signal
	 */
	getEntity<T>(entityName: string, entityId: string): Signal<EntityState<T>> {
		const key = this.makeKey(entityName, entityId);

		if (!this.entities.has(key)) {
			this.entities.set(
				key,
				signal<EntityState>({
					data: null,
					loading: true,
					error: null,
					stale: false,
					refCount: 0,
				}),
			);
		}

		return this.entities.get(key)! as Signal<EntityState<T>>;
	}

	/**
	 * Set entity data
	 */
	setEntity<T>(entityName: string, entityId: string, data: T, tags?: string[]): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);
		const now = Date.now();

		if (entitySignal) {
			entitySignal.value = {
				...entitySignal.value,
				data,
				loading: false,
				error: null,
				stale: false,
				cachedAt: now,
				tags: tags ?? entitySignal.value.tags,
			};
		} else {
			this.entities.set(
				key,
				signal<EntityState>({
					data,
					loading: false,
					error: null,
					stale: false,
					refCount: 0,
					cachedAt: now,
					tags,
				}),
			);
		}

		// Update tag index
		if (tags) {
			for (const tag of tags) {
				if (!this.tagIndex.has(tag)) {
					this.tagIndex.set(tag, new Set());
				}
				this.tagIndex.get(tag)!.add(key);
			}
		}
	}

	/**
	 * Update entity with server update
	 */
	applyServerUpdate(entityName: string, entityId: string, update: Update): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal && entitySignal.value.data != null) {
			const newData = applyUpdate(entitySignal.value.data, update);
			entitySignal.value = {
				...entitySignal.value,
				data: newData,
				stale: false,
			};
		}
	}

	/**
	 * Set entity error state
	 */
	setEntityError(entityName: string, entityId: string, error: Error): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal) {
			entitySignal.value = {
				...entitySignal.value,
				loading: false,
				error,
			};
		}
	}

	/**
	 * Set entity loading state
	 */
	setEntityLoading(entityName: string, entityId: string, loading: boolean): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal) {
			entitySignal.value = {
				...entitySignal.value,
				loading,
			};
		}
	}

	/**
	 * Remove entity from cache
	 */
	removeEntity(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		this.entities.delete(key);
	}

	/**
	 * Check if entity exists in cache
	 */
	hasEntity(entityName: string, entityId: string): boolean {
		const key = this.makeKey(entityName, entityId);
		return this.entities.has(key);
	}

	// ===========================================================================
	// List Management
	// ===========================================================================

	/**
	 * Get or create list signal
	 */
	getList<T>(queryKey: string): Signal<EntityState<T[]>> {
		if (!this.lists.has(queryKey)) {
			this.lists.set(
				queryKey,
				signal<EntityState<unknown[]>>({
					data: null,
					loading: true,
					error: null,
					stale: false,
					refCount: 0,
				}),
			);
		}

		return this.lists.get(queryKey)! as Signal<EntityState<T[]>>;
	}

	/**
	 * Set list data
	 */
	setList<T>(queryKey: string, data: T[]): void {
		const listSignal = this.lists.get(queryKey);

		if (listSignal) {
			listSignal.value = {
				...listSignal.value,
				data: data as unknown[],
				loading: false,
				error: null,
				stale: false,
			};
		} else {
			this.lists.set(
				queryKey,
				signal<EntityState<unknown[]>>({
					data: data as unknown[],
					loading: false,
					error: null,
					stale: false,
					refCount: 0,
				}),
			);
		}
	}

	// ===========================================================================
	// Optimistic Updates
	// ===========================================================================

	/**
	 * Apply optimistic update
	 */
	applyOptimistic<T extends { id: string }>(
		entityName: string,
		type: "create" | "update" | "delete",
		data: Partial<T> & { id: string },
	): string {
		if (!this.config.optimistic) {
			return "";
		}

		const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		const entityId = data.id;
		const key = this.makeKey(entityName, entityId);

		// Store original data for rollback
		const entitySignal = this.entities.get(key);
		const originalData = entitySignal?.value.data ?? null;

		batch(() => {
			switch (type) {
				case "create":
					// Add to cache
					this.setEntity(entityName, entityId, data);
					break;

				case "update":
					// Merge with existing data
					if (entitySignal && entitySignal.value.data) {
						this.setEntity(entityName, entityId, {
							...(entitySignal.value.data as object),
							...data,
						});
					}
					break;

				case "delete":
					// Mark as deleted (keep in cache but null data)
					if (entitySignal) {
						entitySignal.value = {
							...entitySignal.value,
							data: null,
						};
					}
					break;
			}
		});

		// Store for potential rollback
		this.optimisticUpdates.set(optimisticId, {
			id: optimisticId,
			entityName,
			entityId,
			type,
			originalData,
			optimisticData: data,
			timestamp: Date.now(),
		});

		return optimisticId;
	}

	/**
	 * Confirm optimistic update (server confirmed)
	 */
	confirmOptimistic(optimisticId: string, serverData?: unknown): void {
		const entry = this.optimisticUpdates.get(optimisticId);
		if (!entry) return;

		// If server returned different data, update with it
		if (serverData !== undefined && entry.type !== "delete") {
			this.setEntity(entry.entityName, entry.entityId, serverData);
		}

		// Remove from pending
		this.optimisticUpdates.delete(optimisticId);
	}

	/**
	 * Rollback optimistic update (server rejected)
	 */
	rollbackOptimistic(optimisticId: string): void {
		const entry = this.optimisticUpdates.get(optimisticId);
		if (!entry) return;

		batch(() => {
			switch (entry.type) {
				case "create":
					// Remove the optimistically created entity
					this.removeEntity(entry.entityName, entry.entityId);
					break;

				case "update":
				case "delete":
					// Restore original data
					if (entry.originalData !== null) {
						this.setEntity(entry.entityName, entry.entityId, entry.originalData);
					}
					break;
			}
		});

		// Remove from pending
		this.optimisticUpdates.delete(optimisticId);
	}

	/**
	 * Get pending optimistic updates
	 */
	getPendingOptimistic(): OptimisticEntry[] {
		return Array.from(this.optimisticUpdates.values());
	}

	// ===========================================================================
	// Cache Invalidation
	// ===========================================================================

	/**
	 * Invalidate entity and mark as stale
	 */
	invalidate(entityName: string, entityId: string, options?: InvalidationOptions): void {
		const key = this.makeKey(entityName, entityId);
		this.markStale(key);

		// Cascade invalidation
		if (options?.cascade !== false) {
			this.cascadeInvalidate(entityName, "update");
		}
	}

	/**
	 * Invalidate all entities of a type
	 */
	invalidateEntity(entityName: string, options?: InvalidationOptions): void {
		for (const key of this.entities.keys()) {
			if (key.startsWith(`${entityName}:`)) {
				this.markStale(key);
			}
		}

		// Invalidate related lists
		for (const listKey of this.lists.keys()) {
			if (listKey.includes(entityName)) {
				const listSignal = this.lists.get(listKey);
				if (listSignal) {
					listSignal.value = { ...listSignal.value, stale: true };
				}
			}
		}

		// Cascade invalidation
		if (options?.cascade !== false) {
			this.cascadeInvalidate(entityName, "update");
		}
	}

	/**
	 * Invalidate by tags
	 */
	invalidateByTags(tags: string[]): number {
		let count = 0;
		for (const tag of tags) {
			const keys = this.tagIndex.get(tag);
			if (keys) {
				for (const key of keys) {
					this.markStale(key);
					count++;
				}
			}
		}
		return count;
	}

	/**
	 * Invalidate by pattern (glob-like: User:*, *:123)
	 */
	invalidateByPattern(pattern: string): number {
		const regex = this.patternToRegex(pattern);
		let count = 0;

		for (const key of this.entities.keys()) {
			if (regex.test(key)) {
				this.markStale(key);
				count++;
			}
		}

		return count;
	}

	/**
	 * Tag an entity for group invalidation
	 */
	tagEntity(entityName: string, entityId: string, tags: string[]): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal) {
			entitySignal.value = {
				...entitySignal.value,
				tags: [...new Set([...(entitySignal.value.tags ?? []), ...tags])],
			};

			// Update tag index
			for (const tag of tags) {
				if (!this.tagIndex.has(tag)) {
					this.tagIndex.set(tag, new Set());
				}
				this.tagIndex.get(tag)!.add(key);
			}
		}
	}

	/**
	 * Check if entity data is stale (past TTL)
	 */
	isStale(entityName: string, entityId: string): boolean {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (!entitySignal) return true;
		if (entitySignal.value.stale) return true;
		if (!entitySignal.value.cachedAt) return false;

		return Date.now() - entitySignal.value.cachedAt > this.config.cacheTTL;
	}

	/**
	 * Get data with stale-while-revalidate pattern
	 * Returns stale data immediately and triggers revalidation callback
	 */
	getStaleWhileRevalidate<T>(
		entityName: string,
		entityId: string,
		revalidate: () => Promise<T>,
	): { data: T | null; isStale: boolean; revalidating: Promise<T> | null } {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);
		const isStale = this.isStale(entityName, entityId);

		let revalidating: Promise<T> | null = null;

		if (isStale && entitySignal?.value.data != null) {
			// Return stale data and trigger revalidation
			revalidating = revalidate().then((newData) => {
				this.setEntity(entityName, entityId, newData);
				return newData;
			});
		}

		return {
			data: (entitySignal?.value.data as T) ?? null,
			isStale,
			revalidating,
		};
	}

	// ===========================================================================
	// Private Invalidation Helpers
	// ===========================================================================

	private markStale(key: EntityKey): void {
		const entitySignal = this.entities.get(key);
		if (entitySignal) {
			entitySignal.value = { ...entitySignal.value, stale: true };
		}
	}

	private cascadeInvalidate(
		entityName: string,
		operation: "create" | "update" | "delete",
	): void {
		for (const rule of this.config.cascadeRules) {
			if (rule.source !== entityName) continue;
			if (rule.operations && !rule.operations.includes(operation)) continue;

			for (const target of rule.targets) {
				this.invalidateEntity(target, { cascade: false }); // Prevent infinite loop
			}
		}
	}

	private patternToRegex(pattern: string): RegExp {
		// Convert glob-like pattern to regex: * -> .*, ? -> .
		const escaped = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, ".*")
			.replace(/\?/g, ".");
		return new RegExp(`^${escaped}$`);
	}

	// ===========================================================================
	// Reference Counting & Cleanup
	// ===========================================================================

	/**
	 * Increment reference count for entity
	 */
	retain(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal) {
			entitySignal.value = {
				...entitySignal.value,
				refCount: entitySignal.value.refCount + 1,
			};
		}
	}

	/**
	 * Decrement reference count for entity
	 */
	release(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const entitySignal = this.entities.get(key);

		if (entitySignal) {
			const newRefCount = Math.max(0, entitySignal.value.refCount - 1);
			entitySignal.value = {
				...entitySignal.value,
				refCount: newRefCount,
			};

			// Mark as stale when no subscribers
			if (newRefCount === 0) {
				entitySignal.value = {
					...entitySignal.value,
					stale: true,
				};
			}
		}
	}

	/**
	 * Clear all stale entities
	 */
	gc(): number {
		let cleared = 0;

		for (const [key, entitySignal] of this.entities) {
			if (entitySignal.value.stale && entitySignal.value.refCount === 0) {
				this.entities.delete(key);
				cleared++;
			}
		}

		return cleared;
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		this.entities.clear();
		this.lists.clear();
		this.optimisticUpdates.clear();
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Create cache key (delegates to @lens/core)
	 */
	private makeKey(entityName: string, entityId: string): EntityKey {
		return makeEntityKey(entityName, entityId);
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		entities: number;
		lists: number;
		pendingOptimistic: number;
	} {
		return {
			entities: this.entities.size,
			lists: this.lists.size,
			pendingOptimistic: this.optimisticUpdates.size,
		};
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new reactive store
 */
export function createStore(config?: StoreConfig): ReactiveStore {
	return new ReactiveStore(config);
}
