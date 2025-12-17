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
 * Uses the new Message protocol format.
 */
export type Result<T = unknown> = import("@sylphx/lens-core").Message<T>;

// =============================================================================
// Connection State
// =============================================================================

/**
 * Connection state for transports that maintain persistent connections.
 * Used by WebSocket and SSE transports.
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

// =============================================================================
// Optimistic DSL Types
// =============================================================================

// Re-export from core for consistency
import type { OptimisticDSL as OptimisticDSLType } from "@sylphx/lens-core";

export type { OptimisticDSL } from "@sylphx/lens-core";

export { isOptimisticDSL } from "@sylphx/lens-core";

// =============================================================================
// Metadata Types
// =============================================================================

/**
 * Operation metadata from server handshake.
 */
export interface OperationMeta {
	/** Operation type */
	type: "query" | "mutation" | "subscription";
	/** Optimistic update strategy (for mutations) */
	optimistic?: OptimisticDSLType | unknown;
	/**
	 * Return entity type name (if operation returns an entity).
	 * Used for field-level subscription detection.
	 */
	returnType?: string;
	/**
	 * Indicates this is a live query (Publisher pattern with _subscriber).
	 * Client should use streaming transport even though type is "query".
	 */
	live?: boolean;
}

/**
 * Nested operations structure for handshake.
 * Supports nested namespaces like { user: { get: {...}, create: {...} } }
 */
export type OperationsMap = {
	[key: string]: OperationMeta | OperationsMap;
};

/** Field mode for entity fields */
export type FieldMode = "exposed" | "resolve" | "subscribe" | "live";

/** Entity field metadata for client-side routing decisions */
export interface EntityFieldMetadata {
	[fieldName: string]: FieldMode;
}

/** All entities field metadata */
export interface EntitiesMetadata {
	[entityName: string]: EntityFieldMetadata;
}

/**
 * Server metadata returned from handshake.
 */
export interface Metadata {
	/** Server version */
	version: string;
	/** Operation metadata map (can be nested for namespaced routers) */
	operations: OperationsMap;
	/**
	 * Entity field metadata for client-side transport routing.
	 * Client uses this to determine if any selected field requires streaming transport.
	 */
	entities?: EntitiesMetadata;
}

// =============================================================================
// Transport Capability Interfaces
// =============================================================================

/**
 * Base transport interface with connection capability.
 * All transports must implement this.
 */
export interface TransportBase {
	/**
	 * Connect to server and get operation metadata.
	 * Called once during client initialization.
	 *
	 * For route transport, this merges metadata from all child transports.
	 */
	connect(): Promise<Metadata>;

	/**
	 * Optional: Close the transport connection.
	 */
	close?(): void;
}

/**
 * Transport capability for query operations.
 */
export interface QueryCapable extends TransportBase {
	/**
	 * Execute a query operation.
	 * @param op - Operation with type: 'query'
	 * @returns Promise resolving to result
	 */
	query(op: Operation): Promise<Result>;
}

/**
 * Transport capability for mutation operations.
 */
export interface MutationCapable extends TransportBase {
	/**
	 * Execute a mutation operation.
	 * @param op - Operation with type: 'mutation'
	 * @returns Promise resolving to result
	 */
	mutation(op: Operation): Promise<Result>;
}

/**
 * Transport capability for subscription operations.
 */
export interface SubscriptionCapable extends TransportBase {
	/**
	 * Execute a subscription operation.
	 * @param op - Operation with type: 'subscription'
	 * @returns Observable for streaming results
	 */
	subscription(op: Operation): Observable<Result>;
}

// =============================================================================
// Transport Type Combinations
// =============================================================================

/**
 * Transport that supports query and mutation (no subscriptions).
 * Example: http()
 */
export type RequestTransport = QueryCapable & MutationCapable;

/**
 * Transport that only supports subscriptions.
 * Example: pusher(), ably()
 */
export type SubscriptionOnlyTransport = SubscriptionCapable;

/**
 * Full transport supporting all operation types.
 * Example: ws(), sse()
 */
export type FullTransport = QueryCapable & MutationCapable & SubscriptionCapable;

// =============================================================================
// Server Interface (for in-process transport)
// =============================================================================

