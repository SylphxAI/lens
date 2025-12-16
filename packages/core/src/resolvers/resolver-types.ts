/**
 * @sylphx/lens-core - Field Resolver Types
 *
 * Type definitions for field resolution.
 */

import type { z } from "zod";
import type { Emit } from "../emit/index.js";
import type { InferScalar } from "../schema/infer.js";
import type { EntityDefinition, FieldType } from "../schema/types.js";

// =============================================================================
// Entity Type Aliases
// =============================================================================

/**
 * Any entity-like definition (EntityDef or ModelDef).
 * Uses structural typing to accept both types without exactOptionalPropertyTypes issues.
 */
export type AnyEntityLike<
	Name extends string = string,
	Fields extends Record<string, unknown> = Record<string, unknown>,
> = {
	readonly _name: Name | undefined;
	readonly fields: Fields;
};

// =============================================================================
// Context Type (passed to resolvers)
// =============================================================================

/** Base context type for field resolvers - extend this for your app */
export type FieldResolverContext = Record<string, unknown>;

/** Cleanup function registration */
export type OnCleanup = (fn: () => void) => () => void;

/** Emit function for field updates (generic version) */
export type FieldEmit<T> = (value: T) => void;

// =============================================================================
// Publisher Pattern Types
// =============================================================================

/**
 * Subscription callbacks passed to publisher function.
 * Keeps user context clean - emit/onCleanup are NOT on ctx.
 *
 * emit has full Emit<T> API with .delta(), .patch(), .push(), etc.
 */
export interface SubscriptionCallbacks<T> {
	/** Emit updates - full API with .delta(), .patch(), .push(), etc. */
	emit: Emit<T>;
	/** Register cleanup function called when subscription ends */
	onCleanup: OnCleanup;
}

/**
 * Publisher function returned from subscribe.
 * Receives subscription callbacks separately from user context.
 *
 * @example
 * ```typescript
 * .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
 *   ctx.db.onChange(parent.id, (v) => emit(v));
 *   onCleanup(() => ctx.db.unsubscribe(parent.id));
 * })
 * ```
 */
export type Publisher<T> = (callbacks: SubscriptionCallbacks<T>) => void;

// =============================================================================
// Type-Safe Context Types
// =============================================================================

/**
 * Context for field resolvers that return a value (no emit/onCleanup).
 * Used with .resolve() - returns value once.
 */
export type FieldQueryContext<TContext> = TContext;

// =============================================================================
// Resolver Function Types
// =============================================================================

/**
 * Field resolver params for .resolve() - returns value, no emit/onCleanup.
 */
export type FieldResolveParams<TParent, TArgs, TContext> = {
	/**
	 * Source object being resolved.
	 * @example
	 * ```typescript
	 * .resolve(({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id))
	 * ```
	 */
	source: TParent;
	/** Field arguments (if any) */
	args: TArgs;
	ctx: FieldQueryContext<TContext>;
};

/**
 * Field resolver params for .subscribe() - pure context, no emit/onCleanup.
 * Returns a Publisher that receives subscription callbacks.
 */
export type FieldSubscribeParams<TParent, TArgs, TContext> = {
	/** Source object being resolved */
	source: TParent;
	/** Field arguments (if any) */
	args: TArgs;
	ctx: TContext;
};

/**
 * Field resolver function for .resolve() - returns value.
 */
export type FieldResolveFn<TParent, TArgs, TContext, TResult> = (
	params: FieldResolveParams<TParent, TArgs, TContext>,
) => TResult | Promise<TResult>;

/**
 * Live field subscriber function - returns Publisher.
 * Used with .resolve().subscribe() pattern.
 *
 * @example
 * ```typescript
 * .resolve().subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
 *   ctx.db.onChange(parent.id, (v) => emit(v));
 *   onCleanup(() => ctx.db.unsubscribe(parent.id));
 * })
 * ```
 */
export type FieldLiveSubscribeFn<TParent, TArgs, TContext, TResult> = (
	params: FieldSubscribeParams<TParent, TArgs, TContext>,
) => Publisher<TResult>;

