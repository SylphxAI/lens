/**
 * @sylphx/lens-server - Operation Log
 *
 * Bounded log of recent state changes for efficient reconnection.
 * Stores patches that can be replayed to bring disconnected clients up to date.
 */

import type {
	OperationLogConfig,
	OperationLogEntry,
	OperationLogStats,
	PatchOperation,
	Version,
} from "@sylphx/lens-core";
import { DEFAULT_OPERATION_LOG_CONFIG } from "@sylphx/lens-core";

// =============================================================================
// Operation Log
// =============================================================================

/**
 * Operation log with efficient lookup and bounded memory.
 *
 * Features:
 * - O(1) lookup by entity key (via index)
 * - Automatic eviction based on count, age, and memory
 * - Version tracking for efficient reconnect
 *
 * @example
 * ```typescript
 * const log = new OperationLog({ maxEntries: 10000, maxAge: 300000 });
 *
 * // Append operation
 * log.append({
 *   entityKey: "user:123",
 *   version: 5,
 *   timestamp: Date.now(),
 *   patch: [{ op: "replace", path: "/name", value: "Alice" }],
 *   patchSize: 50,
 * });
 *
 * // Get patches since version
 * const patches = log.getSince("user:123", 3);
 * // Returns patches for versions 4 and 5, or null if too old
 * ```
 */
export class OperationLog {
	private entries: OperationLogEntry[] = [];
	private config: OperationLogConfig;
	private totalMemory = 0;

	// Indices for O(1) lookup
	private entityIndex = new Map<string, number[]>(); // entityKey → entry indices
	private oldestVersionIndex = new Map<string, Version>(); // entityKey → oldest version
	private newestVersionIndex = new Map<string, Version>(); // entityKey → newest version

