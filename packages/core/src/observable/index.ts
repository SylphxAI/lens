/**
 * @sylphx/lens-core - Observable Types
 *
 * Minimal Observable interface for streaming operations.
 * Compatible with RxJS and other Observable implementations.
 */

// =============================================================================
// Observable Types
// =============================================================================

/**
 * Observer for receiving streamed values.
 */
export interface Observer<T> {
	/** Called for each emitted value */
	next?: (value: T) => void;
	/** Called when an error occurs (terminates stream) */
	error?: (err: Error) => void;
	/** Called when stream completes successfully */
	complete?: () => void;
}

/**
 * Handle for unsubscribing from an Observable.
 */
export interface Unsubscribable {
	/** Stop receiving values and clean up resources */
	unsubscribe(): void;
}

/**
 * Observable represents a stream of values over time.
 *
 * Can emit:
 * - Zero or more values via next()
 * - An error via error() (terminates stream)
 * - Completion via complete() (terminates stream)
 *
 * @example
 * ```typescript
 * // One-shot (like Promise)
 * const oneShot: Observable<Result> = {
 *   subscribe(observer) {
 *     getData().then(data => {
 *       observer.next?.({ data });
 *       observer.complete?.();
 *     });
 *     return { unsubscribe: () => {} };
 *   }
 * };
 *
 * // Streaming (multiple values)
 * const streaming: Observable<Result> = {
 *   subscribe(observer) {
 *     const interval = setInterval(() => {
 *       observer.next?.({ data: Date.now() });
 *     }, 1000);
 *     return { unsubscribe: () => clearInterval(interval) };
 *   }
 * };
 * ```
 */
export interface Observable<T> {
	subscribe(observer: Observer<T>): Unsubscribable;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a value is an Observable.
 */
export function isObservable<T>(value: unknown): value is Observable<T> {
	return (
		value != null &&
		typeof value === "object" &&
		"subscribe" in value &&
		typeof (value as Observable<T>).subscribe === "function"
	);
}

/**
 * Convert Observable to Promise, taking only the first value.
 *
 * @throws Error if Observable completes without emitting
 * @throws Error from Observable's error callback
 */
export function firstValueFrom<T>(observable: Observable<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		let subscription: Unsubscribable | undefined;

		subscription = observable.subscribe({
			next: (value) => {
				if (!resolved) {
					resolved = true;
					subscription?.unsubscribe();
					resolve(value);
				}
			},
			error: (err) => {
				if (!resolved) {
					resolved = true;
					reject(err);
				}
			},
			complete: () => {
				if (!resolved) {
					resolved = true;
					reject(new Error("Observable completed without emitting a value"));
				}
			},
		});

		// If already resolved synchronously, unsubscribe immediately
		if (resolved && subscription) {
			subscription.unsubscribe();
		}
	});
}

/**
 * Create an Observable that emits a single value and completes.
 */
export function of<T>(value: T): Observable<T> {
	return {
		subscribe(observer) {
			observer.next?.(value);
			observer.complete?.();
			return { unsubscribe: () => {} };
		},
	};
}

/**
 * Create an Observable that immediately errors.
 */
export function throwError(error: Error): Observable<never> {
	return {
		subscribe(observer) {
			observer.error?.(error);
			return { unsubscribe: () => {} };
		},
	};
}

/**
 * Create an Observable from an AsyncIterable.
 */
export function fromAsyncIterable<T>(iterable: AsyncIterable<T>): Observable<T> {
	return {
		subscribe(observer) {
			let cancelled = false;

			(async () => {
				try {
					for await (const value of iterable) {
						if (cancelled) break;
						observer.next?.(value);
					}
					if (!cancelled) {
						observer.complete?.();
					}
				} catch (err) {
					if (!cancelled) {
						observer.error?.(err instanceof Error ? err : new Error(String(err)));
					}
				}
			})();

			return {
				unsubscribe: () => {
					cancelled = true;
				},
			};
		},
	};
}

/**
 * Create an Observable from a Promise.
 */
export function fromPromise<T>(promise: Promise<T>): Observable<T> {
	return {
		subscribe(observer) {
			let cancelled = false;

			promise
				.then((value) => {
					if (!cancelled) {
						observer.next?.(value);
						observer.complete?.();
					}
				})
				.catch((err) => {
					if (!cancelled) {
						observer.error?.(err instanceof Error ? err : new Error(String(err)));
					}
				});

			return {
				unsubscribe: () => {
					cancelled = true;
				},
			};
		},
	};
}
