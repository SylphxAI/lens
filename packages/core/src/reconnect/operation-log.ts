/**
 * @sylphx/lens-core - Patch Utilities
 *
 * Pure utility functions for JSON Patch (RFC 6902) operations.
 * Used by both client and server for applying patches.
 */

import type { PatchOperation } from "./types.js";

// =============================================================================
// Patch Application (Shared)
// =============================================================================

/**
 * Apply JSON Patch operations to object.
 * Implements RFC 6902.
 *
 * @param target - Object to patch
 * @param patch - Patch operations
 * @returns New patched object (does not mutate original)
 */
export function applyPatch<T extends Record<string, unknown>>(
	target: T,
	patch: PatchOperation[],
): T {
	// Deep clone to avoid mutation (structuredClone is 10-15x faster than JSON.parse/stringify)
	let result = structuredClone(target);

	for (const op of patch) {
		result = applySinglePatch(result, op);
	}

	return result;
}

/**
 * Apply single patch operation.
 */
function applySinglePatch<T extends Record<string, unknown>>(target: T, op: PatchOperation): T {
	const pathParts = op.path.split("/").filter(Boolean);

	if (pathParts.length === 0) {
		// Root replacement
		if (op.op === "replace" || op.op === "add") {
			return op.value as T;
		}
		return target;
	}

	// Navigate to parent
	let current: Record<string, unknown> = target;
	for (let i = 0; i < pathParts.length - 1; i++) {
		const key = decodeJsonPointer(pathParts[i]);
		if (!(key in current)) {
			current[key] = {};
		}
		current = current[key] as Record<string, unknown>;
	}

	const lastKey = decodeJsonPointer(pathParts[pathParts.length - 1]);

	switch (op.op) {
		case "add":
		case "replace":
			current[lastKey] = op.value;
			break;

		case "remove":
			delete current[lastKey];
			break;

		case "move":
			if (op.from) {
				const fromParts = op.from.split("/").filter(Boolean);
				const fromValue = getValueAtPath(target, fromParts);
				removeValueAtPath(target, fromParts);
				current[lastKey] = fromValue;
			}
			break;

		case "copy":
			if (op.from) {
				const fromParts = op.from.split("/").filter(Boolean);
				const fromValue = getValueAtPath(target, fromParts);
				current[lastKey] = structuredClone(fromValue);
			}
			break;

		case "test":
			// Test operations don't modify
			break;
	}

	return target;
}

/**
 * Decode JSON Pointer segment (RFC 6901).
 */
function decodeJsonPointer(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Get value at path in object.
 */
function getValueAtPath(obj: Record<string, unknown>, path: string[]): unknown {
	let current: unknown = obj;
	for (const key of path) {
		if (current === null || typeof current !== "object") {
			return undefined;
		}
		current = (current as Record<string, unknown>)[decodeJsonPointer(key)];
	}
	return current;
}

/**
 * Remove value at path in object (mutates).
 */
function removeValueAtPath(obj: Record<string, unknown>, path: string[]): void {
	if (path.length === 0) return;

	let current: Record<string, unknown> = obj;
	for (let i = 0; i < path.length - 1; i++) {
		const key = decodeJsonPointer(path[i]);
		if (!(key in current)) return;
		current = current[key] as Record<string, unknown>;
	}

	delete current[decodeJsonPointer(path[path.length - 1])];
}