	// Cleanup timer
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: Partial<OperationLogConfig> = {}) {
		this.config = { ...DEFAULT_OPERATION_LOG_CONFIG, ...config };

		// Start cleanup timer
		if (this.config.cleanupInterval > 0) {
			this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
		}
	}

	// ===========================================================================
	// Core Operations
	// ===========================================================================

	/**
	 * Append new operation to log.
	 * Automatically evicts old entries if limits exceeded.
	 */
	append(entry: OperationLogEntry): void {
		const index = this.entries.length;
		this.entries.push(entry);
		this.totalMemory += entry.patchSize;

		// Update entity index
		let indices = this.entityIndex.get(entry.entityKey);
		if (!indices) {
			indices = [];
			this.entityIndex.set(entry.entityKey, indices);
			this.oldestVersionIndex.set(entry.entityKey, entry.version);
			this.newestVersionIndex.set(entry.entityKey, entry.version);
		} else {
			// Track actual min/max versions (handles out-of-order appends)
			const currentOldest = this.oldestVersionIndex.get(entry.entityKey)!;
			const currentNewest = this.newestVersionIndex.get(entry.entityKey)!;
			if (entry.version < currentOldest) {
				this.oldestVersionIndex.set(entry.entityKey, entry.version);
			}
			if (entry.version > currentNewest) {
				this.newestVersionIndex.set(entry.entityKey, entry.version);
			}
		}
		indices.push(index);

		// Check limits and cleanup if needed
		this.checkLimits();
	}

	/**
	 * Append batch of operations efficiently.
	 */
	appendBatch(entries: OperationLogEntry[]): void {
		for (const entry of entries) {
			this.append(entry);
		}
	}

	/**
	 * Get all operations for entity since given version.
	 * Returns null if version is too old (not in log).
	 * Returns empty array if client is already at latest version.
	 */
	getSince(entityKey: string, fromVersion: Version): OperationLogEntry[] | null {
		const oldestVersion = this.oldestVersionIndex.get(entityKey);
		const newestVersion = this.newestVersionIndex.get(entityKey);

		// No entries for this entity
		if (oldestVersion === undefined || newestVersion === undefined) {
			return fromVersion === 0 ? [] : null;
		}

		// Client is already up to date
		if (fromVersion >= newestVersion) {
			return [];
		}

		// Version too old - not in log
		if (fromVersion < oldestVersion - 1) {
			return null;
		}

		// Get entries from index
		const indices = this.entityIndex.get(entityKey) ?? [];
		const result: OperationLogEntry[] = [];

		for (const idx of indices) {
			const entry = this.entries[idx];
			// Entry might be undefined if index is stale (after cleanup)
			if (entry && entry.version > fromVersion) {
				result.push(entry);
			}
		}

		// Sort by version to ensure correct order
		result.sort((a, b) => a.version - b.version);

		// Verify continuity - patches must be consecutive
		if (result.length > 0) {
			// First entry must be fromVersion + 1
			if (result[0].version !== fromVersion + 1) {
				return null;
			}

			// All subsequent entries must be consecutive
			for (let i = 1; i < result.length; i++) {
				if (result[i].version !== result[i - 1].version + 1) {
					// Gap in versions - can't use patches
					return null;
				}
			}
		}

		return result;
	}

	/**
	 * Check if version is within log range for entity.
	 */
	hasVersion(entityKey: string, version: Version): boolean {
		const oldest = this.oldestVersionIndex.get(entityKey);
		const newest = this.newestVersionIndex.get(entityKey);

		if (oldest === undefined || newest === undefined) {
			return false;
		}

		return version >= oldest && version <= newest;
	}

	/**
	 * Get oldest version available for entity.
	 */
	getOldestVersion(entityKey: string): Version | null {
		return this.oldestVersionIndex.get(entityKey) ?? null;
	}

	/**
	 * Get newest version for entity.
	 */
	getNewestVersion(entityKey: string): Version | null {
		return this.newestVersionIndex.get(entityKey) ?? null;
	}

	/**
	 * Get all patches for entity (for debugging/testing).
	 */
	getAll(entityKey: string): OperationLogEntry[] {
		const indices = this.entityIndex.get(entityKey) ?? [];
		const result: OperationLogEntry[] = [];

		for (const idx of indices) {
			const entry = this.entries[idx];
			if (entry) {
				result.push(entry);
			}
		}

		return result.sort((a, b) => a.version - b.version);
	}

	// ===========================================================================
	// Cleanup & Eviction
	// ===========================================================================

	/**
	 * Cleanup expired entries.
	 * Called automatically on interval or manually.
	 */
	cleanup(): void {
		const now = Date.now();
		let removedCount = 0;

		// Time-based eviction
		const minTimestamp = now - this.config.maxAge;
		while (this.entries.length > 0 && this.entries[0].timestamp < minTimestamp) {
			this.removeOldest();
			removedCount++;
		}

		// Count-based eviction
		while (this.entries.length > this.config.maxEntries) {
			this.removeOldest();
			removedCount++;
		}

		// Memory-based eviction
		while (this.totalMemory > this.config.maxMemory && this.entries.length > 0) {
			this.removeOldest();
			removedCount++;
		}

		// Rebuild indices if significant cleanup occurred
		if (removedCount > this.entries.length * 0.1) {
			this.rebuildIndices();
		}
	}

	/**
	 * Remove oldest entry and update tracking.
	 *
	 * IMPORTANT: After entries.shift(), ALL indices must be decremented by 1
	 * to maintain correctness of entityIndex lookups.
	 */
	private removeOldest(): void {
		const removed = this.entries.shift();
		if (!removed) return;

		this.totalMemory -= removed.patchSize;

		// CRITICAL FIX: Decrement ALL indices for ALL entities since array shifted
		// Must happen BEFORE any index lookups to ensure correctness
		for (const indices of this.entityIndex.values()) {
			for (let i = 0; i < indices.length; i++) {
				indices[i]--;
			}
		}

		// Update oldest version for the removed entity
		const removedEntityIndices = this.entityIndex.get(removed.entityKey);
		if (removedEntityIndices && removedEntityIndices.length > 0) {
			// Remove first index (oldest) for this entity
			// After decrement above, this index is now -1, so shift() removes it
			removedEntityIndices.shift();

			if (removedEntityIndices.length === 0) {
				// No more entries for this entity
				this.entityIndex.delete(removed.entityKey);
				this.oldestVersionIndex.delete(removed.entityKey);
				this.newestVersionIndex.delete(removed.entityKey);
			} else {
				// Update oldest version to next entry (indices already corrected)
				const nextEntry = this.entries[removedEntityIndices[0]];
				if (nextEntry) {
					this.oldestVersionIndex.set(removed.entityKey, nextEntry.version);
				}
			}
		}
	}

	/**
	 * Rebuild indices after cleanup.
	 * O(n) operation, should be called sparingly.
	 */
	private rebuildIndices(): void {
		this.entityIndex.clear();
		this.oldestVersionIndex.clear();
		this.newestVersionIndex.clear();
		this.totalMemory = 0;

		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			this.totalMemory += entry.patchSize;

			let indices = this.entityIndex.get(entry.entityKey);
			if (!indices) {
				indices = [];
				this.entityIndex.set(entry.entityKey, indices);
				this.oldestVersionIndex.set(entry.entityKey, entry.version);
			}
			indices.push(i);
			this.newestVersionIndex.set(entry.entityKey, entry.version);
		}
	}

	/**
	 * Check limits and trigger cleanup if needed.
	 */
	private checkLimits(): void {
		const needsCleanup =
			this.entries.length > this.config.maxEntries || this.totalMemory > this.config.maxMemory;

		if (needsCleanup) {
			this.cleanup();
		}
	}

	// ===========================================================================
	// Statistics & Lifecycle
	// ===========================================================================

	/**
	 * Get statistics about the operation log.
	 */
	getStats(): OperationLogStats {
		return {
			entryCount: this.entries.length,
			entityCount: this.entityIndex.size,
			memoryUsage: this.totalMemory,
			oldestTimestamp: this.entries[0]?.timestamp ?? null,
			newestTimestamp: this.entries[this.entries.length - 1]?.timestamp ?? null,
			config: { ...this.config },
		};
	}

	/**
	 * Clear all entries.
	 */
	clear(): void {
		this.entries = [];
		this.entityIndex.clear();
		this.oldestVersionIndex.clear();
		this.newestVersionIndex.clear();
		this.totalMemory = 0;
	}

	/**
	 * Stop cleanup timer and release resources.
	 */
	dispose(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.clear();
	}

	/**
	 * Update configuration.
	 */
	updateConfig(config: Partial<OperationLogConfig>): void {
		this.config = { ...this.config, ...config };

		// Restart cleanup timer if interval changed
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
		}
		if (this.config.cleanupInterval > 0) {
			this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
		}

		// Apply new limits
		this.cleanup();
	}
}

