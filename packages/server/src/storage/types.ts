/**
 * @sylphx/lens-server - Storage Types
 *
 * Storage adapter interface for opLog plugin.
 * Enables serverless support by abstracting state/version/patch storage.
 */

import type { PatchOperation } from "@sylphx/lens-core";

/**
 * Entity state stored in the operation log.
 */
export interface StoredEntityState {
	/** Canonical state data */
	data: Record<string, unknown>;
	/** Current version */
	version: number;
	/** Timestamp of last update */
	updatedAt: number;
}

/**
 * Operation log entry stored in storage.
 */
export interface StoredPatchEntry {
	/** Version this patch creates */
	version: number;
	/** Patch operations */
	patch: PatchOperation[];
	/** Timestamp when patch was created */
	timestamp: number;
}

/**
 * Result from emit operation.
 */
export interface EmitResult {
	/** New version after emit */
	version: number;
	/** Computed patch (null if first emit) */
	patch: PatchOperation[] | null;
	/** Whether state actually changed */
	changed: boolean;
}

/**
 * Storage adapter interface for opLog.
 *
 * Implementations:
 * - `memoryStorage()` - In-memory (default, for long-running servers)
 * - `redisStorage()` - Redis/Upstash (for serverless)
 * - `kvStorage()` - Cloudflare KV, Vercel KV
 *
 * All methods are async to support external storage.
 *
 * @example
 * ```typescript
 * // Default (in-memory)
 * const app = createApp({
 *   router,
 *   plugins: [opLog()],
 * });
 *
 * // With Redis for serverless
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: redisStorage({ url: process.env.REDIS_URL }),
 *   })],
 * });
 * ```
 */
export interface OpLogStorage {
	/**
	 * Emit new state for an entity.
	 * This is an atomic operation that:
	 * 1. Computes patch from previous state (if exists)
	 * 2. Stores new state with incremented version
	 * 3. Appends patch to operation log
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @param data - New state data
	 * @returns Emit result with version, patch, and changed flag
	 */
	emit(entity: string, entityId: string, data: Record<string, unknown>): Promise<EmitResult>;

	/**
	 * Get current canonical state for an entity.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @returns State data or null if not found
	 */
	getState(entity: string, entityId: string): Promise<Record<string, unknown> | null>;

	/**
	 * Get current version for an entity.
	 * Returns 0 if entity doesn't exist.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @returns Current version (0 if not found)
	 */
	getVersion(entity: string, entityId: string): Promise<number>;

	/**
	 * Get the latest patch for an entity.
	 * Returns null if no patches available.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @returns Latest patch or null
	 */
	getLatestPatch(entity: string, entityId: string): Promise<PatchOperation[] | null>;

	/**
	 * Get all patches since a given version.
	 * Used for reconnection to bring client up to date.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @param sinceVersion - Client's current version
	 * @returns Array of patches (one per version), or null if too old
	 */
	getPatchesSince(
		entity: string,
		entityId: string,
		sinceVersion: number,
	): Promise<PatchOperation[][] | null>;

	/**
	 * Check if entity exists in storage.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 * @returns True if entity exists
	 */
	has(entity: string, entityId: string): Promise<boolean>;

	/**
	 * Delete an entity from storage.
	 * Removes state, version, and all patches.
	 *
	 * @param entity - Entity type name
	 * @param entityId - Entity ID
	 */
	delete(entity: string, entityId: string): Promise<void>;

	/**
	 * Clear all data from storage.
	 * Used for testing.
	 */
	clear(): Promise<void>;

	/**
	 * Dispose storage resources.
	 * Called when shutting down.
	 */
	dispose?(): Promise<void>;
}

/**
 * Configuration for operation log storage.
 */
export interface OpLogStorageConfig {
	/**
	 * Maximum number of patches to keep per entity.
	 * Older patches are evicted when limit is reached.
	 * @default 1000
	 */
	maxPatchesPerEntity?: number;

	/**
	 * Maximum age of patches in milliseconds.
	 * Patches older than this are evicted.
	 * @default 300000 (5 minutes)
	 */
	maxPatchAge?: number;

	/**
	 * Cleanup interval in milliseconds.
	 * Set to 0 to disable automatic cleanup.
	 * @default 60000 (1 minute)
	 */
	cleanupInterval?: number;
}

/**
 * Default storage configuration.
 */
export const DEFAULT_STORAGE_CONFIG: Required<OpLogStorageConfig> = {
	maxPatchesPerEntity: 1000,
	maxPatchAge: 5 * 60 * 1000, // 5 minutes
	cleanupInterval: 60 * 1000, // 1 minute
};
