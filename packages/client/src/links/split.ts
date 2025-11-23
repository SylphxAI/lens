/**
 * @lens/client - Split Link
 *
 * Conditionally route operations to different links.
 */

import type { Link, LinkFn, OperationContext } from "./types";

export interface SplitLinkOptions {
	/** Condition to determine which link to use */
	condition: (op: OperationContext) => boolean;
	/** Link to use when condition is true */
	true: Link;
	/** Link to use when condition is false */
	false: Link;
}

/**
 * Split link - route operations conditionally
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     splitLink({
 *       // Use WebSocket for subscriptions, HTTP for everything else
 *       condition: (op) => op.type === "subscription",
 *       true: wsLink({ url: "ws://localhost:3000" }),
 *       false: httpLink({ url: "http://localhost:3000" }),
 *     }),
 *   ],
 * });
 * ```
 */
export function splitLink(options: SplitLinkOptions): Link {
	const { condition, true: trueLink, false: falseLink } = options;

	// Initialize both links
	const trueLinkFn = trueLink();
	const falseLinkFn = falseLink();

	return (): LinkFn => {
		return (op, next) => {
			if (condition(op)) {
				return trueLinkFn(op, next);
			}
			return falseLinkFn(op, next);
		};
	};
}

/**
 * Create a split based on operation type
 */
export function splitByType(options: {
	query?: Link;
	mutation?: Link;
	subscription?: Link;
	default: Link;
}): Link {
	const queryLink = options.query?.() ?? options.default();
	const mutationLink = options.mutation?.() ?? options.default();
	const subscriptionLink = options.subscription?.() ?? options.default();

	return (): LinkFn => {
		return (op, next) => {
			switch (op.type) {
				case "query":
					return queryLink(op, next);
				case "mutation":
					return mutationLink(op, next);
				case "subscription":
					return subscriptionLink(op, next);
				default:
					return options.default()(op, next);
			}
		};
	};
}