/** Field resolver function without args for .resolve() */
export type FieldResolveFnNoArgs<TParent, TContext, TResult> = (params: {
	source: TParent;
	/** @deprecated Use `source` instead */
	parent: TParent;
	ctx: FieldQueryContext<TContext>;
}) => TResult | Promise<TResult>;

/** Live field subscriber function without args - returns Publisher */
export type FieldLiveSubscribeFnNoArgs<TParent, TContext, TResult> = (params: {
	source: TParent;
	/** @deprecated Use `source` instead */
	parent: TParent;
	ctx: TContext;
}) => Publisher<TResult>;

/**
 * Plain function resolver - simple arrow function without builder API.
 * Used for inline field resolvers in resolver definitions.
 *
 * @example
 * ```typescript
 * resolver(User, (t) => ({
 *   id: t.expose("id"),
 *   displayName: ({ source }) => `${source.firstName}`,  // plain function
 * }))
 * ```
 */
export type PlainFieldResolver<TSource, TContext, TResult> = (params: {
	source: TSource;
	ctx: FieldQueryContext<TContext>;
}) => TResult | Promise<TResult>;

// =============================================================================
// Field Definition Types
// =============================================================================

/** Exposed field - directly uses parent value */
export interface ExposedField<T = unknown> {
	readonly _kind: "exposed";
	readonly _fieldName: string;
	readonly _type: T;
}

/** Resolved field - uses resolver function (returns value) */
export interface ResolvedField<
	T = unknown,
	TArgs = Record<string, never>,
	TContext = FieldResolverContext,
> {
	readonly _kind: "resolved";
	readonly _mode: "resolve";
	readonly _returnType: T;
	readonly _argsSchema: z.ZodType<TArgs> | null;
	readonly _resolver: (params: {
		parent: unknown;
		args: TArgs;
		ctx: FieldQueryContext<TContext>;
	}) => T | Promise<T>;
}

/**
 * Live field - has both resolver (initial) and subscriber (updates).
 * Created by chaining .resolve().subscribe()
 *
 * @example
 * ```typescript
 * status: f.string()
 *   .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
 *   .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
 *     ctx.statusService.watch(parent.id, (s) => emit(s));
 *     onCleanup(() => ctx.statusService.unwatch(parent.id));
 *   })
 * ```
 */
export interface LiveField<
	T = unknown,
	TArgs = Record<string, never>,
	TContext = FieldResolverContext,
> {
	readonly _kind: "resolved";
	readonly _mode: "live";
	readonly _returnType: T;
	readonly _argsSchema: z.ZodType<TArgs> | null;
	/** Resolver for initial value (Phase 1 - batchable) */
	readonly _resolver: (params: {
		parent: unknown;
		args: TArgs;
		ctx: FieldQueryContext<TContext>;
	}) => T | Promise<T>;
	/** Subscriber for live updates (Phase 2 - returns Publisher) */
	readonly _subscriber: (params: { parent: unknown; args: TArgs; ctx: TContext }) => Publisher<T>;
}

/** Field definition (exposed, resolved, or live) */
export type FieldDef<T = unknown, TArgs = unknown, TContext = FieldResolverContext> =
	| ExposedField<T>
	| ResolvedField<T, TArgs, TContext>
	| LiveField<T, TArgs, TContext>;

/**
 * Any field definition - can be plain function OR builder result.
 * Used as return type for resolver() builder callback.
 *
 * Plain functions are automatically wrapped as ResolvedField internally.
 *
 * @example
 * ```typescript
 * resolver(User, (t) => ({
 *   id: t.expose("id"),                                    // ExposedField
 *   displayName: ({ source }) => `${source.firstName}`,  // PlainFieldResolver
 *   posts: t.args(z.object({...})).resolve(...),         // ResolvedField
 * }))
 * ```
 */
export type AnyFieldDef<TContext = unknown> =
	| PlainFieldResolver<any, TContext, any>
	| ExposedField<any>
	| ResolvedField<any, any, TContext>
	| LiveField<any, any, TContext>;

