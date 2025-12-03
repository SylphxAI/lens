/**
 * @sylphx/lens-server - Storage
 *
 * Storage adapters for opLog plugin.
 *
 * Available adapters:
 * - `memoryStorage()` - In-memory (default, for long-running servers)
 * - `redisStorage()` - Redis via ioredis (for long-running servers)
 * - `upstashStorage()` - Upstash Redis HTTP (for serverless/edge)
 * - `vercelKVStorage()` - Vercel KV (for Next.js/Vercel)
 */

// In-memory (default)
export { memoryStorage } from "./memory.js";

// Redis (ioredis)
export { type RedisClient, type RedisStorageOptions, redisStorage } from "./redis.js";
// Types
export {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredEntityState,
	type StoredPatchEntry,
} from "./types.js";
// Upstash Redis (HTTP)
export {
	type UpstashRedisClient,
	type UpstashStorageOptions,
	upstashStorage,
} from "./upstash.js";
// Vercel KV
export {
	type VercelKVClient,
	type VercelKVStorageOptions,
	vercelKVStorage,
} from "./vercel-kv.js";
