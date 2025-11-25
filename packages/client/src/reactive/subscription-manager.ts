/**
 * @sylphx/lens-client - SubscriptionManager
 *
 * Manages field-level subscriptions and server communication.
 * Tracks which fields are subscribed and handles ref counting.
 */

import type { EntityKey, Update } from "@sylphx/lens-core";
import { makeEntityKey, parseEntityKey } from "@sylphx/lens-core";
import { EntitySignal } from "./entity-signal";

// Re-export for convenience
export type { EntityKey };

/** Field subscription state */
export interface FieldSubscription {
	/** Reference count (how many are subscribed to this field) */
	refCount: number;
	/** Last known value */
	value: unknown;
}

/** Entity subscription state */
export interface EntitySubscription<T extends Record<string, unknown> = Record<string, unknown>> {
	/** Entity name */
	entityName: string;
	/** Entity ID */
	entityId: string;
	/** Field subscriptions */
	fields: Map<string, FieldSubscription>;
	/** Number of subscribers to the full entity (all fields) */
	fullEntityRefs: number;
	/** The EntitySignal instance */
	signal: EntitySignal<T>;
}

/** Subscribe message to server */
export interface SubscribeMessage {
	type: "subscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Unsubscribe message to server */
export interface UnsubscribeMessage {
	type: "unsubscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Update message from server */
export interface UpdateMessage {
	type: "update";
	entity: string;
	id: string;
	field: string;
	update: Update;
}

/** Server message types */
export type ServerMessage = SubscribeMessage | UnsubscribeMessage;

/** Transport interface for sending messages */
export interface SubscriptionTransport {
	/** Send message to server */
	send(message: ServerMessage): void;
	/** Set handler for incoming updates */
	onUpdate(handler: (message: UpdateMessage) => void): void;
}

// =============================================================================
// SubscriptionManager
// =============================================================================

/**
 * Manages field-level subscriptions for all entities.
 *
 * Key responsibilities:
 * - Track which fields are subscribed (ref counting)
 * - Communicate with server about subscription changes
 * - Apply server updates to EntitySignals
 * - Support query deduplication
 */
export class SubscriptionManager {
	/** All entity subscriptions */
	private subscriptions = new Map<EntityKey, EntitySubscription>();

	/** Transport for server communication */
	private transport: SubscriptionTransport | null = null;

	/** Pending field changes to batch */
	private pendingSubscribe = new Map<EntityKey, Set<string>>();
	private pendingUnsubscribe = new Map<EntityKey, Set<string>>();

	/** Batch timer */
	private batchTimer: ReturnType<typeof setTimeout> | null = null;

	/** Batch delay in ms */
	private readonly batchDelay = 10;

	// ===========================================================================
	// Setup
	// ===========================================================================

	/**
	 * Set the transport for server communication
	 */
	setTransport(transport: SubscriptionTransport): void {
		this.transport = transport;

		// Handle incoming updates
		transport.onUpdate((message) => {
			this.handleServerUpdate(message);
		});
	}

	// ===========================================================================
	// Subscription Management
	// ===========================================================================

	/**
	 * Get or create subscription for an entity
	 */
	getOrCreateSubscription<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
		initialData: T,
	): EntitySubscription<T> {
		const key = this.makeKey(entityName, entityId);

		if (!this.subscriptions.has(key)) {
			const entitySignal = new EntitySignal(initialData, {
				onFieldAccess: (field) => {
					// When a field is accessed, ensure it's subscribed
					this.subscribeField(entityName, entityId, field);
				},
				onDispose: () => {
					// Cleanup when signal is disposed
					this.unsubscribeAll(entityName, entityId);
				},
			});

			const subscription: EntitySubscription<T> = {
				entityName,
				entityId,
				fields: new Map(),
				fullEntityRefs: 0,
				signal: entitySignal,
			};

			// Initialize field subscriptions
			for (const field of Object.keys(initialData)) {
				subscription.fields.set(field, {
					refCount: 0,
					value: initialData[field],
				});
			}

			this.subscriptions.set(key, subscription as EntitySubscription);
		}

		return this.subscriptions.get(key) as EntitySubscription<T>;
	}

	/**
	 * Subscribe to a specific field
	 */
	subscribeField(entityName: string, entityId: string, field: string): void {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		let fieldSub = sub.fields.get(field);
		if (!fieldSub) {
			fieldSub = { refCount: 0, value: undefined };
			sub.fields.set(field, fieldSub);
		}

		const wasZero = fieldSub.refCount === 0;
		fieldSub.refCount++;

		// If this is a new subscription, notify server
		if (wasZero) {
			this.queueSubscribe(key, field);
		}
	}

	/**
	 * Subscribe to all fields (full entity)
	 */
	subscribeFullEntity(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		const wasZero = sub.fullEntityRefs === 0;
		sub.fullEntityRefs++;

		// Subscribe to all fields
		for (const field of sub.fields.keys()) {
			this.subscribeField(entityName, entityId, field);
		}

		// If this is the first full subscription, tell server we want all fields
		if (wasZero && this.transport) {
			this.transport.send({
				type: "subscribe",
				entity: entityName,
				id: entityId,
				fields: "*",
			});
		}
	}

	/**
	 * Unsubscribe from a specific field
	 */
	unsubscribeField(entityName: string, entityId: string, field: string): void {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		const fieldSub = sub.fields.get(field);
		if (!fieldSub || fieldSub.refCount === 0) return;

		fieldSub.refCount--;

		// If no more subscribers, notify server
		if (fieldSub.refCount === 0) {
			this.queueUnsubscribe(key, field);
		}
	}

