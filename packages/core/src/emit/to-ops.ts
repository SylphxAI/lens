/**
 * @sylphx/lens-core - EmitCommand to Op[] Converter
 *
 * Transforms internal EmitCommand format to wire protocol Op[].
 */

import type { Op } from "../protocol/types.js";
import type { DeltaOperation, PatchOperation } from "../updates/strategies.js";
import type { ArrayOperation, EmitCommand, InternalFieldUpdate } from "./index.js";

// =============================================================================
// Convert EmitCommand to Op[]
// =============================================================================

/**
 * Convert an EmitCommand to Op[] for wire protocol.
 *
 * @param command - EmitCommand to convert
 * @param path - Optional base path (for nested field subscriptions)
 * @returns Array of operations
 *
 * @example
 * ```typescript
 * // Full data emission
 * toOps({ type: "full", data: { name: "Alice" }, replace: false })
 * // → [{ o: "merge", p: "", v: { name: "Alice" } }]
 *
 * // Field update
 * toOps({ type: "field", field: "name", update: { strategy: "value", data: "Bob" } })
 * // → [{ o: "set", p: "name", v: "Bob" }]
 *
 * // Array operation
 * toOps({ type: "array", operation: { op: "push", item: { id: "1" } } }, "users")
 * // → [{ o: "push", p: "users", v: [{ id: "1" }] }]
 * ```
 */
export function toOps(command: EmitCommand, path = ""): Op[] {
	switch (command.type) {
		case "full":
			return fullToOps(command.data, command.replace, path);

		case "field":
			return fieldToOps(command.field, command.update, path);

		case "batch":
			return batchToOps(command.updates, path);

		case "array":
			return arrayToOps(command.operation, command.field ?? path);
	}
}

// =============================================================================
// Full Data Conversion
// =============================================================================

/**
 * Convert full data emission to ops
 */
function fullToOps(data: unknown, replace: boolean, basePath: string): Op[] {
	// For replace mode, set the entire value
	if (replace) {
		return [{ o: "set", p: basePath, v: data }];
	}

	// For merge mode with objects, use merge operation
	if (data !== null && typeof data === "object" && !Array.isArray(data)) {
		return [{ o: "merge", p: basePath, v: data as Record<string, unknown> }];
	}

	// For non-objects in merge mode, treat as set
	return [{ o: "set", p: basePath, v: data }];
}

// =============================================================================
// Field Update Conversion
// =============================================================================

/**
 * Convert field update to ops
 */
function fieldToOps(
	field: string,
	update: { strategy: string; data: unknown },
	basePath: string,
): Op[] {
	const fullPath = basePath ? `${basePath}.${field}` : field;

	switch (update.strategy) {
		case "value":
			return [{ o: "set", p: fullPath, v: update.data }];

		case "delta":
			return [{ o: "delta", p: fullPath, d: update.data as DeltaOperation[] }];

		case "patch":
			return [{ o: "patch", p: fullPath, d: update.data as PatchOperation[] }];

		default:
			// Unknown strategy, treat as value
			return [{ o: "set", p: fullPath, v: update.data }];
	}
}

// =============================================================================
// Batch Conversion
// =============================================================================

/**
 * Convert batch updates to ops
 */
function batchToOps(updates: InternalFieldUpdate[], basePath: string): Op[] {
	const ops: Op[] = [];
	for (const update of updates) {
		ops.push(...fieldToOps(update.field, update.update, basePath));
	}
	return ops;
}

// =============================================================================
// Array Operation Conversion
// =============================================================================

/**
 * Convert array operation to ops
 */
function arrayToOps(operation: ArrayOperation, path: string): Op[] {
	switch (operation.op) {
		case "push":
			return [{ o: "push", p: path, v: [operation.item] }];

		case "unshift":
			return [{ o: "unshift", p: path, v: [operation.item] }];

		case "insert":
			return [{ o: "splice", p: path, i: operation.index, dc: 0, v: [operation.item] }];

		case "remove":
			return [{ o: "arrDel", p: path, i: operation.index }];

		case "removeById":
			return [{ o: "arrDelId", p: path, id: operation.id }];

		case "update":
			return [{ o: "arrSet", p: path, i: operation.index, v: operation.item }];

		case "updateById":
			return [{ o: "arrSetId", p: path, id: operation.id, v: operation.item }];

		case "merge":
			return [
				{
					o: "arrMerge",
					p: path,
					i: operation.index,
					v: operation.partial as Record<string, unknown>,
				},
			];

		case "mergeById":
			return [
				{
					o: "arrMergeId",
					p: path,
					id: operation.id,
					v: operation.partial as Record<string, unknown>,
				},
			];
	}
}
