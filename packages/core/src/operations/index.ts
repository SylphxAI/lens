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

import type { Emit } from "../emit/index.js";
import type { Pipeline, StepBuilder } from "../optimistic/reify.js";
import { isPipeline } from "../optimistic/reify.js";
import type { EntityDef } from "../schema/define.js";
import type { InferScalar, ScalarFields } from "../schema/infer.js";
import type { EntityDefinition } from "../schema/types.js";
import type { Prettify, UnionToIntersection } from "../utils/types.js";

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
 * Lens-provided context extensions.
 * These are automatically injected by the server into the user's context.
 *
 * @typeParam TOutput - Output type for emit typing
 */
export interface LensContextExtensions<TOutput = unknown> {
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
	 * ctx.onCleanup(unsub)  // Called when client disconnects
	 * ```
	 *
	 * Only available in subscription context.
	 */
	onCleanup: (fn: () => void) => () => void;
}

/**
 * Full context type combining user context with Lens extensions.
 * This is what resolvers receive as `ctx`.
 */
export type LensContext<TContext, TOutput = unknown> = TContext & LensContextExtensions<TOutput>;

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
 * resolve(({ input, ctx }) => {
 *   const unsub = ctx.db.user.onChange(input.id, (data) => {
 *     ctx.emit.merge({ name: data.name })  // Update specific field
 *   })
 *   ctx.onCleanup(unsub)
 *   return ctx.db.user.find(input.id)
 * })
 * ```
 */
export interface ResolverContext<TInput = unknown, TOutput = unknown, TContext = unknown> {
	/** Parsed and validated input */
	input: TInput;

	/**
	 * Context containing user-defined values (db, user, etc.) plus Lens extensions (emit, onCleanup).
	 * Set via createServer({ context }).
	 */
	ctx: LensContext<TContext, TOutput>;
}

/** Resolver function type - can return sync, async, or generator */
export type ResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: ResolverContext<TInput, TOutput, TContext>,
) => TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;

// =============================================================================
// Optimistic DSL - Uses Reify Pipeline
// =============================================================================

/**
 * Optimistic update specification
 *
 * Uses Reify Pipeline for describing optimistic updates.
 * Import DSL tools directly from @sylphx/reify.
 *
 * @example
 * ```typescript
 * import { entity, pipe, ref, temp, now } from '@sylphx/reify';
 *
 * mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Message)
 *   .optimistic(
 *     pipe(({ input }) => [
 *       entity.create('Message', {
 *         id: temp(),
 *         title: input.title,
 *         content: input.content,
 *         createdAt: now(),
 *       }).as('message'),
 *     ])
 *   )
 *   .resolve(({ input, ctx }) => ctx.db.message.create({ data: input }));
 * ```
 */
/** Sugar syntax for common optimistic update patterns */
export type OptimisticSugar = "merge" | "create" | "delete" | { merge: Record<string, unknown> };

/**
 * OptimisticDSL - Defines optimistic update behavior
 *
 * Can be:
 * - Sugar syntax ("merge", "create", "delete", { merge: {...} }) for common patterns
 * - Reify Pipeline for complex multi-entity operations
 *
 * Note: Server converts sugar to Pipeline at metadata generation time,
 * so client always receives Pipeline.
 */
export type OptimisticDSL = OptimisticSugar | Pipeline;

/**
 * Check if value is an OptimisticDSL (sugar or Pipeline)
 */
export function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	// Check for sugar syntax
	if (value === "merge" || value === "create" || value === "delete") {
		return true;
	}
	if (value && typeof value === "object" && "merge" in value) {
		return true;
	}
	// Check for Pipeline
	return isPipeline(value);
}

// =============================================================================
// Query Builder
// =============================================================================

/** Query definition */
export interface QueryDef<TInput = void, TOutput = unknown, TContext = unknown> {
	_type: "query";
	/** Query name (optional - derived from export key if not provided) */
	_name?: string | undefined;
	_input?: ZodLikeSchema<TInput> | undefined;
	_output?: ReturnSpec | undefined;
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

	/** Define resolver function - uses TOutput from .returns() */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext>;
}

