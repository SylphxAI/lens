/**
 * @sylphx/lens-core - Model Resolver Types
 *
 * Types for model-level field resolution.
 * Use standalone resolver(Model, ...) function instead of model chains.
 *
 * @example
 * ```typescript
 * type UserSource = InferModelSource<typeof User>
 * // { id: string; name: string }  - posts excluded (relation)
 * ```
 */

import type { FieldQueryContext, Publisher } from "../resolvers/resolver-types.js";
import type { InferScalar, ScalarFields } from "./infer.js";
import type { ModelDef } from "./model.js";
import type { EntityDefinition, LazyManyType, LazyOneType } from "./types.js";

// =============================================================================
// Source Type Inference
// =============================================================================

/**
 * Extract scalar (non-relation) fields from entity definition.
 * This is the "source" type available in field resolvers.
 *
 * Relations are excluded because they need to be resolved separately.
 */
export type ScalarFieldsOnly<E extends EntityDefinition> = {
	[K in ScalarFields<E>]: InferScalar<E[K]>;
};

/**
 * Infer source type from a ModelDef.
 * Source = only scalar fields (relations need field resolvers).
 *
 * @example
 * ```typescript
 * const { model } = lens<AppContext>();
 *
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   posts: list(() => Post),
 * })
 *
 * type UserSource = InferModelSource<typeof User>
 * // { id: string; name: string }  - posts excluded (relation)
 * ```
 */
export type InferModelSource<M extends ModelDef<any, any>> =
	M extends ModelDef<string, infer F> ? ScalarFieldsOnly<F> : never;

// =============================================================================
// Field Type Inference
// =============================================================================

/**
 * Infer entity type from a ModelDef.
 * For model chains, returns all scalar fields as the expected resolver output.
 */
type InferModelEntity<M> = M extends ModelDef<string, infer F> ? ScalarFieldsOnly<F> : unknown;

/**
 * Extract the TypeScript type from a field definition.
 *
 * For scalar fields: uses `_tsType` directly
 * For lazy relations: infers from the target model's scalar fields
 * For legacy relations: falls back to unknown (requires schema context)
 */
type InferFieldOutputType<F> =
	// Lazy one-to-many: t.many(() => Post) → Post[]
	// Target is already the model type (result of calling targetRef)
	F extends LazyManyType<infer Target, unknown>
		? Array<InferModelEntity<Target>>
		: // Lazy one-to-one: t.one(() => Profile) → Profile | null
			F extends LazyOneType<infer Target, unknown>
			? InferModelEntity<Target> | null
			: // Scalar fields: use _tsType
				F extends { _tsType: infer T }
				? T
				: unknown;

/**
 * Extract field args type if the field has an args schema.
 * Falls back to Record<string, never> if no args defined.
 */
type InferFieldArgs<F> = F extends { _argsSchema: infer S }
	? S extends { _output: infer A }
		? A
		: Record<string, never>
	: Record<string, never>;

// =============================================================================
// Field Resolver Types
// =============================================================================

/**
 * Field resolver function for model chain.
 * Receives source (parent), args, and context.
 * Return type is checked against the field's expected type.
 *
 * @example
 * ```typescript
 * const User = model('User', {
 *   id: id(),
 *   posts: list(() => Post),
 * }).resolve({
 *   posts: ({ source, args, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === source.id)
 * });
 * ```
 */
export type ModelFieldResolver<TSource, TArgs, TContext, TResult> = (params: {
	/** Source object being resolved */
	source: TSource;
	/** Field arguments (if any) */
	args: TArgs;
	/** Application context */
	ctx: FieldQueryContext<TContext>;
}) => TResult | Promise<TResult>;

/**
 * Field subscriber function for model chain (returns Publisher).
 * Used for real-time field updates.
 *
 * @example
 * ```typescript
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 * }).subscribe({
 *   name: ({ source, ctx }) => ({ emit, onCleanup }) => {
 *     const unsub = ctx.events.on(`user:${source.id}:name`, emit)
 *     onCleanup(unsub)
 *   }
 * });
 * ```
 */
export type ModelFieldSubscriber<TSource, TArgs, TContext, TResult> = (params: {
	/** Source object being resolved */
	source: TSource;
	/** Field arguments (if any) */
	args: TArgs;
	/** Application context (pure, no emit/onCleanup) */
	ctx: TContext;
}) => Publisher<TResult>;

// =============================================================================
// Field Map Types
// =============================================================================

/**
 * Map of field resolvers for a model.
 * Keys are field names, values are resolver functions.
 * Return types are checked against the field's expected type.
 */
export type FieldResolverMap<
	Fields extends EntityDefinition,
	TContext,
	TSource = ScalarFieldsOnly<Fields>,
> = {
	[K in keyof Fields]?: ModelFieldResolver<
		TSource,
		InferFieldArgs<Fields[K]>,
		TContext,
		InferFieldOutputType<Fields[K]>
	>;
};

/**
 * Map of field subscribers for a model.
 * Keys are field names, values are subscriber functions.
 * Emit types are checked against the field's expected type.
 */
export type FieldSubscriberMap<
	Fields extends EntityDefinition,
	TContext,
	TSource = ScalarFieldsOnly<Fields>,
> = {
	[K in keyof Fields]?: ModelFieldSubscriber<
		TSource,
		InferFieldArgs<Fields[K]>,
		TContext,
		InferFieldOutputType<Fields[K]>
	>;
};
