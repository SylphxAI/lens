/**
 * @sylphx/lens-core - Type Inference Utilities
 *
 * Powerful type inference from schema definitions.
 * Enables full end-to-end type safety.
 */

import type {
	ArrayType,
	BelongsToType,
	BooleanType,
	DateTimeType,
	EntityDefinition,
	EnumType,
	FieldDefinition,
	FieldType,
	FloatType,
	HasManyType,
	HasOneType,
	IdType,
	IntType,
	ObjectType,
	SchemaDefinition,
	StringType,
} from "./types";

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
			/** Limit results */
			take?: number;
			/** Skip results */
			skip?: number;
			/** Type-safe where filter for related entity */
			where?: WhereInput<S[Target]>;
			/** Type-safe orderBy for related entity */
			orderBy?: OrderByInput<S[Target]> | OrderByInput<S[Target]>[];
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
	S extends SchemaDefinition = never,
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

// =============================================================================
// Type-Safe Filter Types (Where)
// =============================================================================

/** String field filter operations */
export type StringFilter = {
	equals?: string | null;
	not?: string | null | StringFilter;
	in?: string[];
	notIn?: string[];
	contains?: string;
	startsWith?: string;
	endsWith?: string;
	mode?: "default" | "insensitive";
};

/** Number field filter operations (int/float) */
export type NumberFilter = {
	equals?: number | null;
	not?: number | null | NumberFilter;
	in?: number[];
	notIn?: number[];
	lt?: number;
	lte?: number;
	gt?: number;
	gte?: number;
};

/** Boolean field filter operations */
export type BooleanFilter = {
	equals?: boolean | null;
	not?: boolean | null | BooleanFilter;
};

/** DateTime field filter operations */
export type DateTimeFilter = {
	equals?: Date | string | null;
	not?: Date | string | null | DateTimeFilter;
	in?: (Date | string)[];
	notIn?: (Date | string)[];
	lt?: Date | string;
	lte?: Date | string;
	gt?: Date | string;
	gte?: Date | string;
};

/** Enum field filter operations */
export type EnumFilter<T extends string> = {
	equals?: T | null;
	not?: T | null | EnumFilter<T>;
	in?: T[];
	notIn?: T[];
};

/** Get filter type for a field type */
/** Extract base type from potentially nullable/optional wrapper */
type UnwrapFieldType<F> = F extends { _nullable: true }
	? Omit<F, "_nullable" | "_tsType">
	: F extends { _optional: true }
		? Omit<F, "_optional" | "_tsType">
		: F;

export type FieldFilter<F extends FieldDefinition> =
	UnwrapFieldType<F> extends IdType
		? StringFilter
		: UnwrapFieldType<F> extends StringType
			? StringFilter
			: UnwrapFieldType<F> extends IntType
				? NumberFilter
				: UnwrapFieldType<F> extends FloatType
					? NumberFilter
					: UnwrapFieldType<F> extends BooleanType
						? BooleanFilter
						: UnwrapFieldType<F> extends DateTimeType
							? DateTimeFilter
							: UnwrapFieldType<F> extends EnumType<infer V>
								? EnumFilter<V[number]>
								: never;

/** Where input for filtering entities */
export type WhereInput<E extends EntityDefinition> = {
	[K in ScalarFields<E>]?: FieldFilter<E[K]> | InferScalarWithNullable<E[K]>;
} & {
	AND?: WhereInput<E> | WhereInput<E>[];
	OR?: WhereInput<E>[];
	NOT?: WhereInput<E> | WhereInput<E>[];
};

// =============================================================================
// Type-Safe Sorting Types (OrderBy)
// =============================================================================

/** Sort direction */
export type SortOrder = "asc" | "desc";

/** Null handling in sorting */
export type NullsOrder = "first" | "last";

/** Sort field with options */
export type SortOrderInput = SortOrder | { sort: SortOrder; nulls?: NullsOrder };

/** OrderBy input for sorting entities */
export type OrderByInput<E extends EntityDefinition> = {
	[K in ScalarFields<E>]?: SortOrderInput;
};

// =============================================================================
// Type-Safe Cursor Pagination
// =============================================================================

/** Cursor pagination input */
export type CursorInput<E extends EntityDefinition> = {
	[K in ScalarFields<E>]?: InferScalarWithNullable<E[K]>;
};

/** Pagination options */
export type PaginationInput<E extends EntityDefinition> = {
	/** Number of records to take */
	take?: number;
	/** Number of records to skip */
	skip?: number;
	/** Cursor for cursor-based pagination */
	cursor?: CursorInput<E>;
};

