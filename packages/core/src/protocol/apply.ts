/**
 * @sylphx/lens-core - Apply Protocol Operations
 *
 * Pure functions to apply Op[] to state.
 * No side effects, immutable transformations.
 */

import { applyUpdate } from "../updates/strategies.js";
import type { Op } from "./types.js";

// =============================================================================
// Apply Operations
// =============================================================================

/**
 * Apply an array of operations to state, returning new state.
 * Immutable - always returns a new object.
 *
 * @example
 * ```typescript
 * const state = { user: { name: "Alice", age: 30 } };
 * const ops: Op[] = [
 *   { o: "set", p: "user.name", v: "Bob" },
 *   { o: "set", p: "user.age", v: 31 }
 * ];
 * const newState = applyOps(state, ops);
 * // { user: { name: "Bob", age: 31 } }
 * ```
 */
export function applyOps<T>(state: T, ops: Op[]): T {
	let result = state;
	for (const op of ops) {
		result = applyOp(result, op);
	}
	return result;
}

/**
 * Apply a single operation to state
 */
export function applyOp<T>(state: T, op: Op): T {
	switch (op.o) {
		// Value operations
		case "set":
			return setAtPath(state, op.p, op.v);
		case "del":
			return deleteAtPath(state, op.p);
		case "merge":
			return mergeAtPath(state, op.p, op.v);

		// String delta operations
		case "delta": {
			const current = getAtPath(state, op.p) as string;
			const updated = applyUpdate(current, { strategy: "delta", data: op.d });
			return setAtPath(state, op.p, updated);
		}

		// JSON Patch operations
		case "patch": {
			const current = getAtPath(state, op.p) as object;
			const updated = applyUpdate(current, { strategy: "patch", data: op.d });
			return setAtPath(state, op.p, updated);
		}

		// Array operations
		case "push":
			return arrayPush(state, op.p, op.v);
		case "unshift":
			return arrayUnshift(state, op.p, op.v);
		case "splice":
			return arraySplice(state, op.p, op.i, op.dc, op.v);
		case "arrSet":
			return arraySetAt(state, op.p, op.i, op.v);
		case "arrDel":
			return arrayDeleteAt(state, op.p, op.i);
		case "arrSetId":
			return arraySetById(state, op.p, op.id, op.v);
		case "arrDelId":
			return arrayDeleteById(state, op.p, op.id);
		case "arrMerge":
			return arrayMergeAt(state, op.p, op.i, op.v);
		case "arrMergeId":
			return arrayMergeById(state, op.p, op.id, op.v);

		default:
			// Unknown operation - return unchanged
			return state;
	}
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Parse dot-notation path into segments
 * Handles array indices: "users.0.name" -> ["users", "0", "name"]
 */
function parsePath(path: string): string[] {
	if (!path) return [];
	return path.split(".");
}

/**
 * Get value at path
 */
function getAtPath(state: unknown, path: string): unknown {
	const segments = parsePath(path);
	let current = state;
	for (const segment of segments) {
		if (current === null || current === undefined) return undefined;
		if (typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Set value at path (immutable)
 */
function setAtPath<T>(state: T, path: string, value: unknown): T {
	const segments = parsePath(path);
	if (segments.length === 0) return value as T;

	return updateAtPath(state, segments, () => value);
}

/**
 * Delete value at path (immutable)
 */
function deleteAtPath<T>(state: T, path: string): T {
	const segments = parsePath(path);
	if (segments.length === 0) return undefined as T;

	const parentPath = segments.slice(0, -1);
	const key = segments[segments.length - 1];

	return updateAtPath(state, parentPath, (parent) => {
		if (parent === null || parent === undefined) return parent;
		if (Array.isArray(parent)) {
			const idx = parseInt(key, 10);
			const result = [...parent];
			result.splice(idx, 1);
			return result;
		}
		if (typeof parent === "object") {
			const { [key]: _, ...rest } = parent as Record<string, unknown>;
			return rest;
		}
		return parent;
	});
}

/**
 * Merge object at path (immutable)
 */
function mergeAtPath<T>(state: T, path: string, value: Record<string, unknown>): T {
	const segments = parsePath(path);

	return updateAtPath(state, segments, (current) => {
		if (current === null || current === undefined) return value;
		if (typeof current !== "object" || Array.isArray(current)) return value;
		return { ...current, ...value };
	});
}

/**
 * Update value at path with transform function (immutable)
 */
function updateAtPath<T>(state: T, segments: string[], transform: (value: unknown) => unknown): T {
	if (segments.length === 0) {
		return transform(state) as T;
	}

	const [head, ...tail] = segments;

	// Handle null/undefined state
	if (state === null || state === undefined) {
		const isArrayIndex = /^\d+$/.test(head);
		const newState = isArrayIndex ? [] : {};
		return updateAtPath(newState as T, segments, transform);
	}

	// Clone and recurse
	if (Array.isArray(state)) {
		const result = [...state];
		const idx = parseInt(head, 10);
		result[idx] = updateAtPath(result[idx], tail, transform);
		return result as T;
	}

	if (typeof state === "object") {
		const obj = state as Record<string, unknown>;
		return {
			...obj,
			[head]: updateAtPath(obj[head], tail, transform),
		} as T;
	}

	// Primitive at non-leaf path - create object
	return { [head]: updateAtPath(undefined, tail, transform) } as T;
}

// =============================================================================
// Array Operations
// =============================================================================

/**
 * Push items to array at path
 */
function arrayPush<T>(state: T, path: string, items: unknown[]): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return items;
		return [...arr, ...items];
	});
}

/**
 * Unshift items to array at path
 */
function arrayUnshift<T>(state: T, path: string, items: unknown[]): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return items;
		return [...items, ...arr];
	});
}

