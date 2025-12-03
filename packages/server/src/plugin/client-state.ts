/**
 * @sylphx/lens-server - Client State Plugin
 *
 * Server-side plugin that enables per-client state tracking.
 * By default, the server operates in stateless mode.
 * Adding this plugin enables:
 * - Per-client state tracking (what each client has seen)
 * - Subscription management
 * - Efficient diff computation (only send changes)
 * - Reconnection support with state recovery
 *
 * This plugin is ideal for:
 * - Long-running WebSocket connections
 * - Bandwidth-sensitive applications
 * - Real-time collaborative features
 *
 * For serverless/stateless deployments, skip this plugin.
 */

import { createUpdate, type Update } from "@sylphx/lens-core";
import { GraphStateManager, type GraphStateManagerConfig } from "../state/graph-state-manager.js";
import type {
	AfterSendContext,
	BeforeSendContext,
	BroadcastContext,
	ConnectContext,
	DisconnectContext,
	ReconnectContext,
	ReconnectHookResult,
	ServerPlugin,
	SubscribeContext,
	UnsubscribeContext,
	UpdateFieldsContext,
} from "./types.js";

/**
 * Client state plugin configuration.
 */
export interface ClientStateOptions extends GraphStateManagerConfig {
	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Create a client state plugin.
 *
 * This plugin enables per-client state tracking:
 * - Tracks what each client has seen
 * - Manages subscriptions
 * - Computes efficient diffs (only sends changes)
 * - Handles reconnection with state recovery
 *
 * Without this plugin, the server operates in stateless mode.
 *
 * @example
 * ```typescript
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [
 *     clientState({
 *       // Optional: operation log settings for reconnection
 *       operationLog: { maxAge: 60000 },
 *     }),
 *   ],
 * });
 * ```
 */
export function clientState(options: ClientStateOptions = {}): ServerPlugin & {
	/** Get the underlying GraphStateManager instance */
	getStateManager(): GraphStateManager;
} {
	const stateManager = new GraphStateManager(options);
	const debug = options.debug ?? false;

	// Per-client state tracking: clientId → entityKey → lastState
	const clientStates = new Map<string, Map<string, Record<string, unknown>>>();

	// Track client-entity subscriptions
	const clientSubscriptions = new Map<string, Set<string>>(); // clientId -> Set<entityKey>

	// Track client-entity fields: clientId → entityKey → fields
	const clientFields = new Map<string, Map<string, string[] | "*">>();

	// Store client send functions for actual message delivery
	const clientSendFns = new Map<string, (message: unknown) => void>();

	// Track entity subscribers: entityKey → Set<{ clientId, subscriptionId }>
	const entitySubscribers = new Map<string, Set<{ clientId: string; subscriptionId: string }>>();

	// Track subscription info: clientId → subscriptionId → { entity, entityId, fields }
	const subscriptionInfo = new Map<
		string,
		Map<string, { entity: string; entityId: string; fields: string[] | "*" }>
	>();

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[clientState]", ...args);
		}
	};

	const makeEntityKey = (entity: string, entityId: string) => `${entity}:${entityId}`;

	return {
		name: "clientState",

		/**
		 * Get the underlying GraphStateManager instance.
		 * Useful for advanced use cases like manual state management.
		 */
		getStateManager(): GraphStateManager {
			return stateManager;
		},

		/**
		 * When a client connects, initialize their state tracking and store send function.
		 */
		onConnect(ctx: ConnectContext): void {
			log("Client connected:", ctx.clientId);
			clientStates.set(ctx.clientId, new Map());
			clientSubscriptions.set(ctx.clientId, new Set());
			clientFields.set(ctx.clientId, new Map());
			subscriptionInfo.set(ctx.clientId, new Map());

			// Store send function for message delivery
			if (ctx.send) {
				clientSendFns.set(ctx.clientId, ctx.send);
			}
		},

		/**
		 * When a client disconnects, clean up their state.
		 */
		onDisconnect(ctx: DisconnectContext): void {
			log("Client disconnected:", ctx.clientId, "subscriptions:", ctx.subscriptionCount);

			// Clean up entity subscribers for all this client's subscriptions
			const subs = subscriptionInfo.get(ctx.clientId);
			if (subs) {
				for (const [subId, info] of subs) {
					const entityKey = makeEntityKey(info.entity, info.entityId);
					const subscribers = entitySubscribers.get(entityKey);
					if (subscribers) {
						for (const sub of subscribers) {
							if (sub.clientId === ctx.clientId && sub.subscriptionId === subId) {
								subscribers.delete(sub);
								break;
							}
						}
						if (subscribers.size === 0) {
							entitySubscribers.delete(entityKey);
						}
					}
				}
			}

			clientStates.delete(ctx.clientId);
			clientSubscriptions.delete(ctx.clientId);
			clientFields.delete(ctx.clientId);
			clientSendFns.delete(ctx.clientId);
			subscriptionInfo.delete(ctx.clientId);
		},

		/**
		 * When a client subscribes, track the subscription.
		 */
		onSubscribe(ctx: SubscribeContext): void {
			log("Subscribe:", ctx.clientId, ctx.operation, ctx.entity, ctx.entityId);

			const subs = clientSubscriptions.get(ctx.clientId);
			const fields = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (subs && ctx.entity && ctx.entityId) {
				const entityKey = makeEntityKey(ctx.entity, ctx.entityId);
				subs.add(entityKey);
				fields?.set(entityKey, ctx.fields);

				// Track subscription info for this client
				subInfo?.set(ctx.subscriptionId, {
					entity: ctx.entity,
					entityId: ctx.entityId,
					fields: ctx.fields,
				});

				// Track entity subscribers for broadcast
				let subscribers = entitySubscribers.get(entityKey);
				if (!subscribers) {
					subscribers = new Set();
					entitySubscribers.set(entityKey, subscribers);
				}
				subscribers.add({ clientId: ctx.clientId, subscriptionId: ctx.subscriptionId });
			}
		},

		/**
		 * When a client unsubscribes, remove from tracking.
		 */
		onUnsubscribe(ctx: UnsubscribeContext): void {
			log("Unsubscribe:", ctx.clientId, ctx.subscriptionId);

			const subs = clientSubscriptions.get(ctx.clientId);
			const states = clientStates.get(ctx.clientId);
			const fields = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (subs || states || fields) {
				for (const entityKey of ctx.entityKeys) {
					subs?.delete(entityKey);
					states?.delete(entityKey);
					fields?.delete(entityKey);

					// Remove from entity subscribers
					const subscribers = entitySubscribers.get(entityKey);
					if (subscribers) {
						for (const sub of subscribers) {
							if (sub.clientId === ctx.clientId && sub.subscriptionId === ctx.subscriptionId) {
								subscribers.delete(sub);
								break;
							}
						}
						if (subscribers.size === 0) {
							entitySubscribers.delete(entityKey);
						}
					}
				}
			}

			// Remove subscription info
			subInfo?.delete(ctx.subscriptionId);
		},

		/**
		 * Before sending data, compute optimal diff if we have previous state.
		 * This is the core optimization logic.
		 *
		 * In the stateless server design, this hook also handles actual message delivery
		 * using the send function stored from onConnect.
		 */
		beforeSend(ctx: BeforeSendContext): Record<string, unknown> | void {
			const { clientId, subscriptionId, entity, entityId, data, isInitial, fields } = ctx;
			const entityKey = makeEntityKey(entity, entityId);

			log("beforeSend:", clientId, entityKey, "initial:", isInitial);

			// Get send function for this client
			const sendFn = clientSendFns.get(clientId);

			// Get or create client state map
			let clientStateMap = clientStates.get(clientId);
			if (!clientStateMap) {
				clientStateMap = new Map();
				clientStates.set(clientId, clientStateMap);
			}

			// Initial send: store state, send full data
			if (isInitial) {
				clientStateMap.set(entityKey, { ...data });
				log("  Initial send, storing state");

				// Send initial data message
				if (sendFn) {
					sendFn({
						type: "data",
						id: subscriptionId,
						entity,
						entityId,
						data,
					});
				}
				return data;
			}

			// Get client's last known state
			const lastState = clientStateMap.get(entityKey);

			// No previous state: treat as initial
			if (!lastState) {
				clientStateMap.set(entityKey, { ...data });
				log("  No previous state, storing and sending full");

				if (sendFn) {
					sendFn({
						type: "data",
						id: subscriptionId,
						entity,
						entityId,
						data,
					});
				}
				return data;
			}

			// Compute diff: only send changed fields
			const fieldsToCheck = fields === "*" ? Object.keys(data) : fields;
			const updates: Record<string, Update> = {};
			let hasChanges = false;

			for (const field of fieldsToCheck) {
				const oldValue = lastState[field];
				const newValue = data[field];

				// Skip if unchanged (deep equality check)
				if (oldValue === newValue) continue;
				if (
					typeof oldValue === "object" &&
					typeof newValue === "object" &&
					JSON.stringify(oldValue) === JSON.stringify(newValue)
				) {
					continue;
				}

				// Compute optimal update strategy
				const update = createUpdate(oldValue, newValue);
				updates[field] = update;
				hasChanges = true;
			}

			// Update client's last known state
			clientStateMap.set(entityKey, { ...data });

			// No changes: don't send anything
			if (!hasChanges) {
				log("  No changes detected");
				return {};
			}

			// Send optimized update message
			const transformedData = {
				_type: "update",
				entity,
				id: entityId,
				updates,
			};

			log("  Computed diff with", Object.keys(updates).length, "field changes");

			if (sendFn) {
				sendFn({
					type: "update",
					id: subscriptionId,
					entity,
					entityId,
					data: transformedData,
				});
			}

			return transformedData;
		},

		/**
		 * After sending data, log for debugging.
		 */
		afterSend(ctx: AfterSendContext): void {
			log("afterSend:", ctx.clientId, ctx.entity, ctx.entityId, "timestamp:", ctx.timestamp);
		},

		/**
		 * Handle client reconnection with subscription state.
		 * Uses GraphStateManager to determine sync strategy for each subscription.
		 */
		onReconnect(ctx: ReconnectContext): ReconnectHookResult[] {
			log("Reconnect:", ctx.clientId, "subscriptions:", ctx.subscriptions.length);

			const results: ReconnectHookResult[] = [];

			// Initialize client state tracking if not exists
			if (!clientStates.has(ctx.clientId)) {
				clientStates.set(ctx.clientId, new Map());
				clientSubscriptions.set(ctx.clientId, new Set());
				clientFields.set(ctx.clientId, new Map());
				subscriptionInfo.set(ctx.clientId, new Map());
			}

			// Process each subscription using GraphStateManager
			const reconnectSubs = ctx.subscriptions.map((sub) => {
				const mapped: {
					id: string;
					entity: string;
					entityId: string;
					version: number;
					fields: string[] | "*";
					dataHash?: string;
				} = {
					id: sub.id,
					entity: sub.entity,
					entityId: sub.entityId,
					version: sub.version,
					fields: sub.fields,
				};
				if (sub.dataHash !== undefined) {
					mapped.dataHash = sub.dataHash;
				}
				return mapped;
			});

			const stateResults = stateManager.handleReconnect(reconnectSubs);

			for (let i = 0; i < ctx.subscriptions.length; i++) {
				const sub = ctx.subscriptions[i];
				const stateResult = stateResults[i];
				const entityKey = makeEntityKey(sub.entity, sub.entityId);

				// Only restore subscription if not deleted/error
				if (stateResult.status !== "deleted" && stateResult.status !== "error") {
					// Track subscription and fields in plugin state
					const subs = clientSubscriptions.get(ctx.clientId);
					const fieldsMap = clientFields.get(ctx.clientId);
					const subInfo = subscriptionInfo.get(ctx.clientId);

					subs?.add(entityKey);
					fieldsMap?.set(entityKey, sub.fields);

					// Track subscription info
					subInfo?.set(sub.id, {
						entity: sub.entity,
						entityId: sub.entityId,
						fields: sub.fields,
					});

					// Track entity subscribers for broadcast
					let subscribers = entitySubscribers.get(entityKey);
					if (!subscribers) {
						subscribers = new Set();
						entitySubscribers.set(entityKey, subscribers);
					}
					subscribers.add({ clientId: ctx.clientId, subscriptionId: sub.id });

					// If we got a snapshot, update client's last known state
					if (stateResult.status === "snapshot" && stateResult.data) {
						const clientStateMap = clientStates.get(ctx.clientId);
						clientStateMap?.set(entityKey, { ...stateResult.data });
					}
				}

				// Convert to plugin result format
				const result: ReconnectHookResult = {
					id: stateResult.id,
					entity: stateResult.entity,
					entityId: stateResult.entityId,
					status: stateResult.status,
					version: stateResult.version,
				};
				if (stateResult.patches) {
					result.patches = stateResult.patches;
				}
				if (stateResult.data) {
					result.data = stateResult.data;
				}
				results.push(result);

				log(
					"  Subscription",
					sub.id,
					entityKey,
					"status:",
					stateResult.status,
					"version:",
					stateResult.version,
				);
			}

			return results;
		},

		/**
		 * Handle client updating subscribed fields for an entity.
		 */
		onUpdateFields(ctx: UpdateFieldsContext): void {
			log(
				"UpdateFields:",
				ctx.clientId,
				ctx.entity,
				ctx.entityId,
				"from:",
				ctx.previousFields,
				"to:",
				ctx.fields,
			);

			const entityKey = makeEntityKey(ctx.entity, ctx.entityId);
			const fieldsMap = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (fieldsMap) {
				fieldsMap.set(entityKey, ctx.fields);
			}

			// Update subscription info
			if (subInfo) {
				const info = subInfo.get(ctx.subscriptionId);
				if (info) {
					info.fields = ctx.fields;
				}
			}
		},

		/**
		 * Handle broadcast - find all subscribers of an entity and send data to them.
		 * This is the core of the stateless server design - the plugin owns subscriber tracking.
		 */
		onBroadcast(ctx: BroadcastContext): boolean {
			const { entity, entityId, data } = ctx;
			const entityKey = makeEntityKey(entity, entityId);

			log("onBroadcast:", entityKey);

			const subscribers = entitySubscribers.get(entityKey);
			if (!subscribers || subscribers.size === 0) {
				log("  No subscribers for entity");
				return true; // We handled it, just no one to send to
			}

			// Send to each subscriber
			for (const { clientId, subscriptionId } of subscribers) {
				const sendFn = clientSendFns.get(clientId);
				if (!sendFn) {
					log("  No send function for client:", clientId);
					continue;
				}

				// Get client's subscribed fields for this entity
				const fieldsMap = clientFields.get(clientId);
				const fields = fieldsMap?.get(entityKey) ?? "*";

				// Use beforeSend logic to compute diff and send
				const clientStateMap = clientStates.get(clientId);
				const lastState = clientStateMap?.get(entityKey);

				if (!lastState) {
					// No previous state - send full data
					clientStateMap?.set(entityKey, { ...data });
					sendFn({
						type: "data",
						id: subscriptionId,
						entity,
						entityId,
						data,
					});
					log("  Sent full data to:", clientId);
					continue;
				}

				// Compute diff
				const fieldsToCheck = fields === "*" ? Object.keys(data) : fields;
				const updates: Record<string, Update> = {};
				let hasChanges = false;

				for (const field of fieldsToCheck) {
					const oldValue = lastState[field];
					const newValue = data[field];

					if (oldValue === newValue) continue;
					if (
						typeof oldValue === "object" &&
						typeof newValue === "object" &&
						JSON.stringify(oldValue) === JSON.stringify(newValue)
					) {
						continue;
					}

					const update = createUpdate(oldValue, newValue);
					updates[field] = update;
					hasChanges = true;
				}

				// Update state
				clientStateMap?.set(entityKey, { ...data });

				if (!hasChanges) {
					log("  No changes for:", clientId);
					continue;
				}

				// Send update
				sendFn({
					type: "update",
					id: subscriptionId,
					entity,
					entityId,
					data: {
						_type: "update",
						entity,
						id: entityId,
						updates,
					},
				});
				log("  Sent diff to:", clientId, "fields:", Object.keys(updates).length);
			}

			return true;
		},
	};
}

/**
 * Check if a plugin is a client state plugin.
 */
export function isClientStatePlugin(
	plugin: ServerPlugin,
): plugin is ServerPlugin & { getStateManager(): GraphStateManager } {
	return plugin.name === "clientState" && "getStateManager" in plugin;
}

// =============================================================================
// Deprecated Aliases (backwards compatibility)
// =============================================================================

/**
 * @deprecated Use `clientState` instead. Will be removed in v1.0.
 */
export const stateSync = clientState;

/**
 * @deprecated Use `ClientStateOptions` instead. Will be removed in v1.0.
 */
export type StateSyncOptions = ClientStateOptions;

/**
 * @deprecated Use `isClientStatePlugin` instead. Will be removed in v1.0.
 */
export const isStateSyncPlugin = isClientStatePlugin;

/**
 * @deprecated Use `clientState` instead. Will be removed in v1.0.
 */
export const diffOptimizer = clientState;

/**
 * @deprecated Use `ClientStateOptions` instead. Will be removed in v1.0.
 */
export type DiffOptimizerOptions = ClientStateOptions;

/**
 * @deprecated Use `isClientStatePlugin` instead. Will be removed in v1.0.
 */
export const isDiffOptimizerPlugin = isClientStatePlugin;
