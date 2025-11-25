/**
 * @lens/client - Shared Utilities
 *
 * Common infrastructure for key generation, batching, and deduplication.
 */

export { makeQueryKey, makeQueryKeyWithFields, parseQueryKey } from "./keys";

export {
	BatchScheduler,
	createBatchScheduler,
	type BatchProcessor,
	type BatchSchedulerOptions,
} from "./batching";

export {
	RequestDeduplicator,
	createDeduplicator,
	type KeyGenerator,
} from "./dedup";
