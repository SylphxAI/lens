/**
 * @sylphx/lens-client - Simple Store
 *
 * Non-reactive store for entity caching and optimistic updates.
 * Uses plain objects and callbacks instead of signals.
 *
 * For reactive store with signals, use @sylphx/lens-signals.
 */

import type { EntityKey, Pipeline, Update } from "@sylphx/lens-core";
import { applyUpdate, makeEntityKey } from "@sylphx/lens-core";
import {
	createCachePlugin,
	execute,
	type PipelineResult,
	registerPlugin,
	unregisterPlugin,
} from "@sylphx/reify";

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
	cachedAt?: number | undefined;
	/** Cache tags for invalidation */
	tags?: string[] | undefined;
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

/** Multi-entity optimistic transaction */
export interface OptimisticTransaction {
	id: string;
	/** Pipeline results from Reify execution */
	results: PipelineResult;
	/** Original data for each entity (for rollback) */
	originalData: Map<string, unknown>;
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
}

/** Entity state wrapper with get/set accessors */
export interface EntityStateRef<T = unknown> {
	/** Get current state */
	readonly value: EntityState<T>;
}

// =============================================================================
// Simple Store (non-reactive)
// =============================================================================

/**
 * Simple store for managing entity state (non-reactive)
 */
export class SimpleStore {
	/** Entity states by key */
	private entities = new Map<EntityKey, EntityState>();

	/** List states by query key */
	private lists = new Map<string, EntityState<unknown[]>>();

	/** Optimistic updates pending confirmation */
	private optimisticUpdates = new Map<string, OptimisticEntry>();

	/** Multi-entity optimistic transactions */
	private optimisticTransactions = new Map<string, OptimisticTransaction>();

	/** Configuration */
	private config: Required<StoreConfig>;

	/** Tag to entity keys mapping */
	private tagIndex = new Map<string, Set<EntityKey>>();

	constructor(config: StoreConfig = {}) {
		this.config = {
			optimistic: config.optimistic ?? true,
			cacheTTL: config.cacheTTL ?? 5 * 60 * 1000,
			maxCacheSize: config.maxCacheSize ?? 1000,
		};
	}

	// ===========================================================================
	// Entity Management
	// ===========================================================================

	/**
	 * Get or create entity state
	 */
	getEntity<T>(entityName: string, entityId: string): EntityStateRef<T> {
		const key = this.makeKey(entityName, entityId);

		if (!this.entities.has(key)) {
			this.entities.set(key, {
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		}

		const entities = this.entities;
		return {
			get value() {
				return entities.get(key) as EntityState<T>;
			},
		};
	}

	/**
	 * Set entity data
	 */
	setEntity<T>(entityName: string, entityId: string, data: T, tags?: string[]): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);
		const now = Date.now();

		this.entities.set(key, {
			data,
			loading: false,
			error: null,
			stale: false,
			refCount: existing?.refCount ?? 0,
			cachedAt: now,
			tags: tags ?? existing?.tags,
		});

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
		const existing = this.entities.get(key);

		if (existing && existing.data != null) {
			const newData = applyUpdate(existing.data, update);
			this.entities.set(key, {
				...existing,
				data: newData,
				stale: false,
			});
		}
	}