// =============================================================================
// Aggregation Types
// =============================================================================

/** Numeric fields that can be aggregated */
export type NumericFields<E extends EntityDefinition> = {
	[K in ScalarFields<E>]: E[K] extends IntType | FloatType ? K : never;
}[ScalarFields<E>];

/** Aggregation select for numeric operations */
export type AggregateSelect<E extends EntityDefinition> = {
	[K in NumericFields<E>]?: true;
};

/** Count input */
export type CountInput<E extends EntityDefinition> = {
	where?: WhereInput<E>;
	/** Count specific field (null values excluded) */
	select?: { [K in ScalarFields<E>]?: true } | { _all?: true };
};

/** Aggregate input with type-safe field selection */
export type AggregateInput<E extends EntityDefinition> = {
	where?: WhereInput<E>;
	orderBy?: OrderByInput<E> | OrderByInput<E>[];
	take?: number;
	skip?: number;
	cursor?: CursorInput<E>;
	/** Count records */
	_count?: true | { [K in ScalarFields<E>]?: true };
	/** Sum numeric fields */
	_sum?: AggregateSelect<E>;
	/** Average of numeric fields */
	_avg?: AggregateSelect<E>;
	/** Minimum value */
	_min?: { [K in ScalarFields<E>]?: true };
	/** Maximum value */
	_max?: { [K in ScalarFields<E>]?: true };
};

/** Infer aggregate result type */
export type AggregateResult<E extends EntityDefinition, A extends AggregateInput<E>> = {
	_count: A["_count"] extends true
		? number
		: A["_count"] extends object
			? { [K in keyof A["_count"] & ScalarFields<E>]: number }
			: never;
	_sum: A["_sum"] extends object
		? { [K in keyof A["_sum"] & NumericFields<E>]: number | null }
		: never;
	_avg: A["_avg"] extends object
		? { [K in keyof A["_avg"] & NumericFields<E>]: number | null }
		: never;
	_min: A["_min"] extends object
		? { [K in keyof A["_min"] & ScalarFields<E>]: InferScalarWithNullable<E[K]> | null }
		: never;
	_max: A["_max"] extends object
		? { [K in keyof A["_max"] & ScalarFields<E>]: InferScalarWithNullable<E[K]> | null }
		: never;
};

/** Group by input */
export type GroupByInput<E extends EntityDefinition> = {
	by: ScalarFields<E>[];
	where?: WhereInput<E>;
	orderBy?: OrderByInput<E> | OrderByInput<E>[];
	having?: WhereInput<E>;
	take?: number;
	skip?: number;
	_count?: true | { [K in ScalarFields<E>]?: true };
	_sum?: AggregateSelect<E>;
	_avg?: AggregateSelect<E>;
	_min?: { [K in ScalarFields<E>]?: true };
	_max?: { [K in ScalarFields<E>]?: true };
};

// =============================================================================
// Batch Operation Types
// =============================================================================

/** Create many input */
export type CreateManyInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	data: CreateInput<E, S>[];
	/** Skip duplicate records (based on unique constraints) */
	skipDuplicates?: boolean;
};

/** Create many result */
export type CreateManyResult = {
	count: number;
};

/** Update many input */
export type UpdateManyInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where: WhereInput<E>;
	data: Partial<Omit<CreateInput<E, S>, "id">>;
};

/** Update many result */
export type UpdateManyResult = {
	count: number;
};

/** Delete many input */
export type DeleteManyInput<E extends EntityDefinition> = {
	where: WhereInput<E>;
};

/** Delete many result */
export type DeleteManyResult = {
	count: number;
};

// =============================================================================
// Relation Mutation Types
// =============================================================================

/** Connect a single relation by unique field */
export type ConnectInput = {
	id: string;
};

/** Connect or create a relation */
export type ConnectOrCreateInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where: { id: string };
	create: CreateInput<E, S>;
};

/** Relation mutation for hasOne/belongsTo */
export type SingleRelationInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	/** Connect to existing record */
	connect?: ConnectInput;
	/** Connect or create if not exists */
	connectOrCreate?: ConnectOrCreateInput<E, S>;
	/** Create new related record */
	create?: CreateInput<E, S>;
	/** Disconnect (set to null) - only for optional relations */
	disconnect?: boolean;
	/** Delete related record */
	delete?: boolean;
	/** Update related record */
	update?: Partial<CreateInput<E, S>>;
	/** Upsert related record */
	upsert?: {
		create: CreateInput<E, S>;
		update: Partial<CreateInput<E, S>>;
	};
};

