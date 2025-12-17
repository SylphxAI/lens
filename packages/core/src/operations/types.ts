/**
 * @sylphx/lens-core - Operations Types
 *
 * Type definitions for query and mutation operations.
 */

import type { Emit } from "../emit/index.js";
import type { Pipeline, StepBuilder } from "../optimistic/reify.js";
import { isPipeline } from "../optimistic/reify.js";
import type { ModelDef } from "../schema/model.js";
import type { FieldType } from "../schema/types.js";
import type { ListWrapper, NullableWrapper } from "../schema/wrappers.js";
import type { Prettify } from "../utils/types.js";

// =============================================================================
// Input Schema Types
// =============================================================================

/**
 * Zod-like schema interface for input validation.
 * Compatible with Zod, Valibot, Arktype, and other schema libraries.
 */
export interface ZodLikeSchema<T = unknown> {
	parse(data: unknown): T;
	safeParse?(data: unknown): { success: true; data: T } | { success: false; error: unknown };
	_output?: T;
}

// =============================================================================
// Schema Types
// =============================================================================

/** Model definition type for return specifications (uses any for fields to avoid variance issues) */
type AnyModelDef = ModelDef<string, any>;

/**
 * Return type specification
 * - Model: Model definition
 * - nullable(Model): Nullable model
 * - list(Model): Array of models
 * - nullable(list(Model)): Nullable array
 *
 * Uses `any` for inner types to avoid variance issues with specific ModelDef types.
 */
export type ReturnSpec =
	| AnyModelDef
	| NullableWrapper<any>
	| ListWrapper<any>
	| NullableWrapper<ListWrapper<any>>;

// =============================================================================
// Type Inference
// =============================================================================

/**
 * Infer entity/model type from definition fields.
 * Uses permissive `any` constraint to avoid variance issues with ProcessedFields.
 */
type InferModelFromFieldsAny<F> = Prettify<
	{
		[K in keyof F as F[K] extends { _optional: true } ? never : K]: F[K] extends FieldType<infer T>
			? T
			: unknown;
	} & {
		[K in keyof F as F[K] extends { _optional: true } ? K : never]?: F[K] extends FieldType<infer T>
			? T
			: unknown;
	}
>;

/**
 * Structural check for ModelDef-like objects.
 * Avoids issues with nominal typing and EntityMarker extension.
 */
type IsModelDefLike<T> = T extends { readonly fields: infer F; _name: string } ? F : never;

/**
 * Infer TypeScript type from return spec.
 * Uses structural matching to avoid variance issues with ProcessedFields.
 */
export type InferReturnType<R extends ReturnSpec> =
	// Nullable wrapper
	R extends NullableWrapper<infer Inner>
		? Inner extends ListWrapper<infer Model>
			? IsModelDefLike<Model> extends infer F
				? F extends never
					? never
					: InferModelFromFieldsAny<F>[] | null
				: never
			: IsModelDefLike<Inner> extends infer F
				? F extends never
					? never
					: InferModelFromFieldsAny<F> | null
				: never
		: // List wrapper
			R extends ListWrapper<infer Model>
			? IsModelDefLike<Model> extends infer F
				? F extends never
					? never
					: InferModelFromFieldsAny<F>[]
				: never
			: // ModelDef-like
				IsModelDefLike<R> extends infer F
				? F extends never
					? never
					: InferModelFromFieldsAny<F>
				: never;

// =============================================================================
// Context Types
// =============================================================================

/**
 * Lens-provided context extensions for emit-based subscriptions.
 * Used when resolver returns void and uses emit() to push updates.
 */
export interface EmitContextExtensions<TOutput = unknown> {
	/**
	 * Emit state updates to subscribed clients.
	 * Only available in subscription context (return void).
	 */
	emit: Emit<TOutput>;

	/**
	 * Register cleanup function called when client unsubscribes.
	 * Returns a function to manually remove the cleanup.
	 */
	onCleanup: (fn: () => void) => () => void;
}

/**
 * Lens-provided context extensions for generator-based subscriptions.
 * Used when resolver is an async generator (yield).
 */
