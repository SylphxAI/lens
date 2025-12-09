/**
 * @sylphx/lens-core - Model Collection Utilities
 *
 * Utilities for extracting models from routers and operations.
 * Used by server to auto-track models without explicit `entities` config.
 */

import { isMutationDef, type MutationDef } from "../operations/mutation.js";
// Import operation types
import { type AnyQueryDef, isQueryDef } from "../operations/query.js";
import { flattenRouter, type RouterDef } from "../router/index.js";
import { type EntityDef, isEntityDef } from "./define.js";
import { isModelDef, type ModelDef } from "./model.js";
import type { EntityDefinition } from "./types.js";
import {
	isListWrapper,
	isNullableWrapper,
	type ListWrapper,
	type NullableWrapper,
} from "./wrappers.js";

/**
 * Any definition that could be a model (EntityDef or ModelDef)
 */
type AnyModelLike = EntityDef<string, EntityDefinition> | ModelDef<string, EntityDefinition>;

/**
 * Map of collected models by name
 */
export type CollectedModels = Map<string, AnyModelLike>;

/**
 * Unwrap a return spec to get the underlying model.
 * Handles: Model, nullable(Model), list(Model), nullable(list(Model))
 */
function unwrapReturnSpec(spec: unknown): AnyModelLike | undefined {
	if (!spec) return undefined;

	// Unwrap nullable
	if (isNullableWrapper(spec)) {
		return unwrapReturnSpec((spec as NullableWrapper<unknown>)._inner);
	}

	// Unwrap list
	if (isListWrapper(spec)) {
		return unwrapReturnSpec((spec as ListWrapper<unknown>)._inner);
	}

	// Legacy array syntax [Entity]
	if (Array.isArray(spec) && spec.length === 1) {
		return unwrapReturnSpec(spec[0]);
	}

	// Check if it's a model/entity
	if (isModelDef(spec)) {
		return spec as ModelDef<string, EntityDefinition>;
	}

	if (isEntityDef(spec)) {
		return spec as EntityDef<string, EntityDefinition>;
	}

	// Legacy Record<string, Entity> - collect all values
	if (typeof spec === "object" && spec !== null) {
		// This is a record of entities - we'll handle this at a higher level
		return undefined;
	}

	return undefined;
}

/**
 * Collect models from a Record<string, Entity> return spec.
 */
function collectFromRecord(spec: Record<string, unknown>, collected: CollectedModels): void {
	for (const value of Object.values(spec)) {
		const model = unwrapReturnSpec(value);
		if (model) {
			const name = isModelDef(model) ? model._name : (model as EntityDef)._name;
			if (name && !collected.has(name)) {
				collected.set(name, model);
			}
		}
	}
}

/**
 * Collect models from a single operation definition.
 */
function collectFromOperation(def: AnyQueryDef | MutationDef, collected: CollectedModels): void {
	const output = def._output;
	if (!output) return;

	// Try to unwrap as single model
	const model = unwrapReturnSpec(output);
	if (model) {
		const name = isModelDef(model) ? model._name : (model as EntityDef)._name;
		if (name && !collected.has(name)) {
			collected.set(name, model);
		}
		return;
	}

	// Check if it's a Record<string, Entity>
	if (typeof output === "object" && output !== null && !Array.isArray(output)) {
		// Skip if it's a wrapper or zod schema
		if (!isNullableWrapper(output) && !isListWrapper(output) && !("parse" in output)) {
			collectFromRecord(output as Record<string, unknown>, collected);
		}
	}
}

/**
 * Collect all models from a router definition.
 *
 * Traverses the router tree and extracts models from all operation return types.
 * Supports both new model() and legacy entity() definitions.
 *
 * @example
 * ```typescript
 * const router = router({
 *   user: {
 *     get: query().returns(User).resolve(...),
 *     list: query().returns(list(User)).resolve(...),
 *   },
 * });
 *
 * const models = collectModelsFromRouter(router);
 * // Map { "User" => UserModelDef }
 * ```
 */
export function collectModelsFromRouter(routerDef: RouterDef): CollectedModels {
	const collected: CollectedModels = new Map();

	const flattened = flattenRouter(routerDef);

	for (const [_path, procedure] of flattened) {
		if (isQueryDef(procedure)) {
			collectFromOperation(procedure as AnyQueryDef, collected);
		} else if (isMutationDef(procedure)) {
			collectFromOperation(procedure as MutationDef, collected);
		}
	}

	return collected;
}

/**
 * Collect models from queries and mutations maps.
 *
 * @example
 * ```typescript
 * const models = collectModelsFromOperations(queries, mutations);
 * ```
 */
export function collectModelsFromOperations(
	queries: Record<string, AnyQueryDef<any, any, any>> | undefined,
	mutations: Record<string, MutationDef<any, any, any>> | undefined,
): CollectedModels {
	const collected: CollectedModels = new Map();

	if (queries) {
		for (const def of Object.values(queries)) {
			if (isQueryDef(def)) {
				collectFromOperation(def, collected);
			}
		}
	}

	if (mutations) {
		for (const def of Object.values(mutations)) {
			if (isMutationDef(def)) {
				collectFromOperation(def, collected);
			}
		}
	}

	return collected;
}

/**
 * Merge multiple model collections into one.
 * Later collections take priority over earlier ones.
 */
export function mergeModelCollections(
	...collections: (CollectedModels | Record<string, AnyModelLike> | undefined)[]
): CollectedModels {
	const merged: CollectedModels = new Map();

	for (const collection of collections) {
		if (!collection) continue;

		if (collection instanceof Map) {
			for (const [name, model] of collection) {
				merged.set(name, model);
			}
		} else {
			for (const [name, model] of Object.entries(collection)) {
				merged.set(name, model);
			}
		}
	}

	return merged;
}
