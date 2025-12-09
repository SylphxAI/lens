/**
 * @sylphx/lens-core - Query Builder
 *
 * Fluent interface for defining queries.
 *
 * Query Types:
 * - .resolve() → Query (returns value, no ctx.emit/onCleanup) - can chain .subscribe()
 * - .subscribe() → Legacy Subscription (ctx.emit) - DEPRECATED
 * - .resolve().subscribe() → Live Subscription (Publisher pattern) - RECOMMENDED
 */

import type { Publisher } from "../resolvers/resolver-types.js";
import type {
	EmitResolverFn,
	GeneratorResolverFn,
	InferReturnType,
	QueryResolverContext,
	QueryResolverFn,
	ResolverFn,
	ReturnSpec,
	ZodLikeSchema,
} from "./types.js";

// =============================================================================
// Query Definition
// =============================================================================

/** Query mode - determines how the query is executed */
export type QueryMode = "query" | "subscribe" | "live";

/** Base query definition */
interface QueryDefBase<TInput = void, TOutput = unknown, _TContext = unknown> {
	_type: "query";
	/** Query name (optional - derived from export key if not provided) */
	_name?: string | undefined;
	_input?: ZodLikeSchema<TInput> | undefined;
	_output?: ReturnSpec | undefined;
	/** Branded phantom types for inference */
	_brand: { input: TInput; output: TOutput };
}

/** Query definition - one-shot query (returns value) */
export interface QueryDef<TInput = void, TOutput = unknown, TContext = unknown>
	extends QueryDefBase<TInput, TOutput, TContext> {
	_mode?: "query";
	/** Method syntax for bivariance - allows flexible context types */
	_resolve?(
		ctx: import("./types.js").ResolverContext<TInput, TOutput, TContext>,
	): TOutput | Promise<TOutput> | AsyncGenerator<TOutput> | void | Promise<void>;
}

/**
 * @deprecated Use .resolve().subscribe() with Publisher pattern instead.
 * Legacy subscription definition - uses ctx.emit
 */
export interface SubscribedQueryDef<TInput = void, TOutput = unknown, TContext = unknown>
	extends QueryDefBase<TInput, TOutput, TContext> {
	_mode: "subscribe";
	_resolve?(
		ctx: import("./types.js").EmitResolverContext<TInput, TOutput, TContext>,
	): void | Promise<void>;
}

/** Live subscription definition - uses Publisher pattern */
export interface LiveQueryDef<TInput = void, TOutput = unknown, TContext = unknown>
	extends QueryDefBase<TInput, TOutput, TContext> {
	_mode: "live";
	/** One-shot resolver for initial value */
	_resolve?(
		ctx: import("./types.js").QueryResolverContext<TInput, TContext>,
	): TOutput | Promise<TOutput>;
	/** Subscriber for live updates (returns Publisher) - method syntax for bivariance */
	_subscriber?(ctx: QueryResolverContext<TInput, TContext>): Publisher<TOutput>;
}

/** Any query definition */
export type AnyQueryDef<TInput = void, TOutput = unknown, TContext = unknown> =
	| QueryDef<TInput, TOutput, TContext>
	| SubscribedQueryDef<TInput, TOutput, TContext>
	| LiveQueryDef<TInput, TOutput, TContext>;

// =============================================================================
// Publisher Subscriber Types
// =============================================================================

/** Publisher-based subscription resolver - returns Publisher */
export type PublisherResolverFn<TInput, TOutput, TContext = unknown> = (ctx: {
	input: TInput;
	ctx: TContext;
}) => Publisher<TOutput>;

// =============================================================================
// Chainable Query Definition
// =============================================================================

/**
 * Chainable query definition - returned by .resolve(), can chain .subscribe()
 */
