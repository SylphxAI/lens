/**
 * @sylphx/lens-core - Update Strategy Types
 *
 * Type definitions for update strategies.
 */

// =============================================================================
// Strategy Types
// =============================================================================

/** Update strategy names */
export type StrategyName = "value" | "delta" | "patch" | "array";

/** Base update interface */
export interface Update<S extends StrategyName = StrategyName, D = unknown> {
	strategy: S;
	data: D;
}

/** Value update - full replacement */
export interface ValueUpdate<T = unknown> extends Update<"value", T> {
	strategy: "value";
	data: T;
}

/** Delta update - character-level diff for strings */
export interface DeltaUpdate extends Update<"delta", DeltaOperation[]> {
	strategy: "delta";
	data: DeltaOperation[];
}

/** Delta operation (insert/delete at position) */
export interface DeltaOperation {
	/** Position in the string */
	position: number;
	/** Number of characters to delete */
	delete?: number;
	/** Text to insert */
	insert?: string;
}

/** Patch update - JSON Patch RFC 6902 */
export interface PatchUpdate extends Update<"patch", PatchOperation[]> {
	strategy: "patch";
	data: PatchOperation[];
}

/** JSON Patch operation */
export interface PatchOperation {
	op: "add" | "remove" | "replace" | "move" | "copy" | "test";
	path: string;
	value?: unknown;
	from?: string;
}

// =============================================================================
// Strategy Interface
// =============================================================================

/** Update strategy interface */
export interface UpdateStrategy<T = unknown> {
	name: StrategyName;

	/** Encode difference between prev and next */
	encode(prev: T, next: T): Update;

	/** Decode update and apply to current value */
	decode(current: T, update: Update): T;

	/** Estimate the size of the update in bytes */
	estimateSize(update: Update): number;
}
