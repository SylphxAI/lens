/**
 * @sylphx/lens-core - Operations API
 *
 * Builder pattern for defining queries and mutations.
 * Inspired by tRPC but with entity-aware features.
 *
 * @example
 * ```typescript
 * import { query, mutation, tempId } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * // Query without input - ctx contains user-defined context (db, user, etc.)
 * export const whoami = query()
 *   .returns(User)
 *   .resolve(({ ctx }) => ctx.currentUser);
 *
 * // Query with input
 * export const user = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }));
 *
 * // Mutation with optimistic updates (DSL)
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic('create')  // Auto-generates tempId, serializable for client
 *   .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }));
 * ```
 */

import type { Emit } from "../emit/index";
import type { EntityDef } from "../schema/define";
import type { InferScalar, ScalarFields } from "../schema/infer";
import type { EntityDefinition } from "../schema/types";

// =============================================================================
// Type Definitions
// =============================================================================

/** Zod-like schema interface (minimal subset we need) */
export interface ZodLikeSchema<T = unknown> {
	parse: (data: unknown) => T;
	safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown };
	_output: T;
}

/**
 * Return type specification
 * - EntityDef: For entity-aware returns (enables normalization, caching)
 * - [EntityDef]: Array of entities
 * - ZodLikeSchema: For simple typed returns (no entity features)
 * - Record: Multiple named returns
 */
export type ReturnSpec =
	| EntityDef<string, EntityDefinition>
	| [EntityDef<string, EntityDefinition>]
	| ZodLikeSchema<unknown>
	| Record<string, EntityDef<string, EntityDefinition> | [EntityDef<string, EntityDefinition>]>;

/** Check if a field has the _optional flag */
type IsOptional<F> = F extends { _optional: true } ? true : false;

/** Flatten intersection types into a single object type */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Infer entity type from entity definition fields.
 * Only infers scalar fields (relations require schema context).
 * Handles optional fields properly (makes them optional properties).
 */
type InferEntityFromFields<F extends EntityDefinition> = Prettify<
	{
		[K in ScalarFields<F> as IsOptional<F[K]> extends true ? never : K]: InferScalar<F[K]>;
	} & {
		[K in ScalarFields<F> as IsOptional<F[K]> extends true ? K : never]?: InferScalar<F[K]>;
	}
>;

/** Infer TypeScript type from return spec */
export type InferReturnType<R extends ReturnSpec> =
	R extends ZodLikeSchema<infer T>
		? T
		: R extends EntityDef<string, infer F>
			? InferEntityFromFields<F>
			: R extends [EntityDef<string, infer F>]
				? InferEntityFromFields<F>[]
				: R extends Record<string, unknown>
					? {
							[K in keyof R]: R[K] extends [EntityDef<string, infer F>]
								? InferEntityFromFields<F>[]
								: R[K] extends EntityDef<string, infer F2>
									? InferEntityFromFields<F2>
									: unknown;
						}
					: never;

/**
 * Resolver context - passed directly to resolver function (tRPC style)
 *
 * @typeParam TInput - Validated input type from .input() schema
 * @typeParam TOutput - Output type (inferred from .returns() or resolver return)
 * @typeParam TContext - User-defined context type from createServer({ context })
 *
 * @example
 * ```typescript
 * // Basic query
 * resolve(({ input, ctx }) => ctx.db.user.find(input.id))
 *
 * // Subscription with emit
 * resolve(({ input, ctx, emit, onCleanup }) => {
 *   const unsub = ctx.db.user.onChange(input.id, (data) => {
 *     emit.merge({ name: data.name })  // Update specific field
 *   })
 *   onCleanup(unsub)
 *   return ctx.db.user.find(input.id)
 * })
 * ```
 */
export interface ResolverContext<TInput = unknown, TOutput = unknown, TContext = unknown> {
	/** Parsed and validated input */
	input: TInput;

	/** User-defined context (db, user, etc.) - set via createServer({ context }) */
	ctx: TContext;

