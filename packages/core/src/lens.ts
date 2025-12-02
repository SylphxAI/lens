/**
 * @sylphx/lens-core - Unified Factory
 *
 * Single factory function that provides typed query, mutation, and resolver builders.
 * Eliminates repetitive context typing across your codebase.
 *
 * @example
 * ```typescript
 * import { lens } from '@sylphx/lens-core';
 *
 * type AppContext = { db: DB; user: User };
 *
 * // Create all typed builders at once
 * const { query, mutation, resolver } = lens<AppContext>();
 *
 * // All operations now have typed context
 * const userResolver = resolver(User, (f) => ({
 *   id: f.expose('id'),
 *   posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.posts...),
 * }));
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
 * const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 *
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Available with optimisticPlugin
 *   .resolve(({ input, ctx }) => ctx.db.user.update(input));
 * ```
 */

import type {
	MutationBuilder,
	MutationBuilderWithInput,
	QueryBuilder,
} from "./operations/index.js";
import { mutation as createMutation, query as createQuery } from "./operations/index.js";
import type { PluginExtension, RuntimePlugin } from "./plugin/types.js";
import type {
	FieldBuilder,
	FieldDef,
	FieldResolverContext,
	ResolverDef,
} from "./resolvers/index.js";
import { resolver as createResolver } from "./resolvers/index.js";
import type { EntityDef } from "./schema/define.js";
import type { EntityDefinition } from "./schema/types.js";

// =============================================================================
// Lens Factory Types
// =============================================================================

/**
 * Typed resolver factory function
 */
export type LensResolver<TContext> = <TEntity extends EntityDef<string, EntityDefinition>>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, TContext>) => Record<string, FieldDef<any, any, TContext>>,
) => ResolverDef<TEntity, Record<string, FieldDef<any, any, TContext>>, TContext>;

/**
 * Typed query factory function
 */
export interface LensQuery<TContext> {
	(): QueryBuilder<void, unknown, TContext>;
	(name: string): QueryBuilder<void, unknown, TContext>;
}

/**
 * Typed mutation factory function
 */
export interface LensMutation<TContext> {
	(): MutationBuilder<unknown, unknown, TContext>;
	(name: string): MutationBuilder<unknown, unknown, TContext>;
}

// =============================================================================
// Plugin-Extended Builder Types
// =============================================================================

/**
 * Mutation builder WITHOUT optimistic plugin.
 * .returns() gives MutationBuilderWithReturnsBase (no .optimistic()).
 */
export type MutationBuilderNoPlugins<TContext> = Omit<
	MutationBuilder<unknown, unknown, TContext>,
	"input"
> & {
	input<T>(
		schema: import("./operations/index.js").ZodLikeSchema<T>,
	): MutationBuilderWithInputNoPlugins<T, unknown, TContext>;
};

/**
 * Mutation builder WITH optimistic plugin.
 * .returns() gives full MutationBuilderWithReturns (with .optimistic()).
 */
export type MutationBuilderWithPlugins<TContext> = Omit<
	MutationBuilder<unknown, unknown, TContext>,
	"input"
> & {
	input<T>(
		schema: import("./operations/index.js").ZodLikeSchema<T>,
	): MutationBuilderWithInputWithPlugins<T, unknown, TContext>;
};

/**
 * Mutation builder after .input() WITHOUT optimistic plugin.
 * Returns() gives MutationBuilderWithReturnsBase (no .optimistic()).
 */
export type MutationBuilderWithInputNoPlugins<TInput, TOutput, TContext> = Omit<
	MutationBuilderWithInput<TInput, TOutput, TContext>,
	"returns"
> & {
	returns<R extends import("./operations/index.js").ReturnSpec>(
		spec: R,
	): MutationBuilderWithReturnsBase<
		TInput,
		import("./operations/index.js").InferReturnType<R>,
		TContext
	>;
};

/**
 * Mutation builder after .input() WITH optimistic plugin.
 * Returns() gives the full MutationBuilderWithReturns (with .optimistic()).
 */
export type MutationBuilderWithInputWithPlugins<TInput, TOutput, TContext> = Omit<
	MutationBuilderWithInput<TInput, TOutput, TContext>,
	"returns"
> & {
	returns<R extends import("./operations/index.js").ReturnSpec>(
		spec: R,
	): import("./operations/index.js").MutationBuilderWithReturns<
		TInput,
		import("./operations/index.js").InferReturnType<R>,
		TContext
	>;
};

