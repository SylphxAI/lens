/**
 * @sylphx/client - Retry Link
 *
 * Automatically retries failed operations.
 */

import type { Link, LinkFn, OperationContext } from "./types";

export interface RetryLinkOptions {
	/** Maximum number of retries (default: 3) */
	maxRetries?: number;
	/** Initial delay in ms (default: 1000) */
	initialDelay?: number;
	/** Maximum delay in ms (default: 30000) */
	maxDelay?: number;
	/** Exponential backoff factor (default: 2) */
	factor?: number;
	/** Which operations to retry (default: queries only) */
	retryOn?: (op: OperationContext, error: Error, attempt: number) => boolean;
	/** Callback when retrying */
	onRetry?: (op: OperationContext, error: Error, attempt: number) => void;
}

/**
 * Retry link - retries failed operations with exponential backoff
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     retryLink({ maxRetries: 3, initialDelay: 1000 }),
 *     httpLink({ url }),
 *   ],
 * });
 * ```
 */
export function retryLink(options: RetryLinkOptions = {}): Link {
	const {
		maxRetries = 3,
		initialDelay = 1000,
		maxDelay = 30000,
		factor = 2,
		retryOn = (op) => op.type === "query", // Only retry queries by default
		onRetry,
	} = options;

	return (): LinkFn => {
		return async (op, next) => {
			let attempt = 0;
			let lastError: Error | undefined;

			while (attempt <= maxRetries) {
				try {
					const result = await next(op);

					// If result has error, treat as retriable
					if (result.error && attempt < maxRetries && retryOn(op, result.error, attempt)) {
						lastError = result.error;
						attempt++;
						onRetry?.(op, result.error, attempt);

						const delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
						await sleep(delay);
						continue;
					}

					return result;
				} catch (error) {
					lastError = error as Error;

					if (attempt < maxRetries && retryOn(op, lastError, attempt)) {
						attempt++;
						onRetry?.(op, lastError, attempt);

						const delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
						await sleep(delay);
						continue;
					}

					throw error;
				}
			}

			// Should not reach here, but just in case
			return { error: lastError };
		};
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
