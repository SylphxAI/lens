/**
 * @sylphx/lens-server - Create / Type Matching
 *
 * Entity type-matching seam: scores how well a plain object matches an entity
 * definition, used to infer an object's type name by field overlap.
 * Internal module - not part of the public API.
 */

import type { ModelDef } from "@sylphx/lens-core";

/**
 * Calculate how well an object matches an entity definition.
 *
 * @returns Score between 0 and 1 (1 = perfect match, all entity fields present)
 */
export function getEntityMatchScore(
	obj: Record<string, unknown>,
	entityDef: ModelDef<string, any>,
): number {
	const fieldNames = Object.keys(entityDef.fields);
	if (fieldNames.length === 0) return 0;

	const matchingFields = fieldNames.filter((field) => field in obj);
	return matchingFields.length / fieldNames.length;
}
