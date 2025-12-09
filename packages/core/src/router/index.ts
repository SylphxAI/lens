/**
 * @sylphx/lens-core - Router
 *
 * Namespace support for organizing queries and mutations.
 * Routes can contain procedures (query/mutation) or nested routers.
 *
 * @example
 * ```typescript
 * import { router, query, mutation } from '@sylphx/lens-core';
 *
 * export const appRouter = router({
 *   user: {
 *     get: query().input(z.object({ id: z.string() })).resolve(...)
 *     create: mutation().input(...).resolve(...)
 *   },
 *   post: router({
 *     list: query().resolve(...)
 *   })
 * });
 * ```
 */

import type { AnyQueryDef, MutationDef, QueryDef } from "../operations/index.js";
import { isMutationDef, isQueryDef } from "../operations/index.js";
import type { UnionToIntersection } from "../utils/types.js";

// =============================================================================
// Types
// =============================================================================

/** Any procedure (query or mutation) */
export type AnyProcedure =
	| AnyQueryDef<unknown, unknown, unknown>
	| MutationDef<unknown, unknown, unknown>;

/** Router routes - can contain procedures or nested routers */
export type RouterRoutes = {
	[key: string]: AnyProcedure | RouterDef;
};

/** Router definition with context type */
export interface RouterDef<TRoutes extends RouterRoutes = RouterRoutes, TContext = unknown> {
	_type: "router";
	_routes: TRoutes;
	/** Phantom type for context inference */
	_context?: TContext;
}

// =============================================================================
// Context Inference
// =============================================================================

/**
 * Extract context from a procedure (non-recursive, single level)
 */
type ExtractProcedureContext<T> =
	T extends QueryDef<unknown, unknown, infer C>
		? C
		: T extends MutationDef<unknown, unknown, infer C>
			? C
			: unknown;

/**
 * Extract context from router's explicit context or from its routes
 */
type ExtractRouterContext<T> =
	T extends RouterDef<infer R, infer C>
		? unknown extends C
			? R extends Record<string, infer V>
				? ExtractProcedureContext<V>
				: unknown
			: C
		: unknown;

/**
 * Extract contexts from a routes object (one level deep)
 * Handles both direct procedures and nested routers
 */
type ExtractRoutesContext<T> =
	T extends Record<string, infer V>
		? V extends RouterDef<RouterRoutes, infer _C>
			? ExtractRouterContext<V>
			: ExtractProcedureContext<V>
		: unknown;

/**
 * Infer merged context type from router or routes
 *
 * Each procedure can declare its own context requirements.
 * The final context is the intersection of all requirements.
 *
 * @example
 * ```typescript
 * // Each query declares what it needs
 * const userGet = query<{ db: DB; user: User }>().resolve(...)
 * const postList = query<{ db: DB; cache: Cache }>().resolve(...)
 *
 * const appRouter = router({ user: { get: userGet }, post: { list: postList } })
 *
 * // InferRouterContext<typeof appRouter> = { db: DB; user: User; cache: Cache }
 * ```
 */
export type InferRouterContext<T> = UnionToIntersection<
	T extends RouterDef<infer R, infer C>
		? unknown extends C
			? ExtractRoutesContext<R>
			: C
		: T extends Record<string, unknown>
			? ExtractRoutesContext<T>
			: unknown
>;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a router definition */
export function isRouterDef(value: unknown): value is RouterDef {
	return typeof value === "object" && value !== null && (value as RouterDef)._type === "router";
}

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create a router for namespacing operations
 *
 * The router automatically infers the context type from its routes.
 * When used with createApp, the context function must return
 * a matching type.
 *
 * @example
 * ```typescript
 * import { router, query, mutation } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * // Using typed lens instance
 * const lens = initLens.context<MyContext>().create()
 *
 * export const appRouter = router({
 *   user: {
 *     get: lens.query()
 *       .input(z.object({ id: z.string() }))
 *       .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),
 *     create: lens.mutation()
 *       .input(z.object({ name: z.string() }))
 *       .resolve(({ input, ctx }) => ctx.db.user.create(input)),
 *   },
 * });
 * // appRouter is RouterDef<..., MyContext>
 *
 * // createServer will enforce context type
 * const server = createApp({
 *   router: appRouter,
 *   context: () => ({
 *     db: prisma,  // Must match MyContext!
 *   }),
 * })
 * ```
 */
export function router<TRoutes extends RouterRoutes>(
	routes: TRoutes,
): RouterDef<TRoutes, InferRouterContext<TRoutes>> {
	return {
		_type: "router",
		_routes: routes,
	};
}

// =============================================================================
// Router Utilities
// =============================================================================

/** Flatten router to dot-notation paths for server processing */
export function flattenRouter(routerDef: RouterDef, prefix = ""): Map<string, AnyProcedure> {
	const result = new Map<string, AnyProcedure>();

	const flatten = (routes: Record<string, unknown>, currentPrefix: string) => {
		for (const [key, value] of Object.entries(routes)) {
			const path = currentPrefix ? `${currentPrefix}.${key}` : key;

			if (isRouterDef(value)) {
				// Recursively flatten nested RouterDef
				const nested = flattenRouter(value, path);
				for (const [nestedPath, procedure] of nested) {
					result.set(nestedPath, procedure);
				}
			} else if (isQueryDef(value) || isMutationDef(value)) {
				// It's a procedure (query or mutation)
				result.set(path, value);
			} else if (value && typeof value === "object" && !Array.isArray(value)) {
				// Plain nested object - recursively process
				flatten(value as Record<string, unknown>, path);
			}
		}
	};

	flatten(routerDef._routes as Record<string, unknown>, prefix);
	return result;
}

// =============================================================================
// Client Type Inference
// =============================================================================

/**
 * Query result type (thenable with reactive features)
 * Matches the client's QueryResult interface
 */
export interface QueryResultType<T> {
	/** Current value (for peeking without subscribing) */
	readonly value: T | null;
	/** Subscribe to updates */
	subscribe(callback?: (data: T) => void): () => void;
	/** Promise interface - allows await */
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2>;
}

/**
 * Mutation result type
 * Matches the client's MutationResult interface
 */
export interface MutationResultType<T> {
	data: T;
	rollback?: () => void;
}

/** Infer the client type from a router definition */
export type InferRouterClient<TRouter extends RouterDef> =
	TRouter extends RouterDef<infer TRoutes>
		? {
				[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
					? InferRouterClient<RouterDef<TNestedRoutes>>
					: TRoutes[K] extends {
								_type: "query";
								_brand: { input: infer TInput; output: infer TOutput };
							}
						? TInput extends void
							? () => QueryResultType<TOutput>
							: (input: TInput) => QueryResultType<TOutput>
						: TRoutes[K] extends {
									_type: "mutation";
									_brand: { input: infer TInput; output: infer TOutput };
								}
							? (input: TInput) => Promise<MutationResultType<TOutput>>
							: never;
			}
		: never;