/**
 * Base mutation builder with returns, without .optimistic().
 * Plugin extensions add .optimistic() conditionally.
 */
export interface MutationBuilderWithReturnsBase<TInput, TOutput, TContext> {
	/** Define resolver function */
	resolve(
		fn: import("./operations/index.js").ResolverFn<TInput, TOutput, TContext>,
	): import("./operations/index.js").MutationDef<TInput, TOutput>;
}

/**
 * Helper type to check if plugin array includes optimistic plugin.
 * Uses direct array element check instead of HasPlugin which can fail with inference.
 */
type IncludesOptimistic<TPlugins> = TPlugins extends readonly (infer E)[]
	? E extends { readonly name: "optimistic" }
		? true
		: false
	: false;

/**
 * Mutation builder after .returns() with plugin extensions.
 * Conditionally includes .optimistic() based on plugin presence.
 *
 * NOTE: We explicitly add the .optimistic() method with bound type parameters
 * rather than using ExtractExtension, because the generic methods in the
 * plugin extension interface don't automatically bind to the outer types.
 */
export type MutationBuilderWithReturnsExtended<
	TInput,
	TOutput,
	TContext,
	TPlugins extends readonly PluginExtension[],
> = MutationBuilderWithReturnsBase<TInput, TOutput, TContext> &
	(IncludesOptimistic<TPlugins> extends true
		? {
				optimistic(
					spec: import("./operations/index.js").OptimisticDSL,
				): import("./operations/index.js").MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
				optimistic(
					callback: import("./operations/index.js").OptimisticCallback<TInput>,
				): import("./operations/index.js").MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
			}
		: unknown);

/**
 * Mutation factory WITHOUT plugins - returns builders without .optimistic()
 */
export interface LensMutationNoPlugins<TContext> {
	(): MutationBuilderNoPlugins<TContext>;
	(name: string): MutationBuilderNoPlugins<TContext>;
}

/**
 * Mutation factory WITH plugins - returns builders with .optimistic()
 */
export interface LensMutationWithPlugins<TContext> {
	(): MutationBuilderWithPlugins<TContext>;
	(name: string): MutationBuilderWithPlugins<TContext>;
}

/**
 * Result of lens<TContext>() - all typed builders
 *
 * NOTE: This uses the plugin-extended builder types with an empty plugin array,
 * which means .optimistic() is NOT available. Use lens({ plugins: [optimisticPlugin()] })
 * to enable .optimistic().
 */
export interface Lens<TContext> {
	/**
	 * Create a resolver with pre-typed context.
	 *
	 * @example
	 * ```typescript
	 * const userResolver = resolver(User, (f) => ({
	 *   id: f.expose('id'),
	 *   posts: f.many(Post).resolve(({ parent, ctx }) => {
	 *     // ctx is AppContext ✅
	 *     return ctx.db.posts.findByAuthor(parent.id);
	 *   }),
	 * }));
	 * ```
	 */
	resolver: LensResolver<TContext>;

	/**
	 * Create a query with pre-typed context.
	 *
	 * @example
	 * ```typescript
	 * const getUser = query()
	 *   .input(z.object({ id: z.string() }))
	 *   .returns(User)
	 *   .resolve(({ input, ctx }) => {
	 *     // ctx is AppContext ✅
	 *     return ctx.db.user.find(input.id);
	 *   });
	 * ```
	 */
	query: LensQuery<TContext>;

	/**
	 * Create a mutation with pre-typed context.
	 * NOTE: .optimistic() is NOT available without plugins.
	 * Use lens({ plugins: [optimisticPlugin()] }) to enable it.
	 *
	 * @example
	 * ```typescript
	 * const createPost = mutation()
	 *   .input(z.object({ title: z.string() }))
	 *   .returns(Post)
	 *   .resolve(({ input, ctx }) => {
	 *     // ctx is AppContext ✅
	 *     return ctx.db.post.create({ ...input, authorId: ctx.user.id });
	 *   });
	 * ```
	 */
	mutation: LensMutationNoPlugins<TContext>;
}

// =============================================================================
// Plugin-Aware Lens Factory Types
// =============================================================================

/**
 * Configuration for lens() with plugins.
 *
 * Accepts RuntimePlugin[] and extracts PluginExtension types for type composition.
 */
export interface LensConfig<
	TPlugins extends
		readonly RuntimePlugin<PluginExtension>[] = readonly RuntimePlugin<PluginExtension>[],
