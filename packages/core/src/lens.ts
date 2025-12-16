/**
 * @sylphx/lens-core - Unified Factory
 *
 * Single factory function that provides typed model, query, mutation, and resolver builders.
 * Eliminates repetitive context typing across your codebase.
 *
 * @example
 * ```typescript
 * import { lens, id, string, list } from '@sylphx/lens-core';
 *
 * type AppContext = { db: DB; user: User };
 *
 * // Create all typed builders at once
 * const { model, query, mutation, resolver } = lens<AppContext>();
 *
 * // Define models with typed context (no need to repeat AppContext!)
 * const User = model("User", {
 *   id: id(),
 *   name: string(),
 *   posts: list(() => Post),
 * }).resolve({
 *   posts: ({ source, ctx }) => ctx.db.posts.filter(...)
 * });
 *
 * const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 *
 * const createPost = mutation()
 *   .input(z.object({ title: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.post.create(input));
 * ```
 *
 * @example With plugins (type-safe extensions)
 * ```typescript
 * import { lens, optimisticPlugin } from '@sylphx/lens-core';
 *
 * // With plugins - .optimistic() is type-safe
 * const { model, mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 *
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Available with optimisticPlugin
 *   .resolve(({ input, ctx }) => ctx.db.user.update(input));
 * ```
 */

import type { StepBuilder } from "@sylphx/reify";
import type {
	InferReturnType,
	MutationBuilderWithOptimistic,
	MutationBuilderWithReturns2,
	MutationDef,
	OptimisticDSL,
	QueryBuilder,
	ResolverFn,
	ReturnSpec,
	SubscriptionBuilder,
	ZodLikeSchema,
} from "./operations/index.js";
import {
	mutation as createMutation,
	query as createQuery,
	subscription as createSubscription,
} from "./operations/index.js";
import type {
	ExtractPluginExtensions,
	HasPlugin,
	PluginExtension,
	RuntimePlugin,
} from "./plugin/types.js";
import type { FieldBuilder, FieldDef, ResolverDef } from "./resolvers/index.js";
import { resolver as createResolver } from "./resolvers/index.js";
import type { EntityDef } from "./schema/define.js";
import type { ModelFactory } from "./schema/model.js";
import { model as createModel } from "./schema/model.js";
import type { EntityDefinition } from "./schema/types.js";

// =============================================================================
// Lens Factory Types
// =============================================================================

/**
 * Typed resolver factory function.
 * Uses TFields generic to preserve exact field types from the builder.
 */
export type LensResolver<TContext> = <
	TEntity extends EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any, TContext>>,
>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, TContext>) => TFields,
) => ResolverDef<TEntity, TFields, TContext>;

/**
 * Typed query factory function
 */
export interface LensQuery<TContext> {
	(): QueryBuilder<void, unknown, TContext>;
	(name: string): QueryBuilder<void, unknown, TContext>;
}

/**
 * Typed subscription factory function
 */
export interface LensSubscription<TContext> {
	(): SubscriptionBuilder<void, unknown, TContext>;
	(name: string): SubscriptionBuilder<void, unknown, TContext>;
}

/**
 * Typed model factory function.
 * Creates models with pre-typed context using plain object fields.
 */
export type LensModel<TContext> = ModelFactory<TContext>;

// =============================================================================
// Plugin-Aware Mutation Builder Types
// =============================================================================

/**
 * Mutation builder with plugin support.
 * Carries TPlugins through the entire chain.
 */
export interface LensMutationBuilder<
	_TInput,
	TOutput,
	TContext,
	TPlugins extends readonly PluginExtension[],
> {
	/** Define input validation schema */
	input<T>(schema: ZodLikeSchema<T>): LensMutationBuilderWithInput<T, TOutput, TContext, TPlugins>;
}

/**
 * Mutation builder after .input() with plugin support.
 */
export interface LensMutationBuilderWithInput<
	TInput,
	_TOutput,
	TContext,
	TPlugins extends readonly PluginExtension[],
> {
	/** Define return type */
	returns<R extends ReturnSpec>(
		spec: R,
	): LensMutationBuilderWithReturns<TInput, InferReturnType<R>, TContext, TPlugins>;

	/** Define resolver directly (for simple return types) */
	resolve<TOut>(fn: ResolverFn<TInput, TOut, TContext>): MutationDef<TInput, TOut>;
}

/**
 * Mutation builder after .returns() with plugin support.
 *
 * Uses conditional type to select the appropriate interface:
 * - With optimistic plugin: interface with proper optimistic() overloads
 * - Without: base interface with just resolve()
 *
 * This approach preserves TypeScript's overload resolution for better
 * callback parameter inference.
 */
