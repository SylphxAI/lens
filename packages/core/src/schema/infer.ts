/**
 * @sylphx/lens-core - Type Inference Utilities
 *
 * Powerful type inference from schema definitions.
 * Enables full end-to-end type safety.
 */

import type {
	ArrayType,
	BelongsToType,
	EntityDefinition,
	EnumType,
	FieldDefinition,
	FieldType,
	HasManyType,
	HasOneType,
	ObjectType,
	SchemaDefinition,
} from "./types.js";

// =============================================================================
// Scalar Type Inference
// =============================================================================

/** Type mapping from field _type to TypeScript type */
type ScalarTypeMap = {
	id: string;
	string: string;
	int: number;
	float: number;
	decimal: number;
	boolean: boolean;
	datetime: Date;
	date: Date;
	bigint: bigint;
	bytes: Uint8Array;
	json: unknown;
};

/** Infer base TypeScript type from field's _type property */
type InferBaseType<T extends FieldType> = T extends {
	_type: infer Type extends keyof ScalarTypeMap;
}
	? ScalarTypeMap[Type]
	: T extends EnumType<infer V>
		? V[number]
		: T extends ObjectType<infer O>
			? O
			: T extends ArrayType<infer I>
				? I[]
				: never;

/** Apply optional/nullable modifiers to base type */
type ApplyModifiers<Base, T> = T extends { _optional: true }
	? Base | undefined
	: T extends { _nullable: true }
		? Base | null
		: Base;

/** Infer TypeScript type from a scalar field type (handles optional/nullable) */
export type InferScalar<T extends FieldType> = ApplyModifiers<InferBaseType<T>, T>;

// =============================================================================
// Relation Type Inference
// =============================================================================

/** Infer the target entity name from a relation type */
export type InferRelationTarget<T> = T extends { target: infer Target } ? Target : never;

/** Check if a field is a relation */
export type IsRelation<T> = T extends { _relationKind: "hasOne" | "hasMany" | "belongsTo" }
	? true
	: false;

/** Check if a field is hasMany */
export type IsHasMany<T> = T extends { _relationKind: "hasMany" } ? true : false;

/** Check if a field is hasOne */
export type IsHasOne<T> = T extends { _relationKind: "hasOne" } ? true : false;

/** Check if a field is belongsTo */
export type IsBelongsTo<T> = T extends { _relationKind: "belongsTo" } ? true : false;

// =============================================================================
// Field Categorization
// =============================================================================

/** Extract scalar field keys from entity definition */
export type ScalarFields<E extends EntityDefinition> = {
	[K in keyof E]: IsRelation<E[K]> extends true ? never : K;
}[keyof E];

/** Extract relation field keys from entity definition */
export type RelationFields<E extends EntityDefinition> = {
	[K in keyof E]: IsRelation<E[K]> extends true ? K : never;
}[keyof E];

// =============================================================================
// Entity Type Inference
// =============================================================================

/** Infer full entity type from definition, resolving relations within schema */
export type InferEntity<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	// Scalar fields
	[K in ScalarFields<E>]: InferFieldType<E[K], S>;
} & {
	// Relation fields
	[K in RelationFields<E>]: InferRelationType<E[K], S>;
};

/** Infer field type (scalar or relation) */
export type InferFieldType<
	F extends FieldDefinition,
	S extends SchemaDefinition,
> = IsRelation<F> extends true ? InferRelationType<F, S> : InferScalarWithNullable<F>;

/** Infer scalar type with nullable support */
export type InferScalarWithNullable<F extends FieldType> = F extends { _nullable: true }
	? InferScalar<F> | null
	: InferScalar<F>;

/** Infer relation type, resolving to target entity if schema provided */
export type InferRelationType<F extends FieldDefinition, S extends SchemaDefinition> = [S] extends [
	never,
]
	? // No schema context - return placeholder
		F extends HasManyType<infer Target>
		? Array<{ __entity: Target }>
		: F extends HasOneType<infer Target>
			? { __entity: Target } | null
			: F extends BelongsToType<infer Target>
				? { __entity: Target }
				: never
	: // With schema context - resolve to actual entity type
		F extends HasManyType<infer Target>
		? Target extends keyof S
			? Array<InferEntity<S[Target], S>>
			: never
		: F extends HasOneType<infer Target>
			? Target extends keyof S
				? InferEntity<S[Target], S> | null
				: never
			: F extends BelongsToType<infer Target>
				? Target extends keyof S
					? InferEntity<S[Target], S>
					: never
				: never;

