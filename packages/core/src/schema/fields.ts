/**
 * @sylphx/lens-core - Field Type Builders
 *
 * Standalone functions for defining field types in models and return types.
 * No `t.` prefix needed - import directly.
 *
 * @example
 * ```typescript
 * import { lens, id, string, int, list, nullable } from '@sylphx/lens-core'
 *
 * const { model, query } = lens<AppContext>()
 *
 * // Model fields
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   bio: nullable(string()),
 *   tags: list(string()),
 *   posts: list(() => Post),
 * })
 *
 * // Return types (same list/nullable!)
 * const getUsers = query()
 *   .returns(list(User))
 *   .resolve(...)
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
	| ListDef<any>
	| NullableDef<any>;

// =============================================================================
// Unified Symbols (shared between field defs and return types)
// =============================================================================

/** Symbol to identify list types */
export const LIST_SYMBOL: unique symbol = Symbol("lens:list");

/** Symbol to identify nullable types */
export const NULLABLE_SYMBOL: unique symbol = Symbol("lens:nullable");

// Legacy aliases for backward compatibility
/** @deprecated Use LIST_SYMBOL instead */
export const LIST_FIELD_SYMBOL = LIST_SYMBOL;
/** @deprecated Use NULLABLE_SYMBOL instead */
export const NULLABLE_FIELD_SYMBOL = NULLABLE_SYMBOL;

// =============================================================================
// List Type (unified for fields and return types)
// =============================================================================

/**
 * List/array wrapper.
 * Works for both model fields and return types.
 */
export interface ListDef<T> {
	[LIST_SYMBOL]: true;
	_inner: T;
}

/** @deprecated Use ListDef instead */
export type ListFieldDef<T> = ListDef<T>;

/** Check if value is a ListDef */
export function isListDef(value: unknown): value is ListDef<unknown> {
	return typeof value === "object" && value !== null && LIST_SYMBOL in value;
}

/** @deprecated Use isListDef instead */
export const isListFieldDef = isListDef;

/**
 * List/array type.
 * Works for both model fields and return types.
 *
 * @example
 * ```typescript
 * // Model fields
 * tags: list(string())      // string[]
 * posts: list(Post)         // Post[]
 * posts: list(() => Post)   // Post[] (lazy ref for circular deps)
 *
 * // Return types
 * .returns(list(User))      // User[]
 * ```
 */
export function list<T extends FieldType<any, any>>(inner: T): ListDef<T>;
export function list<T extends ModelLike>(inner: T): ListDef<T>;
export function list<T extends ModelLike>(inner: LazyModelRef<T>): ListDef<LazyModelRef<T>>;
export function list<T>(inner: T): ListDef<T> {
	return {
		[LIST_SYMBOL]: true,
		_inner: inner,
	};
}

// =============================================================================
// Nullable Type (unified for fields and return types)
// =============================================================================

/**
 * Nullable wrapper.
 * Works for both model fields and return types.
 */
export interface NullableDef<T> {
	[NULLABLE_SYMBOL]: true;
	_inner: T;
}

/** @deprecated Use NullableDef instead */
export type NullableFieldDef<T> = NullableDef<T>;

/** Check if value is a NullableDef */
export function isNullableDef(value: unknown): value is NullableDef<unknown> {
	return typeof value === "object" && value !== null && NULLABLE_SYMBOL in value;
}

/** @deprecated Use isNullableDef instead */
export const isNullableFieldDef = isNullableDef;

/**
 * Nullable type.
 * Works for both model fields and return types.
 *
 * @example
 * ```typescript
 * // Model fields
 * bio: nullable(string())        // string | null
 * profile: nullable(Profile)     // Profile | null
 * tags: nullable(list(string())) // string[] | null
 *
 * // Return types
 * .returns(nullable(User))       // User | null
 * ```
 */
export function nullable<T extends FieldType<any, any>>(inner: T): NullableDef<T>;
export function nullable<T extends ModelLike>(inner: T): NullableDef<T>;
export function nullable<T extends ModelLike>(inner: LazyModelRef<T>): NullableDef<LazyModelRef<T>>;
export function nullable<T>(inner: ListDef<T>): NullableDef<ListDef<T>>;
export function nullable<T>(inner: T): NullableDef<T> {
	return {
		[NULLABLE_SYMBOL]: true,
		_inner: inner,
	};
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Unwrap a wrapped type to get the inner model.
 */
export type UnwrapType<T> =
	T extends NullableDef<infer Inner>
		? UnwrapType<Inner>
		: T extends ListDef<infer Inner>
			? UnwrapType<Inner>
			: T;

/**
 * Check if a type is nullable.
 */
export type IsNullable<T> = T extends NullableDef<unknown> ? true : false;

/**
 * Check if a type is a list.
 */
export type IsList<T> =
	T extends NullableDef<infer Inner> ? IsList<Inner> : T extends ListDef<unknown> ? true : false;

/**
 * Check if inner type is a lazy reference (function).
 */
export function isLazyRef(value: unknown): value is () => unknown {
	return typeof value === "function";
}

// =============================================================================
// Type inference helpers
// =============================================================================

/** Infer the TypeScript type from a FieldDef */
export type InferFieldDefType<T> =
	T extends ListDef<infer Inner>
		? InferFieldDefType<Inner>[]
		: T extends NullableDef<infer Inner>
			? InferFieldDefType<Inner> | null
			: T extends FieldType<infer V, any>
				? V
				: T extends ModelLike
					? T
					: T extends LazyModelRef<infer M>
						? M
						: never;

// =============================================================================
// Processing helpers (for internal use)
// =============================================================================

/**
 * Process a field definition to extract metadata.
 * Used internally by model() to understand field structure.
 */
export function processFieldDef(def: FieldDef): {
	isNullable: boolean;
	isList: boolean;
	isLazy: boolean;
	innerType: unknown;
} {
	let current: unknown = def;
	let isNullable = false;
	let isList = false;

	// Unwrap nullable
	if (isNullableDef(current)) {
		isNullable = true;
		current = current._inner;
	}

	// Unwrap list
	if (isListDef(current)) {
		isList = true;
		current = current._inner;
	}

	// Check if lazy reference
	const isLazy = typeof current === "function";

	return {
		isNullable,
		isList,
		isLazy,
		innerType: current,
	};
}