	/**
	 * Emit state updates to subscribed clients.
	 *
	 * Available methods:
	 * - `emit(data)` - Merge full data
	 * - `emit.merge(partial)` - Merge partial update
	 * - `emit.replace(data)` - Replace entire state
	 * - `emit.set(field, value)` - Set single field
	 * - `emit.delta(field, ops)` - Apply text delta to string field
	 * - `emit.patch(field, ops)` - Apply JSON Patch to object field
	 * - `emit.batch(updates)` - Batch multiple field updates
	 *
	 * Only available in subscription context.
	 */
	emit: Emit<TOutput>;

	/**
	 * Register cleanup function called when client unsubscribes.
	 * Returns a function to manually remove the cleanup.
	 *
	 * @example
	 * ```typescript
	 * const unsub = ctx.db.onChange(id, handler)
	 * onCleanup(unsub)  // Called when client disconnects
	 * ```
	 *
	 * Only available in subscription context.
	 */
	onCleanup: (fn: () => void) => () => void;
}

/** Resolver function type - can return sync, async, or generator */
export type ResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: ResolverContext<TInput, TOutput, TContext>,
) => TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;

// =============================================================================
// Optimistic DSL (Declarative - for type-only client imports)
// =============================================================================

/**
 * Declarative optimistic update DSL
 *
 * Simple, minimal syntax for common cases:
 * - String shorthand: 'merge', 'create', 'delete'
 * - Object for additional fields: { merge: { published: true } }
 * - Full object for cross-entity: { updateMany: { ... } }
 *
 * @example
 * ```typescript
 * // Simple (90% of cases)
 * .optimistic('merge')   // UPDATE: merge input into entity
 * .optimistic('create')  // CREATE: auto tempId
 * .optimistic('delete')  // DELETE: mark deleted
 *
 * // With additional fields
 * .optimistic({ merge: { published: true } })
 * .optimistic({ create: { status: 'draft' } })
 *
 * // Cross-entity update
 * .optimistic({
 *   updateMany: {
 *     entity: 'User',
 *     ids: '$userIds',      // $ = reference input field
 *     set: { role: '$newRole' }
 *   }
 * })
 * ```
 *
 * Future: Could auto-derive from naming convention:
 * - updateX → merge
 * - createX → create
 * - deleteX → delete
 */
export type OptimisticDSL =
	// String shorthand (simple cases)
	| "merge"
	| "create"
	| "delete"
	// Object with additional fields
	| { merge: Record<string, unknown> }
	| { create: Record<string, unknown> }
	// Cross-entity
	| { updateMany: OptimisticUpdateManyConfig };

/** Config for updateMany */
export interface OptimisticUpdateManyConfig {
	/** Target entity type */
	entity: string;
	/** Input field containing IDs (use $ prefix for references) */
	ids: string;
	/** Fields to set (use $ prefix for input references) */
	set: Record<string, unknown>;
}

/**
 * Check if value is an OptimisticDSL
 */
export function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	// String shorthand
	if (value === "merge" || value === "create" || value === "delete") {
		return true;
	}
	// Object form
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		return "merge" in obj || "create" in obj || "updateMany" in obj || "custom" in obj;
	}
	return false;
}

/**
 * Normalize DSL to internal format for interpreter
 */
export function normalizeOptimisticDSL(dsl: OptimisticDSL): {
	type: "merge" | "create" | "delete" | "updateMany";
	set?: Record<string, unknown>;
	config?: OptimisticUpdateManyConfig;
} {
	// String shorthand
	if (dsl === "merge") return { type: "merge" };
	if (dsl === "create") return { type: "create" };
	if (dsl === "delete") return { type: "delete" };

	// Object form
	if ("merge" in dsl) return { type: "merge", set: dsl.merge };
	if ("create" in dsl) return { type: "create", set: dsl.create };
	if ("updateMany" in dsl) return { type: "updateMany", config: dsl.updateMany };

	return { type: "merge" }; // fallback
}

