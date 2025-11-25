/**
 * @sylphx/core - Update Strategies
 *
 * Efficient transfer strategies for different data types.
 * Automatic selection based on data characteristics.
 */

// =============================================================================
// Strategy Types
// =============================================================================

/** Update strategy names */
export type StrategyName = "value" | "delta" | "patch";

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

// =============================================================================
// Value Strategy
// =============================================================================

/**
 * Value strategy - sends full replacement
 *
 * Best for:
 * - Short strings (< 100 chars)
 * - Numbers, booleans, enums
 * - Small objects that change completely
 */
export const valueStrategy: UpdateStrategy = {
	name: "value",

	encode(_prev: unknown, next: unknown): ValueUpdate {
		return { strategy: "value", data: next };
	},

	decode(_current: unknown, update: Update): unknown {
		return update.data;
	},

	estimateSize(update: Update): number {
		return JSON.stringify(update.data).length;
	},
};

// =============================================================================
// Delta Strategy
// =============================================================================

/**
 * Delta strategy - character-level diff for strings
 *
 * Best for:
 * - Long strings with small changes
 * - Streaming text (LLM responses)
 * - ~57% bandwidth savings typical
 */
export const deltaStrategy: UpdateStrategy<string> = {
	name: "delta",

	encode(prev: string, next: string): DeltaUpdate | ValueUpdate<string> {
		const operations = computeStringDiff(prev, next);

		// If diff is larger than value, use value strategy
		const diffSize = JSON.stringify(operations).length;
		const valueSize = next.length + 20; // Account for JSON overhead

		if (diffSize >= valueSize) {
			return { strategy: "value", data: next };
		}

		return { strategy: "delta", data: operations };
	},

	decode(current: string, update: Update): string {
		if (update.strategy === "value") {
			return update.data as string;
		}

		const operations = (update as DeltaUpdate).data;
		return applyStringDiff(current, operations);
	},

	estimateSize(update: Update): number {
		return JSON.stringify(update.data).length;
	},
};

/** Compute string diff operations */
function computeStringDiff(prev: string, next: string): DeltaOperation[] {
	const operations: DeltaOperation[] = [];

	// Find common prefix
	let prefixLen = 0;
	const minLen = Math.min(prev.length, next.length);
	while (prefixLen < minLen && prev[prefixLen] === next[prefixLen]) {
		prefixLen++;
	}

	// Find common suffix (from the remaining parts)
	let suffixLen = 0;
	const remainingPrev = prev.length - prefixLen;
	const remainingNext = next.length - prefixLen;
	const maxSuffix = Math.min(remainingPrev, remainingNext);
	while (
		suffixLen < maxSuffix &&
		prev[prev.length - 1 - suffixLen] === next[next.length - 1 - suffixLen]
	) {
		suffixLen++;
	}

	// Calculate what changed
	const deleteCount = prev.length - prefixLen - suffixLen;
	const insertText = next.slice(prefixLen, next.length - suffixLen || undefined);

	if (deleteCount > 0 || insertText.length > 0) {
		operations.push({
			position: prefixLen,
			...(deleteCount > 0 ? { delete: deleteCount } : {}),
			...(insertText.length > 0 ? { insert: insertText } : {}),
		});
	}

	return operations;
}

/** Apply string diff operations */
function applyStringDiff(current: string, operations: DeltaOperation[]): string {
	let result = current;

	// Apply operations in reverse order to maintain positions
	const sortedOps = [...operations].sort((a, b) => b.position - a.position);

	for (const op of sortedOps) {
		const before = result.slice(0, op.position);
		const after = result.slice(op.position + (op.delete ?? 0));
		result = before + (op.insert ?? "") + after;
	}

	return result;
}

// =============================================================================
// Patch Strategy
// =============================================================================

/**
 * Patch strategy - JSON Patch RFC 6902
 *
 * Best for:
 * - Objects with nested changes
 * - Arrays with modifications
 * - ~99% bandwidth savings for large objects
 */
export const patchStrategy: UpdateStrategy<object> = {
	name: "patch",

	encode(prev: object, next: object): PatchUpdate | ValueUpdate<object> {
		const operations = computeJsonPatch(prev, next);

		// If patch is larger than value, use value strategy
		const patchSize = JSON.stringify(operations).length;
		const valueSize = JSON.stringify(next).length + 20;

		if (patchSize >= valueSize) {
			return { strategy: "value", data: next };
		}

		return { strategy: "patch", data: operations };
	},

	decode(current: object, update: Update): object {
		if (update.strategy === "value") {
			return update.data as object;
		}

		const operations = (update as PatchUpdate).data;
		return applyJsonPatch(current, operations);
	},

	estimateSize(update: Update): number {
		return JSON.stringify(update.data).length;
	},
};

