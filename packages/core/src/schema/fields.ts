/**
 * @sylphx/lens-core - Field Type Builders
 *
 * Standalone functions for defining field types in models.
 * No `t.` prefix needed - import directly.
 *
 * @example
 * ```typescript
 * import { model, id, string, int, list, nullable } from '@sylphx/lens-core'
 *
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   age: int(),
 *   bio: nullable(string()),
 *   tags: list(string()),
 *   posts: list(() => Post),
 *   profile: Profile,
 * })
 * ```
 */

import type { ModelDef } from "./model.js";
import type { EntityDefinition } from "./types.js";
import {
	ArrayType,
	BigIntType,
	BooleanType,
	BytesType,
	DateTimeType,
	DecimalType,
	EnumType,
	type FieldType,
	FloatType,
	IdType,
	IntType,
	JsonType,
	LazyManyType,
	LazyOneType,
	ObjectType,
	ScalarType,
	StringType,
	TimestampType,
} from "./types.js";

// =============================================================================
// Scalar Field Builders
// =============================================================================

/** ID field (primary key, string type) */
export function id(): IdType {
	return new IdType();
}

/** String field */
export function string(): StringType {
	return new StringType();
}

/** Integer field */
export function int(): IntType {
	return new IntType();
}

/** Float field */
export function float(): FloatType {
	return new FloatType();
}

/** Boolean field */
export function boolean(): BooleanType {
	return new BooleanType();
}

/** DateTime field (serialized as ISO string) */
export function datetime(): DateTimeType {
	return new DateTimeType();
}

/** Timestamp field (Unix timestamp in milliseconds) */
export function timestamp(): TimestampType {
	return new TimestampType();
}

/** Decimal field (serialized as string for precision) */
export function decimal(): DecimalType {
	return new DecimalType();
}

/** BigInt field (serialized as string for precision) */
export function bigint(): BigIntType {
	return new BigIntType();
}

/** Binary data field (serialized as base64) */
export function bytes(): BytesType {
	return new BytesType();
}

/** JSON field (schemaless, typed as unknown) */
export function json(): JsonType {
	return new JsonType();
}

/** Enum field with specific values */
export function enumType<const T extends readonly string[]>(values: T): EnumType<T> {
	return new EnumType(values);
}

/** Typed object field */
export function object<T>(): ObjectType<T> {
	return new ObjectType<T>();
}

/**
 * Custom scalar type with user-defined serialization.
 *
 * @example
 * ```typescript
 * const User = model('User', {
 *   id: id(),
 *   location: scalar<Point>('Point', {
 *     serialize: (p) => ({ lat: p.lat, lng: p.lng }),
 *     deserialize: (data) => new Point(data.lat, data.lng),
 *   }),
 * })
 * ```
 */
export function scalar<T, SerializedT = T>(
	name: string,
	options: {
		serialize: (value: T) => SerializedT;
		deserialize: (value: SerializedT) => T;
		validate?: (value: unknown) => boolean;
	},
): ScalarType<T, SerializedT> {
	return new ScalarType({ name, ...options });
}

// =============================================================================
// Model Reference Types
// =============================================================================

/** Model-like type that can be referenced */
type ModelLike = ModelDef<string, EntityDefinition>;

/** Lazy model reference (for circular dependencies) */
type LazyModelRef<T extends ModelLike = ModelLike> = () => T;

// =============================================================================
// Field Definition Type
// =============================================================================

/**
 * Valid field definition types:
 * - Scalar types: id(), string(), int(), etc.
 * - Direct model reference: Profile
 * - Lazy model reference: () => Profile
 * - List: list(string()), list(Profile), list(() => Post)
 * - Nullable: nullable(string()), nullable(Profile)
 */
export type FieldDef =
	| FieldType<any, any>
	| ModelLike
	| LazyModelRef
	| ListFieldDef<any>
	| NullableFieldDef<any>;

// =============================================================================
// List Field Type
// =============================================================================

/** Symbol to identify list fields */
export const LIST_FIELD_SYMBOL: unique symbol = Symbol("lens:list-field");

/** List field wrapper */
export interface ListFieldDef<T> {
	[LIST_FIELD_SYMBOL]: true;
	_inner: T;
	_isLazy: boolean;
}

/** Check if value is a ListFieldDef */
export function isListFieldDef(value: unknown): value is ListFieldDef<unknown> {
	return typeof value === "object" && value !== null && LIST_FIELD_SYMBOL in value;
}

/**
 * List/array field.
 * Works with both scalars and model references.
 *
 * @example
 * ```typescript
 * // Scalar array
 * tags: list(string())     // string[]
 * scores: list(int())      // number[]
 *
 * // Model relation (direct)
 * posts: list(Post)        // Post[]
 *
 * // Model relation (lazy - for circular refs)
 * posts: list(() => Post)  // Post[]
 * ```
 */
