/**
 * @sylphx/lens-core - Subscription Registry
 *
 * Client-side tracking of all active subscriptions with version information.
 * Enables efficient reconnection by remembering what the client was subscribed to.
 */

import { hashEntityState } from "./hash.js";
import type {
	ReconnectSubscription,
	SubscriptionObserver,
	SubscriptionRegistryStats,
	SubscriptionState,
	TrackedSubscription,
	Version,
} from "./types.js";

// =============================================================================
// Subscription Registry
// =============================================================================

/**
 * Registry for tracking all active subscriptions on the client.
 *
 * Responsibilities:
 * - Track subscription metadata (entity, id, fields, input)
 * - Track last received version and data
 * - Provide subscription list for reconnect
 * - Manage subscription lifecycle states
 *
 * @example
 * ```typescript
 * const registry = new SubscriptionRegistry();
 *
 * // When subscribing
 * registry.add({
 *   id: "sub_123",
 *   entity: "user",
 *   entityId: "456",
 *   fields: ["name", "email"],
 *   version: 0,
 *   lastData: null,
 *   observer: { next: (data) => console.log(data) },
 *   input: { id: "456" },
 * });
 *
 * // When receiving update
 * registry.updateVersion("sub_123", 5, { name: "Alice", email: "alice@example.com" });
 *
 * // On reconnect
 * const subs = registry.getAllForReconnect();
 * // [{ id: "sub_123", entity: "user", entityId: "456", version: 5, ... }]
 * ```
 */
export class SubscriptionRegistry {
	private subscriptions = new Map<string, TrackedSubscription>();

	// Index by entity key for efficient lookup
	private entityIndex = new Map<string, Set<string>>(); // entityKey → subscription IDs

	// ===========================================================================
	// Subscription Management
	// ===========================================================================

	/**
	 * Register new subscription.
	 */
	add(
		sub: Omit<TrackedSubscription, "state" | "lastDataHash" | "createdAt" | "lastUpdateAt">
	): void {
		const tracked: TrackedSubscription = {
			...sub,
			state: "pending",
			lastDataHash: sub.lastData ? hashEntityState(sub.lastData) : null,
			createdAt: Date.now(),
			lastUpdateAt: null,
		};

		this.subscriptions.set(sub.id, tracked);

		// Update entity index
		const entityKey = `${sub.entity}:${sub.entityId}`;
		let ids = this.entityIndex.get(entityKey);
		if (!ids) {
			ids = new Set();
			this.entityIndex.set(entityKey, ids);
		}
		ids.add(sub.id);
	}

	/**
	 * Get subscription by ID.
	 */
	get(id: string): TrackedSubscription | undefined {
		return this.subscriptions.get(id);
	}

	/**
	 * Check if subscription exists.
	 */
	has(id: string): boolean {
		return this.subscriptions.has(id);
	}

	/**
	 * Remove subscription.
	 */
	remove(id: string): void {
		const sub = this.subscriptions.get(id);
		if (!sub) return;

		this.subscriptions.delete(id);

		// Update entity index
		const entityKey = `${sub.entity}:${sub.entityId}`;
		const ids = this.entityIndex.get(entityKey);
		if (ids) {
			ids.delete(id);
			if (ids.size === 0) {
				this.entityIndex.delete(entityKey);
			}
		}
	}

	/**
	 * Get all subscriptions for an entity.
	 */
	getByEntity(entity: string, entityId: string): TrackedSubscription[] {
		const entityKey = `${entity}:${entityId}`;
		const ids = this.entityIndex.get(entityKey);
		if (!ids) return [];

		const result: TrackedSubscription[] = [];
		for (const id of ids) {
			const sub = this.subscriptions.get(id);
			if (sub) {
				result.push(sub);
			}
		}
		return result;
	}

	// ===========================================================================
	// Version & Data Updates
	// ===========================================================================

	/**
	 * Update version after receiving update from server.
	 */
	updateVersion(
		id: string,
		version: Version,
		data?: Record<string, unknown>
	): void {
		const sub = this.subscriptions.get(id);
		if (!sub) return;

		sub.version = version;
		sub.lastUpdateAt = Date.now();

		if (data !== undefined) {
			sub.lastData = data;
			sub.lastDataHash = hashEntityState(data);
		}

		// Mark as active if was pending or reconnecting
		if (sub.state === "pending" || sub.state === "reconnecting") {
			sub.state = "active";
		}
	}

	/**
	 * Update last known data (for optimistic updates).
	 */
	updateData(id: string, data: Record<string, unknown>): void {
		const sub = this.subscriptions.get(id);
		if (!sub) return;

		sub.lastData = data;
		sub.lastDataHash = hashEntityState(data);
	}

	/**
	 * Get last known data for subscription.
	 */
	getLastData(id: string): Record<string, unknown> | null {
		return this.subscriptions.get(id)?.lastData ?? null;
	}

	/**
	 * Get current version for subscription.
	 */
	getVersion(id: string): Version | null {
		return this.subscriptions.get(id)?.version ?? null;
	}

	// ===========================================================================
	// State Management
	// ===========================================================================

