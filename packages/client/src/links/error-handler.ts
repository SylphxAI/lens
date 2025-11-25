/**
 * @sylphx/client - Error Handler Link
 *
 * Centralized error handling and transformation.
 */

import type { Link, LinkFn, OperationContext } from "./types";

export interface ErrorHandlerLinkOptions {
	/** Handle error (logging, reporting, etc.) */
	onError?: (error: unknown, op: OperationContext) => void;
	/** Transform error before re-throwing */
	transformError?: (error: unknown, op: OperationContext) => unknown;
}

/**
 * Error handler link for centralized error handling.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     errorHandlerLink({
 *       onError: (error, op) => {
 *         Sentry.captureException(error, {
 *           tags: { operation: `${op.entity}.${op.op}` },
 *         });
 *       },
 *       transformError: (error) => {
 *         if (error instanceof NetworkError) {
 *           return new UserFriendlyError("Connection failed");
 *         }
 *         return error;
 *       },
 *     }),
 *     httpLink({ url }),
 *   ],
 * });
 * ```
 */
export function errorHandlerLink(options: ErrorHandlerLinkOptions = {}): Link {
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
