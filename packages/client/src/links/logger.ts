/**
 * @sylphx/lens-client - Logger Link
 *
 * Logs all operations for debugging.
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

export interface LoggerLinkOptions {
	/** Log function (defaults to console.log) */
	log?: (message: string, data?: unknown) => void;
	/** Log errors (defaults to console.error) */
	logError?: (message: string, error?: unknown) => void;
	/** Enable/disable logging */
	enabled?: boolean | (() => boolean);
	/** Custom formatter */
	formatter?: (op: OperationContext, result?: OperationResult, duration?: number) => string;
}

/**
 * Logger link - logs all operations
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink({ enabled: process.env.NODE_ENV === "development" }),
 *     httpLink({ url }),
 *   ],
 * });
 * ```
 */
export function loggerLink(options: LoggerLinkOptions = {}): Link {
	const { log = console.log, logError = console.error, enabled = true, formatter } = options;

	return (): LinkFn => {
		return async (op, next) => {
			const isEnabled = typeof enabled === "function" ? enabled() : enabled;

			if (!isEnabled) {
				return next(op);
			}

			const start = Date.now();
			const prefix = `[Lens] ${op.type}:${op.entity}.${op.op}`;

			log(`${prefix} → started`, { id: op.id, input: op.input });

			try {
				const result = await next(op);
				const duration = Date.now() - start;

				if (result.error) {
					const message = formatter
						? formatter(op, result, duration)
						: `${prefix} ✗ failed (${duration}ms)`;
					logError(message, result.error);
				} else {
					const message = formatter
						? formatter(op, result, duration)
						: `${prefix} ✓ completed (${duration}ms)`;
					log(message, { data: result.data });
				}

				return result;
			} catch (error) {
				const duration = Date.now() - start;
				const message = formatter
					? formatter(op, { error: error as Error }, duration)
					: `${prefix} ✗ error (${duration}ms)`;
				logError(message, error);
				throw error;
			}
		};
	};
}
