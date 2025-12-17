/**
 * @sylphx/lens-core - Optimistic Plugin Extension
 *
 * Type extension for the optimistic updates plugin.
 * Declares the .optimistic() method on mutation builders.
 *
 * @example
 * ```typescript
 * // With optimistic plugin - .optimistic() is available
 * const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 * mutation()
 *   .args(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Available
 *   .resolve(({ args }) => db.user.update(args));
 * ```
 */

import type { StepBuilder } from "@sylphx/reify";
import type { MutationBuilderWithOptimistic, OptimisticDSL } from "../operations/index.js";
import type { PluginExtension, RuntimePlugin } from "./types.js";

// =============================================================================
// Optimistic Plugin Method Types
// =============================================================================

/**
 * Type-level method definitions for the optimistic plugin.
 *
 * This type provides the method signatures for each builder stage.
 * Used by ExtractPluginMethods to compose builder types.
 *
 * @typeParam TStage - Builder stage name
 * @typeParam TInput - Input type from .args()
 * @typeParam TOutput - Output type from .returns()
 * @typeParam TContext - Context type from lens<TContext>()
 */
export type OptimisticPluginMethods<
	TStage extends string,
	TInput,
	TOutput,
	TContext,
> = TStage extends "MutationBuilderWithReturns"
	? {
			/**
			 * Define optimistic update behavior with typed callback.
			 * The callback receives `{ args }` with the args type inferred from `.args()`.
			 *
			 * IMPORTANT: Callback overload comes FIRST to enable proper TypeScript inference
			 * for inline arrow functions. TypeScript tries overloads in order.
			 *
			 * @param callback - Callback that receives typed args and returns step builders
			 * @returns Builder with .resolve() method
			 *
			 * @example
			 * ```typescript
			 * .optimistic(({ args }) => [
			 *   e.update(User, { id: args.id, name: args.name }),
			 * ])
			 * ```
			 */
			optimistic(
				callback: (ctx: { args: TInput }) => StepBuilder[],
			): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;

			/**
			 * Define optimistic update behavior with DSL spec.
			 *
			 * @param spec - Optimistic update specification (sugar or Pipeline)
			 * @returns Builder with .resolve() method
			 *
			 * @example
			 * ```typescript
			 * .optimistic("merge")  // Merge input with existing entity
			 * .optimistic("create") // Create new entity from input
			 * .optimistic({ merge: { published: true } }) // Merge specific fields
			 * ```
			 */
			optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
		}
	: // biome-ignore lint/complexity/noBannedTypes: Empty object for intersection identity
		{};

// =============================================================================
// Optimistic Plugin Extension Type
// =============================================================================

/**
 * Type extension for optimistic updates plugin.
 *
 * This interface is used by the lens() factory to identify the plugin
 * and compose builder types. The actual methods come from the
 * PluginMethodRegistry augmentation above.
 */
export interface OptimisticPluginExtension extends PluginExtension {
	readonly name: "optimistic";
}

// =============================================================================
// Runtime Plugin Marker
// =============================================================================

/**
 * Symbol to identify optimistic plugin instances.
 * Used for runtime type checking and plugin detection.
 */
declare const OPTIMISTIC_PLUGIN_BRAND: unique symbol;
export const OPTIMISTIC_PLUGIN_SYMBOL: typeof OPTIMISTIC_PLUGIN_BRAND = Symbol.for(
	"lens:optimistic-plugin",
) as typeof OPTIMISTIC_PLUGIN_BRAND;

/**
 * Marker interface for optimistic plugin instances.
 * Combines RuntimePlugin with a unique symbol for type narrowing.
 */
export interface OptimisticPluginMarker extends RuntimePlugin<OptimisticPluginExtension> {
	readonly [OPTIMISTIC_PLUGIN_SYMBOL]: true;
}

/**
 * Type guard to check if a plugin is an optimistic plugin.
 */
export function isOptimisticPlugin(plugin: unknown): plugin is OptimisticPluginMarker {
	return (
		typeof plugin === "object" &&
		plugin !== null &&
		OPTIMISTIC_PLUGIN_SYMBOL in plugin &&
		(plugin as OptimisticPluginMarker)[OPTIMISTIC_PLUGIN_SYMBOL] === true
	);
}