	/**
	 * Unsubscribe from full entity
	 */
	unsubscribeFullEntity(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub || sub.fullEntityRefs === 0) return;

		sub.fullEntityRefs--;

		// Unsubscribe from all fields
		for (const field of sub.fields.keys()) {
			this.unsubscribeField(entityName, entityId, field);
		}
	}

	/**
	 * Unsubscribe from all fields for an entity
	 */
	unsubscribeAll(entityName: string, entityId: string): void {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		// Notify server
		if (this.transport) {
			this.transport.send({
				type: "unsubscribe",
				entity: entityName,
				id: entityId,
				fields: "*",
			});
		}

		// Remove subscription
		this.subscriptions.delete(key);
	}

	// ===========================================================================
	// Query Resolution
	// ===========================================================================

	/**
	 * Check if we can derive a query from existing subscriptions
	 */
	canDerive(entityName: string, entityId: string, fields: string[]): boolean {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return false;

		// If we have a full entity subscription, we can derive any fields
		if (sub.fullEntityRefs > 0) return true;

		// Check if all requested fields are subscribed
		return fields.every((f) => {
			const fieldSub = sub.fields.get(f);
			return fieldSub && fieldSub.refCount > 0;
		});
	}

	/**
	 * Get the EntitySignal for an entity if it exists
	 */
	getSignal<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
	): EntitySignal<T> | null {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		return (sub?.signal as EntitySignal<T>) ?? null;
	}

	/**
	 * Get subscribed fields for an entity
	 */
	getSubscribedFields(entityName: string, entityId: string): string[] {
		const key = this.makeKey(entityName, entityId);
		const sub = this.subscriptions.get(key);
		if (!sub) return [];

		return Array.from(sub.fields.entries())
			.filter(([_, f]) => f.refCount > 0)
			.map(([name]) => name);
	}

	// ===========================================================================
	// Server Update Handling
	// ===========================================================================

	/**
	 * Handle update from server
	 */
	handleServerUpdate(message: UpdateMessage): void {
		const key = this.makeKey(message.entity, message.id);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		// Apply update to field signal
		sub.signal.updateField(message.field, message.update);

		// Update cached value
		const fieldSub = sub.fields.get(message.field);
		if (fieldSub) {
			fieldSub.value = sub.signal.$[message.field as keyof typeof sub.signal.$]?.value;
		}
	}

	// ===========================================================================
	// Batching
	// ===========================================================================

	/**
	 * Queue a field subscription (batched)
	 */
	private queueSubscribe(key: EntityKey, field: string): void {
		if (!this.pendingSubscribe.has(key)) {
			this.pendingSubscribe.set(key, new Set());
		}
		this.pendingSubscribe.get(key)!.add(field);

		// Remove from unsubscribe if queued
		this.pendingUnsubscribe.get(key)?.delete(field);

		this.scheduleBatch();
	}

	/**
	 * Queue a field unsubscription (batched)
	 */
	private queueUnsubscribe(key: EntityKey, field: string): void {
		if (!this.pendingUnsubscribe.has(key)) {
			this.pendingUnsubscribe.set(key, new Set());
		}
		this.pendingUnsubscribe.get(key)!.add(field);

		// Remove from subscribe if queued
		this.pendingSubscribe.get(key)?.delete(field);

		this.scheduleBatch();
	}

	/**
	 * Schedule batch processing
	 */
	private scheduleBatch(): void {
		if (this.batchTimer) return;

		this.batchTimer = setTimeout(() => {
			this.processBatch();
			this.batchTimer = null;
		}, this.batchDelay);
	}

	/**
	 * Process batched subscription changes
	 */
	private processBatch(): void {
		if (!this.transport) return;

		// Process subscribes
		for (const [key, fields] of this.pendingSubscribe) {
			if (fields.size === 0) continue;

			const [entityName, entityId] = this.parseKey(key);
			this.transport.send({
				type: "subscribe",
				entity: entityName,
				id: entityId,
				fields: Array.from(fields),
			});
		}
		this.pendingSubscribe.clear();

		// Process unsubscribes
		for (const [key, fields] of this.pendingUnsubscribe) {
			if (fields.size === 0) continue;

			const [entityName, entityId] = this.parseKey(key);
			this.transport.send({
				type: "unsubscribe",
				entity: entityName,
				id: entityId,
				fields: Array.from(fields),
			});
		}
		this.pendingUnsubscribe.clear();
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	private makeKey(entityName: string, entityId: string): EntityKey {
		return makeEntityKey(entityName, entityId);
	}

	private parseKey(key: EntityKey): [string, string] {
		return parseEntityKey(key);
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		entities: number;
		totalFieldSubscriptions: number;
	} {
		let totalFieldSubscriptions = 0;
		for (const sub of this.subscriptions.values()) {
			for (const field of sub.fields.values()) {
				totalFieldSubscriptions += field.refCount;
			}
		}

		return {
			entities: this.subscriptions.size,
			totalFieldSubscriptions,
		};
	}

	/**
	 * Clear all subscriptions
	 */
	clear(): void {
		// Unsubscribe from all
		for (const sub of this.subscriptions.values()) {
			if (this.transport) {
				this.transport.send({
					type: "unsubscribe",
					entity: sub.entityName,
					id: sub.entityId,
					fields: "*",
				});
			}
		}

		this.subscriptions.clear();
		this.pendingSubscribe.clear();
		this.pendingUnsubscribe.clear();

		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
	}

	/**
	 * Destroy the subscription manager (alias for clear)
	 */
	destroy(): void {
		this.clear();
		this.transport = null;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new SubscriptionManager
 */
export function createSubscriptionManager(): SubscriptionManager {
	return new SubscriptionManager();
}