/**
 * Splice array at path
 */
function arraySplice<T>(
	state: T,
	path: string,
	index: number,
	deleteCount: number,
	items?: unknown[],
): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return items ?? [];
		const result = [...arr];
		if (items) {
			result.splice(index, deleteCount, ...items);
		} else {
			result.splice(index, deleteCount);
		}
		return result;
	});
}

/**
 * Set item at array index
 */
function arraySetAt<T>(state: T, path: string, index: number, value: unknown): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) {
			const result: unknown[] = [];
			result[index] = value;
			return result;
		}
		const result = [...arr];
		result[index] = value;
		return result;
	});
}

/**
 * Delete item at array index
 */
function arrayDeleteAt<T>(state: T, path: string, index: number): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return [];
		const result = [...arr];
		result.splice(index, 1);
		return result;
	});
}

/**
 * Set item in array by id
 */
function arraySetById<T>(state: T, path: string, id: string, value: unknown): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return [value];
		const index = arr.findIndex(
			(item) => item && typeof item === "object" && (item as { id?: string }).id === id,
		);
		if (index === -1) {
			// Not found - append
			return [...arr, value];
		}
		const result = [...arr];
		result[index] = value;
		return result;
	});
}

/**
 * Delete item from array by id
 */
function arrayDeleteById<T>(state: T, path: string, id: string): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return [];
		return arr.filter(
			(item) => !(item && typeof item === "object" && (item as { id?: string }).id === id),
		);
	});
}

/**
 * Merge item at array index
 */
function arrayMergeAt<T>(state: T, path: string, index: number, value: Record<string, unknown>): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) {
			const result: unknown[] = [];
			result[index] = value;
			return result;
		}
		const result = [...arr];
		const current = result[index];
		if (current && typeof current === "object" && !Array.isArray(current)) {
			result[index] = { ...current, ...value };
		} else {
			result[index] = value;
		}
		return result;
	});
}

/**
 * Merge item in array by id
 */
function arrayMergeById<T>(state: T, path: string, id: string, value: Record<string, unknown>): T {
	return updateAtPath(state, parsePath(path), (arr) => {
		if (!Array.isArray(arr)) return [{ id, ...value }];
		const index = arr.findIndex(
			(item) => item && typeof item === "object" && (item as { id?: string }).id === id,
		);
		if (index === -1) {
			// Not found - append with id
			return [...arr, { id, ...value }];
		}
		const result = [...arr];
		const current = result[index];
		if (current && typeof current === "object" && !Array.isArray(current)) {
			result[index] = { ...current, ...value };
		} else {
			result[index] = { id, ...value };
		}
		return result;
	});
}
