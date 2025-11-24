/**
 * @lens/client - QueryResult
 *
 * Unified result object that is both Thenable (can await) and Subscribable (can subscribe).
 * Lazy execution - doesn't fetch until await or subscribe is called.
 */

import type { OperationContext, OperationResult, NextLink } from "../links/types";

// =============================================================================
// Types
// =============================================================================

/** Observer for subscription */
export interface Observer<T> {
	next: (value: T) => void;
	error: (error: Error) => void;
	complete: () => void;
}

/** Subscription handle */
export interface Subscription {
	unsubscribe(): void;
}

/** QueryResult - both Thenable and Subscribable */
export interface QueryResult<T> extends PromiseLike<T> {
	/**
	 * Subscribe to streaming updates
	 * Opens connection, receives all values until unsubscribe
	 */
	subscribe(observer: Observer<T> | ((value: T) => void)): Subscription;

	/**
	 * Refetch the query (invalidate cache and fetch fresh)
	 */
	refetch(): Promise<T>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a QueryResult
 *
 * **Design:**
 * - Lazy execution: doesn't fetch until await/subscribe
 * - Thenable: implements PromiseLike for await
 * - Subscribable: provides subscribe() for streaming
 * - Single source: same operation context shared between await/subscribe
 *
 * @example
 * ```typescript
 * const query = createQueryResult(op, executeLink)
 *
 * // Option 1: await (single value)
 * const user = await query
 *
 * // Option 2: subscribe (streaming)
 * query.subscribe(user => console.log(user))
 * ```
 */
export function createQueryResult<T>(
	operation: OperationContext,
	executeLink: NextLink,
): QueryResult<T> {
	// Lazy promise - only executes when awaited
	let promise: Promise<T> | null = null;

	const getPromise = (): Promise<T> => {
		if (!promise) {
			promise = executeOperation(operation, executeLink);
		}
		return promise;
	};

	const queryResult: QueryResult<T> = {
		// Thenable - for await
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null,
		): Promise<TResult1 | TResult2> {
			return getPromise().then(onfulfilled, onrejected);
		},

		// Subscribable - for streaming
		subscribe(observerOrNext: Observer<T> | ((value: T) => void)): Subscription {
			// Normalize observer
			const observer: Observer<T> =
				typeof observerOrNext === "function"
					? {
							next: observerOrNext,
							error: (err) => {
								throw err;
							},
							complete: () => {},
						}
					: observerOrNext;

			// Create subscription-specific operation
			const subOp: OperationContext = {
				...operation,
				type: "subscription", // Mark as subscription
			};

			// Track subscription state
			let active = true;
			const abortController = new AbortController();

			// Execute subscription
			executeSubscription(subOp, executeLink, observer, abortController.signal).catch((error) => {
				if (active) {
					observer.error(error);
				}
			});

			// Return subscription handle
			return {
				unsubscribe() {
					active = false;
					abortController.abort();
					observer.complete();
				},
			};
		},

		// Refetch
		async refetch(): Promise<T> {
			// Clear cached promise, force new fetch
			promise = null;
			return getPromise();
		},
	};

	return queryResult;
}

/**
 * Execute operation as Promise (for await)
 */
async function executeOperation<T>(op: OperationContext, executeLink: NextLink): Promise<T> {
	const result = await executeLink(op);

	if (result.error) {
		throw result.error;
	}

	return result.data as T;
}

/**
 * Execute operation as Observable (for subscribe)
 *
 * Note: Links decide how to handle subscriptions:
 * - httpLink with polling → polls at interval
 * - sseLink → opens SSE connection
 * - websocketLink → opens WebSocket
 */
async function executeSubscription<T>(
	op: OperationContext,
	executeLink: NextLink,
	observer: Observer<T>,
	signal: AbortSignal,
): Promise<void> {
	// For now, simple implementation: execute once
	// Links will handle streaming (SSE/WebSocket) or polling (HTTP)

	try {
		// Execute operation
		const result = await executeLink(op);

		// Check if aborted
		if (signal.aborted) {
			return;
		}

		// Handle result
		if (result.error) {
			observer.error(result.error);
		} else {
			observer.next(result.data as T);
			observer.complete();
		}
	} catch (error) {
		if (!signal.aborted) {
			observer.error(error as Error);
		}
	}
}