export interface GeneratorContextExtensions {
	/**
	 * Register cleanup function called when client unsubscribes.
	 * Returns a function to manually remove the cleanup.
	 */
	onCleanup: (fn: () => void) => () => void;
}

/**
 * Context for query resolvers (return value).
 * No emit or onCleanup - queries are one-shot.
 */
export type QueryContext<TContext> = TContext;

/**
 * Context for emit-based subscription resolvers (return void).
 * Has emit and onCleanup.
 */
export type EmitSubscriptionContext<TContext, TOutput = unknown> = TContext &
	EmitContextExtensions<TOutput>;

/**
 * Context for generator-based subscription resolvers (yield).
 * Has onCleanup but no emit (yield IS the emit).
 */
export type GeneratorSubscriptionContext<TContext> = TContext & GeneratorContextExtensions;

// =============================================================================
// Resolver Context Types
// =============================================================================

/**
 * Resolver context for queries (return value).
 * ctx has NO emit/onCleanup.
 */
export interface QueryResolverContext<TInput = unknown, TContext = unknown> {
	/**
	 * Parsed and validated arguments.
	 * @example
	 * ```typescript
	 * .resolve(({ args, ctx }) => ctx.db.user.find(args.id))
	 * ```
	 */
	args: TInput;
	/** User context (no Lens extensions for queries) */
	ctx: QueryContext<TContext>;
}

/**
 * Resolver context for emit-based subscriptions (return void).
 * ctx has emit and onCleanup.
 */
export interface EmitResolverContext<TInput = unknown, TOutput = unknown, TContext = unknown> {
	/** Parsed and validated arguments */
	args: TInput;
	/** Context with emit and onCleanup */
	ctx: EmitSubscriptionContext<TContext, TOutput>;
}

/**
 * Resolver context for generator-based subscriptions (yield).
 * ctx has onCleanup but no emit.
 */
export interface GeneratorResolverContext<TInput = unknown, TContext = unknown> {
	/** Parsed and validated arguments */
	args: TInput;
	/** Context with onCleanup only */
	ctx: GeneratorSubscriptionContext<TContext>;
}

// =============================================================================
// Resolver Function Types
// =============================================================================

/** Query resolver - returns value, no emit/onCleanup */
export type QueryResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: QueryResolverContext<TInput, TContext>,
) => TOutput | Promise<TOutput>;

/** Emit-based subscription resolver - returns void, uses emit */
export type EmitResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: EmitResolverContext<TInput, TOutput, TContext>,
) => void | Promise<void>;

/** Generator-based subscription resolver - yields values */
export type GeneratorResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: GeneratorResolverContext<TInput, TContext>,
) => AsyncGenerator<TOutput>;

/**
 * Generic resolver function for mutations.
 * Receives typed arguments and context, returns output.
 */
export type ResolverFn<TInput, TOutput, TContext = unknown> = (ctx: {
	args: TInput;
	ctx: TContext;
}) => TOutput | Promise<TOutput>;

// =============================================================================
// Optimistic DSL Types
// =============================================================================

/** Sugar syntax for common optimistic update patterns */
export type OptimisticSugar = "merge" | "create" | "delete" | { merge: Record<string, unknown> };

/**
 * OptimisticDSL - Defines optimistic update behavior
 *
 * Can be:
 * - Sugar syntax ("merge", "create", "delete", { merge: {...} }) for common patterns
 * - Reify Pipeline for complex multi-entity operations
 */
export type OptimisticDSL = OptimisticSugar | Pipeline;

/**
 * Check if value is an OptimisticDSL (sugar or Pipeline)
 */
export function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	if (value === "merge" || value === "create" || value === "delete") {
		return true;
	}
	if (value && typeof value === "object" && "merge" in value) {
		return true;
	}
	return isPipeline(value);
}

/** Context passed to optimistic callback for type inference */
export interface OptimisticContext<TInput> {
	/** Typed arguments - inferred from .args() schema */
	args: TInput;
}

/** Optimistic callback that receives typed arguments and returns step builders */
export type OptimisticCallback<TInput> = (ctx: OptimisticContext<TInput>) => StepBuilder[];
