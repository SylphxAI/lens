/**
 * @sylphx/lens-server - Create / Operations Map
 *
 * Operations-map build seam: pure helpers for assembling the nested operations
 * metadata tree returned in the transport handshake.
 * Internal module - not part of the public API.
 */

import type { OperationMeta, OperationsMap } from "../types.js";

/**
 * Insert an operation meta into the nested operations map at a dotted path,
 * creating intermediate namespace objects as needed.
 */
export function setNested(result: OperationsMap, path: string, meta: OperationMeta): void {
	const parts = path.split(".");
	let current: OperationsMap = result;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (!current[part] || "type" in current[part]) {
			current[part] = {};
		}
		current = current[part] as OperationsMap;
	}
	current[parts[parts.length - 1]] = meta;
}

/**
 * Extract the return entity type name from an operation's output definition.
 */
export function getReturnTypeName(output: unknown): string | undefined {
	if (!output) return undefined;
	// Handle array output: [EntityDef] → extract from first element
	if (Array.isArray(output) && output.length > 0) {
		const element = output[0];
		if (element && typeof element === "object" && "_name" in element) {
			return element._name as string;
		}
	}
	// Handle direct entity output
	if (typeof output === "object" && "_name" in output) {
		return (output as { _name?: string })._name;
	}
	return undefined;
}
