/**
 * @sylphx/lens-core - Field Resolver Types
 *
 * Type definitions for field resolution.
 */

import type { z } from "zod";
import type { EntityDef } from "../schema/define.js";
import type { InferScalar } from "../schema/infer.js";
import type { EntityDefinition, FieldType } from "../schema/types.js";

// =============================================================================
// Context Type (passed to resolvers)
// =============================================================================

/** Base context type for field resolvers - extend this for your app */
export type FieldResolverContext = Record<string, unknown>;

/** Cleanup function registration */
export type OnCleanup = (fn: () => void) => void;

/** Emit function for field updates (generic version) */
export type FieldEmit<T> = (value: T) => void;

// =============================================================================
// Resolver Function Types
// =============================================================================

/**
 * Resolver function params (object style)
 *
 * Live query capabilities (emit, onCleanup) are optional:
 * - Available when called from a live subscription context
 * - Not available when called via DataLoader batching
 */
export type FieldResolverParams<TParent, TArgs, TContext, TResult = unknown> = {
	parent: TParent;
	args: TArgs;
	ctx: TContext;
	/** Emit a new value for this field (only available in live query context) */
	emit?: FieldEmit<TResult>;
	/** Register cleanup function (only available in live query context) */
	onCleanup?: OnCleanup;
};

/** Resolver function signature (object style: { parent, args, ctx, emit?, onCleanup? }) */
export type FieldResolverFn<TParent, TArgs, TContext, TResult> = (
	params: FieldResolverParams<TParent, TArgs, TContext, TResult>,
) => TResult | Promise<TResult>;

/** Resolver function without args */
export type FieldResolverFnNoArgs<TParent, TContext, TResult> = (params: {
	parent: TParent;
	ctx: TContext;
	emit?: FieldEmit<TResult>;
	onCleanup?: OnCleanup;
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

/** Resolved field - uses resolver function */
export interface ResolvedField<
	T = unknown,
	TArgs = Record<string, never>,
	TContext = FieldResolverContext,
> {
	readonly _kind: "resolved";
	readonly _returnType: T;
	readonly _argsSchema: z.ZodType<TArgs> | null;
	readonly _resolver: (params: {
		parent: unknown;
		args: TArgs;
		ctx: TContext;
		emit?: FieldEmit<T>;
		onCleanup?: OnCleanup;
	}) => T | Promise<T>;
}

/** Field definition (exposed or resolved) */
export type FieldDef<T = unknown, TArgs = unknown, TContext = FieldResolverContext> =
	| ExposedField<T>
	| ResolvedField<T, TArgs, TContext>;

// =============================================================================
// Field Builder Types
// =============================================================================

/** Scalar field builder with args method */
export interface ScalarFieldBuilder<T, TParent, TContext> {
	/** Add field arguments (GraphQL-style) */
	args<TArgs extends z.ZodRawShape>(
		schema: z.ZodObject<TArgs>,
	): ScalarFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>;

	/** Define how to resolve this field (no args) */
	resolve(
		fn: FieldResolverFnNoArgs<TParent, TContext, T>,
	): ResolvedField<T, Record<string, never>, TContext>;

	/** Make the field nullable */
	nullable(): ScalarFieldBuilder<T | null, TParent, TContext>;
}

/** Scalar field builder with args already defined */
export interface ScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	/** Define how to resolve this field with args */
	resolve(fn: FieldResolverFn<TParent, TArgs, TContext, T>): ResolvedField<T, TArgs, TContext>;

	/** Make the field nullable */
	nullable(): ScalarFieldBuilderWithArgs<T | null, TParent, TArgs, TContext>;
}

/** Relation field builder with args method */
export interface RelationFieldBuilder<T, TParent, TContext> {
	/** Add field arguments (GraphQL-style) */
	args<TArgs extends z.ZodRawShape>(
		schema: z.ZodObject<TArgs>,
	): RelationFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>;

	/** Define how to resolve this relation (no args) */
	resolve(
		fn: FieldResolverFnNoArgs<TParent, TContext, T>,
	): ResolvedField<T, Record<string, never>, TContext>;

	/** Make the relation nullable */
	nullable(): RelationFieldBuilder<T | null, TParent, TContext>;
}

/** Relation field builder with args already defined */
export interface RelationFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	/** Define how to resolve this relation with args */
	resolve(fn: FieldResolverFn<TParent, TArgs, TContext, T>): ResolvedField<T, TArgs, TContext>;

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

	/** Get the args schema for a field (if any) */
	getArgsSchema(name: string): z.ZodType | null;

	/** Resolve a single field with args and optional live query context */
	resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: TContext,
		emit?: FieldEmit<unknown>,
		onCleanup?: OnCleanup,
	): Promise<unknown>;

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
