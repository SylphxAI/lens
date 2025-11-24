/**
 * @lens/client - Optimistic Updates Plugin
 *
 * Provides automatic optimistic updates for mutations.
 * Plug and play - just add to your client.
 */

import { defineUnifiedPlugin, type ClientPluginContext } from "@lens/core";
import type { SubscriptionManager } from "../reactive/subscription-manager";
import { OptimisticManager } from "../reactive/optimistic-manager";

// =============================================================================
// Types
// =============================================================================

/** Optimistic updates plugin config */
export interface OptimisticPluginConfig {
	/** Enable optimistic updates (default: true) */
	enabled?: boolean;
	/** Timeout for pending updates in ms (default: 30000) */
	timeout?: number;
}

/** Extended context with subscription manager (set by ReactiveClient) */
interface ExtendedPluginContext extends ClientPluginContext {
	subscriptions?: SubscriptionManager;
}

// =============================================================================
// Optimistic Plugin
// =============================================================================

/**
 * Optimistic updates plugin
 *
 * Automatically applies optimistic updates for mutations,
 * with automatic rollback on failure.
 *
 * @example
 * ```typescript
 * import { createReactiveClient } from "@lens/client";
 * import { optimisticPlugin } from "@lens/client/plugins";
 *
 * const client = createReactiveClient({
 *   links: [...],
 *   plugins: [
 *     optimisticPlugin({ timeout: 30000 }),
 *   ],
 * });
 *
 * // Mutations are now automatically optimistic!
 * await client.User.update("123", { name: "New Name" });
 *
 * // Access the optimistic manager directly
 * const pending = client.$plugins.optimistic.getPending();
 * ```
 */
export const optimisticPlugin = defineUnifiedPlugin<OptimisticPluginConfig>({
	name: "optimistic",
	version: "1.0.0",

	defaultConfig: {
		enabled: true,
		timeout: 30000,
	},

	// Client-only plugin
	client: (config) => {
		let manager: OptimisticManager | null = null;
		// Track pending operations: opKey -> optId
		const pendingOps = new Map<string, string>();

		return {
			name: "optimistic",

			onInit: (ctx: ClientPluginContext) => {
				const extCtx = ctx as ExtendedPluginContext;
				if (extCtx.subscriptions) {
					manager = new OptimisticManager(extCtx.subscriptions, config);
				}
			},

			onBeforeMutation: (ctx, entity, op, input) => {
				if (!manager || !config?.enabled) return;

				const data = input as Record<string, unknown>;
				const id = data.id as string | undefined;

				// Skip batch operations
				if (op === "createMany" || op === "updateMany" || op === "deleteMany") {
					return;
				}

				// Apply optimistic update
				let optId = "";
				const opKey = `${entity}:${op}:${id ?? "new"}:${Date.now()}`;

				switch (op) {
					case "create":
						if (id) {
							optId = manager.applyOptimistic(entity, id, "create", data);
						}
						break;

					case "update":
						if (id) {
							optId = manager.applyOptimistic(entity, id, "update", data);
						}
						break;

					case "delete":
						if (id) {
							optId = manager.applyOptimistic(entity, id, "delete", {});
						}
						break;
				}

				if (optId) {
					pendingOps.set(opKey, optId);
					// Store opKey in input for retrieval in after hooks
					(input as Record<string, unknown>).__opKey = opKey;
				}
			},

			onAfterMutation: (ctx, entity, op, result) => {
				if (!manager) return;

				// Find the pending operation
				const opKey = findPendingOpKey(pendingOps, entity, op);
				if (!opKey) return;

				const optId = pendingOps.get(opKey);
				if (!optId) return;

				// Confirm optimistic update with server data
				if (!result.error) {
					manager.confirm(optId, result.data as Record<string, unknown>);
				}

				pendingOps.delete(opKey);
			},

			onMutationError: (ctx, entity, op, error) => {
				if (!manager) return;

				// Find the pending operation
				const opKey = findPendingOpKey(pendingOps, entity, op);
				if (!opKey) return;

				const optId = pendingOps.get(opKey);
				if (!optId) return;

				// Rollback on error
				manager.rollback(optId);
				pendingOps.delete(opKey);
			},

			// Exposed API
			api: {
				/** Get pending optimistic updates */
				getPending: () => manager?.getPending() ?? [],

				/** Get pending count */
				getPendingCount: () => manager?.getPendingCount() ?? 0,

				/** Check if entity has pending updates */
				hasPending: (entityName: string, entityId: string) =>
					manager?.hasPending(entityName, entityId) ?? false,

				/** Manually rollback an optimistic update */
				rollback: (optId: string) => manager?.rollback(optId),

				/** Clear all pending updates */
				clear: () => manager?.clear(),

				/** Enable/disable optimistic updates */
				setEnabled: (enabled: boolean) => manager?.setEnabled(enabled),

				/** Check if enabled */
				isEnabled: () => manager?.isEnabled() ?? false,
			},

			destroy: () => {
				manager?.clear();
				manager = null;
				pendingOps.clear();
			},
		};
	},
});

// Helper to find pending op by entity and op (gets the oldest one)
function findPendingOpKey(
	pendingOps: Map<string, string>,
	entity: string,
	op: string,
): string | undefined {
	const prefix = `${entity}:${op}:`;
	for (const key of pendingOps.keys()) {
		if (key.startsWith(prefix)) {
			return key;
		}
	}
	return undefined;
}

// Type for the plugin API
export type OptimisticPluginAPI = {
	getPending: () => unknown[];
	getPendingCount: () => number;
	hasPending: (entityName: string, entityId: string) => boolean;
	rollback: (optId: string) => void;
	clear: () => void;
	setEnabled: (enabled: boolean) => void;
	isEnabled: () => boolean;
};
