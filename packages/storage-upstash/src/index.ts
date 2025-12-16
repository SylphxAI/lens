/**
 * @sylphx/lens-storage-upstash
 *
 * Upstash Redis storage adapter for Lens opLog plugin (HTTP-based).
 * Perfect for serverless/edge environments.
 *
 * Features:
 * - HTTP-based (no persistent connections)
 * - Optimistic locking with retry on conflict
 * - Automatic patch eviction
 *
 * @example
 * ```typescript
 * import { Redis } from "@upstash/redis";
 * import { upstashStorage } from "@sylphx/lens-storage-upstash";
 *
 * const redis = new Redis({
 *   url: process.env.UPSTASH_REDIS_REST_URL,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN,
 * });
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: upstashStorage({ redis }),
 *   })],
 * });
 * ```
 */

import type { PatchOperation } from "@sylphx/lens-core";
import {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredPatchEntry,
} from "@sylphx/lens-server";

/**
 * Upstash Redis client interface.
 * Compatible with @upstash/redis.
 */
export interface UpstashRedisClient {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown, options?: { ex?: number; nx?: boolean }): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	exists(...keys: string[]): Promise<number>;
}

/**
 * Upstash storage options.
 */
export interface UpstashStorageOptions extends OpLogStorageConfig {
	/**
	 * Upstash Redis client instance.
	 *
	 * @example
	 * ```typescript
	 * import { Redis } from "@upstash/redis";
	 * const redis = new Redis({ url, token });
	 * ```
	 */
	redis: UpstashRedisClient;

	/**
	 * Key prefix for all stored data.
	 * @default "lens"
	 */
	prefix?: string;

	/**
	 * TTL for state data in seconds.
	 * Set to 0 for no expiration.
	 * @default 0 (no expiration)
	 */
	stateTTL?: number;
}

/**
 * Internal stored data structure.
 */
interface StoredData {
	data: Record<string, unknown>;
	version: number;
	updatedAt: number;
	patches: StoredPatchEntry[];
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

	for (const key of newKeys) {
		const oldValue = oldState[key];
		const newValue = newState[key];

		if (!oldKeys.has(key)) {
			patch.push({ op: "add", path: `/${key}`, value: newValue });
		} else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
			patch.push({ op: "replace", path: `/${key}`, value: newValue });
		}
	}

	for (const key of oldKeys) {
		if (!newKeys.has(key)) {
			patch.push({ op: "remove", path: `/${key}` });
		}
	}

	return patch;
}

/**
 * Create an Upstash Redis storage adapter.
 *
 * Requires `@upstash/redis` as a peer dependency.
 *
 * Uses optimistic locking: if a concurrent write is detected,
 * the operation is retried up to `maxRetries` times.
 *
 * @example
 * ```typescript
 * import { Redis } from "@upstash/redis";
 * import { upstashStorage } from "@sylphx/lens-storage-upstash";
 *
 * const redis = new Redis({
 *   url: process.env.UPSTASH_REDIS_REST_URL,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN,
 * });
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: upstashStorage({ redis }),
 *   })],
 * });
 * ```
 */