	/**
	 * Set entity error state
	 */
	setEntityError(entityName: string, entityId: string, error: Error): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);

		if (existing) {
			this.entities.set(key, {
				...existing,
				loading: false,
				error,
			});
		}
	}

	/**
	 * Set entity loading state
	 */
	setEntityLoading(entityName: string, entityId: string, loading: boolean): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);

		if (existing) {
			this.entities.set(key, {
				...existing,
				loading,
			});
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
	 * Get or create list state
	 */
	getList<T>(queryKey: string): EntityStateRef<T[]> {
		if (!this.lists.has(queryKey)) {
			this.lists.set(queryKey, {
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		}

		const lists = this.lists;
		return {
			get value() {
				return lists.get(queryKey) as EntityState<T[]>;
			},
		};
	}

	/**
	 * Set list data
	 */
	setList<T>(queryKey: string, data: T[]): void {
		const existing = this.lists.get(queryKey);

		this.lists.set(queryKey, {
			data: data as unknown[],
			loading: false,
			error: null,
			stale: false,
			refCount: existing?.refCount ?? 0,
		});
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
		const existing = this.entities.get(key);
		const originalData = existing?.data ?? null;

		switch (type) {
			case "create":
				this.setEntity(entityName, entityId, data);
				break;

			case "update":
				if (existing?.data) {
					this.setEntity(entityName, entityId, {
						...(existing.data as object),
						...data,
					});
				}
				break;

			case "delete":
				if (existing) {
					this.entities.set(key, {
						...existing,
						data: null,
					});
				}
				break;
		}

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

		switch (entry.type) {
			case "create":
				this.removeEntity(entry.entityName, entry.entityId);
				break;

			case "update":
			case "delete":
				if (entry.originalData !== null) {
					this.setEntity(entry.entityName, entry.entityId, entry.originalData);
				}
				break;
		}

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
	// Multi-Entity Optimistic Updates (Transaction-based)
	// ===========================================================================

	/**
	 * Apply optimistic update from Reify Pipeline
	 * Returns transaction ID for confirmation/rollback
	 */
	async applyPipelineOptimistic<TInput extends Record<string, unknown>>(
		pipeline: Pipeline,
		input: TInput,
	): Promise<string> {
		if (!this.config.optimistic) {
			return "";
		}

		const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`;

		// Store original data for rollback
		const originalData = new Map<string, unknown>();

		// Create a cache adapter that wraps SimpleStore
		const cacheAdapter = {
			get: (key: string) => {
				const [entityName, entityId] = key.split(":") as [string, string];
				const state = this.entities.get(this.makeKey(entityName, entityId));
				return state?.data ?? undefined;
			},
			set: (key: string, value: unknown) => {
				const [entityName, entityId] = key.split(":") as [string, string];
				const storeKey = this.makeKey(entityName, entityId);

				// Save original data before first modification
				if (!originalData.has(storeKey)) {
					const state = this.entities.get(storeKey);
					originalData.set(storeKey, state?.data ?? null);
				}

				this.setEntity(entityName, entityId, value);
			},
			delete: (key: string) => {
				const [entityName, entityId] = key.split(":") as [string, string];
				const storeKey = this.makeKey(entityName, entityId);

				// Save original data before deletion
				if (!originalData.has(storeKey)) {
					const state = this.entities.get(storeKey);
					originalData.set(storeKey, state?.data ?? null);
				}

				const existing = this.entities.get(storeKey);
				if (existing) {
					this.entities.set(storeKey, { ...existing, data: null });
				}
				return true;
			},
			has: (key: string) => {
				const [entityName, entityId] = key.split(":") as [string, string];
				return this.entities.has(this.makeKey(entityName, entityId));
			},
		};

		// Execute pipeline with cache adapter
		const cachePlugin = createCachePlugin(cacheAdapter);
		registerPlugin(cachePlugin);

		let results: PipelineResult;
		try {
			results = await execute(pipeline, input);
		} finally {
			unregisterPlugin("entity");
		}

		// Store transaction for potential rollback
		this.optimisticTransactions.set(txId, {
			id: txId,
			results,
			originalData,
			timestamp: Date.now(),
		});

		return txId;
	}

	/**
	 * Confirm pipeline optimistic transaction
	 */
	confirmPipelineOptimistic(
		txId: string,
		serverResults?: Array<{ entity: string; tempId: string; data: unknown }>,
	): void {
		const tx = this.optimisticTransactions.get(txId);
		if (!tx) return;

		if (serverResults) {
			for (const result of serverResults) {
				this.removeEntity(result.entity, result.tempId);

				const realData = result.data as { id?: string } | null;
				if (realData?.id) {
					this.setEntity(result.entity, realData.id, realData);
				}
			}
		}

		this.optimisticTransactions.delete(txId);
	}

	/**
	 * Rollback pipeline optimistic transaction
	 */
	rollbackPipelineOptimistic(txId: string): void {
		const tx = this.optimisticTransactions.get(txId);
		if (!tx) return;

		// Restore all entities to their original state
		for (const [key, originalData] of tx.originalData) {
			const [entityName, entityId] = key.split(":") as [string, string];

			if (originalData === null) {
				this.removeEntity(entityName, entityId);
			} else {
				this.setEntity(entityName, entityId, originalData);
			}
		}

		this.optimisticTransactions.delete(txId);
	}

	/**
	 * Get pending multi-entity transactions
	 */
	getPendingTransactions(): OptimisticTransaction[] {
		return Array.from(this.optimisticTransactions.values());
	}

	// ===========================================================================
	// Cache Invalidation
	// ===========================================================================

	/**
	 * Invalidate entity and mark as stale
	 */
	invalidate(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);
		if (existing) {
			this.entities.set(key, { ...existing, stale: true });
		}
	}

	/**
	 * Invalidate all entities of a type
	 */
	invalidateEntity(entityName: string): void {
		for (const [key, state] of this.entities) {
			if (key.startsWith(`${entityName}:`)) {
				this.entities.set(key, { ...state, stale: true });
			}
		}

		// Invalidate related lists
		for (const [listKey, state] of this.lists) {
			if (listKey.includes(entityName)) {
				this.lists.set(listKey, { ...state, stale: true });
			}
		}
	}

	/**
	 * Check if entity data is stale (past TTL)
	 */
	isStale(entityName: string, entityId: string): boolean {
		const key = this.makeKey(entityName, entityId);
		const state = this.entities.get(key);

		if (!state) return true;
		if (state.stale) return true;
		if (!state.cachedAt) return false;

		return Date.now() - state.cachedAt > this.config.cacheTTL;
	}

	// ===========================================================================
	// Reference Counting & Cleanup
	// ===========================================================================

	/**
	 * Increment reference count for entity
	 */
	retain(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);

		if (existing) {
			this.entities.set(key, {
				...existing,
				refCount: existing.refCount + 1,
			});
		}
	}

	/**
	 * Decrement reference count for entity
	 */
	release(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const existing = this.entities.get(key);

		if (existing) {
			const newRefCount = Math.max(0, existing.refCount - 1);
			this.entities.set(key, {
				...existing,
				refCount: newRefCount,
				stale: newRefCount === 0 ? true : existing.stale,
			});
		}
	}

	/**
	 * Clear all stale entities
	 */
	gc(): number {
		let cleared = 0;

		for (const [key, state] of this.entities) {
			if (state.stale && state.refCount === 0) {
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
		this.optimisticTransactions.clear();
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Create cache key
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
 * Create a new simple store
 */
export function createStore(config?: StoreConfig): SimpleStore {
	return new SimpleStore(config);
}