// =============================================================================
// Query Builder
// =============================================================================

/** Query definition */
export interface QueryDef<TInput = void, TOutput = unknown, TContext = unknown> {
	_type: "query";
	/** Query name (optional - derived from export key if not provided) */
	_name?: string;
	_input?: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	/** Branded phantom types for inference */
	_brand: { input: TInput; output: TOutput };
	/** Method syntax for bivariance - allows flexible context types */
	_resolve?(
		ctx: ResolverContext<TInput, TOutput, TContext>,
	): TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;
}

/** Query builder - fluent interface */
export interface QueryBuilder<TInput = void, TOutput = unknown, TContext = unknown> {
	/** Define input validation schema (optional for queries) */
	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput, TContext>;

	/** Define return type (optional - for entity outputs) */
	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>, TContext>;

	/** Define resolver function */
	resolve<TOut = TOutput>(fn: ResolverFn<TInput, TOut, TContext>): QueryDef<TInput, TOut>;
}

class QueryBuilderImpl<TInput = void, TOutput = unknown, TContext = unknown>
	implements QueryBuilder<TInput, TOutput, TContext>
{
	private _name?: string;
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;

	constructor(name?: string) {
		this._name = name;
	}

	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput, TContext> {
		const builder = new QueryBuilderImpl<T, TOutput, TContext>(this._name);
		builder._inputSchema = schema;
		builder._outputSpec = this._outputSpec;
		return builder;
	}

	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>, TContext> {
		const builder = new QueryBuilderImpl<TInput, InferReturnType<R>, TContext>(this._name);
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	resolve<TOut = TOutput>(fn: ResolverFn<TInput, TOut, TContext>): QueryDef<TInput, TOut> {
		return {
			_type: "query",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: TOut },
			_resolve: fn,
		};
	}
}

/**
 * Create a query builder
 *
 * Name is optional - if not provided, it will be derived from the export key.
 *
 * @example
 * ```typescript
 * // Basic usage (no typed context)
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 *
 * // With typed context (recommended)
 * export const getUser = query<MyContext>()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 *   // ctx is typed as MyContext!
 *
 * // Without .returns() - for simple return types
 * export const getStatus = query()
 *   .resolve(() => ({ online: true, version: "1.0" }));
 *   // Returns inferred type without needing .returns()
 * ```
 */
export function query<TContext = unknown>(): QueryBuilder<void, unknown, TContext>;
export function query<TContext = unknown>(name: string): QueryBuilder<void, unknown, TContext>;
export function query<TContext = unknown>(name?: string): QueryBuilder<void, unknown, TContext> {
	return new QueryBuilderImpl<void, unknown, TContext>(name);
}

// =============================================================================
// Mutation Builder
// =============================================================================

/** Mutation definition */
export interface MutationDef<TInput = unknown, TOutput = unknown, TContext = unknown> {
	_type: "mutation";
	/** Mutation name (optional - derived from export key if not provided) */
	_name?: string;
	_input: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	/** Branded phantom types for inference */
	_brand: { input: TInput; output: TOutput };
	/** Optimistic update DSL (declarative, serializable for client) */
	_optimistic?: OptimisticDSL;
	/** Method syntax for bivariance - allows flexible context types */
	_resolve(
		ctx: ResolverContext<TInput, TOutput, TContext>,
	): TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;
}

/** Mutation builder - fluent interface */
export interface MutationBuilder<TInput = unknown, TOutput = unknown, TContext = unknown> {
	/** Define input validation schema (required for mutations) */
	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput, TContext>;
}

/** Mutation builder after input is defined */
export interface MutationBuilderWithInput<TInput, TOutput = unknown, TContext = unknown> {
	/** Define return type (optional - for entity outputs) */
	returns<R extends ReturnSpec>(
		spec: R,
	): MutationBuilderWithReturns<TInput, InferReturnType<R>, TContext>;

