/**
 * @lens/server - Graph State Manager
 *
 * Core orchestration layer that:
 * - Maintains canonical state per entity (server truth)
 * - Tracks per-client last known state
 * - Computes minimal diffs when state changes
 * - Auto-selects transfer strategy (value/delta/patch)
 * - Pushes updates to subscribed clients
 */

import { createUpdate, type Update, type EntityKey, makeEntityKey } from "@lens/core";

// Re-export for convenience
export type { EntityKey };

/** Client connection interface */
export interface StateClient {
	id: string;
	send: (message: StateUpdateMessage) => void;
}

/** Update message sent to clients */
export interface StateUpdateMessage {
	type: "update";
	entity: string;
	id: string;
	/** Field-level updates with strategy */
	updates: Record<string, Update>;
}

/** Full entity update message */
export interface StateFullMessage {
	type: "data";
	entity: string;
	id: string;
	data: Record<string, unknown>;
}

/** Subscription info */
export interface Subscription {
	clientId: string;
	fields: Set<string> | "*";
}

/** Per-client state for an entity */
interface ClientEntityState {
	/** Last state sent to this client */
	lastState: Record<string, unknown>;
	/** Fields this client is subscribed to */
	fields: Set<string> | "*";
}

/** Configuration */
export interface GraphStateManagerConfig {
	/** Called when an entity has no more subscribers */
	onEntityUnsubscribed?: (entity: string, id: string) => void;
}

// =============================================================================
// GraphStateManager
// =============================================================================

/**
 * Manages server-side canonical state and syncs to clients.
 *
 * @example
 * ```typescript
 * const manager = new GraphStateManager();
 *
 * // Add client
 * manager.addClient({
 *   id: "client-1",
 *   send: (msg) => ws.send(JSON.stringify(msg)),
 * });
 *
 * // Subscribe client to entity
 * manager.subscribe("client-1", "Post", "123", ["title", "content"]);
 *
 * // Emit updates (from resolvers)
 * manager.emit("Post", "123", { content: "Updated content" });
 * // → Automatically computes diff and sends to subscribed clients
 * ```
 */
export class GraphStateManager {
	/** Connected clients */
	private clients = new Map<string, StateClient>();

	/** Canonical state per entity (server truth) */
	private canonical = new Map<EntityKey, Record<string, unknown>>();

	/** Per-client state tracking */
	private clientStates = new Map<string, Map<EntityKey, ClientEntityState>>();

	/** Entity → subscribed client IDs */
	private entitySubscribers = new Map<EntityKey, Set<string>>();

	/** Configuration */
	private config: GraphStateManagerConfig;

	constructor(config: GraphStateManagerConfig = {}) {
		this.config = config;
	}

	// ===========================================================================
	// Client Management
	// ===========================================================================

	/**
	 * Add a client connection
	 */
	addClient(client: StateClient): void {
		this.clients.set(client.id, client);
		this.clientStates.set(client.id, new Map());
	}

	/**
	 * Remove a client and cleanup all subscriptions
	 */
	removeClient(clientId: string): void {
		// Remove from all entity subscribers
		for (const [key, subscribers] of this.entitySubscribers) {
			subscribers.delete(clientId);
			if (subscribers.size === 0) {
				this.cleanupEntity(key);
			}
		}

		this.clients.delete(clientId);
		this.clientStates.delete(clientId);
	}

	// ===========================================================================
	// Subscription Management
	// ===========================================================================

	/**
	 * Subscribe a client to an entity
	 */
	subscribe(
		clientId: string,
		entity: string,
		id: string,
		fields: string[] | "*" = "*",
	): void {
		const key = this.makeKey(entity, id);

		// Add to entity subscribers
		let subscribers = this.entitySubscribers.get(key);
		if (!subscribers) {
			subscribers = new Set();
			this.entitySubscribers.set(key, subscribers);
		}
		subscribers.add(clientId);

		// Initialize client state for this entity
		const clientStateMap = this.clientStates.get(clientId);
		if (clientStateMap) {
			const fieldSet = fields === "*" ? "*" : new Set(fields);
			clientStateMap.set(key, {
				lastState: {},
				fields: fieldSet,
			});
		}

		// If we have canonical state, send initial data
		const canonicalState = this.canonical.get(key);
		if (canonicalState) {
			this.sendInitialData(clientId, entity, id, canonicalState, fields);
		}
	}

	/**
	 * Unsubscribe a client from an entity
	 */
	unsubscribe(clientId: string, entity: string, id: string): void {
		const key = this.makeKey(entity, id);

		// Remove from entity subscribers
		const subscribers = this.entitySubscribers.get(key);
		if (subscribers) {
			subscribers.delete(clientId);
			if (subscribers.size === 0) {
				this.cleanupEntity(key);
			}
		}

		// Remove client state
		const clientStateMap = this.clientStates.get(clientId);
		if (clientStateMap) {
			clientStateMap.delete(key);
		}
	}

	/**
	 * Update subscription fields for a client
	 */
	updateSubscription(
		clientId: string,
		entity: string,
		id: string,
		fields: string[] | "*",
	): void {
		const key = this.makeKey(entity, id);
		const clientStateMap = this.clientStates.get(clientId);

		if (clientStateMap) {
			const state = clientStateMap.get(key);
			if (state) {
				state.fields = fields === "*" ? "*" : new Set(fields);
			}
		}
	}

	// ===========================================================================
	// State Emission (Core)
	// ===========================================================================

