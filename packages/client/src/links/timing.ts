/**
 * @lens/client - Timing Link
 *
 * Performance monitoring link for measuring operation duration.
 */

import type { Link, LinkFn, OperationContext } from "./types";

export interface TimingLinkOptions {
	/** Callback when operation completes */
	onTiming?: (op: OperationContext, durationMs: number) => void;
	/** Add timing to meta (default: true) */
	addToMeta?: boolean;
}

/**
 * Timing link for performance monitoring.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     timingLink({
 *       onTiming: (op, duration) => {
 *         metrics.record(`${op.entity}.${op.op}`, duration);
 *       },
 *     }),
 *     httpLink({ url }),
 *   ],
 * });
 * ```
 */
export function timingLink(options: TimingLinkOptions = {}): Link {
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
