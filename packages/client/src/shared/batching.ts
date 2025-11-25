/**
 * @lens/client - Shared Batching Utilities
 *
 * Unified batching infrastructure with configurable delay.
 */

// =============================================================================
// Types
// =============================================================================

/** Batch processor function */
export type BatchProcessor<T> = (items: T[]) => void | Promise<void>;

/** Batch scheduler options */
export interface BatchSchedulerOptions {
	/** Delay before processing batch (default: 10ms) */
	delay?: number;
	/** Maximum batch size before auto-flush (default: unlimited) */
	maxSize?: number;
}

// =============================================================================
// BatchScheduler
// =============================================================================

/**
 * Batches items and processes them after a delay.
 *
 * Used for:
 * - Subscription field change batching
 * - Query request batching
 *
 * @example
 * ```typescript
 * const scheduler = new BatchScheduler<FieldChange>(
 *   (items) => transport.sendFieldChanges(items),
 *   { delay: 10 }
 * );
 *
 * scheduler.add({ field: "name", action: "subscribe" });
 * scheduler.add({ field: "email", action: "subscribe" });
 * // After 10ms, processes both together
 * ```
 */
export class BatchScheduler<T> {
	private items: T[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly delay: number;
	private readonly maxSize: number;
	private readonly processor: BatchProcessor<T>;

	constructor(processor: BatchProcessor<T>, options: BatchSchedulerOptions = {}) {
		this.processor = processor;
		this.delay = options.delay ?? 10;
		this.maxSize = options.maxSize ?? Infinity;
	}

	/**
	 * Add item to batch
	 */
	add(item: T): void {
		this.items.push(item);

		// Auto-flush if max size reached
		if (this.items.length >= this.maxSize) {
			this.flush();
			return;
		}

		this.scheduleFlush();
	}

	/**
	 * Add multiple items to batch
	 */
	addMany(items: T[]): void {
		this.items.push(...items);

		if (this.items.length >= this.maxSize) {
			this.flush();
			return;
		}

		this.scheduleFlush();
	}

	/**
	 * Immediately flush the batch
	 */
	flush(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if (this.items.length === 0) return;

		const batch = this.items;
		this.items = [];

		this.processor(batch);
	}

	/**
	 * Cancel pending batch without processing
	 */
	cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.items = [];
	}

	/**
	 * Get number of pending items
	 */
	get pending(): number {
		return this.items.length;
	}

	/**
	 * Check if batch is scheduled
	 */
	get scheduled(): boolean {
		return this.timer !== null;
	}

	private scheduleFlush(): void {
		if (this.timer) return;

		this.timer = setTimeout(() => {
			this.timer = null;
			this.flush();
		}, this.delay);
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a batch scheduler
 */
export function createBatchScheduler<T>(
	processor: BatchProcessor<T>,
	options?: BatchSchedulerOptions,
): BatchScheduler<T> {
	return new BatchScheduler(processor, options);
}
