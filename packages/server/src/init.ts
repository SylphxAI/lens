/**
 * @sylphx/lens-server - Server-side Lens Initialization
 *
 * Extends core's initLens with createServer for full type safety.
 *
 * @example
 * ```typescript
 * // lib/lens.ts
 * import { initLens } from '@sylphx/lens-server'
 *
 * interface Context {
 *   db: PrismaClient
 *   user: User | null
 * }
 *
 * export const lens = initLens.context<Context>().create()
 *
 * // routes/user.ts
 * export const getUser = lens.query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }))
 *
 * // server.ts
 * const server = lens.createServer({
 *   router: router({ user: userRoutes }),
 *   context: (req) => ({
 *     db: prisma,
 *     user: getUserFromRequest(req),
 *   }),
 * })
 * ```
 */

import {
	type ContextValue,
	type MutationBuilder,
	type QueryBuilder,
	mutation,
	query,
} from "@sylphx/lens-core";
import {
	type EntitiesMap,
	type LensServer,
	type LensServerConfig,
	type MutationsMap,
	type QueriesMap,
	type RelationsArray,
	createServer,
} from "./server/create";

// =============================================================================
// Types
// =============================================================================

/**
 * Server-side Lens instance with typed context
 */
export interface LensServerInstance<TContext extends ContextValue> {
	/**
	 * Create a query builder with typed context
	 */
	query(): QueryBuilder<void, unknown, TContext>;
	query(name: string): QueryBuilder<void, unknown, TContext>;

	/**
	 * Create a mutation builder with typed context
	 */
	mutation(): MutationBuilder<unknown, unknown, TContext>;
	mutation(name: string): MutationBuilder<unknown, unknown, TContext>;

	/**
	 * Create server with type-safe context
	 *
	 * The context function must return the exact TContext type.
	 *
	 * @example
	 * ```typescript
	 * const server = lens.createServer({
	 *   router: appRouter,
	 *   context: async (req) => ({
	 *     db: prisma,
	 *     user: await getUserFromRequest(req),
	 *   }),
	 * })
	 * ```
	 */
	createServer<Q extends QueriesMap = QueriesMap, M extends MutationsMap = MutationsMap>(
		config: LensServerInstanceConfig<TContext, Q, M>,
	): LensServer & { _types: { queries: Q; mutations: M } };
}

/**
 * Server config without context type (it's inferred from lens instance)
 */
export interface LensServerInstanceConfig<
	TContext extends ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Entity definitions */
	entities?: EntitiesMap;
	/** Relation definitions */
	relations?: RelationsArray;
	/** Router definition */
	router?: LensServerConfig<TContext>["router"];
	/** Query definitions (flat, legacy) */
	queries?: Q;
	/** Mutation definitions (flat, legacy) */
	mutations?: M;
	/** Entity resolvers */
	resolvers?: LensServerConfig<TContext>["resolvers"];
	/** Context factory - must return TContext */
	context?: (req?: unknown) => TContext | Promise<TContext>;
	/** Server version */
	version?: string;
}

/**
 * Lens builder with context type (server-side)
 */
export interface LensServerBuilderWithContext<TContext extends ContextValue> {
	/**
	 * Create the Lens server instance
	 */
	create(): LensServerInstance<TContext>;
}

/**
 * Server-side Lens initialization builder
 */
export interface LensServerBuilder {
	/**
	 * Define the context type for all operations
	 *
	 * @example
	 * ```typescript
	 * interface Context {
	 *   db: PrismaClient
	 *   user: User | null
	 * }
	 *
	 * const lens = initLens.context<Context>().create()
	 * ```
	 */
	context<TContext extends ContextValue>(): LensServerBuilderWithContext<TContext>;
}

// =============================================================================
// Implementation
// =============================================================================

function createLensServerBuilder(): LensServerBuilder {
	return {
		context<TContext extends ContextValue>(): LensServerBuilderWithContext<TContext> {
			return {
				create(): LensServerInstance<TContext> {
					return {
						query(name?: string) {
							return query<TContext>(name as string);
						},
						mutation(name?: string) {
							return mutation<TContext>(name as string);
						},
						createServer<Q extends QueriesMap, M extends MutationsMap>(
							config: LensServerInstanceConfig<TContext, Q, M>,
						) {
							// biome-ignore lint/suspicious/noExplicitAny: Context is already typed from initLens
							return createServer(config as any) as LensServer & { _types: { queries: Q; mutations: M; context: TContext } };
						},
					};
				},
			};
		},
	};
}

/**
 * Initialize Lens for server-side use with typed context
 *
 * This is the recommended way to set up Lens on the server.
 * It provides full type safety for context across all operations.
 *
 * @example
 * ```typescript
 * // lib/lens.ts
 * import { initLens } from '@sylphx/lens-server'
 *
 * interface Context {
 *   db: PrismaClient
 *   user: { id: string; role: 'admin' | 'user' } | null
 * }
 *
 * export const lens = initLens.context<Context>().create()
 *
 * // routes/user.ts
 * import { lens } from '../lib/lens'
 *
 * export const getUser = lens.query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => {
 *     // ctx.db and ctx.user are fully typed!
 *     return ctx.db.user.findUnique({ where: { id: input.id } })
 *   })
 *
 * // server.ts
 * import { router } from '@sylphx/lens-server'
 * import { lens } from './lib/lens'
 * import * as userRoutes from './routes/user'
 *
 * const server = lens.createServer({
 *   router: router({ user: userRoutes }),
 *   context: async (req) => ({
 *     db: prisma,
 *     user: await getUserFromRequest(req),
 *   }),
 * })
 * ```
 */
export const initLens: LensServerBuilder = createLensServerBuilder();
