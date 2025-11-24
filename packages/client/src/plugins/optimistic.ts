/**
 * @lens/client - Optimistic Updates Plugin
 *
 * Provides automatic optimistic updates for mutations.
 * Plug and play - just add to your client.
 */

import { definePlugin } from "./manager";
import type { OptimisticPluginConfig, PluginContext } from "./types";
import { OptimisticManager } from "../reactive/optimistic-manager";

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
export const optimisticPlugin = definePlugin<OptimisticPluginConfig>({
	name: "optimistic",
	version: "1.0.0",

	defaultConfig: {
		enabled: true,
		timeout: 30000,
	},

	create: (config) => {
		let manager: OptimisticManager | null = null;
		const pendingOps = new Map<string, string>(); // op key -> optimistic id

		return {
			name: "optimistic",

			onInit: (ctx: PluginContext) => {
				manager = new OptimisticManager(ctx.subscriptions, config);
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
				}

				return { input, meta: { opKey, optId } };
			},

			onAfterMutation: (ctx, entity, op, result, meta) => {
				if (!manager || !meta?.optId) return;

				const optId = meta.optId as string;
				const opKey = meta.opKey as string;

				// Confirm optimistic update with server data
				if (!result.error) {
					manager.confirm(optId, result.data as Record<string, unknown>);
				}

				pendingOps.delete(opKey);
			},

			onMutationError: (ctx, entity, op, error, meta) => {
				if (!manager || !meta?.optId) return;

				const optId = meta.optId as string;
				const opKey = meta.opKey as string;

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
