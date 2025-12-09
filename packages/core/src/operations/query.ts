/**
 * @sylphx/lens-core - Query Builder
 *
 * Fluent interface for defining queries.
 *
 * Query Types:
 * - .resolve() → Query (returns value, no ctx.emit/onCleanup)
 * - .subscribe() → Subscription (returns void with emit, or yields values)
 */

import type {
	EmitResolverFn,
	GeneratorResolverFn,
	InferReturnType,
	QueryResolverFn,
	ResolverFn,
	ReturnSpec,
	ZodLikeSchema,
} from "./types.js";

// =============================================================================
// Query Definition
// =============================================================================

/** Query definition - can be a query or subscription based on resolver type */
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
		ctx: import("./types.js").ResolverContext<TInput, TOutput, TContext>,
	): TOutput | Promise<TOutput> | AsyncGenerator<TOutput> | void | Promise<void>;
}

// =============================================================================
// Query Builder Interface
// =============================================================================

/** Query builder - fluent interface */
export interface QueryBuilder<TInput = void, TOutput = unknown, TContext = unknown> {
	/** Define input validation schema (optional for queries) */
	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput, TContext>;
	/** Define return type (optional - for entity outputs) */
	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>, TContext>;

	/**
	 * Define query resolver (returns value).
	 * ctx has NO emit/onCleanup - queries are one-shot.
	 *
	 * @example
	 * ```typescript
	 * query()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => db.user.find(input.id));
	 * ```
	 */
	resolve<T>(fn: QueryResolverFn<TInput, T, TContext>): QueryDef<TInput, T, TContext>;

	/**
	 * Define subscription resolver (emit-based).
	 * Returns void, uses ctx.emit() to push updates.
	 * ctx has emit and onCleanup.
	 *
	 * @example
	 * ```typescript
	 * query()
	 *   .returns(User)
	 *   .subscribe(({ input, ctx }) => {
	 *     const unsub = pubsub.on(`user:${input.id}`, (user) => ctx.emit(user));
	 *     ctx.onCleanup(unsub);
	 *   });
	 * ```
	 */
	subscribe(fn: EmitResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext>;

	/**
	 * Define subscription resolver (generator-based).
	 * Yields values to push updates.
	 * ctx has onCleanup but NO emit (yield IS the emit).
	 *
	 * @example
	 * ```typescript
	 * query()
	 *   .subscribe(async function* ({ input, ctx }) {
	 *     for await (const event of pubsub.subscribe(`user:${input.id}`)) {
	 *       yield event;
	 *     }
	 *   });
	 * ```
	 */
	subscribe<T>(fn: GeneratorResolverFn<TInput, T, TContext>): QueryDef<TInput, T, TContext>;

	/**
	 * @deprecated Use .resolve() for queries or .subscribe() for subscriptions.
	 * Legacy resolver that allows all patterns but doesn't enforce type safety.
	 */
	resolveUnsafe(fn: ResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext>;
}

// =============================================================================
// Query Builder Implementation
// =============================================================================

export class QueryBuilderImpl<TInput = void, TOutput = unknown, TContext = unknown>
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

	resolve<T>(fn: QueryResolverFn<TInput, T, TContext>): QueryDef<TInput, T, TContext> {
		return {
			_type: "query",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: T },
			_resolve: fn as ResolverFn<TInput, T, TContext>,
		};
	}

	subscribe(
		fn: EmitResolverFn<TInput, TOutput, TContext> | GeneratorResolverFn<TInput, TOutput, TContext>,
	): QueryDef<TInput, TOutput, TContext> {
		return {
			_type: "query",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: TOutput },
			_resolve: fn as ResolverFn<TInput, TOutput, TContext>,
		};
	}

	resolveUnsafe(fn: ResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext> {
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

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a query builder
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 *
 * // With typed context
 * export const getUser = query<MyContext>()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 * ```
 */
export function query<TContext = unknown>(): QueryBuilder<void, unknown, TContext>;
export function query<TContext = unknown>(name: string): QueryBuilder<void, unknown, TContext>;
export function query<TContext = unknown>(name?: string): QueryBuilder<void, unknown, TContext> {
	return new QueryBuilderImpl<void, unknown, TContext>(name);
}

// =============================================================================
// Type Guard
// =============================================================================

/** Check if value is a query definition */
export function isQueryDef(value: unknown): value is QueryDef {
	return typeof value === "object" && value !== null && (value as QueryDef)._type === "query";
}
