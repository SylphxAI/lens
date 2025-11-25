/**
 * @lens/client - Shared Utilities
 *
 * Common infrastructure used by both V1 reactive layer and unified client.
 */

export {
	type EntityKey,
	makeEntityKey,
	parseEntityKey,
	makeQueryKey,
	makeQueryKeyWithFields,
	parseQueryKey,
} from "./keys";

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