export function list<T extends FieldType<any, any>>(inner: T): ListFieldDef<T>;
export function list<T extends ModelLike>(inner: T): ListFieldDef<T>;
export function list<T extends ModelLike>(inner: LazyModelRef<T>): ListFieldDef<LazyModelRef<T>>;
export function list<T>(inner: T): ListFieldDef<T> {
	const isLazy = typeof inner === "function";
	return {
		[LIST_FIELD_SYMBOL]: true,
		_inner: inner,
		_isLazy: isLazy,
	};
}

// =============================================================================
// Nullable Field Type
// =============================================================================

/** Symbol to identify nullable fields */
export const NULLABLE_FIELD_SYMBOL: unique symbol = Symbol("lens:nullable-field");

/** Nullable field wrapper */
export interface NullableFieldDef<T> {
	[NULLABLE_FIELD_SYMBOL]: true;
	_inner: T;
}

/** Check if value is a NullableFieldDef */
export function isNullableFieldDef(value: unknown): value is NullableFieldDef<unknown> {
	return typeof value === "object" && value !== null && NULLABLE_FIELD_SYMBOL in value;
}

/**
 * Nullable field.
 * Works with scalars, model references, and lists.
 *
 * @example
 * ```typescript
 * // Nullable scalar
 * bio: nullable(string())        // string | null
 *
 * // Nullable model reference
 * profile: nullable(Profile)     // Profile | null
 *
 * // Nullable list
 * tags: nullable(list(string())) // string[] | null
 * ```
 */
export function nullable<T extends FieldType<any, any>>(inner: T): NullableFieldDef<T>;
export function nullable<T extends ModelLike>(inner: T): NullableFieldDef<T>;
export function nullable<T extends ModelLike>(
	inner: LazyModelRef<T>,
): NullableFieldDef<LazyModelRef<T>>;
export function nullable<T>(inner: ListFieldDef<T>): NullableFieldDef<ListFieldDef<T>>;
export function nullable<T>(inner: T): NullableFieldDef<T> {
	return {
		[NULLABLE_FIELD_SYMBOL]: true,
		_inner: inner,
	};
}

// =============================================================================
// Field Definition Processing
// =============================================================================

import { isModelDef } from "./model.js";

/**
 * Process a field definition and convert to internal field type.
 * Handles scalars, model refs, lists, and nullables.
 */
export function processFieldDef(fieldDef: FieldDef): FieldType<any, any> {
	// Already a FieldType (scalar)
	if (fieldDef instanceof Object && "_type" in fieldDef && typeof fieldDef._type === "string") {
		return fieldDef as FieldType<any, any>;
	}

	// List field
	if (isListFieldDef(fieldDef)) {
		const inner = fieldDef._inner;
		if (typeof inner === "function") {
			// Lazy model ref: list(() => Post)
			return new LazyManyType(inner as () => unknown);
		} else if (isModelDef(inner)) {
			// Direct model ref: list(Post)
			return new LazyManyType(() => inner);
		} else {
			// Scalar: list(string())
			return new ArrayType(inner as FieldType<any, any>);
		}
	}

	// Nullable field
	if (isNullableFieldDef(fieldDef)) {
		const inner = processFieldDef(fieldDef._inner as FieldDef);
		// Mark as nullable
		(inner as any)._nullable = true;
		return inner;
	}

	// Lazy model ref: () => Profile
	if (typeof fieldDef === "function") {
		return new LazyOneType(fieldDef);
	}

	// Direct model ref: Profile
	if (isModelDef(fieldDef)) {
		return new LazyOneType(() => fieldDef);
	}

	throw new Error(`Invalid field definition: ${String(fieldDef)}`);
}

// =============================================================================
// Type Inference
// =============================================================================

import type { InferScalar } from "./infer.js";
import type { ScalarFieldsOnly } from "./model-resolvers.js";

/** Infer TypeScript type from a field definition */
export type InferFieldDefType<F> =
	// List of scalars
	F extends ListFieldDef<infer Inner>
		? Inner extends FieldType<any, any>
			? InferScalar<Inner>[]
			: // List of model refs (lazy)
				Inner extends () => infer M
				? M extends ModelDef<string, infer Fields>
					? ScalarFieldsOnly<Fields>[]
					: unknown[]
				: // List of model refs (direct)
					Inner extends ModelDef<string, infer Fields>
					? ScalarFieldsOnly<Fields>[]
					: unknown[]
		: // Nullable
			F extends NullableFieldDef<infer Inner>
			? InferFieldDefType<Inner> | null
			: // Lazy model ref
				F extends () => infer M
				? M extends ModelDef<string, infer Fields>
					? ScalarFieldsOnly<Fields> | null
					: unknown
				: // Direct model ref
					F extends ModelDef<string, infer Fields>
					? ScalarFieldsOnly<Fields> | null
					: // Scalar type
						F extends FieldType<any, any>
						? InferScalar<F>
						: unknown;