// =============================================================================
// Field Builder Types
// =============================================================================

/**
 * Resolved field with chainable .subscribe() for live updates.
 * Returned by .resolve() to allow optional .subscribe() chaining.
 *
 * @example
 * ```typescript
 * // Just resolve (one-shot, batchable)
 * posts: f.many(Post).resolve(({ parent, ctx }) => ctx.db.getPosts(parent.id))
 *
 * // Resolve + subscribe (initial + live updates)
 * status: f.string()
 *   .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
 *   .subscribe(({ parent, ctx, emit }) => {
 *     ctx.statusService.watch(parent.id, (s) => emit(s));
 *   })
 * ```
 */
export interface ResolvedFieldChainable<
	T = unknown,
	TArgs = Record<string, never>,
	TParent = unknown,
	TContext = FieldResolverContext,
> extends ResolvedField<T, TArgs, TContext> {
	/**
	 * Add subscription for live updates after initial resolution.
	 * The resolve function handles initial data (batchable),
	 * the subscribe function sets up watchers for updates (Publisher pattern).
	 */
	subscribe(
		fn: TArgs extends Record<string, never>
			? FieldLiveSubscribeFnNoArgs<TParent, TContext, T>
			: FieldLiveSubscribeFn<TParent, TArgs, TContext, T>,
	): LiveField<T, TArgs, TContext>;
}

/** Check if a field is optional */
export type IsOptionalField<T> = T extends { _optional: true } ? true : false;

/** Extract required field keys */
export type RequiredFieldKeys<E extends EntityDefinition> = {
	[K in keyof E]: IsOptionalField<E[K]> extends true ? never : K;
}[keyof E];

/** Extract optional field keys */
export type OptionalFieldKeys<E extends EntityDefinition> = {
	[K in keyof E]: IsOptionalField<E[K]> extends true ? K : never;
}[keyof E];

/** Infer parent type from entity fields (with proper optional handling) */
export type InferParent<E extends EntityDefinition> = {
	[K in RequiredFieldKeys<E>]: E[K] extends FieldType ? InferScalar<E[K]> : never;
} & {
	[K in OptionalFieldKeys<E>]?: E[K] extends FieldType ? InferScalar<E[K]> : never;
};

/**
 * Infer parent type from any fields (permissive version).
 * Used for field builders where exact field types aren't critical.
 */
export type InferParentAny<E> = E extends EntityDefinition ? InferParent<E> : any;

/** Field builder with args already defined */
export interface FieldBuilderWithArgs<TParent, TArgs, TContext> {
	/**
	 * Define how to resolve this field with args (returns value).
	 * Can optionally chain .subscribe() for live updates.
	 */
	resolve<TResult>(
		fn: FieldResolveFn<TParent, TArgs, TContext, TResult>,
	): ResolvedFieldChainable<TResult, TArgs, TParent, TContext>;
}

/**
 * Simplified field builder for an entity.
 * Types are now defined in the Model, so builder only handles resolution.
 *
 * Use plain functions for simple computed fields:
 * ```typescript
 * resolver(User, (t) => ({
 *   id: t.expose('id'),                                 // expose source field
 *   displayName: ({ source }) => `${source.firstName}`, // plain function
 *   posts: t.args(z.object({ limit: z.number() }))     // with args
 *     .resolve(({ source, args, ctx }) => ...)
 * }))
 * ```
 */
export interface FieldBuilder<TEntity extends AnyEntityLike, TContext = FieldResolverContext> {
	/**
	 * Expose a field from the parent entity directly.
	 * The field must exist in the entity definition.
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (t) => ({
	 *   id: t.expose('id'),     // expose parent.id
	 *   name: t.expose('name'), // expose parent.name
	 * }));
	 * ```
	 */
	expose<K extends keyof TEntity["fields"] & string>(fieldName: K): ExposedField<unknown>;

