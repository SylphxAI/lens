/**
 * @sylphx/lens-client - Cache Link
 *
 * In-memory cache for query results.
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

export interface CacheLinkOptions {
	/** Time-to-live in ms (default: 5000) */
	ttl?: number;
	/** Maximum cache entries (default: 100) */
	maxSize?: number;
	/** Cache key generator */
	getCacheKey?: (op: OperationContext) => string;
	/** Which operations to cache (default: queries only) */
	shouldCache?: (op: OperationContext) => boolean;
}

interface CacheEntry {
	result: OperationResult;
	timestamp: number;
}

/**
 * Cache link - caches query results in memory
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     cacheLink({ ttl: 10000 }),
 *     httpLink({ url }),
 *   ],
 * });
 * ```
 */
export function cacheLink(options: CacheLinkOptions = {}): Link {
	const {
		ttl = 5000,
		maxSize = 100,
		getCacheKey = defaultCacheKey,
		shouldCache = (op) => op.type === "query",
	} = options;

	const cache = new Map<string, CacheEntry>();

	return (): LinkFn => {
		return async (op, next) => {
			// Only cache queries
			if (!shouldCache(op)) {
				// Mutations should invalidate related cache entries
				if (op.type === "mutation") {
					invalidateEntity(cache, op.entity);
				}
				return next(op);
			}

			const key = getCacheKey(op);
			const now = Date.now();

			// Check cache
			const cached = cache.get(key);
			if (cached && now - cached.timestamp < ttl) {
				return { ...cached.result, meta: { ...cached.result.meta, fromCache: true } };
			}

			// Execute and cache
			const result = await next(op);

			// Only cache successful results
			if (!result.error) {
				// Evict oldest entries if at max size
				if (cache.size >= maxSize) {
					const oldest = findOldestEntry(cache);
					if (oldest) cache.delete(oldest);
				}

				cache.set(key, { result, timestamp: now });
			}

			return result;
		};
	};
}

function defaultCacheKey(op: OperationContext): string {
	return `${op.entity}:${op.op}:${JSON.stringify(op.input)}`;
}

function invalidateEntity(cache: Map<string, CacheEntry>, entity: string): void {
	for (const key of cache.keys()) {
		if (key.startsWith(`${entity}:`)) {
			cache.delete(key);
		}
	}
}

function findOldestEntry(cache: Map<string, CacheEntry>): string | undefined {
	let oldest: string | undefined;
	let oldestTime = Number.POSITIVE_INFINITY;

	for (const [key, entry] of cache) {
		if (entry.timestamp < oldestTime) {
			oldest = key;
			oldestTime = entry.timestamp;
		}
	}

	return oldest;
}

/**
 * Create a shared cache instance that can be used across multiple links
 */
export function createCacheStore() {
	const cache = new Map<string, CacheEntry>();

	return {
		get: (key: string) => cache.get(key),
		set: (key: string, entry: CacheEntry) => cache.set(key, entry),
		delete: (key: string) => cache.delete(key),
		clear: () => cache.clear(),
		invalidateEntity: (entity: string) => invalidateEntity(cache, entity),
		size: () => cache.size,
	};
}
