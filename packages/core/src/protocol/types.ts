/**
 * @sylphx/lens-core - Wire Protocol Types
 *
 * Clean, unambiguous protocol for server-client communication.
 * Uses discriminated unions with short keys for minimal wire size.
 *
 * Design principles:
 * - Single message type with clear discrimination
 * - No optional field ambiguity
 * - Path-based addressing for all operations
 * - Batching built into the design
 */

import type { DeltaOperation, PatchOperation } from "../updates/strategies.js";

// =============================================================================
// Message Type - Server → Client
// =============================================================================

/**
 * Server message - exactly ONE kind per emission.
 * No ambiguity, no optional field mixing.
 *
 * @example
 * ```typescript
 * // Initial data
 * { $: "snapshot", data: { id: "1", name: "Alice" } }
 *
 * // Incremental update
 * { $: "ops", ops: [{ o: "set", p: "name", v: "Bob" }] }
 *
 * // Error
 * { $: "error", error: "Not found", code: "NOT_FOUND" }
 * ```
 */
export type Message<T = unknown> =
	| { $: "snapshot"; data: T }
	| { $: "ops"; ops: Op[] }
	| { $: "error"; error: string; code?: string };

// =============================================================================
// Operation Types - Incremental Updates
// =============================================================================

/**
 * Operation type - all incremental updates.
 * Uses short keys for minimal wire size.
 *
 * Key mapping:
 * - o: operation type
 * - p: path (dot notation)
 * - v: value
 * - d: delta operations
 * - i: index
 * - dc: delete count
 * - id: item id (for by-id operations)
 */
export type Op =
	// Value operations
	| { o: "set"; p: string; v: unknown } // Set value at path
	| { o: "del"; p: string } // Delete at path
	| { o: "merge"; p: string; v: Record<string, unknown> } // Merge at path

	// String delta operations (OT-style)
	| { o: "delta"; p: string; d: DeltaOperation[] }

	// JSON Patch operations
	| { o: "patch"; p: string; d: PatchOperation[] }

	// Array operations
	| { o: "push"; p: string; v: unknown[] } // Append items
	| { o: "unshift"; p: string; v: unknown[] } // Prepend items
	| { o: "splice"; p: string; i: number; dc: number; v?: unknown[] } // Splice
	| { o: "arrSet"; p: string; i: number; v: unknown } // Set at index
	| { o: "arrDel"; p: string; i: number } // Delete at index
	| { o: "arrSetId"; p: string; id: string; v: unknown } // Set by id
	| { o: "arrDelId"; p: string; id: string } // Delete by id
	| { o: "arrMerge"; p: string; i: number; v: Record<string, unknown> } // Merge at index
	| { o: "arrMergeId"; p: string; id: string; v: Record<string, unknown> }; // Merge by id

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if message is a snapshot
 */
export function isSnapshot<T>(msg: Message<T>): msg is { $: "snapshot"; data: T } {
	return msg.$ === "snapshot";
}

/**
 * Check if message is an ops message
 */
export function isOps(msg: Message): msg is { $: "ops"; ops: Op[] } {
	return msg.$ === "ops";
}

/**
 * Check if message is an error
 */
export function isError(msg: Message): msg is { $: "error"; error: string; code?: string } {
	return msg.$ === "error";
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract data type from Message
 */
export type MessageData<M> = M extends Message<infer T> ? T : never;

/**
 * Observable that emits Messages
 */
export interface MessageObservable<T = unknown> {
	subscribe(observer: MessageObserver<T>): { unsubscribe(): void };
}

/**
 * Observer for Message streams
 */
export interface MessageObserver<T = unknown> {
	next?: (message: Message<T>) => void;
	error?: (error: Error) => void;
	complete?: () => void;
}
