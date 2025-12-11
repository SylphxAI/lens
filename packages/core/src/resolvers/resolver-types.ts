/**
 * @sylphx/lens-core - Field Resolver Types
 *
 * Type definitions for field resolution.
 */

import type { z } from "zod";
import type { Emit } from "../emit/index.js";
import type { EntityDef } from "../schema/define.js";
import type { InferScalar } from "../schema/infer.js";
import type { EntityDefinition, FieldType } from "../schema/types.js";

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

/**
 * @deprecated Use Publisher pattern instead. emit/onCleanup should be in publisher callback.
 * Context for field resolvers that emit updates (has emit and onCleanup).
 * Used with .subscribe() - can push updates over time.
 */
export type FieldSubscriptionContext<TContext, TResult = unknown> = TContext & {
	/** Emit a new value for this field */
	emit: FieldEmit<TResult>;
	/** Register cleanup function called when subscription ends */
	onCleanup: OnCleanup;
};

/**
 * @deprecated Use FieldQueryContext or Publisher pattern
 * Extended context with live query capabilities.
 * User context is extended with emit and onCleanup.
 */
export type FieldLiveContext<TContext, TResult = unknown> = TContext & {
	emit: FieldEmit<TResult>;
	onCleanup: OnCleanup;
};

// =============================================================================
// Resolver Function Types
// =============================================================================

/**
 * Field resolver params for .resolve() - returns value, no emit/onCleanup.
 */
export type FieldResolveParams<TParent, TArgs, TContext> = {
	/**
	 * Parent object being resolved (preferred).
	 * @example
	 * ```typescript
	 * .resolve(({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id))
	 * ```
	 */
	source: TParent;
	/** @deprecated Use `source` instead for consistency with GraphQL terminology */
	parent: TParent;
	/** Field arguments (if any) */
	args: TArgs;
	ctx: FieldQueryContext<TContext>;
};

/**
 * Field resolver params for .subscribe() - pure context, no emit/onCleanup.
 * Returns a Publisher that receives subscription callbacks.
 */
