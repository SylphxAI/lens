/**
 * @sylphx/lens-server - Selection
 *
 * Field selection logic for query results.
 */

import type { SelectionObject } from "./types.js";

/**
 * Apply field selection to data.
 * Recursively filters data to only include selected fields.
 *
 * @param data - The data to filter
 * @param select - Selection object specifying which fields to include
 * @returns Filtered data with only selected fields
 */
export function applySelection(data: unknown, select: SelectionObject): unknown {
	if (!data) return data;

	if (Array.isArray(data)) {
		return data.map((item) => applySelection(item, select));
	}

	if (typeof data !== "object") return data;

	const obj = data as Record<string, unknown>;
	const result: Record<string, unknown> = {};

	// Always include id
	if ("id" in obj) result.id = obj.id;

	for (const [key, value] of Object.entries(select)) {
		if (!(key in obj)) continue;

		if (value === true) {
			result[key] = obj[key];
		} else if (typeof value === "object" && value !== null) {
			const nestedSelect = "select" in value ? value.select : value;
			result[key] = applySelection(obj[key], nestedSelect as SelectionObject);
		}
	}

	return result;
}
