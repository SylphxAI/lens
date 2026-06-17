/**
 * @sylphx/lens-storage-redis
 *
 * Redis storage adapter for Lens opLog plugin using ioredis.
 * Best for long-running servers with persistent connections.
 *
 * Features:
 * - Persistent connection pooling
 * - Optimistic locking with retry on conflict
 * - Automatic patch eviction
 *
 * For serverless environments, use `@sylphx/lens-storage-upstash` or
 * `@sylphx/lens-storage-vercel-kv` instead.
 *
 * @example
 * ```typescript
 * import Redis from "ioredis";
 * import { redisStorage } from "@sylphx/lens-storage-redis";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: redisStorage({ redis }),
 *   })],
 * });
 * ```
 */

import { computeShallowPatch, type PatchOperation } from "@sylphx/lens-core";
import {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredPatchEntry,
} from "@sylphx/lens-server";

/**
 * Redis client interface.
 * Compatible with ioredis.
 */
export interface RedisClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	exists(...keys: string[]): Promise<number>;
	quit(): Promise<unknown>;
}

/**
 * Redis storage options.
 */
export interface RedisStorageOptions extends OpLogStorageConfig {
	/**
	 * Redis client instance (ioredis).
	 *
	 * @example
	 * ```typescript
	 * import Redis from "ioredis";
	 * const redis = new Redis(process.env.REDIS_URL);
	 * ```
	 */
	redis: RedisClient;

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
 * Create a Redis storage adapter.
 *
 * Requires `ioredis` as a peer dependency.
 *
 * Uses optimistic locking: if a concurrent write is detected,
 * the operation is retried up to `maxRetries` times.
 *
 * @example
 * ```typescript
 * import Redis from "ioredis";
 * import { redisStorage } from "@sylphx/lens-storage-redis";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: redisStorage({ redis }),
 *   })],
 * });
 * ```
 */
export function redisStorage(options: RedisStorageOptions): OpLogStorage {
	const { redis, prefix = "lens", stateTTL = 0 } = options;
	const cfg = { ...DEFAULT_STORAGE_CONFIG, ...options };

	function makeKey(entity: string, entityId: string): string {
		return `${prefix}:${entity}:${entityId}`;
	}

	async function getData(entity: string, entityId: string): Promise<StoredData | null> {
		const key = makeKey(entity, entityId);
		const raw = await redis.get(key);
		if (!raw) return null;

		try {
			return JSON.parse(raw) as StoredData;
		} catch {
			return null;
		}
	}

	async function setData(entity: string, entityId: string, data: StoredData): Promise<void> {
		const key = makeKey(entity, entityId);
		const value = JSON.stringify(data);

		if (stateTTL > 0) {
			await redis.set(key, value, "EX", stateTTL);
		} else {
			await redis.set(key, value);
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

		const oldHash = JSON.stringify(existing.data);
		const newHash = JSON.stringify(data);

		if (oldHash === newHash) {
			return {
				version: existing.version,
				patch: null,
				changed: false,
			};
		}

		const patch = computeShallowPatch(existing.data, data);
		const newVersion = expectedVersion + 1;

		let patches = [...existing.patches];
		if (patch.length > 0) {
			patches.push({
				version: newVersion,
				patch,
				timestamp: now,
			});
			patches = trimPatches(patches, now);
		}

		const newData: StoredData = {
			data: { ...data },
			version: newVersion,
			updatedAt: now,
			patches,
		};

		await setData(entity, entityId, newData);

		// Re-read to verify our write succeeded (optimistic check)
		const verify = await getData(entity, entityId);
		if (verify && verify.version !== newVersion) {
			// Version conflict
			if (retryCount < cfg.maxRetries) {
				const delay = Math.min(10 * 2 ** retryCount, 100);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return emitWithRetry(entity, entityId, data, retryCount + 1);
			}
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
			await redis.quit();
		},
	};
}