export function upstashStorage(options: UpstashStorageOptions): OpLogStorage {
	const { redis, prefix = "lens", stateTTL = 0 } = options;
	const cfg = { ...DEFAULT_STORAGE_CONFIG, ...options };

	function makeKey(entity: string, entityId: string): string {
		return `${prefix}:${entity}:${entityId}`;
	}

	async function getData(entity: string, entityId: string): Promise<StoredData | null> {
		const key = makeKey(entity, entityId);
		const data = await redis.get<StoredData>(key);
		return data;
	}

	async function setData(entity: string, entityId: string, data: StoredData): Promise<void> {
		const key = makeKey(entity, entityId);
		if (stateTTL > 0) {
			await redis.set(key, data, { ex: stateTTL });
		} else {
			await redis.set(key, data);
		}
	}

	function trimPatches(patches: StoredPatchEntry[], now: number): StoredPatchEntry[] {
		const minTimestamp = now - cfg.maxPatchAge;
		let filtered = patches.filter((p) => p.timestamp >= minTimestamp);

		if (filtered.length > cfg.maxPatchesPerEntity) {
			filtered = filtered.slice(-cfg.maxPatchesPerEntity);
		}

		return filtered;
	}

	/**
	 * Emit with optimistic locking.
	 * Retries on version conflict up to maxRetries times.
	 */
	async function emitWithRetry(
		entity: string,
		entityId: string,
		data: Record<string, unknown>,
		retryCount = 0,
	): Promise<EmitResult> {
		const now = Date.now();
		const existing = await getData(entity, entityId);

		if (!existing) {
			// First emit - no conflict possible
			const newData: StoredData = {
				data: { ...data },
				version: 1,
				updatedAt: now,
				patches: [],
			};
			await setData(entity, entityId, newData);

			return {
				version: 1,
				patch: null,
				changed: true,
			};
		}

		const expectedVersion = existing.version;

		// Check if changed
		const oldHash = JSON.stringify(existing.data);
		const newHash = JSON.stringify(data);

		if (oldHash === newHash) {
			return {
				version: existing.version,
				patch: null,
				changed: false,
			};
		}

		// Compute patch
		const patch = computePatch(existing.data, data);
		const newVersion = expectedVersion + 1;

		// Update patches array
		let patches = [...existing.patches];
		if (patch.length > 0) {
			patches.push({
				version: newVersion,
				patch,
				timestamp: now,
			});
			patches = trimPatches(patches, now);
		}

		// Prepare new data
		const newData: StoredData = {
			data: { ...data },
			version: newVersion,
			updatedAt: now,
			patches,
		};

		// Write and verify version didn't change
		await setData(entity, entityId, newData);

		// Re-read to verify our write succeeded (optimistic check)
		const verify = await getData(entity, entityId);
		if (verify && verify.version !== newVersion) {
			// Version conflict - another write happened
			if (retryCount < cfg.maxRetries) {
				// Retry with exponential backoff
				const delay = Math.min(10 * 2 ** retryCount, 100);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return emitWithRetry(entity, entityId, data, retryCount + 1);
			}
			// Max retries exceeded - return the current state
			// This implements "last writer wins" semantics
			return {
				version: verify.version,
				patch: null,
				changed: true,
			};
		}

		return {
			version: newVersion,
			patch: patch.length > 0 ? patch : null,
			changed: true,
		};
	}

	return {
		emit: (entity, entityId, data) => emitWithRetry(entity, entityId, data, 0),

		async getState(entity, entityId): Promise<Record<string, unknown> | null> {
			const stored = await getData(entity, entityId);
			return stored ? { ...stored.data } : null;
		},

		async getVersion(entity, entityId): Promise<number> {
			const stored = await getData(entity, entityId);
			return stored?.version ?? 0;
		},

		async getLatestPatch(entity, entityId): Promise<PatchOperation[] | null> {
			const stored = await getData(entity, entityId);
			if (!stored || stored.patches.length === 0) {
				return null;
			}
			const lastPatch = stored.patches[stored.patches.length - 1];
			return lastPatch ? lastPatch.patch : null;
		},

		async getPatchesSince(entity, entityId, sinceVersion): Promise<PatchOperation[][] | null> {
			const stored = await getData(entity, entityId);

			if (!stored) {
				return sinceVersion === 0 ? [] : null;
			}

			if (sinceVersion >= stored.version) {
				return [];
			}

			const relevantPatches = stored.patches.filter((p) => p.version > sinceVersion);

			if (relevantPatches.length === 0) {
				return null;
			}

			relevantPatches.sort((a, b) => a.version - b.version);

			const firstPatch = relevantPatches[0];
			if (!firstPatch || firstPatch.version !== sinceVersion + 1) {
				return null;
			}

			for (let i = 1; i < relevantPatches.length; i++) {
				const current = relevantPatches[i];
				const previous = relevantPatches[i - 1];
				if (!current || !previous || current.version !== previous.version + 1) {
					return null;
				}
			}

			return relevantPatches.map((p) => p.patch);
		},

		async has(entity, entityId): Promise<boolean> {
			const key = makeKey(entity, entityId);
			const count = await redis.exists(key);
			return count > 0;
		},

		async delete(entity, entityId): Promise<void> {
			const key = makeKey(entity, entityId);
			await redis.del(key);
		},

		async clear(): Promise<void> {
			const keys = await redis.keys(`${prefix}:*`);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		},

		async dispose(): Promise<void> {
			// No-op for HTTP-based Upstash storage.
			// There are no persistent connections to close.
		},
	};
}
