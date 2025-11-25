/**
 * @sylphx/client - Link Types
 *
 * Links are composable middleware for request/response processing.
 * Inspired by tRPC's link system.
 */

// =============================================================================
// Operation Types
// =============================================================================

/** Operation types */
export type OperationType = "query" | "mutation" | "subscription";

/** Operation context passed through link chain */
export interface OperationContext {
	/** Unique operation ID */
	id: string;
	/** Operation type */
	type: OperationType;
	/** Entity name */
	entity: string;
	/** Operation name (get, list, create, update, delete) */
	op: string;
	/** Operation input */
	input: unknown;
	/** Custom metadata (can be extended by links) */
	meta: Record<string, unknown>;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/** Operation result */
export interface OperationResult<T = unknown> {
	/** Result data */
	data?: T;
	/** Error if failed */
	error?: Error;
	/** Custom metadata from response */
	meta?: Record<string, unknown>;
}

// =============================================================================
// Link Types
// =============================================================================

/** Next function to call the next link in chain */
export type NextLink = (
	op: OperationContext,
) => Promise<OperationResult> | OperationResult;

/** Link function - processes operation and calls next */
export type LinkFn = (
	op: OperationContext,
	next: NextLink,
) => Promise<OperationResult> | OperationResult;

/** Link factory - creates a link function */
export type Link = () => LinkFn;

/** Terminal link - doesn't call next, actually executes the operation */
export type TerminalLink = (op: OperationContext) => Promise<OperationResult>;

// =============================================================================
// Observable Types (for subscriptions)
// =============================================================================

/** Observable for subscription results */
export interface Observable<T> {
	subscribe(observer: Observer<T>): Unsubscribable;
}

/** Observer for subscription */
export interface Observer<T> {
	next: (value: T) => void;
	error: (err: Error) => void;
	complete: () => void;
}

/** Unsubscribable handle */
export interface Unsubscribable {
	unsubscribe(): void;
}

// =============================================================================
// Link Chain
// =============================================================================

/**
 * Compose multiple links into a single link chain
 */
export function composeLinks(links: LinkFn[], terminal: TerminalLink): NextLink {
	// Build chain from right to left
	let chain: NextLink = terminal;

	for (let i = links.length - 1; i >= 0; i--) {
		const link = links[i];
		const next = chain;
		chain = (op) => link(op, next);
	}

	return chain;
}

/**
 * Create operation context
 */
export function createOperationContext(
	type: OperationType,
	entity: string,
	op: string,
	input: unknown,
	signal?: AbortSignal,
): OperationContext {
	return {
		id: `${type}-${entity}-${op}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		type,
		entity,
		op,
		input,
		meta: {},
		signal,
	};
}