	/**
	 * Define resolver function directly (without .returns())
	 * Use this for mutations that return simple types (not entities)
	 *
	 * @example
	 * ```typescript
	 * mutation()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => ({ success: true }))
	 * ```
	 */
	resolve<TOut>(fn: ResolverFn<TInput, TOut, TContext>): MutationDef<TInput, TOut>;
}

/** Mutation builder after returns is defined */
export interface MutationBuilderWithReturns<TInput, TOutput, TContext = unknown> {
	/**
	 * Define optimistic update (optional)
	 *
	 * DSL is serializable and sent to client via handshake metadata.
	 *
	 * @example
	 * ```typescript
	 * .optimistic('merge')   // UPDATE: merge input into entity
	 * .optimistic('create')  // CREATE: auto tempId
	 * .optimistic('delete')  // DELETE: mark deleted
	 * .optimistic({ merge: { published: true } })  // With additional fields
	 * ```
	 */
	optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;

	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
}

/** Mutation builder after optimistic is defined */
export interface MutationBuilderWithOptimistic<TInput, TOutput, TContext = unknown> {
	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
}

class MutationBuilderImpl<TInput = unknown, TOutput = unknown, TContext = unknown>
	implements
		MutationBuilder<TInput, TOutput>,
		MutationBuilderWithInput<TInput, TOutput, TContext>,
		MutationBuilderWithReturns<TInput, TOutput, TContext>,
		MutationBuilderWithOptimistic<TInput, TOutput, TContext>
{
	private _name?: string;
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;
	private _optimisticSpec?: OptimisticDSL;

	constructor(name?: string) {
		this._name = name;
	}

	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput, TContext> {
		const builder = new MutationBuilderImpl<T, TOutput, TContext>(this._name);
		builder._inputSchema = schema;
		return builder;
	}

	returns<R extends ReturnSpec>(
		spec: R,
	): MutationBuilderWithReturns<TInput, InferReturnType<R>, TContext> {
		const builder = new MutationBuilderImpl<TInput, InferReturnType<R>, TContext>(this._name);
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<TInput, TOutput, TContext> {
		const builder = new MutationBuilderImpl<TInput, TOutput, TContext>(this._name);
		builder._inputSchema = this._inputSchema;
		builder._outputSpec = this._outputSpec;
		builder._optimisticSpec = spec;
		return builder;
	}

	resolve<TOut = TOutput>(fn: ResolverFn<TInput, TOut, TContext>): MutationDef<TInput, TOut> {
		if (!this._inputSchema) {
			throw new Error("Mutation requires input schema. Use .input(schema) first.");
		}

		return {
			_type: "mutation",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: TOut },
			_optimistic: this._optimisticSpec,
			_resolve: fn,
		};
	}
}

/**
 * Create a mutation builder
 *
 * Name is optional - if not provided, it will be derived from the export key.
 *
 * @example
 * ```typescript
 * // Basic usage (no typed context)
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .resolve(({ input }) => db.post.create({ data: input }));
 *
 * // With typed context (recommended)
 * export const createPost = mutation<MyContext>()
 *   .input(z.object({ title: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }));
 *   // ctx is typed as MyContext!
 *
 * // Without .returns() - for simple return types
 * export const deletePost = mutation()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input }) => ({ success: true }));
 *   // Returns { success: boolean } without needing .returns()
 * ```
 */
export function mutation<TContext = unknown>(): MutationBuilder<unknown, unknown, TContext>;
export function mutation<TContext = unknown>(
	name: string,
): MutationBuilder<unknown, unknown, TContext>;
export function mutation<TContext = unknown>(
	name?: string,
): MutationBuilder<unknown, unknown, TContext> {
	return new MutationBuilderImpl<unknown, unknown, TContext>(name);
}

// =============================================================================
// Operations Factory
// =============================================================================

/**
 * Operations factory result - typed query and mutation builders
 */