	/**
	 * Add field arguments (GraphQL-style).
	 * Chain with .resolve() for computed fields with arguments.
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (t) => ({
	 *   posts: t
	 *     .args(z.object({ limit: z.number().default(10) }))
	 *     .resolve(({ source, args, ctx }) => ctx.db.posts.filter(...).slice(0, args.limit)),
	 * }));
	 * ```
	 */
	args<TArgs extends z.ZodRawShape>(
		schema: z.ZodObject<TArgs>,
	): FieldBuilderWithArgs<InferParentAny<TEntity["fields"]>, z.infer<z.ZodObject<TArgs>>, TContext>;

	/**
	 * Define a computed field resolver (no args).
	 * For simple computed fields, prefer using a plain function instead:
	 * `displayName: ({ source }) => ...`
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (t) => ({
	 *   displayName: t.resolve(({ source }) => `${source.firstName} ${source.lastName}`),
	 * }));
	 * ```
	 */
	resolve<TResult>(
		fn: FieldResolveFnNoArgs<InferParentAny<TEntity["fields"]>, TContext, TResult>,
	): ResolvedFieldChainable<
		TResult,
		Record<string, never>,
		InferParentAny<TEntity["fields"]>,
		TContext
	>;
}

// =============================================================================
// Resolver Definition
// =============================================================================

/** Resolver fields definition */
export type ResolverFields<TContext = FieldResolverContext> = Record<
	string,
	FieldDef<unknown, TContext>
>;

/** Resolver definition for an entity */
export interface ResolverDef<
	TEntity extends AnyEntityLike = AnyEntityLike,
	TFields extends Record<string, FieldDef<any, any, any>> = Record<string, FieldDef<any, any, any>>,
	TContext = FieldResolverContext,
> {
	/** The entity this resolver is for */
	readonly entity: TEntity;

	/** Field definitions */
	readonly fields: TFields;

	/** Get field names */
	getFieldNames(): (keyof TFields)[];

	/** Check if field exists */
	hasField(name: string): boolean;

	/** Check if field is exposed (vs resolved) */
	isExposed(name: string): boolean;

	/** Check if field is a subscription (live mode with updates) */
	isSubscription(name: string): boolean;

	/** Check if field is a live field (has both resolver and subscriber) */
	isLive(name: string): boolean;

	/** Get the field mode: "exposed", "resolve", "live", or null if not found */
	getFieldMode(name: string): "exposed" | "resolve" | "live" | null;

	/** Get the args schema for a field (if any) */
	getArgsSchema(name: string): z.ZodType | null;

	/**
	 * Resolve initial value for a field.
	 * Works for "resolve" and "live" modes.
	 * For "subscribe" mode, returns undefined (subscribe handles initial value).
	 */
	resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParentAny<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: FieldQueryContext<TContext>,
	): Promise<unknown>;

	/**
	 * Set up subscription for a live field.
	 * Returns a Publisher that receives { emit, onCleanup } callbacks.
	 */
	subscribeField<K extends keyof TFields>(
		name: K,
		parent: InferParentAny<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: TContext,
	): Publisher<unknown> | null;

	/** Resolve all fields for a parent with args per field */
	resolveAll(
		parent: InferParentAny<TEntity["fields"]>,
		ctx: TContext,
		select?: Array<{ name: string; args?: Record<string, unknown> }> | string[],
	): Promise<Record<string, unknown>>;
}

// =============================================================================
// Type Inference Helpers
// =============================================================================

/** Infer the resolved type from a resolver definition */
export type InferResolverOutput<R extends ResolverDef> = {
	[K in keyof R["fields"]]: R["fields"][K] extends ExposedField<infer T>
		? T
		: R["fields"][K] extends ResolvedField<infer T>
			? T
			: R["fields"][K] extends LiveField<infer T>
				? T
				: never;
};

/** Infer selected fields from resolver */
export type InferResolverSelected<
	R extends ResolverDef,
	Select extends (keyof R["fields"])[] | undefined,
> = Select extends (keyof R["fields"])[]
	? Pick<InferResolverOutput<R>, Select[number]>
	: InferResolverOutput<R>;

/** Array of resolver definitions */
export type Resolvers = ResolverDef<any, any, any>[];