/** Compute JSON Patch operations */
function computeJsonPatch(prev: object, next: object, basePath = ""): PatchOperation[] {
	const operations: PatchOperation[] = [];
	const prevObj = prev as Record<string, unknown>;
	const nextObj = next as Record<string, unknown>;

	// Find removed keys
	for (const key of Object.keys(prevObj)) {
		if (!(key in nextObj)) {
			operations.push({ op: "remove", path: `${basePath}/${escapeJsonPointer(key)}` });
		}
	}

	// Find added/changed keys
	for (const [key, nextValue] of Object.entries(nextObj)) {
		const path = `${basePath}/${escapeJsonPointer(key)}`;
		const prevValue = prevObj[key];

		if (!(key in prevObj)) {
			// Added
			operations.push({ op: "add", path, value: nextValue });
		} else if (!deepEqual(prevValue, nextValue)) {
			// Changed
			if (
				isPlainObject(prevValue) &&
				isPlainObject(nextValue) &&
				!Array.isArray(prevValue) &&
				!Array.isArray(nextValue)
			) {
				// Recurse into objects
				operations.push(...computeJsonPatch(prevValue, nextValue, path));
			} else {
				// Replace value
				operations.push({ op: "replace", path, value: nextValue });
			}
		}
	}

	return operations;
}

/** Apply JSON Patch operations */
function applyJsonPatch(current: object, operations: PatchOperation[]): object {
	let result = structuredClone(current);

	for (const op of operations) {
		const pathParts = parseJsonPointer(op.path);

		switch (op.op) {
			case "add":
			case "replace":
				setValueAtPath(result, pathParts, op.value);
				break;
			case "remove":
				removeValueAtPath(result, pathParts);
				break;
			case "move":
				if (op.from) {
					const fromParts = parseJsonPointer(op.from);
					const value = getValueAtPath(result, fromParts);
					removeValueAtPath(result, fromParts);
					setValueAtPath(result, pathParts, value);
				}
				break;
			case "copy":
				if (op.from) {
					const fromParts = parseJsonPointer(op.from);
					const value = structuredClone(getValueAtPath(result, fromParts));
					setValueAtPath(result, pathParts, value);
				}
				break;
			case "test":
				// Test operations don't modify
				break;
		}
	}

	return result;
}

// =============================================================================
// Strategy Selection
// =============================================================================

/** Thresholds for strategy selection */
const THRESHOLDS = {
	/** Strings longer than this use delta */
	STRING_DELTA_MIN: 100,
	/** Objects larger than this (in JSON chars) use patch */
	OBJECT_PATCH_MIN: 50,
};

/**
 * Select optimal update strategy based on data type and change
 */
export function selectStrategy(
	prev: unknown,
	next: unknown,
): UpdateStrategy {
	// Strings use delta if long enough (check before primitives)
	if (typeof prev === "string" && typeof next === "string") {
		if (next.length >= THRESHOLDS.STRING_DELTA_MIN) {
			return deltaStrategy as UpdateStrategy;
		}
		return valueStrategy;
	}

	// Primitives (non-strings) always use value
	if (typeof next !== "object" || next === null) {
		return valueStrategy;
	}

	// Objects/arrays use patch if complex enough
	if (isPlainObject(prev) && isPlainObject(next)) {
		const prevSize = JSON.stringify(prev).length;
		if (prevSize >= THRESHOLDS.OBJECT_PATCH_MIN) {
			return patchStrategy as UpdateStrategy;
		}
	}

	// Default to value
	return valueStrategy;
}

/**
 * Create an optimized update from prev to next
 */
export function createUpdate(prev: unknown, next: unknown): Update {
	const strategy = selectStrategy(prev, next);
	return strategy.encode(prev, next);
}

/**
 * Apply an update to a current value
 */
export function applyUpdate<T>(current: T, update: Update): T {
	switch (update.strategy) {
		case "value":
			return valueStrategy.decode(current, update) as T;
		case "delta":
			return deltaStrategy.decode(current as string, update) as T;
		case "patch":
			return patchStrategy.decode(current as object, update) as T;
		default:
			return update.data as T;
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Check if value is a plain object */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** Escape JSON Pointer special characters */
function escapeJsonPointer(str: string): string {
	return str.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Parse JSON Pointer path */
function parseJsonPointer(path: string): string[] {
	if (!path || path === "/") return [];
	return path
		.slice(1)
		.split("/")
		.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Get value at path */
function getValueAtPath(obj: object, path: string[]): unknown {
	let current: unknown = obj;
	for (const key of path) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/** Set value at path */
function setValueAtPath(obj: object, path: string[], value: unknown): void {
	if (path.length === 0) return;

	let current: Record<string, unknown> = obj as Record<string, unknown>;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i];
		if (!(key in current) || typeof current[key] !== "object") {
			current[key] = {};
		}
		current = current[key] as Record<string, unknown>;
	}
	current[path[path.length - 1]] = value;
}

/** Remove value at path */
function removeValueAtPath(obj: object, path: string[]): void {
	if (path.length === 0) return;

	let current: Record<string, unknown> = obj as Record<string, unknown>;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i];
		if (!(key in current) || typeof current[key] !== "object") return;
		current = current[key] as Record<string, unknown>;
	}
	delete current[path[path.length - 1]];
}
