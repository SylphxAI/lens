/**
 * OptimisticManager - High-level manager for optimistic updates
 *
 * Coordinates cache, executor, and mutation lifecycle.
 * Provides simple API for automatic optimistic updates.
 */

import type { OptimisticConfig } from "@sylphx/lens-core";
import type { Observable } from "@sylphx/lens-core";
import { BehaviorSubject } from "rxjs";
import { NormalizedCache } from "./cache.js";
import { OptimisticExecutor } from "./executor.js";

/**
 * Pending mutation info
 */
interface PendingMutation {
	id: string;
	entityType: string;
	entityId: string | number;
	startTime: number;
}

/**
 * Optimistic manager configuration
 */
export interface OptimisticManagerConfig {
	/** Auto-confirm timeout (ms). If mutation takes longer, it's still pending. Default: 30000 (30s) */
	autoConfirmTimeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * High-level optimistic updates manager
 *
 * Usage:
 * ```ts
 * const manager = new OptimisticManager();
 *
 * // Before mutation
 * const mutationId = manager.beforeMutation(optimisticConfig, input);
 *
 * try {
 *   // Execute mutation
 *   const result = await api.mutate(input);
 *   // On success
 *   manager.onSuccess(mutationId);
 * } catch (error) {
 *   // On error
 *   manager.onError(mutationId);
 * }
 *
 * // Subscribe to entity changes
 * manager.subscribe('Session', 'sess-1').subscribe(data => {
 *   console.log('Session updated:', data);
 * });
 * ```
 */
export class OptimisticManager {
	private cache: NormalizedCache;
	private executor: OptimisticExecutor;
	private config: Required<OptimisticManagerConfig>;
	private pendingMutations = new Map<string, PendingMutation>();
	private mutationCounter = 0;

	// Observable subjects for each entity (entityType:id -> subject)
	private entitySubjects = new Map<string, BehaviorSubject<any>>();

	constructor(config: OptimisticManagerConfig = {}) {
		this.cache = new NormalizedCache();
		this.executor = new OptimisticExecutor(this.cache);
		this.config = {
			autoConfirmTimeout: config.autoConfirmTimeout ?? 30000,
			debug: config.debug ?? false,
		};
	}

	/**
	 * Generate unique mutation ID
	 */
	private generateMutationId(): string {
		return `mut-${Date.now()}-${++this.mutationCounter}`;
	}

	/**
	 * Get entity cache key
	 */
	private getEntityKey(entityType: string, entityId: string | number): string {
		return `${entityType}:${entityId}`;
	}

	/**
	 * Log debug message
	 */
	private log(...args: any[]): void {
		if (this.config.debug) {
			console.log("[OptimisticManager]", ...args);
		}
	}

	/**
	 * Hook: Before mutation (auto-apply optimistic update)
	 *
	 * @param config - Optimistic configuration from mutation metadata
	 * @param input - Mutation input
	 * @returns Mutation ID (for tracking)
	 */
	beforeMutation(config: OptimisticConfig | undefined, input: any): string | null {
		if (!config) {
			this.log("No optimistic config, skipping");
			return null;
		}

		const mutationId = this.generateMutationId();

		try {
			// Execute optimistic update
			this.executor.execute(mutationId, config, input);

			// Extract entity info for tracking
			const entityIdDescriptor = config.id;
			const entityId = this.resolveEntityId(entityIdDescriptor, input);

			if (entityId == null) {
				this.log("Failed to resolve entity ID, skipping tracking");
				return mutationId;
			}

			// Track pending mutation
			this.pendingMutations.set(mutationId, {
				id: mutationId,
				entityType: config.entity,
				entityId,
				startTime: Date.now(),
			});

			this.log(`Applied optimistic update: ${mutationId}`, config.entity, entityId);

			// Notify subscribers
			this.notifyEntityChange(config.entity, entityId);

			// Set auto-timeout
			setTimeout(() => {
				if (this.pendingMutations.has(mutationId)) {
					this.log(`Mutation timeout: ${mutationId}, auto-confirming`);
					this.onSuccess(mutationId);
				}
			}, this.config.autoConfirmTimeout);

			return mutationId;
		} catch (error) {
			this.log("Failed to apply optimistic update:", error);
			return null;
		}
	}

	/**
	 * Hook: On mutation success (auto-confirm)
	 *
	 * @param mutationId - Mutation ID from beforeMutation
	 */
	onSuccess(mutationId: string | null): void {
		if (!mutationId) return;

		const pending = this.pendingMutations.get(mutationId);
		if (!pending) {
			this.log(`Mutation not found: ${mutationId}`);
			return;
		}

		// Confirm optimistic update (merge into base)
		this.executor.confirm(mutationId, pending.entityType, pending.entityId);

		// Remove from pending
		this.pendingMutations.delete(mutationId);

		const duration = Date.now() - pending.startTime;
		this.log(
			`Confirmed optimistic update: ${mutationId} (${duration}ms)`,
			pending.entityType,
			pending.entityId,
		);

		// Notify subscribers
		this.notifyEntityChange(pending.entityType, pending.entityId);
	}