export type FieldSubscribeParams<TParent, TArgs, TContext> = {
	/** Parent object being resolved (preferred) */
	source: TParent;
	/** @deprecated Use `source` instead */
	parent: TParent;
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
 * @deprecated Use .resolve().subscribe() instead.
 * Legacy field subscription function - receives ctx with emit/onCleanup.
 *
 * @example
 * ```typescript
 * .subscribe(({ parent, ctx }) => {
 *   ctx.emit(getInitial());
 *   ctx.onCleanup(() => cleanup());
 * })
 * ```
 */
export type FieldSubscribeFn<TParent, TArgs, TContext, TResult> = (
	params: FieldSubscribeParams<TParent, TArgs, TContext> & {
		ctx: FieldSubscriptionContext<TContext, TResult>;
	},
) => void | Promise<void>;

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

/**
 * @deprecated Use .resolve().subscribe() instead.
 * Legacy field subscription function without args - receives ctx with emit/onCleanup.
 */
export type FieldSubscribeFnNoArgs<TParent, TContext, TResult> = (params: {
	source: TParent;
	/** @deprecated Use `source` instead */
	parent: TParent;
	ctx: FieldSubscriptionContext<TContext, TResult>;
}) => void | Promise<void>;

/** Live field subscriber function without args - returns Publisher */
export type FieldLiveSubscribeFnNoArgs<TParent, TContext, TResult> = (params: {
	source: TParent;
	/** @deprecated Use `source` instead */
	parent: TParent;
	ctx: TContext;
}) => Publisher<TResult>;

/**
 * @deprecated Use FieldResolveParams or FieldSubscribeParams
 */
export type FieldResolverParams<TParent, TArgs, TContext, TResult = unknown> = {
	source: TParent;
	parent: TParent;
	args: TArgs;
	ctx: FieldLiveContext<TContext, TResult>;
};

/**
 * @deprecated Use FieldResolveFn or FieldSubscribeFn
 */
export type FieldResolverFn<TParent, TArgs, TContext, TResult> = (
	params: FieldResolverParams<TParent, TArgs, TContext, TResult>,
) => TResult | Promise<TResult>;

/**
 * @deprecated Use FieldResolveFnNoArgs or FieldSubscribeFnNoArgs
 */
export type FieldResolverFnNoArgs<TParent, TContext, TResult> = (params: {
	source: TParent;
	parent: TParent;
	ctx: FieldLiveContext<TContext, TResult>;
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
 * @deprecated Prefer .resolve().subscribe() for better performance (batchable initial).
 * Subscribed field - uses legacy ctx.emit pattern.
 */
export interface SubscribedField<
	T = unknown,
	TArgs = Record<string, never>,
	TContext = FieldResolverContext,
> {
	readonly _kind: "resolved";
	readonly _mode: "subscribe";
	readonly _returnType: T;
	readonly _argsSchema: z.ZodType<TArgs> | null;
	/** Legacy resolver - receives ctx with emit/onCleanup, returns void */
	readonly _resolver: (params: {
		parent: unknown;
		args: TArgs;
		ctx: FieldSubscriptionContext<TContext, T>;
	}) => void | Promise<void>;
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

/** Field definition (exposed, resolved, subscribed, or live) */
export type FieldDef<T = unknown, TArgs = unknown, TContext = FieldResolverContext> =
	| ExposedField<T>
	| ResolvedField<T, TArgs, TContext>
	| SubscribedField<T, TArgs, TContext>
	| LiveField<T, TArgs, TContext>;

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

/** Scalar field builder with args method */
export interface ScalarFieldBuilder<T, TParent, TContext> {
	/** Add field arguments (GraphQL-style) */
	args<TArgs extends z.ZodRawShape>(
		schema: z.ZodObject<TArgs>,
	): ScalarFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>;

	/**
	 * Define how to resolve this field (returns value, no emit/onCleanup).
	 * Use for computed fields that derive from parent data.
	 *
	 * Can optionally chain .subscribe() for live updates:
	 * @example
	 * ```typescript
	 * status: f.string()
	 *   .resolve(({ ctx }) => getStatus())
	 *   .subscribe(({ ctx, emit }) => watch((s) => emit(s)))
	 * ```
	 */
	resolve(
		fn: FieldResolveFnNoArgs<TParent, TContext, T>,
	): ResolvedFieldChainable<T, Record<string, never>, TParent, TContext>;

	/**
	 * Define how to subscribe to this field (uses emit, returns void).
	 * Use for fields that push updates from external sources.
	 *
	 * @deprecated Prefer .resolve().subscribe() for better performance.
	 * .subscribe() alone requires manual initial value emission.
	 */
	subscribe(
		fn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
	): SubscribedField<T, Record<string, never>, TContext>;

	/** Make the field nullable */
	nullable(): ScalarFieldBuilder<T | null, TParent, TContext>;
}

/** Scalar field builder with args already defined */
export interface ScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	/**
	 * Define how to resolve this field with args (returns value).
	 * Can optionally chain .subscribe() for live updates.
	 */
	resolve(
		fn: FieldResolveFn<TParent, TArgs, TContext, T>,
	): ResolvedFieldChainable<T, TArgs, TParent, TContext>;

	/**
	 * Define how to subscribe to this field with args (uses emit).
	 * @deprecated Prefer .resolve().subscribe() for better performance.
	 */
	subscribe(fn: FieldSubscribeFn<TParent, TArgs, TContext, T>): SubscribedField<T, TArgs, TContext>;

	/** Make the field nullable */
	nullable(): ScalarFieldBuilderWithArgs<T | null, TParent, TArgs, TContext>;
}

/** Relation field builder with args method */
export interface RelationFieldBuilder<T, TParent, TContext> {
	/** Add field arguments (GraphQL-style) */
	args<TArgs extends z.ZodRawShape>(
		schema: z.ZodObject<TArgs>,
	): RelationFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>;

	/**
	 * Define how to resolve this relation (returns value, no emit/onCleanup).
	 * Use for relations that derive from parent data.
	 * Can optionally chain .subscribe() for live updates.
	 */
	resolve(
		fn: FieldResolveFnNoArgs<TParent, TContext, T>,
	): ResolvedFieldChainable<T, Record<string, never>, TParent, TContext>;

	/**
	 * Define how to subscribe to this relation (uses emit, returns void).
	 * Use for relations that push updates from external sources.
	 * @deprecated Prefer .resolve().subscribe() for better performance.
	 */
	subscribe(
		fn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
	): SubscribedField<T, Record<string, never>, TContext>;

	/** Make the relation nullable */
	nullable(): RelationFieldBuilder<T | null, TParent, TContext>;
}

/** Relation field builder with args already defined */
export interface RelationFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	/**
	 * Define how to resolve this relation with args (returns value).
	 * Can optionally chain .subscribe() for live updates.
	 */
	resolve(
		fn: FieldResolveFn<TParent, TArgs, TContext, T>,
	): ResolvedFieldChainable<T, TArgs, TParent, TContext>;

	/**
	 * Define how to subscribe to this relation with args (uses emit).
	 * @deprecated Prefer .resolve().subscribe() for better performance.
	 */
	subscribe(fn: FieldSubscribeFn<TParent, TArgs, TContext, T>): SubscribedField<T, TArgs, TContext>;

	/** Make the relation nullable */
	nullable(): RelationFieldBuilderWithArgs<T | null, TParent, TArgs, TContext>;
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

/** Field builder for an entity */
export interface FieldBuilder<
	TEntity extends EntityDef<string, EntityDefinition>,
	TContext = FieldResolverContext,
> {
	/**
	 * Expose a field from the parent entity directly.
	 * The field must exist in the entity definition.
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (f) => ({
	 *   id: f.expose('id'),     // expose parent.id
	 *   name: f.expose('name'), // expose parent.name
	 * }));
	 * ```
	 */
	expose<K extends keyof TEntity["fields"] & string>(
		fieldName: K,
	): ExposedField<InferScalar<TEntity["fields"][K]>>;

	// Scalar type builders

	/** String field */
	string(): ScalarFieldBuilder<string, InferParent<TEntity["fields"]>, TContext>;

	/** Integer field */
	int(): ScalarFieldBuilder<number, InferParent<TEntity["fields"]>, TContext>;

	/** Float field */
	float(): ScalarFieldBuilder<number, InferParent<TEntity["fields"]>, TContext>;

	/** Boolean field */
	boolean(): ScalarFieldBuilder<boolean, InferParent<TEntity["fields"]>, TContext>;

	/** DateTime field */
	datetime(): ScalarFieldBuilder<Date, InferParent<TEntity["fields"]>, TContext>;

	/** Date field */
	date(): ScalarFieldBuilder<Date, InferParent<TEntity["fields"]>, TContext>;

	/**
	 * JSON/object field with custom type T.
	 * Use for JSON fields that need .resolve() or .subscribe().
	 *
	 * @example
	 * ```typescript
	 * resolver(Session, (f) => ({
	 *   status: f.json<SessionStatus>().subscribe(({ ctx }) => {
	 *     ctx.emit({ isActive: true, text: "Working..." });
	 *   }),
	 * }));
	 * ```
	 */
	json<T = unknown>(): ScalarFieldBuilder<T, InferParent<TEntity["fields"]>, TContext>;

	// Relation type builders

	/**
	 * One-to-one or many-to-one relation (returns single entity)
	 *
	 * @example
	 * ```typescript
	 * resolver(Post, (f) => ({
	 *   author: f.one(User).resolve((post, ctx) =>
	 *     ctx.loaders.user.load(post.authorId)
	 *   ),
	 * }));
	 * ```
	 */
	one<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): RelationFieldBuilder<InferParent<Target["fields"]>, InferParent<TEntity["fields"]>, TContext>;

	/**
	 * One-to-many relation (returns array of entities)
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (f) => ({
	 *   posts: f.many(Post).resolve((user, ctx) =>
	 *     ctx.loaders.post.loadByAuthorId(user.id)
	 *   ),
	 * }));
	 * ```
	 */
	many<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): RelationFieldBuilder<
		InferParent<Target["fields"]>[],
		InferParent<TEntity["fields"]>,
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
	TEntity extends EntityDef<string, EntityDefinition> = EntityDef<string, EntityDefinition>,
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

	/** Check if field is a subscription (uses emit pattern - "subscribe" or "live" mode) */
	isSubscription(name: string): boolean;

	/** Check if field is a live field (has both resolver and subscriber) */
	isLive(name: string): boolean;

	/** Get the field mode: "exposed", "resolve", "subscribe", "live", or null if not found */
	getFieldMode(name: string): "exposed" | "resolve" | "subscribe" | "live" | null;

	/** Get the args schema for a field (if any) */
	getArgsSchema(name: string): z.ZodType | null;

	/**
	 * Resolve initial value for a field.
	 * Works for "resolve" and "live" modes.
	 * For "subscribe" mode, returns undefined (subscribe handles initial value).
	 */
	resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: FieldQueryContext<TContext>,
	): Promise<unknown>;

	/**
	 * Set up subscription for a live field.
	 * Returns a Publisher that receives { emit, onCleanup } callbacks.
	 *
	 * For "live" mode: returns the _subscriber's Publisher.
	 * For "subscribe" mode (legacy): returns null (use subscribeFieldLegacy instead).
	 */
	subscribeField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: TContext,
	): Publisher<unknown> | null;

	/**
	 * @deprecated Legacy subscription - calls resolver with ctx.emit/ctx.onCleanup.
	 * For "subscribe" mode only.
	 */
	subscribeFieldLegacy<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: FieldSubscriptionContext<TContext, unknown>,
	): void | Promise<void>;

	/** Resolve all fields for a parent with args per field */
	resolveAll(
		parent: InferParent<TEntity["fields"]>,
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
			: R["fields"][K] extends SubscribedField<infer T>
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
