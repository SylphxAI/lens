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
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Available
 *   .resolve(({ input }) => db.user.update(input));
 * ```
 */

import type {
	MutationDef,
	OptimisticCallback,
	OptimisticDSL,
	ResolverFn,
} from "../operations/index.js";
import type { PluginExtension, RuntimePlugin } from "./types.js";

// =============================================================================
// Optimistic Plugin Extension Type
// =============================================================================

/**
 * Type extension for optimistic updates plugin.
 *
 * Adds the .optimistic() method to MutationBuilderWithReturns.
 * This type is used by the lens() factory to compose builder types.
 */
export interface OptimisticPluginExtension extends PluginExtension {
	readonly name: "optimistic";

	/**
	 * Methods added to MutationBuilder after .returns() is called.
	 *
	 * Note: Generic parameters TInput, TOutput, TContext are bound when
	 * the builder is created. The intersection happens at that point.
	 */
	readonly MutationBuilderWithReturns: OptimisticMutationMethods;
}

/**
 * Optimistic mutation methods interface.
 *
 * These methods are added to MutationBuilderWithReturns when
 * optimisticPlugin() is included in the plugins array.
 */
export interface OptimisticMutationMethods {
	/** Index signature to satisfy Record<string, unknown> constraint */
	[key: string]: unknown;

	/**
	 * Define optimistic update behavior.
	 *
	 * Sugar syntax:
	 * - "merge" - Update entity with input fields
	 * - "create" - Create new entity with temp ID
	 * - "delete" - Mark entity as deleted
	 * - { merge: {...} } - Merge with additional static fields
	 *
	 * @example
	 * ```typescript
	 * // Sugar syntax
	 * .optimistic('merge')
	 * .optimistic('create')
	 * .optimistic('delete')
	 * .optimistic({ merge: { updatedAt: Date.now() } })
	 *
	 * // Callback with typed input
	 * .optimistic(({ input }) => [
	 *   entity.update('User', { id: input.id, name: input.name })
	 * ])
	 * ```
	 */
	optimistic<TInput, TOutput, TContext>(
		spec: OptimisticDSL,
	): MutationBuilderWithOptimisticExt<TInput, TOutput, TContext>;

	/**
	 * Define optimistic update with typed input callback.
	 *
	 * The callback receives a typed input proxy and returns
	 * an array of step builders (Reify DSL).
	 */
	optimistic<TInput, TOutput, TContext>(
		callback: OptimisticCallback<TInput>,
	): MutationBuilderWithOptimisticExt<TInput, TOutput, TContext>;
}

/**
 * Mutation builder state after .optimistic() is called.
 * Only .resolve() is available at this point.
 */
export interface MutationBuilderWithOptimisticExt<TInput, TOutput, TContext> {
	/**
	 * Define the resolver function.
	 * This completes the mutation definition.
	 */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
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