	/**
	 * Emit data for an entity.
	 * This is the core method called by resolvers.
	 *
	 * @param entity - Entity name
	 * @param id - Entity ID
	 * @param data - Full or partial entity data
	 * @param options - Emit options
	 */
	emit(
		entity: string,
		id: string,
		data: Record<string, unknown>,
		options: { replace?: boolean } = {},
	): void {
		const key = this.makeKey(entity, id);

		// Get or create canonical state
		let currentCanonical = this.canonical.get(key);

		if (options.replace || !currentCanonical) {
			// Replace mode or first emit
			currentCanonical = { ...data };
		} else {
			// Merge mode (default)
			currentCanonical = { ...currentCanonical, ...data };
		}

		this.canonical.set(key, currentCanonical);

		// Push updates to all subscribed clients
		const subscribers = this.entitySubscribers.get(key);
		if (!subscribers) return;

		for (const clientId of subscribers) {
			this.pushToClient(clientId, entity, id, key, currentCanonical);
		}
	}

	/**
	 * Get current canonical state for an entity
	 */
	getState(entity: string, id: string): Record<string, unknown> | undefined {
		return this.canonical.get(this.makeKey(entity, id));
	}

	/**
	 * Check if entity has any subscribers
	 */
	hasSubscribers(entity: string, id: string): boolean {
		const subscribers = this.entitySubscribers.get(this.makeKey(entity, id));
		return subscribers !== undefined && subscribers.size > 0;
	}

	// ===========================================================================
	// Internal Methods
	// ===========================================================================

	/**
	 * Push update to a specific client
	 */
	private pushToClient(
		clientId: string,
		entity: string,
		id: string,
		key: EntityKey,
		newState: Record<string, unknown>,
	): void {
		const client = this.clients.get(clientId);
		if (!client) return;

		const clientStateMap = this.clientStates.get(clientId);
		if (!clientStateMap) return;

		const clientEntityState = clientStateMap.get(key);
		if (!clientEntityState) return;

		const { lastState, fields } = clientEntityState;

		// Determine which fields to send
		const fieldsToCheck =
			fields === "*" ? Object.keys(newState) : Array.from(fields);

		// Compute updates for changed fields
		const updates: Record<string, Update> = {};
		let hasChanges = false;

		for (const field of fieldsToCheck) {
			const oldValue = lastState[field];
			const newValue = newState[field];

			// Skip if unchanged
			if (oldValue === newValue) continue;
			if (
				typeof oldValue === "object" &&
				typeof newValue === "object" &&
				JSON.stringify(oldValue) === JSON.stringify(newValue)
			) {
				continue;
			}

			// Compute optimal update
			const update = createUpdate(oldValue, newValue);
			updates[field] = update;
			hasChanges = true;
		}

		if (!hasChanges) return;

		// Send update
		client.send({
			type: "update",
			entity,
			id,
			updates,
		});

		// Update client's last known state
		for (const field of fieldsToCheck) {
			if (newState[field] !== undefined) {
				clientEntityState.lastState[field] = newState[field];
			}
		}
	}

	/**
	 * Send initial data to a newly subscribed client
	 */
	private sendInitialData(
		clientId: string,
		entity: string,
		id: string,
		state: Record<string, unknown>,
		fields: string[] | "*",
	): void {
		const client = this.clients.get(clientId);
		if (!client) return;

		const key = this.makeKey(entity, id);
		const clientStateMap = this.clientStates.get(clientId);
		if (!clientStateMap) return;

		// Filter to requested fields
		const fieldsToSend = fields === "*" ? Object.keys(state) : fields;
		const dataToSend: Record<string, unknown> = {};
		const updates: Record<string, Update> = {};

		for (const field of fieldsToSend) {
			if (state[field] !== undefined) {
				dataToSend[field] = state[field];
				updates[field] = { strategy: "value", data: state[field] };
			}
		}

		// Send as update message with value strategy
		client.send({
			type: "update",
			entity,
			id,
			updates,
		});

		// Update client's last known state
		const clientEntityState = clientStateMap.get(key);
		if (clientEntityState) {
			clientEntityState.lastState = { ...dataToSend };
		}
	}

	/**
	 * Cleanup entity when no subscribers remain
	 */
	private cleanupEntity(key: EntityKey): void {
		const [entity, id] = key.split(":") as [string, string];

		// Optionally notify
		if (this.config.onEntityUnsubscribed) {
			this.config.onEntityUnsubscribed(entity, id);
		}

		// Remove canonical state (optional - could keep for cache)
		// this.canonical.delete(key);

		// Remove from subscribers map
		this.entitySubscribers.delete(key);
	}

	private makeKey(entity: string, id: string): EntityKey {
		return makeEntityKey(entity, id);
	}

	// ===========================================================================
	// Stats & Debug
	// ===========================================================================

	/**
	 * Get statistics
	 */
	getStats(): {
		clients: number;
		entities: number;
		totalSubscriptions: number;
	} {
		let totalSubscriptions = 0;
		for (const subscribers of this.entitySubscribers.values()) {
			totalSubscriptions += subscribers.size;
		}

		return {
			clients: this.clients.size,
			entities: this.canonical.size,
			totalSubscriptions,
		};
	}

	/**
	 * Clear all state (for testing)
	 */
	clear(): void {
		this.clients.clear();
		this.canonical.clear();
		this.clientStates.clear();
		this.entitySubscribers.clear();
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a GraphStateManager instance
 */
export function createGraphStateManager(
	config?: GraphStateManagerConfig,
): GraphStateManager {
	return new GraphStateManager(config);
}
