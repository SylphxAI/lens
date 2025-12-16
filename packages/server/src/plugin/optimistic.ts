/**
 * @sylphx/lens-server - Optimistic Updates Plugin
 *
 * Server-side plugin that enables optimistic update configuration.
 * Processes mutation definitions and adds optimistic config to handshake metadata.
 *
 * This plugin implements both:
 * - RuntimePlugin<OptimisticPluginExtension> for lens() type extensions
 * - ServerPlugin for server-side metadata processing
 *
 * @example With lens() for type-safe .optimistic()
 * ```typescript
 * const { mutation, plugins } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 *
 * // .optimistic() is now type-safe (compile error without plugin)
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Type-safe
 *   .resolve(({ input }) => db.user.update(input));
 *
 * const server = createApp({ router, plugins });
 * ```
 *
 * @example Direct server usage
 * ```typescript
 * const server = createApp({
 *   router,
 *   plugins: [optimisticPlugin()],
 * });
 * ```
 */

import {
	isPipeline,
	OPTIMISTIC_PLUGIN_SYMBOL,
	type OptimisticPluginMarker,
	type Pipeline,
} from "@sylphx/lens-core";
import type { EnhanceOperationMetaContext, ServerPlugin } from "./types.js";

/**
 * Optimistic plugin configuration.
 */
export interface OptimisticPluginOptions {
	/**
	 * Whether to auto-derive optimistic config from mutation naming.
	 * - `updateX` → "merge"
	 * - `createX` / `addX` → "create"
	 * - `deleteX` / `removeX` → "delete"
	 * @default true
	 */
	autoDerive?: boolean;

	/**
	 * Enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Sugar syntax types for optimistic updates.
 */
type OptimisticSugar = "merge" | "create" | "delete";
type OptimisticMerge = { merge: Record<string, unknown> };
type OptimisticDSL = OptimisticSugar | OptimisticMerge | Pipeline;

/**
 * MutationDef shape for type checking.
 */
interface MutationDefLike {
	_optimistic?: OptimisticDSL;
	_output?: unknown;
	_input?: { shape?: Record<string, unknown> };
}

/**
 * Extract entity type name from return spec.
 *
 * Entity definitions can have different formats:
 * 1. Direct entity: { _name: "User", fields: {...}, "~entity": { name: "User" } }
 * 2. Return spec wrapper: { _tag: "entity", entityDef: { _name: "User" } }
 * 3. Array: { _tag: "array", element: <entity> }
 */
function getEntityTypeName(returnSpec: unknown): string | undefined {
	if (!returnSpec) return undefined;
	if (typeof returnSpec !== "object") return undefined;

	const spec = returnSpec as Record<string, unknown>;

	// Direct entity definition with _name
	if ("_name" in spec && typeof spec._name === "string") {
		return spec._name;
	}

	// ~entity marker (entity definitions have this)
	if ("~entity" in spec) {
		const entity = spec["~entity"] as { name?: string } | undefined;
		if (entity?.name) return entity.name;
	}

	// Return spec wrapper with _tag
	if ("_tag" in spec) {
		if (spec._tag === "entity" && spec.entityDef) {
			const entityDef = spec.entityDef as { _name?: string };
			if (entityDef._name) return entityDef._name;
		}
		if (spec._tag === "array" && spec.element) {
			return getEntityTypeName(spec.element);
		}
	}

	return undefined;
}

/**
 * Get input field names from Zod schema.
 */
function getInputFields(schema: { shape?: Record<string, unknown> } | undefined): string[] {
	if (!schema?.shape) return [];
	return Object.keys(schema.shape);
}

/**
 * Create a Reify $input reference.
 */
function $input(field: string): { $input: string } {
	return { $input: field };
}

/**
 * Create a Reify Pipeline step.
 */
interface ReifyPipelineStep {
	$do: string;
	$with: Record<string, unknown>;
	$as: string;
}

/**
 * Create a Reify Pipeline.
 */
interface ReifyPipeline {
	$pipe: ReifyPipelineStep[];
}

/**
 * Convert sugar syntax to Reify Pipeline.
 *
 * Sugar syntax:
 * - "merge" → entity.update with input fields
 * - "create" → entity.create from output
 * - "delete" → entity.delete by input.id
 *
 * Returns the original value if already a Pipeline.
 *
 * Output format (Reify DSL):
 * {
 *   "$pipe": [{
 *     "$do": "entity.create",
 *     "$with": { "type": "Entity", "field": { "$input": "field" } },
 *     "$as": "result"
 *   }]
 * }
 */
function sugarToPipeline(
	sugar: OptimisticDSL | undefined,
	entityType: string | undefined,
	inputFields: string[],
): Pipeline | undefined {
	if (!sugar) return undefined;
	if (isPipeline(sugar)) return sugar;

	const entity = entityType ?? "Entity";

	switch (sugar) {
		case "merge": {
			// entity.update('Entity', { id: input.id, ...fields })
			const updateData: Record<string, unknown> = {
				type: entity,
				id: $input("id"),
			};
			// Add all input fields as $input references
			for (const field of inputFields) {
				if (field !== "id") {
					updateData[field] = $input(field);
				}
			}
			const pipeline: ReifyPipeline = {
				$pipe: [
					{
						$do: "entity.update",
						$with: updateData,
						$as: "result",
					},
				],
			};
			return pipeline as unknown as Pipeline;
		}
		case "create": {
			// entity.create('Entity', { id: temp(), ...from output })
			// For create, we use a special marker that client interprets as "use mutation output"
			const pipeline: ReifyPipeline = {
				$pipe: [
					{
						$do: "entity.create",
						$with: {
							type: entity,
							id: { $temp: true },
							$fromOutput: true, // Special marker: use mutation output data
						},
						$as: "result",
					},
				],
			};
			return pipeline as unknown as Pipeline;
		}
		case "delete": {
			// entity.delete('Entity', { id: input.id })
			const pipeline: ReifyPipeline = {
				$pipe: [
					{
						$do: "entity.delete",
						$with: {
							type: entity,
							id: $input("id"), // Fixed: was incorrectly nested as { id: $input("id") }
						},
						$as: "result",
					},
				],
			};
			return pipeline as unknown as Pipeline;
		}
		default:
			// Handle { merge: {...} } sugar
			if (typeof sugar === "object" && "merge" in sugar) {
				const updateData: Record<string, unknown> = {
					type: entity,
					id: $input("id"),
				};
				// Add input fields
				for (const field of inputFields) {
					if (field !== "id") {
						updateData[field] = $input(field);
					}
				}
				// Add extra static fields from merge object
				for (const [key, value] of Object.entries(sugar.merge)) {
					updateData[key] = value;
				}
				const pipeline: ReifyPipeline = {
					$pipe: [
						{
							$do: "entity.update",
							$with: updateData,
							$as: "result",
						},
					],
				};
				return pipeline as unknown as Pipeline;
			}
			return undefined;
	}
}

/**
 * Check if a value is optimistic DSL.
 */
function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	if (value === "merge" || value === "create" || value === "delete") return true;
	if (isPipeline(value)) return true;
	if (typeof value === "object" && value !== null && "merge" in value) return true;
	return false;
}

