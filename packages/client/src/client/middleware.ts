/**
 * @lens/client - Utility Links
 *
 * Non-terminal links for logging, retry, timing, and error handling.
 * These are middleware that call `next()` to pass to the next link.
 */

import type { Link, LinkFn, OperationContext } from "../links/types";

// =============================================================================
// Logger Link
// =============================================================================

export interface LoggerOptions {
	/** Enable/disable logging (default: true) */
	enabled?: boolean;
	/** Log prefix */
	prefix?: string;
	/** Custom logger */
	logger?: {
		log: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
	/** Log request details */
	logRequest?: boolean;
	/** Log response details */
	logResponse?: boolean;
}

/**
 * Logger link for debugging and devtools.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink({ enabled: process.env.NODE_ENV === "development" }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function loggerLink(options: LoggerOptions = {}): Link {
	const {
		enabled = true,
		prefix = "[Lens]",
		logger = console,
		logRequest = true,
		logResponse = true,
	} = options;

	return (): LinkFn => async (op, next) => {
		if (!enabled) {
			return next(op);
		}

		const startTime = Date.now();
		const requestId = op.id.slice(-8);

		if (logRequest) {
			logger.log(
				`${prefix} → ${op.type.toUpperCase()} ${op.entity}.${op.op}`,
				op.input !== undefined ? op.input : "",
				`[${requestId}]`,
			);
		}

		try {
			const result = await next(op);
			const duration = Date.now() - startTime;

			if (logResponse) {
				logger.log(
					`${prefix} ← ${op.type.toUpperCase()} ${op.entity}.${op.op}`,
					`${duration}ms`,
					result,
					`[${requestId}]`,
				);
			}

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error(
				`${prefix} ✗ ${op.type.toUpperCase()} ${op.entity}.${op.op}`,
				`${duration}ms`,
				error,
				`[${requestId}]`,
			);
			throw error;
		}
	};
}

/** @deprecated Use loggerLink instead */
export const loggerMiddleware = loggerLink;

// =============================================================================
// Retry Link
// =============================================================================

export interface RetryOptions {
	/** Maximum number of retries (default: 3) */
	maxRetries?: number;
	/** Base delay between retries in ms (default: 1000) */
	baseDelay?: number;
	/** Use exponential backoff (default: true) */
	exponentialBackoff?: boolean;
	/** Only retry these operation types (default: ["query"]) */
	retryOn?: ("query" | "mutation")[];
	/** Custom retry condition */
	shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Retry link for automatic retries on failure.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     retryLink({ maxRetries: 3 }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function retryLink(options: RetryOptions = {}): Link {
	const {
		maxRetries = 3,
		baseDelay = 1000,
		exponentialBackoff = true,
		retryOn = ["query"],
		shouldRetry = () => true,
	} = options;

	return (): LinkFn => async (op, next) => {
		// Only retry specified operation types
		if (!retryOn.includes(op.type as "query" | "mutation")) {
			return next(op);
		}

		let lastError: unknown;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await next(op);
			} catch (error) {
				lastError = error;

				// Check if we should retry
				if (attempt < maxRetries && shouldRetry(error, attempt)) {
					const delay = exponentialBackoff
						? baseDelay * Math.pow(2, attempt)
						: baseDelay;
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}

				throw error;
			}
		}

		throw lastError;
	};
}

/** @deprecated Use retryLink instead */
export const retryMiddleware = retryLink;

// =============================================================================
// Timing Link
// =============================================================================

export interface TimingOptions {
	/** Callback when operation completes */
	onTiming?: (op: OperationContext, durationMs: number) => void;
	/** Add timing to meta */
	addToMeta?: boolean;
}

/**
 * Timing link for performance monitoring.
 */
export function timingLink(options: TimingOptions = {}): Link {
	const { onTiming, addToMeta = true } = options;

	return (): LinkFn => async (op, next) => {
		const startTime = performance.now();

		try {
			const result = await next(op);
			const duration = performance.now() - startTime;

			if (addToMeta) {
				op.meta.duration = duration;
			}

			if (onTiming) {
				onTiming(op, duration);
			}

			return result;
		} catch (error) {
			const duration = performance.now() - startTime;

			if (addToMeta) {
				op.meta.duration = duration;
			}

			if (onTiming) {
				onTiming(op, duration);
			}

			throw error;
		}
	};
}

/** @deprecated Use timingLink instead */
export const timingMiddleware = timingLink;

// =============================================================================
// Error Handler Link
// =============================================================================

export interface ErrorHandlerOptions {
	/** Handle error */
	onError?: (error: unknown, op: OperationContext) => void;
	/** Transform error */
	transformError?: (error: unknown, op: OperationContext) => unknown;
}

/**
 * Error handler link for centralized error handling.
 */
export function errorHandlerLink(options: ErrorHandlerOptions = {}): Link {
	const { onError, transformError } = options;

	return (): LinkFn => async (op, next) => {
		try {
			return await next(op);
		} catch (error) {
			if (onError) {
				onError(error, op);
			}

			if (transformError) {
				throw transformError(error, op);
			}

			throw error;
		}
	};
}

/** @deprecated Use errorHandlerLink instead */
export const errorHandlerMiddleware = errorHandlerLink;
