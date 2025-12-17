/**
 * @sylphx/lens-core - Mutation Builder
 *
 * Fluent interface for defining mutations.
 */

import type { Pipeline, StepBuilder } from "../optimistic/reify.js";
import type { ExtractPluginMethods, PluginExtension } from "../plugin/types.js";
import type {
	InferReturnType,
	OptimisticCallback,
	OptimisticDSL,
	ResolverFn,
	ReturnSpec,
	ZodLikeSchema,
} from "./types.js";

// =============================================================================
// Mutation Definition
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
	_resolve(ctx: {
		args: TInput;
		ctx: TContext;
	}): TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;
}

// =============================================================================
// Mutation Builder Interfaces
// =============================================================================

/** Mutation builder - fluent interface */
export interface MutationBuilder<
	_TInput = unknown,
	TOutput = unknown,
	TContext = unknown,
	TPlugins extends readonly PluginExtension[] = readonly PluginExtension[],
> {
	/** Define args validation schema (required for mutations) */
	args<T>(schema: ZodLikeSchema<T>): MutationBuilderWithArgs<T, TOutput, TContext, TPlugins>;
}

/** Mutation builder after args is defined */
export interface MutationBuilderWithArgs<
	TInput,
	_TOutput = unknown,
	TContext = unknown,
	TPlugins extends readonly PluginExtension[] = readonly PluginExtension[],
> {
	/** Define return type (optional - for entity outputs) */
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

	/** Define resolver function directly (without .returns()) */
	resolve<TOut>(fn: ResolverFn<TInput, TOut, TContext>): MutationDef<TInput, TOut>;
}

/**
 * Mutation builder after returns is defined (strict version).
 * Only has .resolve() - no .optimistic().
 */
export interface MutationBuilderWithReturns2<TInput, TOutput, TContext = unknown> {
	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
}

/**
 * Mutation builder after returns is defined (with optimistic).
 * Has .optimistic() and .resolve().
 */
export interface MutationBuilderWithReturns<TInput, TOutput, TContext = unknown>
	extends MutationBuilderWithReturns2<TInput, TOutput, TContext> {
	/**
	 * Define optimistic update (optional)
	 *
	 * @example
	 * ```typescript
	 * // Sugar syntax
	 * .optimistic('merge')
	 * .optimistic('create')
	 * .optimistic('delete')
	 *
	 * // Callback with typed args
	 * .optimistic(({ args }) => [
	 *   e.update("User", { id: args.id, name: args.name })
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

// =============================================================================
// Mutation Builder Implementation
// =============================================================================

export class MutationBuilderImpl<TInput = unknown, TOutput = unknown, TContext = unknown>
	implements
		MutationBuilder<TInput, TOutput>,
		MutationBuilderWithArgs<TInput, TOutput, TContext>,
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

	args<T>(schema: ZodLikeSchema<T>): MutationBuilderWithArgs<T, TOutput, TContext> {
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

		if (typeof specOrCallback === "function") {
			const argsProxy = new Proxy(
				{},
				{
					get(_, prop: string) {
						return { $input: prop };
					},
				},
			) as TInput;
			const stepBuilders: StepBuilder[] = specOrCallback({ args: argsProxy });
			const steps = stepBuilders.map((s: StepBuilder) => s.build());
			builder._optimisticSpec = { $pipe: steps } as Pipeline;
		} else {
			builder._optimisticSpec = specOrCallback;
		}

		return builder;
	}

	resolve<TOut = TOutput>(fn: ResolverFn<TInput, TOut, TContext>): MutationDef<TInput, TOut> {
		if (!this._inputSchema) {
			throw new Error("Mutation requires args schema. Use .args(schema) first.");
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

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a mutation builder
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const createPost = mutation()
 *   .args(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .resolve(({ args }) => db.post.create({ data: args }));
 *
 * // With typed context
 * export const createPost = mutation<MyContext>()
 *   .args(z.object({ title: z.string() }))
 *   .resolve(({ args, ctx }) => ctx.db.post.create({ data: args }));
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
// Type Guard
// =============================================================================

/** Check if value is a mutation definition */
export function isMutationDef(value: unknown): value is MutationDef {
	return typeof value === "object" && value !== null && (value as MutationDef)._type === "mutation";
}

/** Check if value is any operation definition */
export function isOperationDef(
	value: unknown,
): value is import("./query.js").QueryDef | MutationDef {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { _type?: string })._type;
	return type === "mutation" || type === "query";
}
