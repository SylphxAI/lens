/**
 * @sylphx/lens-storage-vercel-kv
 *
 * Vercel KV storage adapter for Lens opLog plugin.
 * Designed for Next.js and Vercel serverless functions.
 *
 * Features:
 * - HTTP-based (no persistent connections)
 * - Optimistic locking with retry on conflict
 * - Automatic patch eviction
 *
 * @example
 * ```typescript
 * import { kv } from "@vercel/kv";
 * import { vercelKVStorage } from "@sylphx/lens-storage-vercel-kv";
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: vercelKVStorage({ kv }),
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
 * Vercel KV client interface.
 * Compatible with @vercel/kv.
 */
export interface VercelKVClient {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	exists(...keys: string[]): Promise<number>;
}

/**
 * Vercel KV storage options.
 */
export interface VercelKVStorageOptions extends OpLogStorageConfig {
	/**
	 * Vercel KV client instance.
	 *
	 * @example
	 * ```typescript
	 * import { kv } from "@vercel/kv";
	 * // or
	 * import { createClient } from "@vercel/kv";
	 * const kv = createClient({ url, token });
	 * ```
	 */
	kv: VercelKVClient;

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
 * Create a Vercel KV storage adapter.
 *
 * Requires `@vercel/kv` as a peer dependency.
 *
 * Uses optimistic locking: if a concurrent write is detected,
 * the operation is retried up to `maxRetries` times.
 *
 * @example
 * ```typescript
 * import { kv } from "@vercel/kv";
 * import { vercelKVStorage } from "@sylphx/lens-storage-vercel-kv";
 *
 * const app = createApp({
 *   router,
 *   plugins: [opLog({
 *     storage: vercelKVStorage({ kv }),
 *   })],
 * });
 * ```
 */
export function vercelKVStorage(options: VercelKVStorageOptions): OpLogStorage {
	const { kv, prefix = "lens", stateTTL = 0 } = options;
	const cfg = { ...DEFAULT_STORAGE_CONFIG, ...options };

	function makeKey(entity: string, entityId: string): string {
		return `${prefix}:${entity}:${entityId}`;
	}

	async function getData(entity: string, entityId: string): Promise<StoredData | null> {
		const key = makeKey(entity, entityId);
		const data = await kv.get<StoredData>(key);
		return data;
	}

	async function setData(entity: string, entityId: string, data: StoredData): Promise<void> {
		const key = makeKey(entity, entityId);
		if (stateTTL > 0) {
			await kv.set(key, data, { ex: stateTTL });
		} else {
			await kv.set(key, data);
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

		const patch = computePatch(existing.data, data);
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
				await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
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
			const count = await kv.exists(key);
			return count > 0;
		},

		async delete(entity, entityId): Promise<void> {
			const key = makeKey(entity, entityId);
			await kv.del(key);
		},

		async clear(): Promise<void> {
			const keys = await kv.keys(`${prefix}:*`);
			if (keys.length > 0) {
				await kv.del(...keys);
			}
		},
	};
}
