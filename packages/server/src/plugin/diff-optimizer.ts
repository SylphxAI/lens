/**
 * @sylphx/lens-server - Diff Optimizer Plugin
 *
 * Server-side plugin that enables efficient diff computation and state tracking.
 * By default, the server operates in stateless mode (sends full data).
 * Adding this plugin enables:
 * - Per-client state tracking
 * - Minimal diff computation
 * - Optimal transfer strategy selection (value/delta/patch)
 * - Reconnection support with version tracking
 *
 * This plugin is ideal for:
 * - Long-running WebSocket connections
 * - Bandwidth-sensitive applications
 * - Real-time collaborative features
 *
 * For serverless/stateless deployments, skip this plugin and let
 * the server send full data on each update.
 */

import { createUpdate, type Update } from "@sylphx/lens-core";
import { GraphStateManager, type GraphStateManagerConfig } from "../state/graph-state-manager.js";
import type {
	AfterSendContext,
	BeforeSendContext,
	ConnectContext,
	DisconnectContext,
	ServerPlugin,
	SubscribeContext,
	UnsubscribeContext,
} from "./types.js";

/**
 * Diff optimizer plugin configuration.
 */
export interface DiffOptimizerOptions extends GraphStateManagerConfig {
	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Create a diff optimizer plugin.
 *
 * This plugin tracks state per-client and computes minimal diffs
 * when sending updates. Without this plugin, the server sends
 * full data on each update (stateless mode).
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   router: appRouter,
 *   plugins: [
 *     diffOptimizer({
 *       // Optional: operation log settings for reconnection
 *       operationLog: { maxAge: 60000 },
 *     }),
 *   ],
 * });
 * ```
 */
export function diffOptimizer(options: DiffOptimizerOptions = {}): ServerPlugin & {
	/** Get the underlying GraphStateManager instance */
	getStateManager(): GraphStateManager;
} {
	const stateManager = new GraphStateManager(options);
	const debug = options.debug ?? false;

	// Per-client state tracking: clientId → entityKey → lastState
	const clientStates = new Map<string, Map<string, Record<string, unknown>>>();

	// Track client-entity subscriptions
	const clientSubscriptions = new Map<string, Set<string>>(); // clientId -> Set<entityKey>

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[diffOptimizer]", ...args);
		}
	};

	const makeEntityKey = (entity: string, entityId: string) => `${entity}:${entityId}`;

	return {
		name: "diffOptimizer",

		/**
		 * Get the underlying GraphStateManager instance.
		 * Useful for advanced use cases like manual state management.
		 */
		getStateManager(): GraphStateManager {
			return stateManager;
		},

		/**
		 * When a client connects, initialize their state tracking.
		 */
		onConnect(ctx: ConnectContext): void {
			log("Client connected:", ctx.clientId);
			clientStates.set(ctx.clientId, new Map());
			clientSubscriptions.set(ctx.clientId, new Set());
		},

		/**
		 * When a client disconnects, clean up their state.
		 */
		onDisconnect(ctx: DisconnectContext): void {
			log("Client disconnected:", ctx.clientId, "subscriptions:", ctx.subscriptionCount);
			clientStates.delete(ctx.clientId);
			clientSubscriptions.delete(ctx.clientId);
		},

		/**
		 * When a client subscribes, track the subscription.
		 */
		onSubscribe(ctx: SubscribeContext): void {
			log("Subscribe:", ctx.clientId, ctx.operation, ctx.entity, ctx.entityId);

			const subs = clientSubscriptions.get(ctx.clientId);
			if (subs && ctx.entity && ctx.entityId) {
				const entityKey = makeEntityKey(ctx.entity, ctx.entityId);
				subs.add(entityKey);
			}
		},

		/**
		 * When a client unsubscribes, remove from tracking.
		 */
		onUnsubscribe(ctx: UnsubscribeContext): void {
			log("Unsubscribe:", ctx.clientId, ctx.subscriptionId);

			const subs = clientSubscriptions.get(ctx.clientId);
			const states = clientStates.get(ctx.clientId);

			if (subs || states) {
				for (const entityKey of ctx.entityKeys) {
					subs?.delete(entityKey);
					states?.delete(entityKey);
				}
			}
		},

		/**
		 * Before sending data, compute optimal diff if we have previous state.
		 * This is the core optimization logic.
		 */
		beforeSend(ctx: BeforeSendContext): Record<string, unknown> | void {
			const { clientId, entity, entityId, data, isInitial, fields } = ctx;
			const entityKey = makeEntityKey(entity, entityId);

			log("beforeSend:", clientId, entityKey, "initial:", isInitial);

			// Get or create client state map
			let clientStateMap = clientStates.get(clientId);
			if (!clientStateMap) {
				clientStateMap = new Map();
				clientStates.set(clientId, clientStateMap);
			}

			// Initial send: store state, return full data
			if (isInitial) {
				clientStateMap.set(entityKey, { ...data });
				log("  Initial send, storing state");
				return data;
			}

			// Get client's last known state
			const lastState = clientStateMap.get(entityKey);

			// No previous state: treat as initial
			if (!lastState) {
				clientStateMap.set(entityKey, { ...data });
				log("  No previous state, storing and sending full");
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

			// No changes: return empty update
			if (!hasChanges) {
				log("  No changes detected");
				return {};
			}

			// Return optimized payload with updates
			log("  Computed diff with", Object.keys(updates).length, "field changes");
			return {
				_type: "update",
				entity,
				id: entityId,
				updates,
			};
		},

		/**
		 * After sending data, log for debugging.
		 */
		afterSend(ctx: AfterSendContext): void {
			log("afterSend:", ctx.clientId, ctx.entity, ctx.entityId, "timestamp:", ctx.timestamp);
		},
	};
}

/**
 * Check if a plugin is a diff optimizer plugin.
 */
export function isDiffOptimizerPlugin(
	plugin: ServerPlugin,
): plugin is ServerPlugin & { getStateManager(): GraphStateManager } {
	return plugin.name === "diffOptimizer" && "getStateManager" in plugin;
}
