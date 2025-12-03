/**
 * @sylphx/lens-server - Memory Storage
 *
 * In-memory storage adapter for opLog plugin.
 * Default storage for long-running servers.
 *
 * Features:
 * - O(1) state and version lookups
 * - Bounded patch history per entity
 * - Automatic cleanup of old patches
 *
 * Memory: O(entities × maxPatchesPerEntity)
 */

import type { PatchOperation } from "@sylphx/lens-core";
import {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredPatchEntry,
} from "./types.js";

/**
 * Entity key for internal storage.
 */
type EntityKey = string;

/**
 * Internal entity state.
 */
interface EntityState {
	data: Record<string, unknown>;
	version: number;
	patches: StoredPatchEntry[];
}

/**
 * Create entity key from entity type and ID.
 */
function makeKey(entity: string, entityId: string): EntityKey {
	return `${entity}:${entityId}`;
}

/**
 * Compute JSON Patch operations between two states.
 */
function computePatch(
	oldState: Record<string, unknown>,
	newState: Record<string, unknown>,
): PatchOperation[] {
	const patch: PatchOperation[] = [];
	const oldKeys = new Set(Object.keys(oldState));
	const newKeys = new Set(Object.keys(newState));

	// Additions and replacements
	for (const key of newKeys) {
		const oldValue = oldState[key];
		const newValue = newState[key];

		if (!oldKeys.has(key)) {
			// New field
			patch.push({ op: "add", path: `/${key}`, value: newValue });
		} else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
			// Changed field
			patch.push({ op: "replace", path: `/${key}`, value: newValue });
		}
	}

	// Deletions
	for (const key of oldKeys) {
		if (!newKeys.has(key)) {
			patch.push({ op: "remove", path: `/${key}` });
		}
	}

	return patch;
}

/**
 * Hash entity state for change detection.
 */
function hashState(state: Record<string, unknown>): string {
	return JSON.stringify(state);
}

/**
 * Create an in-memory storage adapter.
 *
 * @example
 * ```typescript
 * const storage = memoryStorage();
 *
 * // Or with custom config
 * const storage = memoryStorage({
 *   maxPatchesPerEntity: 500,
 *   maxPatchAge: 60000,
 * });
 * ```
 */
export function memoryStorage(config: OpLogStorageConfig = {}): OpLogStorage {
	const cfg = { ...DEFAULT_STORAGE_CONFIG, ...config };
	const entities = new Map<EntityKey, EntityState>();
	let cleanupTimer: ReturnType<typeof setInterval> | null = null;

	// Start cleanup timer
	if (cfg.cleanupInterval > 0) {
		cleanupTimer = setInterval(() => cleanup(), cfg.cleanupInterval);
	}

	/**
	 * Cleanup old patches based on age.
	 */
	function cleanup(): void {
		const now = Date.now();
		const minTimestamp = now - cfg.maxPatchAge;

		for (const state of entities.values()) {
			// Remove patches older than maxPatchAge
			state.patches = state.patches.filter((p) => p.timestamp >= minTimestamp);
		}
	}

	/**
	 * Trim patches to maxPatchesPerEntity.
	 */
	function trimPatches(state: EntityState): void {
		if (state.patches.length > cfg.maxPatchesPerEntity) {
			// Remove oldest patches
			state.patches = state.patches.slice(-cfg.maxPatchesPerEntity);
		}
	}

	return {
		async emit(entity, entityId, data): Promise<EmitResult> {
			const key = makeKey(entity, entityId);
			const existing = entities.get(key);
			const now = Date.now();

			if (!existing) {
				// First emit - no previous state
				const newState: EntityState = {
					data: { ...data },
					version: 1,
					patches: [],
				};

				// No patch for first emit (full state is sent instead)
				entities.set(key, newState);

				return {
					version: 1,
					patch: null,
					changed: true,
				};
			}

			// Check if state actually changed
			const oldHash = hashState(existing.data);
			const newHash = hashState(data);

			if (oldHash === newHash) {
				return {
					version: existing.version,
					patch: null,
					changed: false,
				};
			}

			// Compute patch
			const patch = computePatch(existing.data, data);

			// Update state
			const newVersion = existing.version + 1;
			existing.data = { ...data };
			existing.version = newVersion;

			// Append patch to log
			if (patch.length > 0) {
				existing.patches.push({
					version: newVersion,
					patch,
					timestamp: now,
				});
				trimPatches(existing);
			}

			return {
				version: newVersion,
				patch: patch.length > 0 ? patch : null,
				changed: true,
			};
		},

		async getState(entity, entityId): Promise<Record<string, unknown> | null> {
			const key = makeKey(entity, entityId);
			const state = entities.get(key);
			return state ? { ...state.data } : null;
		},

		async getVersion(entity, entityId): Promise<number> {
			const key = makeKey(entity, entityId);
			const state = entities.get(key);
			return state?.version ?? 0;
		},

		async getLatestPatch(entity, entityId): Promise<PatchOperation[] | null> {
			const key = makeKey(entity, entityId);
			const state = entities.get(key);

			if (!state || state.patches.length === 0) {
				return null;
			}

			return state.patches[state.patches.length - 1].patch;
		},

		async getPatchesSince(entity, entityId, sinceVersion): Promise<PatchOperation[][] | null> {
			const key = makeKey(entity, entityId);
			const state = entities.get(key);

			if (!state) {
				return sinceVersion === 0 ? [] : null;
			}

			// Already up to date
			if (sinceVersion >= state.version) {
				return [];
			}

			// Find patches since the given version
			const relevantPatches = state.patches.filter((p) => p.version > sinceVersion);

			if (relevantPatches.length === 0) {
				// No patches in log - version too old
				return null;
			}

			// Verify continuity
			relevantPatches.sort((a, b) => a.version - b.version);

			// First patch must be sinceVersion + 1
			if (relevantPatches[0].version !== sinceVersion + 1) {
				return null;
			}

			// Check for gaps
			for (let i = 1; i < relevantPatches.length; i++) {
				if (relevantPatches[i].version !== relevantPatches[i - 1].version + 1) {
					return null;
				}
			}

			return relevantPatches.map((p) => p.patch);
		},

		async has(entity, entityId): Promise<boolean> {
			const key = makeKey(entity, entityId);
			return entities.has(key);
		},

		async delete(entity, entityId): Promise<void> {
			const key = makeKey(entity, entityId);
			entities.delete(key);
		},

		async clear(): Promise<void> {
			entities.clear();
		},

		async dispose(): Promise<void> {
			if (cleanupTimer) {
				clearInterval(cleanupTimer);
				cleanupTimer = null;
			}
			entities.clear();
		},
	};
}
