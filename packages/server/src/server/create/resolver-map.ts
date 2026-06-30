/**
 * @sylphx/lens-server - Create / Resolver Map
 *
 * Schema build seam: assembles the resolver map from explicit resolvers plus
 * auto-generated exposed-only resolvers for models without one.
 * Internal module - not part of the public API.
 */

import { createResolverFromEntity, isModelDef, type Resolvers } from "@sylphx/lens-core";
import type { EntitiesMap } from "../types.js";
import type { ResolverMap } from "./internal-types.js";

/**
 * Build resolver map from explicit resolvers.
 *
 * Models without explicit resolvers get auto-generated exposed-only resolvers.
 * Use standalone resolver(Model, ...) for custom field resolution.
 *
 * Priority: explicit resolvers > auto-generated exposed-only resolvers
 */
export function buildResolverMap(
	explicitResolvers: Resolvers | undefined,
	entities: EntitiesMap,
): ResolverMap | undefined {
	const resolverMap: ResolverMap = new Map();

	// 1. Add explicit resolvers first (takes priority)
	if (explicitResolvers) {
		for (const resolver of explicitResolvers) {
			const entityName = resolver.entity._name;
			if (entityName) {
				resolverMap.set(entityName, resolver);
			}
		}
	}

	// 2. Auto-create exposed-only resolvers for models without explicit resolvers
	for (const [name, entity] of Object.entries(entities)) {
		if (!isModelDef(entity)) continue;
		if (resolverMap.has(name)) continue; // Explicit resolver takes priority

		// Create exposed-only resolver for this model
		const resolver = createResolverFromEntity(entity);
		resolverMap.set(name, resolver);
	}

	return resolverMap.size > 0 ? resolverMap : undefined;
}