// =============================================================================
// Field Selection Type Inference
// =============================================================================

/** Field arguments type (for computed/relation fields with args) */
export type FieldArgs = Record<string, unknown>;

/** Scalar field selection options (for fields with arguments) */
export type ScalarSelectOptions = {
	/** Field arguments (GraphQL-style) */
	args?: FieldArgs;
};

/** Nested relation selection options */
export type RelationSelectOptions<
	Target extends string,
	S extends SchemaDefinition,
> = Target extends keyof S
	? {
			/** Field arguments (GraphQL-style) */
			args?: FieldArgs;
			/** Nested field selection */
			select?: Select<S[Target], S>;
			/** Limit results (for hasMany) */
			take?: number;
			/** Skip results (for hasMany) */
			skip?: number;
		}
	: never;

/** Selection object type with type-safe nested relations */
export type Select<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	[K in keyof E]?: IsRelation<E[K]> extends true
		? // For relations, allow nested selection or true
			true | RelationSelectOptions<InferRelationTarget<E[K]> & string, S>
		: // For scalars, allow true or options with args
			true | ScalarSelectOptions;
};

/** Infer selected type from selection */
export type InferSelected<
	E extends EntityDefinition,
	Sel extends Select<E, S>,
	S extends SchemaDefinition = never,
> = {
	[K in keyof Sel & keyof E]: Sel[K] extends true
		? // Direct selection (true)
			InferFieldType<E[K], S>
		: Sel[K] extends { select: infer NestedSel }
			? // Nested selection with select property
				E[K] extends HasManyType<infer Target>
				? Target extends keyof S
					? NestedSel extends Select<S[Target], S>
						? Array<InferSelected<S[Target], NestedSel, S>>
						: never
					: never
				: E[K] extends HasOneType<infer Target>
					? Target extends keyof S
						? NestedSel extends Select<S[Target], S>
							? InferSelected<S[Target], NestedSel, S> | null
							: never
						: never
					: E[K] extends BelongsToType<infer Target>
						? Target extends keyof S
							? NestedSel extends Select<S[Target], S>
								? InferSelected<S[Target], NestedSel, S>
								: never
							: never
						: never
			: Sel[K] extends { args: FieldArgs }
				? // Selection with args but no nested select - return field type
					InferFieldType<E[K], S>
				: // Relation without nested select returns full entity
					InferFieldType<E[K], S>;
};

// =============================================================================
// Schema Type Inference
// =============================================================================

/** Infer all entity types from schema */
export type InferSchemaEntities<S extends SchemaDefinition> = {
	[K in keyof S]: InferEntity<S[K], S>;
};

/** Get entity names from schema */
export type EntityNames<S extends SchemaDefinition> = keyof S & string;

/** Get entity type by name */
export type EntityType<S extends SchemaDefinition, Name extends keyof S> = InferEntity<S[Name], S>;

// =============================================================================
// Input Types (for mutations)
// =============================================================================

/** Check if a field is nullable or has a default */
type IsOptionalField<F extends FieldDefinition> = F extends { _nullable: true }
	? true
	: F extends { _default: unknown }
		? true
		: false;

/** Extract required scalar fields (not id, not nullable, no default) */
type RequiredScalarFields<E extends EntityDefinition> = {
	[K in ScalarFields<E> as K extends "id"
		? never
		: IsOptionalField<E[K]> extends true
			? never
			: K]: InferScalar<E[K]>;
};

/** Extract optional scalar fields (nullable or has default) */
type OptionalScalarFields<E extends EntityDefinition> = {
	[K in ScalarFields<E> as K extends "id"
		? never
		: IsOptionalField<E[K]> extends true
			? K
			: never]?: InferScalarWithNullable<E[K]>;
};

/** Create input type with proper optional handling */
export type CreateInput<
	E extends EntityDefinition,
	_S extends SchemaDefinition = never,
> = RequiredScalarFields<E> &
	OptionalScalarFields<E> & {
		[K in RelationFields<E>]?: E[K] extends BelongsToType<string>
			? string // Foreign key ID
			: never;
	};

/** Update input type (id required, all else optional) */
export type UpdateInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	id: string;
} & Partial<CreateInput<E, S>>;

/** Delete input type */
export type DeleteInput = {
	id: string;
};

// =============================================================================
// Utility Types
// =============================================================================

/** Make specific keys required */
export type RequireKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Make specific keys optional */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

/** Deep partial type */
export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;
