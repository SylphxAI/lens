/**
 * @sylphx/lens-server - Operation Log Plugin
 *
 * Server-side plugin for cursor-based state synchronization.
 * Provides:
 * - Canonical state per entity (server truth)
 * - Version tracking (cursor-based)
 * - Operation log for efficient reconnection
 * - Patch computation
 *
 * This plugin ONLY handles state management.
 * Subscription routing is handled by the handler layer.
 *
 * Memory: O(entities × history) - does not scale with client count
 *
 * @example
 * ```typescript
 * // Default (in-memory storage)
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [opLog()],
 * });
 *
 * // With external storage for serverless
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [opLog({
 *     storage: redisStorage({ url: process.env.REDIS_URL }),
 *   })],
 * });
 * ```
 */

import type { PatchOperation } from "@sylphx/lens-core";
import { memoryStorage, type OpLogStorage, type OpLogStorageConfig } from "../storage/index.js";
import type {
	BroadcastContext,
	ReconnectContext,
	ReconnectHookResult,
	ServerPlugin,
} from "./types.js";

/**
 * Operation log plugin configuration.
 */
export interface OpLogOptions extends OpLogStorageConfig {
	/**
	 * Storage adapter for state/version/patches.
	 * Defaults to in-memory storage.
	 *
	 * @example
	 * ```typescript
	 * // In-memory (default)
	 * opLog()
	 *
	 * // Redis for serverless
	 * opLog({ storage: redisStorage({ url: REDIS_URL }) })
	 * ```
	 */
	storage?: OpLogStorage;

	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/** @deprecated Use OpLogOptions */
export type StateSyncOptions = OpLogOptions;
/** @deprecated Use OpLogOptions */
export type ClientStateOptions = OpLogOptions;

/**
 * Broadcast result returned by the plugin.
 * Handler uses this to send updates to subscribers.
 */
export interface BroadcastResult {
	/** Current version after update */
	version: number;
	/** Patch operations (null if first emit or log evicted) */
	patch: PatchOperation[] | null;
	/** Full data (for initial sends or when patch unavailable) */
	data: Record<string, unknown>;
}

/**
 * OpLog plugin instance type.
 */
export interface OpLogPlugin extends ServerPlugin {
	/** Get the storage adapter */
	getStorage(): OpLogStorage;
	/** Get version for an entity (async) */
	getVersion(entity: string, entityId: string): Promise<number>;
	/** Get current canonical state for an entity (async) */
	getState(entity: string, entityId: string): Promise<Record<string, unknown> | null>;
	/** Get latest patch for an entity (async) */
	getLatestPatch(entity: string, entityId: string): Promise<PatchOperation[] | null>;
}

/**
 * Create an operation log plugin.
 *
 * This plugin provides cursor-based state synchronization:
 * - Canonical state per entity (server truth)
 * - Version tracking for cursor-based sync
 * - Operation log for efficient reconnection (patches or snapshot)
 *
 * This plugin does NOT handle subscription routing - that's the handler's job.
 * Memory: O(entities × history) - does not scale with client count.
 *
 * @example
 * ```typescript
 * // Default (in-memory)
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [opLog()],
 * });
 *
 * // With Redis for serverless
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [opLog({
 *     storage: redisStorage({ url: process.env.REDIS_URL }),
 *   })],
 * });
 * ```
 */
export function opLog(options: OpLogOptions = {}): OpLogPlugin {
	const storage = options.storage ?? memoryStorage(options);
	const debug = options.debug ?? false;

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[opLog]", ...args);
		}
	};

	return {
		name: "opLog",

		/**
		 * Get the storage adapter.
		 */
		getStorage(): OpLogStorage {
			return storage;
		},

		/**
		 * Get version for an entity.
		 */
		async getVersion(entity: string, entityId: string): Promise<number> {
			return storage.getVersion(entity, entityId);
		},

		/**
		 * Get current canonical state for an entity.
		 */
		async getState(entity: string, entityId: string): Promise<Record<string, unknown> | null> {
			return storage.getState(entity, entityId);
		},

		/**
		 * Get latest patch for an entity.
		 */
		async getLatestPatch(entity: string, entityId: string): Promise<PatchOperation[] | null> {
			return storage.getLatestPatch(entity, entityId);
		},

		/**
		 * Handle broadcast - update canonical state and return patch info.
		 * Handler is responsible for routing to subscribers.
		 */
		async onBroadcast(ctx: BroadcastContext): Promise<BroadcastResult> {
			const { entity, entityId, data } = ctx;

			log("onBroadcast:", entity, entityId);

			// Update canonical state (computes and logs patch)
			const result = await storage.emit(entity, entityId, data);

			log("  Version:", result.version, "Patch ops:", result.patch?.length ?? 0);

			return {
				version: result.version,
				patch: result.patch,
				data,
			};
		},

		/**
		 * Handle reconnection - return patches or snapshot based on client's version.
		 */
		async onReconnect(ctx: ReconnectContext): Promise<ReconnectHookResult[]> {
			log("Reconnect:", ctx.clientId, "subscriptions:", ctx.subscriptions.length);

			const results: ReconnectHookResult[] = [];

			for (const sub of ctx.subscriptions) {
				const currentVersion = await storage.getVersion(sub.entity, sub.entityId);
				const currentState = await storage.getState(sub.entity, sub.entityId);

				// Entity doesn't exist (might have been deleted)
				if (currentState === null) {
					results.push({
						id: sub.id,
						entity: sub.entity,
						entityId: sub.entityId,
						status: "deleted",
						version: 0,
					});
					log("  Subscription", sub.id, `${sub.entity}:${sub.entityId}`, "status: deleted");
					continue;
				}

				// Client is already at latest version
				if (sub.version >= currentVersion) {
					results.push({
						id: sub.id,
						entity: sub.entity,
						entityId: sub.entityId,
						status: "current",
						version: currentVersion,
					});
					log(
						"  Subscription",
						sub.id,
						`${sub.entity}:${sub.entityId}`,
						"status: current",
						"version:",
						currentVersion,
					);
					continue;
				}

				// Try to get patches from operation log
				const patches = await storage.getPatchesSince(sub.entity, sub.entityId, sub.version);

				if (patches !== null && patches.length > 0) {
					// Can patch - return patches
					results.push({
						id: sub.id,
						entity: sub.entity,
						entityId: sub.entityId,
						status: "patched",
						version: currentVersion,
						patches,
					});
					log(
						"  Subscription",
						sub.id,
						`${sub.entity}:${sub.entityId}`,
						"status: patched",
						"version:",
						currentVersion,
						"patches:",
						patches.length,
					);
					continue;
				}

				// Patches not available - send full snapshot
				results.push({
					id: sub.id,
					entity: sub.entity,
					entityId: sub.entityId,
					status: "snapshot",
					version: currentVersion,
					data: currentState,
				});
				log(
					"  Subscription",
					sub.id,
					`${sub.entity}:${sub.entityId}`,
					"status: snapshot",
					"version:",
					currentVersion,
				);
			}

			return results;
		},
	};
}

/** @deprecated Use opLog */
export const stateSync = opLog;
/** @deprecated Use opLog */
export const clientState = opLog;

/**
 * Check if a plugin is an opLog plugin.
 */
export function isOpLogPlugin(plugin: ServerPlugin): plugin is OpLogPlugin {
	return plugin.name === "opLog" && "getStorage" in plugin;
}

/** @deprecated Use isOpLogPlugin */
export const isStateSyncPlugin = isOpLogPlugin;
/** @deprecated Use isOpLogPlugin */
export const isClientStatePlugin = isOpLogPlugin;
