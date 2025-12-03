/**
 * @sylphx/lens-core - Array Update Strategy
 *
 * Efficient diff operations for arrays with identity tracking.
 */

import type { Update, ValueUpdate } from "./strategy-types.js";

// =============================================================================
// Array Diff Types
// =============================================================================

/**
 * Array diff operation types
 */
export type ArrayDiffOperation =
	| { op: "push"; item: unknown }
	| { op: "unshift"; item: unknown }
	| { op: "insert"; index: number; item: unknown }
	| { op: "remove"; index: number }
	| { op: "update"; index: number; item: unknown }
	| { op: "move"; from: number; to: number }
	| { op: "replace"; items: unknown[] };

/**
 * Array update with diff operations
 */
export interface ArrayUpdate extends Update<"array", ArrayDiffOperation[]> {
	strategy: "array";
	data: ArrayDiffOperation[];
}

// =============================================================================
// Array Diff Computation
// =============================================================================

/** Object with id field */
interface ObjectWithId {
	id: string;
	[key: string]: unknown;
}

/** Check if value is object with id */
function isObjectWithId(value: unknown): value is ObjectWithId {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof (value as { id: unknown }).id === "string"
	);
}

/** Deep equality check */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object" || a === null || b === null) return false;

	const aKeys = Object.keys(a as object);
	const bKeys = Object.keys(b as object);

	if (aKeys.length !== bKeys.length) return false;

	for (const key of aKeys) {
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false;
		}
	}

	return true;
}

/**
 * Compute optimal diff operations between two arrays.
 * Assumes arrays contain objects with 'id' fields for identity tracking.
 *
 * @param prev - Previous array state
 * @param next - New array state
 * @returns Array of operations to transform prev into next, or null if full replace is more efficient
 */
export function computeArrayDiff<T>(prev: T[], next: T[]): ArrayDiffOperation[] | null {
	// Empty array transitions
	if (prev.length === 0 && next.length === 0) return [];
	if (prev.length === 0) {
		// All items are new - just replace
		return [{ op: "replace", items: next }];
	}
	if (next.length === 0) {
		// All items removed - replace with empty
		return [{ op: "replace", items: [] }];
	}

	// Check if items have 'id' field for identity-based diffing
	const hasIds = isObjectWithId(prev[0]) && isObjectWithId(next[0]);

	if (!hasIds) {
		// For non-id arrays, use simple position-based diff
		return computePositionalDiff(prev, next);
	}

	// Identity-based diff for objects with 'id'
	return computeIdBasedDiff(prev as ObjectWithId[], next as ObjectWithId[]);
}

/**
 * Compute diff for arrays of objects with 'id' fields.
 * Tracks additions, removals, updates, and moves.
 */
function computeIdBasedDiff(
	prev: ObjectWithId[],
	next: ObjectWithId[],
): ArrayDiffOperation[] | null {
	const operations: ArrayDiffOperation[] = [];

	// Build ID maps
	const prevById = new Map(prev.map((item, index) => [item.id, { item, index }]));
	const nextById = new Map(next.map((item, index) => [item.id, { item, index }]));

	const prevIds = new Set(prev.map((item) => item.id));
	const nextIds = new Set(next.map((item) => item.id));

	// Find removed items (in prev but not in next)
	const removed: number[] = [];
	for (const id of prevIds) {
		if (!nextIds.has(id)) {
			removed.push(prevById.get(id)!.index);
		}
	}

	// Find added items (in next but not in prev)
	const added: { index: number; item: ObjectWithId }[] = [];
	for (const id of nextIds) {
		if (!prevIds.has(id)) {
			const entry = nextById.get(id)!;
			added.push({ index: entry.index, item: entry.item });
		}
	}

	// Find updated items (same id, different content)
	const updated: { index: number; item: ObjectWithId }[] = [];
	for (const id of nextIds) {
		if (prevIds.has(id)) {
			const prevItem = prevById.get(id)!.item;
			const nextEntry = nextById.get(id)!;
			if (!deepEqual(prevItem, nextEntry.item)) {
				updated.push({ index: nextEntry.index, item: nextEntry.item });
			}
		}
	}

	// Calculate if diff is more efficient than full replace
	const opCount = removed.length + added.length + updated.length;

	// For small number of operations, prefer diff (more meaningful for clients)
	// Only consider efficiency for larger change sets
	if (opCount > 5) {
		const diffSize =
			removed.length * 20 + // Remove ops ~20 bytes each
			added.length * (JSON.stringify(added[0]?.item ?? {}).length + 30) +
			updated.length * (JSON.stringify(updated[0]?.item ?? {}).length + 30);
		const replaceSize = JSON.stringify(next).length + 30;

		// If diff is larger than full replace, just replace
		if (diffSize > replaceSize) {
			return null;
		}
	}

	// Generate operations (order matters: remove first, then add/update)
	// Sort removals in descending order to maintain indices
	removed.sort((a, b) => b - a);
	for (const index of removed) {
		operations.push({ op: "remove", index });
	}

	// Sort additions by index
	added.sort((a, b) => a.index - b.index);
	for (const { index, item } of added) {
		if (index >= next.length - 1) {
			operations.push({ op: "push", item });
		} else {
			operations.push({ op: "insert", index, item });
		}
	}

	// Updates
	for (const { index, item } of updated) {
		operations.push({ op: "update", index, item });
	}

	return operations;
}