export type LensMutationBuilderWithReturns<
	TInput,
	TOutput,
	TContext,
	TPlugins extends readonly PluginExtension[],
> = HasPlugin<TPlugins, "optimistic"> extends true
	? LensMutationBuilderWithReturnsAndOptimistic<TInput, TOutput, TContext>
	: MutationBuilderWithReturns2<TInput, TOutput, TContext>;

/**
 * Mutation builder with optimistic() overloads.
 * This interface preserves proper overload semantics for callback inference.
 *
 * IMPORTANT: Callback overload comes FIRST to enable proper TypeScript inference
 * for inline arrow functions. TypeScript tries overloads in order.
 */
export interface LensMutationBuilderWithReturnsAndOptimistic<TInput, TOutput, TContext>
	extends MutationBuilderWithReturns2<TInput, TOutput, TContext> {
	/**
	 * Define optimistic update behavior with typed callback.
	 * The callback receives `{ input }` with the input type inferred from `.input()`.
	 *
	 * @param callback - Callback that receives typed input and returns step builders
	 * @returns Builder with .resolve() method
	 *
	 * @example
	 * ```typescript
	 * .optimistic(({ input }) => [
	 *   e.update(User, { id: input.id, name: input.name }),
	 * ])
	 * ```
	 */
	optimistic(
		callback: (ctx: { input: TInput }) => StepBuilder[],
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

/**
 * Typed mutation factory function with plugin support.
 */
export interface LensMutation<TContext, TPlugins extends readonly PluginExtension[]> {
	(): LensMutationBuilder<unknown, unknown, TContext, TPlugins>;
	(name: string): LensMutationBuilder<unknown, unknown, TContext, TPlugins>;
}

// =============================================================================
// Lens Result Types
// =============================================================================

/**
 * Result of lens<TContext>() without plugins.
 */
export interface Lens<TContext> {
	/**
	 * Create a model with pre-typed context.
	 */
	model: LensModel<TContext>;

	/**
	 * Create a resolver with pre-typed context.
	 */
	resolver: LensResolver<TContext>;

	/**
	 * Create a query with pre-typed context.
	 */
	query: LensQuery<TContext>;

	/**
	 * Create a mutation with pre-typed context.
	 * No plugin methods available (use lens({ plugins }) to enable).
	 */
	mutation: LensMutation<TContext, []>;

	/**
	 * Create a subscription with pre-typed context.
	 */
	subscription: LensSubscription<TContext>;
}

/**
 * Result of lens<TContext>({ plugins }) with plugins.
 *
 * @typeParam TContext - User context type
 * @typeParam TPlugins - Tuple of plugin extension types
 */
export interface LensWithPlugins<TContext, TPlugins extends readonly PluginExtension[]> {
	/**
	 * Create a model with pre-typed context.
	 */
	model: LensModel<TContext>;

	/**
	 * Create a resolver with pre-typed context.
	 */
	resolver: LensResolver<TContext>;

	/**
	 * Create a query with pre-typed context.
	 */
	query: LensQuery<TContext>;

	/**
	 * Create a mutation with pre-typed context and plugin methods.
	 */
	mutation: LensMutation<TContext, TPlugins>;

	/**
	 * Create a subscription with pre-typed context.
	 */
	subscription: LensSubscription<TContext>;

	/**
	 * Runtime plugins for use with createApp().
	 */
	plugins: RuntimePlugin[];
}

// =============================================================================
// Lens Configuration
// =============================================================================

/**
 * Configuration for lens() with plugins.
 */
export interface LensConfig<
	TPlugins extends
		readonly RuntimePlugin<PluginExtension>[] = readonly RuntimePlugin<PluginExtension>[],
> {
	/**
	 * Plugins that extend builder functionality.
	 *
	 * @example
	 * ```typescript
	 * const { mutation } = lens<AppContext>({
	 *   plugins: [optimisticPlugin()],
	 * });
	 * ```
	 */
	plugins?: TPlugins;
}

/**
 * Configuration for lens() with plugins (plugins required).
 * Used internally for better type inference.
 */
export interface LensConfigWithPlugins<TPlugins extends readonly RuntimePlugin<PluginExtension>[]> {
	plugins: TPlugins;
}

// =============================================================================
// Lens Factory Implementation
// =============================================================================

/**
 * Create typed query, mutation, and resolver builders with shared context.
 *
 * This is the primary API for Lens - call once with your context type,
 * then use the returned builders everywhere.
 *
 * @example Without plugins
 * ```typescript
 * const { query, mutation, resolver } = lens<AppContext>();
 *
 * // .optimistic() is NOT available
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => ...);  // Only .resolve() available
 * ```
 *
 * @example With plugins
 * ```typescript
 * const { mutation, plugins } = lens<AppContext>({
 *   plugins: [optimisticPlugin()],
 * });
 *
 * // .optimistic() is now available
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Plugin method available
 *   .resolve(({ input }) => ...);
 *
 * // Pass plugins to server
 * createApp({ router, plugins });
 * ```
 */
/**
 * Lens builder that allows separate configuration of context type and plugins.
 * This avoids TypeScript overload resolution issues when providing explicit type params.
 */
export interface LensBuilder<TContext> extends Lens<TContext> {
	/**
	 * Add plugins to the lens.
	 * Returns LensWithPlugins which includes plugin-provided methods on builders.
	 */
	withPlugins<const TPlugins extends readonly RuntimePlugin<PluginExtension>[]>(
		plugins: TPlugins,
	): LensWithPlugins<TContext, ExtractPluginExtensions<TPlugins>>;
}

/**
 * Create a typed lens without plugins.
 * Use .withPlugins() to add plugins after the fact.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const { query, mutation } = lens<MyContext>();
 *
 * // With plugins - use .withPlugins()
 * const { mutation, plugins } = lens<MyContext>().withPlugins([optimisticPlugin()]);
 * mutation().input(...).returns(...).optimistic('merge');
 * ```
 */
export function lens<TContext>(): LensBuilder<TContext>;

/**
 * Create a typed lens with plugins.
 * This overload is for when you want to provide plugins inline.
 *
 * NOTE: Due to TypeScript overload resolution, do NOT provide an explicit type
 * parameter when using this form. Let TypeScript infer TContext from usage,
 * or use `lens<TContext>().withPlugins([...])` instead.
 */
export function lens<
	TContext,
	const TPlugins extends readonly RuntimePlugin<PluginExtension>[],
>(config: { plugins: TPlugins }): LensWithPlugins<TContext, ExtractPluginExtensions<TPlugins>>;

/**
 * Implementation
 */
export function lens<TContext>(config?: {
	plugins?: readonly RuntimePlugin<PluginExtension>[];
}): LensBuilder<TContext> | LensWithPlugins<TContext, readonly PluginExtension[]> {
	// Create typed resolver factory using curried form
	const typedResolver = createResolver<TContext>();

	// Create typed model factory - delegates to createModel with TContext baked in
	const typedModel = createModel<TContext>() as LensModel<TContext>;

	// Create mutation factory that returns plugin-aware builders
	const createPluginMutation = (name?: string) => {
		const base = createMutation<TContext>(name as string);
		// The runtime builder is the same, but types differ based on TPlugins
		return base;
	};

	// Helper to create withPlugins method
	const createWithPlugins = (
		plugins: readonly RuntimePlugin<PluginExtension>[],
	): LensWithPlugins<TContext, readonly PluginExtension[]> => ({
		model: typedModel,
		resolver: typedResolver as LensResolver<TContext>,
		query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
		mutation: createPluginMutation as unknown as LensMutation<TContext, readonly PluginExtension[]>,
		subscription: ((name?: string) =>
			createSubscription<TContext>(name as string)) as LensSubscription<TContext>,
		plugins: plugins as unknown as RuntimePlugin[],
	});

	// If no config or no plugins, return LensBuilder with withPlugins method
	if (!config?.plugins || config.plugins.length === 0) {
		return {
			model: typedModel,
			resolver: typedResolver as LensResolver<TContext>,
			query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
			mutation: createPluginMutation as LensMutation<TContext, []>,
			subscription: ((name?: string) =>
				createSubscription<TContext>(name as string)) as LensSubscription<TContext>,
			withPlugins: createWithPlugins as LensBuilder<TContext>["withPlugins"],
		} as LensBuilder<TContext>;
	}

	// Return LensWithPlugins with plugin-extended types
	// Note: The actual plugin types are handled by overload signatures
	return createWithPlugins(config.plugins);
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

// Re-export optimistic plugin types
export type {
	OptimisticPluginExtension,
	OptimisticPluginMarker,
} from "./plugin/optimistic-extension.js";
export { isOptimisticPlugin, OPTIMISTIC_PLUGIN_SYMBOL } from "./plugin/optimistic-extension.js";
// Re-export plugin types
export type {
	ExtractPluginExtensions,
	ExtractPluginMethods,
	NoPlugins,
	PluginExtension,
	RuntimePlugin,
} from "./plugin/types.js";
