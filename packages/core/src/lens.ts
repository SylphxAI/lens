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

import type { MutationBuilder, QueryBuilder } from "./operations/index.js";
import { mutation as createMutation, query as createQuery } from "./operations/index.js";
import type { NoExtension, PluginExtension, RuntimePlugin } from "./plugin/types.js";
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

/**
 * Result of lens<TContext>() - all typed builders
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
	mutation: LensMutation<TContext>;
}

// =============================================================================
// Plugin-Aware Lens Factory Types
// =============================================================================

/**
 * Configuration for lens() with plugins.
 */
export interface LensConfig<TPlugins extends readonly PluginExtension[] = readonly NoExtension[]> {
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
 */
export interface LensWithPlugins<
	TContext,
	_TPlugins extends readonly PluginExtension[] = readonly NoExtension[],
> {
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
	 * Extended with plugin methods when plugins are configured.
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
	mutation: LensMutation<TContext>;

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
	TPlugins extends readonly PluginExtension[] = readonly NoExtension[],
>(config: LensConfig<TPlugins>): LensWithPlugins<TContext, TPlugins>;
export function lens<
	TContext = FieldResolverContext,
	TPlugins extends readonly PluginExtension[] = readonly NoExtension[],
>(config?: LensConfig<TPlugins>): Lens<TContext> | LensWithPlugins<TContext, TPlugins> {
	// Create typed resolver factory using curried form
	const typedResolver = createResolver<TContext>();

	const base: Lens<TContext> = {
		resolver: typedResolver as LensResolver<TContext>,
		query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
		mutation: ((name?: string) =>
			createMutation<TContext>(name as string)) as LensMutation<TContext>,
	};

	// If no config or no plugins, return base Lens
	if (!config?.plugins) {
		return base;
	}

	// Return LensWithPlugins with runtime plugins
	return {
		...base,
		plugins: config.plugins as unknown as RuntimePlugin[],
	} as LensWithPlugins<TContext, TPlugins>;
}