/** Relation mutation for hasMany */
export type ManyRelationInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	/** Connect existing records */
	connect?: ConnectInput[];
	/** Connect or create records */
	connectOrCreate?: ConnectOrCreateInput<E, S>[];
	/** Create new related records */
	create?: CreateInput<E, S>[];
	/** Create many related records */
	createMany?: { data: CreateInput<E, S>[]; skipDuplicates?: boolean };
	/** Disconnect specific records */
	disconnect?: ConnectInput[];
	/** Set relations (replace all) */
	set?: ConnectInput[];
	/** Delete specific related records */
	delete?: ConnectInput[];
	/** Delete many by condition */
	deleteMany?: WhereInput<E>[];
	/** Update specific related records */
	update?: { where: ConnectInput; data: Partial<CreateInput<E, S>> }[];
	/** Update many by condition */
	updateMany?: { where: WhereInput<E>; data: Partial<CreateInput<E, S>> }[];
	/** Upsert related records */
	upsert?: {
		where: ConnectInput;
		create: CreateInput<E, S>;
		update: Partial<CreateInput<E, S>>;
	}[];
};

/** Type-safe create input with relation mutations */
export type CreateInputWithRelations<
	E extends EntityDefinition,
	S extends SchemaDefinition,
> = CreateInput<E, S> & {
	[K in RelationFields<E>]?: IsHasMany<E[K]> extends true
		? InferRelationTarget<E[K]> extends keyof S
			? ManyRelationInput<S[InferRelationTarget<E[K]>], S>
			: never
		: IsHasOne<E[K]> extends true
			? InferRelationTarget<E[K]> extends keyof S
				? SingleRelationInput<S[InferRelationTarget<E[K]>], S>
				: never
			: IsBelongsTo<E[K]> extends true
				? InferRelationTarget<E[K]> extends keyof S
					? SingleRelationInput<S[InferRelationTarget<E[K]>], S> | string
					: never
				: never;
};

/** Type-safe update input with relation mutations */
export type UpdateInputWithRelations<E extends EntityDefinition, S extends SchemaDefinition> = {
	id: string;
} & Partial<Omit<CreateInput<E, S>, "id">> & {
		[K in RelationFields<E>]?: IsHasMany<E[K]> extends true
			? InferRelationTarget<E[K]> extends keyof S
				? ManyRelationInput<S[InferRelationTarget<E[K]>], S>
				: never
			: IsHasOne<E[K]> extends true
				? InferRelationTarget<E[K]> extends keyof S
					? SingleRelationInput<S[InferRelationTarget<E[K]>], S>
					: never
				: IsBelongsTo<E[K]> extends true
					? InferRelationTarget<E[K]> extends keyof S
						? SingleRelationInput<S[InferRelationTarget<E[K]>], S> | string
						: never
					: never;
	};

// =============================================================================
// Find Types (findFirst, findUnique, upsert)
// =============================================================================

/** Find first input */
export type FindFirstInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where?: WhereInput<E>;
	orderBy?: OrderByInput<E> | OrderByInput<E>[];
	select?: Select<E, S>;
	skip?: number;
	cursor?: CursorInput<E>;
	/** Throw if not found */
	rejectOnNotFound?: boolean;
};

/** Find unique input (by unique field) */
export type FindUniqueInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where: { id: string } | WhereUniqueInput<E>;
	select?: Select<E, S>;
	/** Throw if not found */
	rejectOnNotFound?: boolean;
};

/** Where unique input - for fields with unique constraints */
export type WhereUniqueInput<E extends EntityDefinition> = {
	id?: string;
} & {
	[K in ScalarFields<E>]?: InferScalarWithNullable<E[K]>;
};

/** Upsert input */
export type UpsertInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where: { id: string } | WhereUniqueInput<E>;
	create: CreateInput<E, S>;
	update: Partial<Omit<CreateInput<E, S>, "id">>;
	select?: Select<E, S>;
};

// =============================================================================
// Distinct Types
// =============================================================================

/** Distinct input */
export type DistinctInput<E extends EntityDefinition> = ScalarFields<E>[];

/** Find many with distinct */
export type FindManyInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	where?: WhereInput<E>;
	orderBy?: OrderByInput<E> | OrderByInput<E>[];
	select?: Select<E, S>;
	take?: number;
	skip?: number;
	cursor?: CursorInput<E>;
	distinct?: DistinctInput<E>;
};