class QueryBuilderImpl<TInput = void, TOutput = unknown, TContext = unknown>
	implements QueryBuilder<TInput, TOutput, TContext>
{
	private _name?: string | undefined;
	private _inputSchema?: ZodLikeSchema<TInput> | undefined;
	private _outputSpec?: ReturnSpec | undefined;

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

	resolve(fn: ResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext> {
		return {
			_type: "query",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: TOutput },
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
	_name?: string | undefined;
	_input: ZodLikeSchema<TInput>;
	_output?: ReturnSpec | undefined;
	/** Branded phantom types for inference */
	_brand: { input: TInput; output: TOutput };
	/** Optimistic update DSL (declarative, serializable for client) */
	_optimistic?: OptimisticDSL | undefined;
	/** Method syntax for bivariance - allows flexible context types */
	_resolve(
		ctx: ResolverContext<TInput, TOutput, TContext>,
	): TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;
}

// Import plugin types for generic-aware builders
import type { ExtractPluginMethods, PluginExtension } from "../plugin/types.js";

/** Mutation builder - fluent interface */
export interface MutationBuilder<
	_TInput = unknown,
	TOutput = unknown,
	TContext = unknown,
	TPlugins extends readonly PluginExtension[] = readonly PluginExtension[],
> {
	/** Define input validation schema (required for mutations) */
	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput, TContext, TPlugins>;
}

/** Mutation builder after input is defined */
export interface MutationBuilderWithInput<
	TInput,
	_TOutput = unknown,
	TContext = unknown,
	TPlugins extends readonly PluginExtension[] = readonly PluginExtension[],
> {
	/**
	 * Define return type (optional - for entity outputs).
	 * Returns a builder with .resolve() and any plugin methods (e.g., .optimistic()).
	 */
	returns<R extends ReturnSpec>(
		spec: R,
	): MutationBuilderWithReturns2<TInput, InferReturnType<R>, TContext> &
		ExtractPluginMethods<
			TPlugins,
			"MutationBuilderWithReturns",
			TInput,
			InferReturnType<R>,
			TContext
		>;

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

/** Context passed to optimistic callback for type inference */
export interface OptimisticContext<TInput> {
	/** Typed input - inferred from .input() schema */
	input: TInput;
}

/** Optimistic callback that receives typed input and returns step builders */
export type OptimisticCallback<TInput> = (ctx: OptimisticContext<TInput>) => StepBuilder[];

/**
 * Mutation builder after returns is defined (strict version).
 * Only has .resolve() - no .optimistic().
 * Used by lens() without plugins for type safety.
 */
export interface MutationBuilderWithReturns2<TInput, TOutput, TContext = unknown> {
	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
}

/**
 * Mutation builder after returns is defined (with optimistic).
 * Has .optimistic() and .resolve().
 * Used by direct mutation() calls for backward compatibility.
 */
export interface MutationBuilderWithReturns<TInput, TOutput, TContext = unknown>
	extends MutationBuilderWithReturns2<TInput, TOutput, TContext> {
	/**
	 * Define optimistic update (optional)
	 *
	 * DSL is serializable and sent to client via handshake metadata.
	 *
	 * @example
	 * ```typescript
	 * // Sugar syntax
	 * .optimistic('merge')   // UPDATE: merge input into entity
	 * .optimistic('create')  // CREATE: auto tempId
	 * .optimistic('delete')  // DELETE: mark deleted
	 * .optimistic({ merge: { published: true } })  // With additional fields
	 *
	 * // Callback with typed input (recommended for complex pipelines)
	 * .optimistic(({ input }) => [
	 *   branch(input.sessionId)
	 *     .then(e.update("Session", { id: input.sessionId }))
	 *     .else(e.create("Session", { id: temp(), userId: input.userId }))
	 *     .as("session"),
	 * ])
	 * ```
	 */
	optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
	optimistic(
		callback: OptimisticCallback<TInput>,
	): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
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
	private _name?: string | undefined;
	private _inputSchema?: ZodLikeSchema<TInput> | undefined;
	private _outputSpec?: ReturnSpec | undefined;
	private _optimisticSpec?: OptimisticDSL | undefined;

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

	optimistic(
		specOrCallback: OptimisticDSL | OptimisticCallback<TInput>,
	): MutationBuilderWithOptimistic<TInput, TOutput, TContext> {
		const builder = new MutationBuilderImpl<TInput, TOutput, TContext>(this._name);
		builder._inputSchema = this._inputSchema;
		builder._outputSpec = this._outputSpec;

		// Handle callback: execute with input proxy to build Pipeline
		if (typeof specOrCallback === "function") {
			// Create proxy that generates $input references
			// The proxy intercepts property access and returns { $input: 'propName' }
			const inputProxy = new Proxy(
				{},
				{
					get(_, prop: string) {
						return { $input: prop };
					},
				},
			) as TInput;
			const stepBuilders: StepBuilder[] = specOrCallback({ input: inputProxy });
			// Convert StepBuilder[] to PipelineStep[]
			const steps = stepBuilders.map((s: StepBuilder) => s.build());
			builder._optimisticSpec = { $pipe: steps } as Pipeline;
		} else {
			builder._optimisticSpec = specOrCallback;
		}

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
