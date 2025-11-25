/**
 * @lens/client - Shared Request Deduplication
 *
 * Prevents duplicate concurrent requests for the same key.
 */

// =============================================================================
// Types
// =============================================================================

/** Key generator function */
export type KeyGenerator<T> = (args: T) => string;

// =============================================================================
// RequestDeduplicator
// =============================================================================

/**
 * Deduplicates concurrent requests by key.
 *
 * When multiple callers request the same key concurrently,
 * only one request is made and the result is shared.
 *
 * @example
 * ```typescript
 * const dedup = new RequestDeduplicator<string, User>();
 *
 * // Both calls share the same request
 * const [user1, user2] = await Promise.all([
 *   dedup.dedupe("user:123", () => fetchUser("123")),
 *   dedup.dedupe("user:123", () => fetchUser("123")),
 * ]);
 * ```
 */
export class RequestDeduplicator<V> {
	private inFlight = new Map<string, Promise<V>>();

	/**
	 * Execute with deduplication
	 */
	async dedupe(key: string, factory: () => Promise<V>): Promise<V> {
		// Check for existing in-flight request
		const existing = this.inFlight.get(key);
		if (existing) {
			return existing;
		}

		// Create new request
		const promise = factory();
		this.inFlight.set(key, promise);

		try {
			const result = await promise;
			return result;
		} finally {
			this.inFlight.delete(key);
		}
	}

	/**
	 * Check if a request is in flight
	 */
	has(key: string): boolean {
		return this.inFlight.has(key);
	}

	/**
	 * Get in-flight request (if exists)
	 */
	get(key: string): Promise<V> | undefined {
		return this.inFlight.get(key);
	}

	/**
	 * Get number of in-flight requests
	 */
	get size(): number {
		return this.inFlight.size;
	}

	/**
	 * Clear all in-flight requests
	 */
	clear(): void {
		this.inFlight.clear();
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a request deduplicator
 */
export function createDeduplicator<V>(): RequestDeduplicator<V> {
	return new RequestDeduplicator<V>();
}