	/**
	 * Mark subscription as active.
	 */
	markActive(id: string): void {
		const sub = this.subscriptions.get(id);
		if (sub) {
			sub.state = "active";
		}
	}

	/**
	 * Mark subscription as error.
	 */
	markError(id: string): void {
		const sub = this.subscriptions.get(id);
		if (sub) {
			sub.state = "error";
		}
	}

	/**
	 * Mark all active subscriptions as reconnecting.
	 * Called when connection is lost.
	 */
	markAllReconnecting(): void {
		for (const sub of this.subscriptions.values()) {
			if (sub.state === "active") {
				sub.state = "reconnecting";
			}
		}
	}

	/**
	 * Get subscriptions by state.
	 */
	getByState(state: SubscriptionState): TrackedSubscription[] {
		const result: TrackedSubscription[] = [];
		for (const sub of this.subscriptions.values()) {
			if (sub.state === state) {
				result.push(sub);
			}
		}
		return result;
	}

	// ===========================================================================
	// Reconnection Support
	// ===========================================================================

	/**
	 * Get all subscriptions formatted for reconnect message.
	 * Only includes subscriptions that have received at least one update.
	 */
	getAllForReconnect(): ReconnectSubscription[] {
		const result: ReconnectSubscription[] = [];

		for (const sub of this.subscriptions.values()) {
			// Only reconnect subscriptions that were active
			// (have received at least one update or were previously active)
			if (sub.state === "reconnecting" || sub.state === "active") {
				result.push({
					id: sub.id,
					entity: sub.entity,
					entityId: sub.entityId,
					fields: sub.fields,
					version: sub.version,
					dataHash: sub.lastDataHash ?? undefined,
					input: sub.input,
				});
			}
		}

		return result;
	}

	/**
	 * Process reconnect result for single subscription.
	 */
	processReconnectResult(
		id: string,
		version: Version,
		data?: Record<string, unknown>
	): void {
		const sub = this.subscriptions.get(id);
		if (!sub) return;

		sub.version = version;
		sub.state = "active";
		sub.lastUpdateAt = Date.now();

		if (data !== undefined) {
			sub.lastData = data;
			sub.lastDataHash = hashEntityState(data);
		}
	}

	// ===========================================================================
	// Observer Management
	// ===========================================================================

	/**
	 * Get observer for subscription.
	 */
	getObserver(id: string): SubscriptionObserver | undefined {
		return this.subscriptions.get(id)?.observer;
	}

	/**
	 * Update observer for subscription.
	 */
	updateObserver(id: string, observer: SubscriptionObserver): void {
		const sub = this.subscriptions.get(id);
		if (sub) {
			sub.observer = observer;
		}
	}

	/**
	 * Notify observer with data.
	 */
	notifyNext<T>(id: string, data: T): void {
		const sub = this.subscriptions.get(id);
		sub?.observer.next?.({ data, version: sub.version });
	}

	/**
	 * Notify observer with error.
	 */
	notifyError(id: string, error: Error): void {
		this.subscriptions.get(id)?.observer.error?.(error);
	}

	/**
	 * Notify all reconnecting subscriptions with error.
	 */
	notifyAllReconnectingError(error: Error): void {
		for (const sub of this.subscriptions.values()) {
			if (sub.state === "reconnecting") {
				sub.observer.error?.(error);
			}
		}
	}

	// ===========================================================================
	// Statistics & Utilities
	// ===========================================================================

	/**
	 * Get total subscription count.
	 */
	get size(): number {
		return this.subscriptions.size;
	}

	/**
	 * Get all subscription IDs.
	 */
	getIds(): string[] {
		return Array.from(this.subscriptions.keys());
	}

	/**
	 * Get all subscriptions (iterator).
	 */
	values(): IterableIterator<TrackedSubscription> {
		return this.subscriptions.values();
	}

	/**
	 * Get statistics about the registry.
	 */
	getStats(): SubscriptionRegistryStats {
		const byState: Record<SubscriptionState, number> = {
			pending: 0,
			active: 0,
			reconnecting: 0,
			error: 0,
		};
		const byEntity: Record<string, number> = {};

		for (const sub of this.subscriptions.values()) {
			byState[sub.state]++;

			const entityKey = `${sub.entity}:${sub.entityId}`;
			byEntity[entityKey] = (byEntity[entityKey] ?? 0) + 1;
		}

		return {
			total: this.subscriptions.size,
			byState,
			byEntity,
		};
	}

	/**
	 * Clear all subscriptions.
	 */
	clear(): void {
		// Notify all observers that subscription is complete
		for (const sub of this.subscriptions.values()) {
			sub.observer.complete?.();
		}

		this.subscriptions.clear();
		this.entityIndex.clear();
	}

	/**
	 * Clear subscriptions in error state.
	 */
	clearErrors(): void {
		const toRemove: string[] = [];
		for (const [id, sub] of this.subscriptions) {
			if (sub.state === "error") {
				toRemove.push(id);
			}
		}
		for (const id of toRemove) {
			this.remove(id);
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create new subscription registry.
 */
export function createSubscriptionRegistry(): SubscriptionRegistry {
	return new SubscriptionRegistry();
}