/**
 * Minimal Lens server interface needed by transports.
 * Used for in-process transport and type inference.
 *
 * Server always returns Observable<Result>:
 * - One-shot (query/mutation): emits once, then completes
 * - Streaming (subscription): emits multiple times until unsubscribed
 */
export interface LensServerInterface {
	/** Get operation metadata */
	getMetadata(): Metadata;
	/** Execute an operation - always returns Observable */
	execute(op: Operation): Observable<Result>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if transport supports queries.
 */
export function isQueryCapable(t: TransportBase): t is QueryCapable {
	return "query" in t && typeof (t as QueryCapable).query === "function";
}

/**
 * Check if transport supports mutations.
 */
export function isMutationCapable(t: TransportBase): t is MutationCapable {
	return "mutation" in t && typeof (t as MutationCapable).mutation === "function";
}

/**
 * Check if transport supports subscriptions.
 */
export function isSubscriptionCapable(t: TransportBase): t is SubscriptionCapable {
	return "subscription" in t && typeof (t as SubscriptionCapable).subscription === "function";
}

// =============================================================================
// Subscription Detection Helpers
// =============================================================================

/** Selection object for field selection (matches server types) */
interface SelectionObject {
	[key: string]:
		| boolean
		| SelectionObject
		| { select: SelectionObject }
		| { input?: unknown; select?: SelectionObject };
}

/**
 * Check if any selected field (recursively) is a subscription.
 * Used by client to determine if streaming transport is needed.
 *
 * @param entities - Entity field metadata from server metadata
 * @param entityName - The entity type name to check
 * @param select - Selection object (if undefined, checks ALL fields)
 * @param visited - Set of visited entity names (prevents infinite recursion)
 * @returns true if any selected field is a subscription
 */
export function hasAnySubscription(
	entities: EntitiesMetadata | undefined,
	entityName: string,
	select?: SelectionObject,
	visited: Set<string> = new Set(),
): boolean {
	// No entities metadata - can't determine
	if (!entities) return false;

	// Prevent infinite recursion on circular references
	if (visited.has(entityName)) return false;
	visited.add(entityName);

	const entityMetadata = entities[entityName];
	if (!entityMetadata) return false;

	// Determine which fields to check
	const fieldsToCheck = select ? Object.keys(select) : Object.keys(entityMetadata);

	for (const fieldName of fieldsToCheck) {
		// Skip if field doesn't exist in entity metadata
		const fieldMode = entityMetadata[fieldName];
		if (!fieldMode) continue;

		// Check if this field is a subscription (either pure subscribe or live mode)
		if (fieldMode === "subscribe" || fieldMode === "live") {
			return true;
		}

		// Get nested selection for this field
		const fieldSelect = select?.[fieldName];
		const nestedSelect =
			typeof fieldSelect === "object" && fieldSelect !== null && "select" in fieldSelect
				? (fieldSelect as { select?: SelectionObject }).select
				: undefined;

		// For nested selections, recursively check all entities
		// (since we don't know the target entity type from field metadata alone)
		if (nestedSelect || (typeof fieldSelect === "object" && fieldSelect !== null)) {
			for (const targetEntityName of Object.keys(entities)) {
				if (targetEntityName === entityName) continue; // Skip self
				if (hasAnySubscription(entities, targetEntityName, nestedSelect, visited)) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Determine the effective operation type based on operation metadata and field selection.
 * Returns "subscription" if either:
 * 1. Operation is declared as subscription (async generator)
 * 2. Any selected field is a subscription field
 *
 * @param opType - Base operation type from metadata
 * @param entities - Entity field metadata from server
 * @param returnEntityName - Name of the entity type returned by operation
 * @param select - Selection object for the operation
 * @returns Effective operation type for routing
 */
export function getEffectiveOperationType(
	opType: "query" | "mutation" | "subscription",
	entities: EntitiesMetadata | undefined,
	returnEntityName: string | undefined,
	select?: SelectionObject,
): "query" | "mutation" | "subscription" {
	// Already a subscription - keep it
	if (opType === "subscription") return "subscription";

	// Mutations are always mutations
	if (opType === "mutation") return "mutation";

	// For queries, check if any selected field is a subscription
	if (opType === "query" && returnEntityName && entities) {
		if (hasAnySubscription(entities, returnEntityName, select)) {
			return "subscription";
		}
	}

	return opType;
}