/**
 * Combined plugin type that works with both lens() and createApp().
 *
 * This type satisfies:
 * - OptimisticPluginMarker (RuntimePlugin<OptimisticPluginExtension>) for lens() type extensions
 * - ServerPlugin for server-side metadata processing
 */
export type OptimisticPlugin = OptimisticPluginMarker & ServerPlugin;

/**
 * Create an optimistic plugin.
 *
 * This plugin enables type-safe .optimistic() on mutation builders when used
 * with lens(), and processes mutation definitions for server metadata.
 *
 * @example With lens() for type-safe builders
 * ```typescript
 * const { mutation, plugins } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 *
 * // .optimistic() is type-safe (compile error without plugin)
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')
 *   .resolve(({ input }) => db.user.update(input));
 *
 * const server = createApp({ router, plugins });
 * ```
 *
 * @example Direct server usage
 * ```typescript
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [optimisticPlugin()],
 * });
 * ```
 */
export function optimisticPlugin(options: OptimisticPluginOptions = {}): OptimisticPlugin {
	const { autoDerive = true, debug = false } = options;

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[optimisticPlugin]", ...args);
		}
	};

	return {
		// RuntimePlugin (OptimisticPluginMarker) interface
		name: "optimistic" as const,
		[OPTIMISTIC_PLUGIN_SYMBOL]: true as const,

		// ServerPlugin interface
		/**
		 * Enhance operation metadata with optimistic config.
		 * Called for each operation when building handshake metadata.
		 */
		enhanceOperationMeta(ctx: EnhanceOperationMetaContext): void {
			// Only process mutations
			if (ctx.type !== "mutation") return;

			const def = ctx.definition as MutationDefLike;
			let optimisticSpec = def._optimistic;

			// Auto-derive from naming convention if enabled and not explicitly set
			if (!optimisticSpec && autoDerive) {
				const lastSegment = ctx.path.includes(".") ? ctx.path.split(".").pop()! : ctx.path;

				if (lastSegment.startsWith("update")) {
					optimisticSpec = "merge";
				} else if (lastSegment.startsWith("create") || lastSegment.startsWith("add")) {
					optimisticSpec = "create";
				} else if (lastSegment.startsWith("delete") || lastSegment.startsWith("remove")) {
					optimisticSpec = "delete";
				}

				log(`Auto-derived optimistic for ${ctx.path}:`, optimisticSpec);
			}

			// Convert to pipeline and add to metadata
			if (optimisticSpec && isOptimisticDSL(optimisticSpec)) {
				const entityType = getEntityTypeName(def._output);
				const inputFields = getInputFields(def._input);
				const pipeline = sugarToPipeline(optimisticSpec, entityType, inputFields);

				if (pipeline) {
					ctx.meta.optimistic = pipeline;
					log(`Added optimistic config for ${ctx.path}:`, pipeline);
				}
			}
		},
	};
}

/**
 * Check if a plugin is an optimistic plugin.
 *
 * Uses the OPTIMISTIC_PLUGIN_SYMBOL for type-safe identification.
 */
export { isOptimisticPlugin } from "@sylphx/lens-core";
