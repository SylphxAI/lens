/**
 * @sylphx/lens-client - Transport Types
 *
 * Core interfaces for the transport system.
 */

// =============================================================================
// Observable Types (for subscriptions)
// =============================================================================

/** Observable for subscription results */
export interface Observable<T> {
	subscribe(observer: Observer<T>): Unsubscribable;
}

/** Observer for subscription */
export interface Observer<T> {
	next?: (value: T) => void;
	error?: (err: Error) => void;
	complete?: () => void;
}

/** Unsubscribable handle */
export interface Unsubscribable {
	unsubscribe(): void;
}

// =============================================================================
// Operation Types
// =============================================================================

/**
 * Operation to be executed by transport.
 */
export interface Operation {
	/** Unique operation ID for tracking */
	id: string;
	/** Operation path (e.g., 'user.get', 'auth.login') */
	path: string;
	/** Operation type */
	type: "query" | "mutation" | "subscription";
	/** Operation input */
	input?: unknown;
	/** Metadata for plugins to attach data */
	meta?: Record<string, unknown>;
}

/**
 * Result from operation execution.
 */
export interface Result<T = unknown> {
	/** Success data */
	data?: T;
	/** Error if operation failed */
	error?: Error;
}

// =============================================================================
// Metadata Types
// =============================================================================

/**
 * Optimistic update DSL.
 */
export type OptimisticDSL =
	| "merge"
	| "create"
	| "delete"
	| { merge: Record<string, unknown> }
	| { create: Record<string, unknown> }
	| { delete: true };

/**
 * Operation metadata from server handshake.
 */
export interface OperationMeta {
	/** Operation type */
	type: "query" | "mutation" | "subscription";
	/** Optimistic update strategy (for mutations) */
	optimistic?: OptimisticDSL;
}

/**
 * Server metadata returned from handshake.
 */
export interface Metadata {
	/** Server version */
	version: string;
	/** Operation metadata map */
	operations: Record<string, OperationMeta>;
}

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Transport handles communication with server.
 *
 * Each transport is responsible for:
 * - Connecting to server and getting metadata (handshake)
 * - Executing operations
 * - Handling all operation types (query, mutation, subscription)
 *
 * @example
 * ```typescript
 * const httpTransport = http({ url: '/api' })
 * const metadata = await httpTransport.connect()
 * const result = await httpTransport.execute({ path: 'user.get', input: { id: '1' } })
 * ```
 */
export interface Transport {
	/**
	 * Connect to server and get operation metadata.
	 * Called once during client initialization.
	 *
	 * For route transport, this merges metadata from all child transports.
	 */
	connect(): Promise<Metadata>;

	/**
	 * Execute an operation.
	 *
	 * Returns Promise for query/mutation, Observable for subscription.
	 * Each transport handles all operation types internally:
	 * - HTTP uses polling for subscriptions
	 * - WebSocket uses native streaming
	 * - SSE uses EventSource
	 */
	execute(op: Operation): Promise<Result> | Observable<Result>;
}