/**
 * Simple position-based diff for arrays without ids.
 * Falls back to replace for significant changes.
 */
function computePositionalDiff<T>(prev: T[], next: T[]): ArrayDiffOperation[] | null {
	// For now, use simple heuristics
	const lenDiff = next.length - prev.length;

	// If lengths are very different, replace
	if (Math.abs(lenDiff) > Math.max(prev.length, next.length) / 2) {
		return null;
	}

	// Check for append-only (common case)
	if (lenDiff > 0) {
		let isAppendOnly = true;
		for (let i = 0; i < prev.length; i++) {
			if (!deepEqual(prev[i], next[i])) {
				isAppendOnly = false;
				break;
			}
		}
		if (isAppendOnly) {
			const operations: ArrayDiffOperation[] = [];
			for (let i = prev.length; i < next.length; i++) {
				operations.push({ op: "push", item: next[i] });
			}
			return operations;
		}
	}

	// Check for prepend-only
	if (lenDiff > 0) {
		let isPrependOnly = true;
		for (let i = 0; i < prev.length; i++) {
			if (!deepEqual(prev[i], next[i + lenDiff])) {
				isPrependOnly = false;
				break;
			}
		}
		if (isPrependOnly) {
			const operations: ArrayDiffOperation[] = [];
			for (let i = lenDiff - 1; i >= 0; i--) {
				operations.push({ op: "unshift", item: next[i] });
			}
			return operations;
		}
	}

	// Check for remove from end
	if (lenDiff < 0) {
		let isRemoveFromEnd = true;
		for (let i = 0; i < next.length; i++) {
			if (!deepEqual(prev[i], next[i])) {
				isRemoveFromEnd = false;
				break;
			}
		}
		if (isRemoveFromEnd) {
			const operations: ArrayDiffOperation[] = [];
			for (let i = prev.length - 1; i >= next.length; i--) {
				operations.push({ op: "remove", index: i });
			}
			return operations;
		}
	}

	// Complex changes - fall back to replace
	return null;
}

// =============================================================================
// Array Diff Application
// =============================================================================

/**
 * Apply array diff operations to transform an array
 */
export function applyArrayDiff<T>(current: T[], operations: ArrayDiffOperation[]): T[] {
	let result = [...current];

	for (const op of operations) {
		switch (op.op) {
			case "push":
				result.push(op.item as T);
				break;
			case "unshift":
				result.unshift(op.item as T);
				break;
			case "insert":
				result.splice(op.index, 0, op.item as T);
				break;
			case "remove":
				result.splice(op.index, 1);
				break;
			case "update":
				result[op.index] = op.item as T;
				break;
			case "move": {
				const [item] = result.splice(op.from, 1);
				result.splice(op.to, 0, item);
				break;
			}
			case "replace":
				result = op.items as T[];
				break;
		}
	}

	return result;
}

/**
 * Create an array update with optimal diff
 */
export function createArrayUpdate<T>(prev: T[], next: T[]): ArrayUpdate | ValueUpdate<T[]> {
	const diff = computeArrayDiff(prev, next);

	if (diff === null || diff.length === 0) {
		// Full replace is more efficient or no changes
		return { strategy: "value", data: next };
	}

	// Check if single replace op
	if (diff.length === 1 && diff[0].op === "replace") {
		return { strategy: "value", data: next };
	}

	return { strategy: "array", data: diff };
}
