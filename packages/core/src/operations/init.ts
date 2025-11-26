/**
 * @sylphx/lens-core - Typed Lens Initialization
 *
 * Create typed query/mutation builders with context type inference.
 * Similar to tRPC's initTRPC pattern.
 *
 * @example
 * ```typescript
 * // lib/lens.ts
 * import { initLens } from '@sylphx/lens-core'
 *
 * interface MyContext {
 *   db: Database
 *   user: User | null
 * }
 *
 * export const lens = initLens.context<MyContext>().create()
 *
 * // routes/user.ts
 * import { lens } from '../lib/lens'
 *
 * export const getUser = lens.query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => {
 *     // ctx is typed as MyContext!
 *     return ctx.db.user.find(input.id)
 *   })
 *
 * export const createUser = lens.mutation()
 *   .input(z.object({ name: z.string() }))
 *   .resolve(({ input, ctx }) => {
 *     return ctx.db.user.create(input)
 *   })
 * ```
 */

import { query, mutation, type QueryBuilder, type MutationBuilder } from "./index";

/**
 * Lens instance with typed context
 */
export interface LensInstance<TContext> {
	/**
	 * Create a query builder with typed context
	 *
	 * @example
	 * ```typescript
	 * const getUser = lens.query()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
	 * ```
	 */
	query(): QueryBuilder<void, unknown, TContext>;
	query(name: string): QueryBuilder<void, unknown, TContext>;

	/**
	 * Create a mutation builder with typed context
	 *
	 * @example
	 * ```typescript
	 * const createUser = lens.mutation()
	 *   .input(z.object({ name: z.string() }))
	 *   .resolve(({ input, ctx }) => ctx.db.user.create(input))
	 * ```
	 */
	mutation(): MutationBuilder<unknown, unknown, TContext>;
	mutation(name: string): MutationBuilder<unknown, unknown, TContext>;
}

/**
 * Lens builder with context type
 */
export interface LensBuilderWithContext<TContext> {
	/**
	 * Create the Lens instance
	 *
	 * @example
	 * ```typescript
	 * const lens = initLens.context<MyContext>().create()
	 * ```
	 */
	create(): LensInstance<TContext>;
}

/**
 * Lens initialization builder
 */
export interface LensBuilder {
	/**
	 * Define the context type for all operations
	 *
	 * @example
	 * ```typescript
	 * interface MyContext {
	 *   db: Database
	 *   user: User | null
	 * }
	 *
	 * const lens = initLens.context<MyContext>().create()
	 * ```
	 */
	context<TContext>(): LensBuilderWithContext<TContext>;
}

/**
 * Create a Lens instance factory with typed context
 */
function createLensBuilder(): LensBuilder {
	return {
		context<TContext>(): LensBuilderWithContext<TContext> {
			return {
				create(): LensInstance<TContext> {
					return {
						query(name?: string) {
							return query<TContext>(name as string);
						},
						mutation(name?: string) {
							return mutation<TContext>(name as string);
						},
					};
				},
			};
		},
	};
}

/**
 * Initialize Lens with typed context
 *
 * @example
 * ```typescript
 * // lib/lens.ts
 * import { initLens } from '@sylphx/lens-core'
 *
 * interface MyContext {
 *   db: Database
 *   user: User | null
 * }
 *
 * export const lens = initLens.context<MyContext>().create()
 *
 * // routes/user.ts
 * import { lens } from '../lib/lens'
 *
 * export const getUser = lens.query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ ctx }) => ctx.db.user.findMany())
 *   // ctx.db is typed!
 * ```
 */
export const initLens: LensBuilder = createLensBuilder();