// =============================================================================
// Patch Utilities (Server-side)
// =============================================================================

/**
 * Coalesce multiple patches into single optimized patch.
 * Removes redundant operations and combines sequential changes.
 *
 * @param patches - Array of patch arrays (one per version)
 * @returns Single coalesced patch array
 */
export function coalescePatches(patches: PatchOperation[][]): PatchOperation[] {
	const flatPatches = patches.flat();
	const pathMap = new Map<string, PatchOperation>();

	for (const op of flatPatches) {
		const existing = pathMap.get(op.path);

		if (!existing) {
			pathMap.set(op.path, op);
			continue;
		}

		// Coalesce based on operation type
		switch (op.op) {
			case "replace":
			case "add":
				// Later value wins
				pathMap.set(op.path, op);
				break;

			case "remove":
				// Remove trumps add/replace
				pathMap.set(op.path, op);
				break;

			case "move":
			case "copy":
				// These are complex - just keep the latest
				pathMap.set(op.path, op);
				break;

			case "test":
				// Test operations can be dropped in coalescing
				break;
		}
	}

	// Convert back to array, maintaining a reasonable order
	const result = Array.from(pathMap.values());

	// Sort by path depth (shallower first) for proper application order
	result.sort((a, b) => {
		const depthA = a.path.split("/").length;
		const depthB = b.path.split("/").length;
		if (depthA !== depthB) return depthA - depthB;
		return a.path.localeCompare(b.path);
	});

	return result;
}

/**
 * Estimate memory size of patch operations.
 */
export function estimatePatchSize(patch: PatchOperation[]): number {
	// Rough estimate: JSON stringify length
	return JSON.stringify(patch).length;
}