> {
	/**
	 * Plugins that extend builder functionality.
	 * Each plugin can add methods to query/mutation builders.
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
 * Result of lens<TContext>({ plugins }) - typed builders with plugin extensions
 *
 * NOTE: This simplified version always includes .optimistic() on mutations
 * when ANY plugins are configured. For finer control, separate plugin-specific
 * interfaces could be created.
 */
export interface LensWithPlugins<TContext> {
	/**
	 * Create a resolver with pre-typed context.
	 */
	resolver: LensResolver<TContext>;

	/**
	 * Create a query with pre-typed context.
	 * Extended with plugin methods when plugins are configured.
	 */
	query: LensQuery<TContext>;

	/**
	 * Create a mutation with pre-typed context.
	 * .optimistic() is available when optimisticPlugin is included.
	 *
	 * @example With optimisticPlugin
	 * ```typescript
	 * const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
	 * mutation()
	 *   .input(z.object({ id: z.string(), name: z.string() }))
	 *   .returns(User)
	 *   .optimistic('merge')  // ✅ Available from optimisticPlugin
	 *   .resolve(({ input, ctx }) => ctx.db.user.update(input));
	 * ```
	 */
	mutation: LensMutationWithPlugins<TContext>;

	/**
	 * Runtime plugins for use with createServer().
	 * Pass this to the server to enable plugin functionality.
	 */
	plugins: RuntimePlugin[];
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
 * @example Basic usage
 * ```typescript
 * // Define your context type
 * type AppContext = {
 *   db: Database;
 *   user: User | null;
 *   requestId: string;
 * };
 *
 * // Create typed builders
 * const { query, mutation, resolver } = lens<AppContext>();
 *
 * // Define entities (plain data)
 * const User = entity('User', { id: t.id(), name: t.string() });
 * const Post = entity('Post', { id: t.id(), title: t.string(), authorId: t.string() });
 *
 * // Define resolvers (pure values)
 * const userResolver = resolver(User, (f) => ({
 *   id: f.expose('id'),
 *   name: f.expose('name'),
 *   posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.postsByAuthor(parent.id)),
 * }));
 *
 * // Define operations
 * const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 *
 * // Create server with resolver array
 * createServer({
 *   router: appRouter,
 *   resolvers: [userResolver, postResolver],
 *   context: () => ({ db, user: null, requestId: crypto.randomUUID() }),
 * });
 * ```
 *
 * @example With plugins (type-safe extensions)
 * ```typescript
 * import { lens, optimisticPlugin } from '@sylphx/lens-core';
 *
 * // Pass plugins for type-safe builder extensions
 * const { mutation, plugins } = lens<AppContext>({
 *   plugins: [optimisticPlugin()],
 * });
 *
 * // .optimistic() is now available on mutations
 * const updateUser = mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Type-safe with plugin
 *   .resolve(({ input, ctx }) => ctx.db.user.update(input));
 *
 * // Pass plugins to server
 * createServer({ router, plugins });
 * ```
 */
export function lens<TContext = FieldResolverContext>(): Lens<TContext>;
export function lens<
	TContext = FieldResolverContext,
	TPlugins extends
		readonly RuntimePlugin<PluginExtension>[] = readonly RuntimePlugin<PluginExtension>[],
>(config: LensConfig<TPlugins>): LensWithPlugins<TContext>;
export function lens<
	TContext = FieldResolverContext,
	TPlugins extends
		readonly RuntimePlugin<PluginExtension>[] = readonly RuntimePlugin<PluginExtension>[],
>(config?: LensConfig<TPlugins>): Lens<TContext> | LensWithPlugins<TContext> {
	// Create typed resolver factory using curried form
	const typedResolver = createResolver<TContext>();

	// If no config or no plugins, return base Lens (no .optimistic())
	if (!config?.plugins) {
		return {
			resolver: typedResolver as LensResolver<TContext>,
			query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
			mutation: ((name?: string) =>
				createMutation<TContext>(name as string)) as LensMutationNoPlugins<TContext>,
		};
	}

	// Return LensWithPlugins with runtime plugins (has .optimistic())
	// doesn't propagate the plugin types correctly through the function signature.
	return {
		resolver: typedResolver as LensResolver<TContext>,
		query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
		mutation: ((name?: string) =>
			createMutation<TContext>(name as string)) as unknown as LensMutationWithPlugins<TContext>,
		plugins: config.plugins as unknown as RuntimePlugin[],
	};
}