	/**
	 * Hook: On mutation error (auto-rollback)
	 *
	 * @param mutationId - Mutation ID from beforeMutation
	 */
	onError(mutationId: string | null): void {
		if (!mutationId) return;

		const pending = this.pendingMutations.get(mutationId);
		if (!pending) {
			this.log(`Mutation not found: ${mutationId}`);
			return;
		}

		// Rollback optimistic update
		this.executor.rollback(mutationId, pending.entityType, pending.entityId);

		// Remove from pending
		this.pendingMutations.delete(mutationId);

		const duration = Date.now() - pending.startTime;
		this.log(
			`Rolled back optimistic update: ${mutationId} (${duration}ms)`,
			pending.entityType,
			pending.entityId,
		);

		// Notify subscribers
		this.notifyEntityChange(pending.entityType, pending.entityId);
	}

	/**
	 * Subscribe to entity changes
	 *
	 * Returns observable that emits whenever entity is updated (optimistic or confirmed).
	 *
	 * @param entityType - Entity type (e.g., 'Session')
	 * @param entityId - Entity ID
	 * @returns Observable of entity data
	 */
	subscribe<T = any>(entityType: string, entityId: string | number): Observable<T | undefined> {
		const key = this.getEntityKey(entityType, entityId);

		// Get or create subject for this entity
		if (!this.entitySubjects.has(key)) {
			const currentData = this.cache.get(entityType, entityId);
			const subject = new BehaviorSubject<any>(currentData);
			this.entitySubjects.set(key, subject);
		}

		return this.entitySubjects.get(key)!.asObservable() as Observable<T | undefined>;
	}

	/**
	 * Get entity data (merged with optimistic layers)
	 *
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 * @returns Entity data, or undefined if not found
	 */
	get<T = any>(entityType: string, entityId: string | number): T | undefined {
		return this.cache.get(entityType, entityId) as T | undefined;
	}

	/**
	 * Set base entity data (from server)
	 *
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 * @param data - Entity data
	 */
	setBase(entityType: string, entityId: string | number, data: Record<string, any>): void {
		this.cache.setBase(entityType, entityId, data);
		this.notifyEntityChange(entityType, entityId);
	}

	/**
	 * Merge base entity data (from server)
	 *
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 * @param data - Partial data to merge
	 */
	mergeBase(entityType: string, entityId: string | number, data: Record<string, any>): void {
		this.cache.mergeBase(entityType, entityId, data);
		this.notifyEntityChange(entityType, entityId);
	}

	/**
	 * Check if entity has pending optimistic updates
	 *
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 * @returns True if entity has pending updates
	 */
	hasOptimistic(entityType: string, entityId: string | number): boolean {
		return this.cache.hasOptimistic(entityType, entityId);
	}

	/**
	 * Get all pending mutations
	 *
	 * @returns Array of pending mutation info
	 */
	getPendingMutations(): PendingMutation[] {
		return Array.from(this.pendingMutations.values());
	}

	/**
	 * Clear all optimistic updates for an entity
	 *
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 */
	clearOptimistic(entityType: string, entityId: string | number): void {
		this.cache.clearOptimistic(entityType, entityId);
		this.notifyEntityChange(entityType, entityId);
	}

	/**
	 * Clear all cache
	 */
	clearAll(): void {
		this.cache.clear();
		this.pendingMutations.clear();
		// Notify all subscribers with undefined
		for (const subject of this.entitySubjects.values()) {
			subject.next(undefined);
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats() {
		return {
			...this.cache.getStats(),
			pendingMutations: this.pendingMutations.size,
			subscribedEntities: this.entitySubjects.size,
		};
	}

	/**
	 * Notify subscribers of entity change
	 */
	private notifyEntityChange(entityType: string, entityId: string | number): void {
		const key = this.getEntityKey(entityType, entityId);
		const subject = this.entitySubjects.get(key);

		if (subject) {
			const currentData = this.cache.get(entityType, entityId);
			subject.next(currentData);
		}
	}

	/**
	 * Resolve entity ID from descriptor
	 */
	private resolveEntityId(descriptor: any, input: any): string | number | null {
		if (descriptor.type !== "field") {
			return null;
		}

		let value = input;
		for (const key of descriptor.path) {
			if (value == null) return null;
			value = value[key];
		}

		return value;
	}

	/**
	 * Get direct access to cache (for advanced use)
	 */
	getCache(): NormalizedCache {
		return this.cache;
	}

	/**
	 * Get direct access to executor (for advanced use)
	 */
	getExecutor(): OptimisticExecutor {
		return this.executor;
	}
}