export interface Operations<TContext> {
	/** Create a query with pre-typed context */
	query: {
		(): QueryBuilder<void, unknown, TContext>;
		(name: string): QueryBuilder<void, unknown, TContext>;
	};
	/** Create a mutation with pre-typed context */
	mutation: {
		(): MutationBuilder<unknown, unknown, TContext>;
		(name: string): MutationBuilder<unknown, unknown, TContext>;
	};
}

/**
 * Create typed query and mutation builders with shared context.
 *
 * This eliminates the need to repeat context types on every operation.
 *
 * @example
 * ```typescript
 * // Define context type once
 * type AppContext = { db: DB; user: User };
 *
 * // Create typed operations
 * const { query, mutation } = operations<AppContext>();
 *
 * // Now all operations automatically have AppContext
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 *   // ctx is AppContext ✅
 *
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.post.create(input));
 *   // ctx is AppContext ✅
 * ```
 */
export function operations<TContext>(): Operations<TContext> {
	return {
		query: ((name?: string) =>
			new QueryBuilderImpl<void, unknown, TContext>(name)) as Operations<TContext>["query"],
		mutation: ((name?: string) =>
			new MutationBuilderImpl<unknown, unknown, TContext>(
				name,
			)) as Operations<TContext>["mutation"],
	};
}

// =============================================================================
// Helpers
// =============================================================================

let tempIdCounter = 0;

/**
 * Generate a temporary ID for optimistic updates.
 * Used internally by 'create' DSL to generate placeholder IDs.
 *
 * @example
 * ```typescript
 * // Typically used internally by the 'create' DSL:
 * .optimistic('create')  // Auto-generates tempId
 *
 * // Manual usage (advanced):
 * tempId()  // Returns "temp_0", "temp_1", etc.
 * ```
 */
export function tempId(): string {
	return `temp_${tempIdCounter++}`;
}

/**
 * Reset temp ID counter (for testing)
 */
export function resetTempIdCounter(): void {
	tempIdCounter = 0;
}

/**
 * Check if an ID is a temporary ID
 */
export function isTempId(id: string): boolean {
	return id.startsWith("temp_");
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a query definition */
export function isQueryDef(value: unknown): value is QueryDef {
	return typeof value === "object" && value !== null && (value as QueryDef)._type === "query";
}

/** Check if value is a mutation definition */
export function isMutationDef(value: unknown): value is MutationDef {
	return typeof value === "object" && value !== null && (value as MutationDef)._type === "mutation";
}

/** Check if value is any operation definition */
export function isOperationDef(value: unknown): value is QueryDef | MutationDef {
	return isQueryDef(value) || isMutationDef(value);
}

// =============================================================================
// Router (Namespace Support)
// =============================================================================

/** Any procedure (query or mutation) */
export type AnyProcedure =
	| QueryDef<unknown, unknown, unknown>
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

/**
 * Convert union type to intersection type
 * { a: 1 } | { b: 2 } => { a: 1 } & { b: 2 } => { a: 1; b: 2 }
 */
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
	x: infer I,
) => void
	? I
	: never;

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

/** Check if value is a router definition */
export function isRouterDef(value: unknown): value is RouterDef {
	return typeof value === "object" && value !== null && (value as RouterDef)._type === "router";
}

/**
 * Create a router for namespacing operations
 *
 * The router automatically infers the context type from its routes.
 * When used with createServer, the context function must return
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
 * const server = createServer({
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

/** Flatten router to dot-notation paths for server processing */
export function flattenRouter(routerDef: RouterDef, prefix = ""): Map<string, AnyProcedure> {
	const result = new Map<string, AnyProcedure>();

	for (const [key, value] of Object.entries(routerDef._routes)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (isRouterDef(value)) {
			// Recursively flatten nested routers
			const nested = flattenRouter(value, path);
			for (const [nestedPath, procedure] of nested) {
				result.set(nestedPath, procedure);
			}
		} else {
			// It's a procedure (query or mutation)
			result.set(path, value);
		}
	}

	return result;
}

// =============================================================================
// Type Inference for Router
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
