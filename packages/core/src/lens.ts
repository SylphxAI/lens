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
 */

import type { MutationBuilder, QueryBuilder } from "./operations/index";
import { mutation as createMutation, query as createQuery } from "./operations/index";
import type { FieldBuilder, FieldDef, FieldResolverContext, ResolverDef } from "./resolvers/index";
import { resolver as createResolver } from "./resolvers/index";
import type { EntityDef } from "./schema/define";
import type { EntityDefinition } from "./schema/types";

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
// Lens Factory Implementation
// =============================================================================

/**
 * Create typed query, mutation, and resolver builders with shared context.
 *
 * This is the primary API for Lens - call once with your context type,
 * then use the returned builders everywhere.
 *
 * @example
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
 */
export function lens<TContext = FieldResolverContext>(): Lens<TContext> {
	// Create typed resolver factory using curried form
	const typedResolver = createResolver<TContext>();

	return {
		resolver: typedResolver as LensResolver<TContext>,
		query: ((name?: string) => createQuery<TContext>(name as string)) as LensQuery<TContext>,
		mutation: ((name?: string) =>
			createMutation<TContext>(name as string)) as LensMutation<TContext>,
	};
}