export interface QueryDefChainable<TInput = void, TOutput = unknown, TContext = unknown>
	extends QueryDef<TInput, TOutput, TContext> {
	/**
	 * Add live subscription to query (Publisher pattern).
	 * Creates a LiveQueryDef that fetches initial value then streams updates.
	 *
	 * @example
	 * ```typescript
	 * query()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
	 *   .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
	 *     const unsub = pubsub.on(`user:${input.id}`, emit);
	 *     onCleanup(unsub);
	 *   });
	 * ```
	 */
	subscribe(
		fn: PublisherResolverFn<TInput, TOutput, TContext>,
	): LiveQueryDef<TInput, TOutput, TContext>;
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
	 * Can chain .subscribe() for live updates (Publisher pattern).
	 *
	 * @example
	 * ```typescript
	 * // One-shot query
	 * query()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => db.user.find(input.id));
	 *
	 * // Live query (resolve + subscribe)
	 * query()
	 *   .input(z.object({ id: z.string() }))
	 *   .resolve(({ input, ctx }) => db.user.find(input.id))
	 *   .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
	 *     const unsub = pubsub.on(`user:${input.id}`, emit);
	 *     onCleanup(unsub);
	 *   });
	 * ```
	 */
	resolve<T>(fn: QueryResolverFn<TInput, T, TContext>): QueryDefChainable<TInput, T, TContext>;

	/**
	 * @deprecated Use .resolve().subscribe() with Publisher pattern instead.
	 * Define subscription resolver (emit-based).
	 * Returns void, uses ctx.emit() to push updates.
	 * ctx has emit and onCleanup.
	 *
	 * @example
	 * ```typescript
	 * // DEPRECATED - use .resolve().subscribe() instead
	 * query()
	 *   .returns(User)
	 *   .subscribe(({ input, ctx }) => {
	 *     const unsub = pubsub.on(`user:${input.id}`, (user) => ctx.emit(user));
	 *     ctx.onCleanup(unsub);
	 *   });
	 * ```
	 */
	subscribe(
		fn: EmitResolverFn<TInput, TOutput, TContext>,
	): SubscribedQueryDef<TInput, TOutput, TContext>;

	/**
	 * @deprecated Use .resolve().subscribe() with Publisher pattern instead.
	 * Define subscription resolver (generator-based).
	 * Yields values to push updates.
	 * ctx has onCleanup but NO emit (yield IS the emit).
	 *
	 * @example
	 * ```typescript
	 * // DEPRECATED - use .resolve().subscribe() instead
	 * query()
	 *   .subscribe(async function* ({ input, ctx }) {
	 *     for await (const event of pubsub.subscribe(`user:${input.id}`)) {
	 *       yield event;
	 *     }
	 *   });
	 * ```
	 */
	subscribe<T>(
		fn: GeneratorResolverFn<TInput, T, TContext>,
	): SubscribedQueryDef<TInput, T, TContext>;

	/**
	 * @deprecated Use .resolve() for queries or .resolve().subscribe() for subscriptions.
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

	resolve<T>(fn: QueryResolverFn<TInput, T, TContext>): QueryDefChainable<TInput, T, TContext> {
		const resolver = fn;
		const name = this._name;
		const inputSchema = this._inputSchema;
		const outputSpec = this._outputSpec;

		// Return QueryDef with chainable .subscribe()
		const queryDef: QueryDefChainable<TInput, T, TContext> = {
			_type: "query",
			_mode: "query",
			_name: name,
			_input: inputSchema,
			_output: outputSpec,
			_brand: {} as { input: TInput; output: T },
			_resolve: resolver as (ctx: { input: TInput; ctx: TContext }) => T | Promise<T>,
			// Chainable subscribe - creates LiveQueryDef with Publisher pattern
			subscribe(
				subscribeFn: PublisherResolverFn<TInput, T, TContext>,
			): LiveQueryDef<TInput, T, TContext> {
				return {
					_type: "query",
					_mode: "live",
					_name: name,
					_input: inputSchema,
					_output: outputSpec,
					_brand: {} as { input: TInput; output: T },
					_resolve: resolver as (ctx: { input: TInput; ctx: TContext }) => T | Promise<T>,
					_subscriber: subscribeFn,
				};
			},
		};
		return queryDef;
	}

	/** @deprecated Use .resolve().subscribe() with Publisher pattern instead */
	subscribe(
		fn: EmitResolverFn<TInput, TOutput, TContext> | GeneratorResolverFn<TInput, TOutput, TContext>,
	): SubscribedQueryDef<TInput, TOutput, TContext> {
		return {
			_type: "query",
			_mode: "subscribe",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: TOutput },
			_resolve: fn as (ctx: {
				input: TInput;
				ctx: import("./types.js").EmitSubscriptionContext<TContext, TOutput>;
			}) => void | Promise<void>,
		};
	}

	/** @deprecated Use .resolve() or .resolve().subscribe() */
	resolveUnsafe(fn: ResolverFn<TInput, TOutput, TContext>): QueryDef<TInput, TOutput, TContext> {
		return {
			_type: "query",
			_mode: "query",
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
// Type Guards
// =============================================================================

/** Check if value is a query definition (any mode) */
export function isQueryDef(value: unknown): value is AnyQueryDef {
	return typeof value === "object" && value !== null && (value as QueryDef)._type === "query";
}

/** Check if value is a live query definition (Publisher pattern) */
export function isLiveQueryDef(value: unknown): value is LiveQueryDef {
	return isQueryDef(value) && (value as LiveQueryDef)._mode === "live";
}

/** Check if value is a subscribed query definition (legacy ctx.emit) */
export function isSubscribedQueryDef(value: unknown): value is SubscribedQueryDef {
	return isQueryDef(value) && (value as SubscribedQueryDef)._mode === "subscribe";
}
