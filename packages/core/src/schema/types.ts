/**
 * @lens/core - Schema Type Builders
 *
 * Type-safe DSL for defining entity schemas.
 * Every type supports full TypeScript inference.
 */

// =============================================================================
// Type Brands (for type discrimination)
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

// =============================================================================
// Base Type Classes
// =============================================================================

/** Base class for all field types */
export abstract class FieldType<T = unknown, SerializedT = T> {
	abstract readonly _type: string;
	abstract readonly _tsType: T;

	protected _nullable = false;
	protected _default?: T;

	/** Make this field nullable */
	nullable(): NullableType<this> {
		const clone = Object.create(this);
		clone._nullable = true;
		return clone as NullableType<this>;
	}

	/** Set default value */
	default(value: T): DefaultType<this, T> {
		const clone = Object.create(this);
		clone._default = value;
		return clone as DefaultType<this, T>;
	}

	/** Check if field is nullable */
	isNullable(): boolean {
		return this._nullable;
	}

	/** Get default value */
	getDefault(): T | undefined {
		return this._default;
	}

	/**
	 * Serialize value for transport (server → client)
	 * Override this for custom types (e.g., Date → ISO string)
	 */
	serialize(value: T): SerializedT {
		return value as unknown as SerializedT;
	}

	/**
	 * Deserialize value from transport (client ← server)
	 * Override this for custom types (e.g., ISO string → Date)
	 */
	deserialize(value: SerializedT): T {
		return value as unknown as T;
	}

	/**
	 * Optional validation before serialization
	 * Override this for custom validation logic
	 */
	validate?(value: unknown): boolean;
}

/** Wrapper type for nullable fields */
export type NullableType<T extends FieldType> = T & {
	_tsType: T["_tsType"] | null;
};

/** Wrapper type for fields with defaults */
export type DefaultType<T extends FieldType, D> = T & {
	_default: D;
};

// =============================================================================
// Scalar Types
// =============================================================================

/** ID field type (primary key) */
export class IdType extends FieldType<string> {
	readonly _type = "id" as const;
	readonly _tsType!: string;
}

/** String field type */
export class StringType extends FieldType<string> {
	readonly _type = "string" as const;
	readonly _tsType!: string;
}

/** Integer field type */
export class IntType extends FieldType<number> {
	readonly _type = "int" as const;
	readonly _tsType!: number;
}

/** Float field type */
export class FloatType extends FieldType<number> {
	readonly _type = "float" as const;
	readonly _tsType!: number;
}

/** Boolean field type */
export class BooleanType extends FieldType<boolean> {
	readonly _type = "boolean" as const;
	readonly _tsType!: boolean;
}

/** DateTime field type (serialized as ISO string) */
export class DateTimeType extends FieldType<Date, string> {
	readonly _type = "datetime" as const;
	readonly _tsType!: Date;

	/**
	 * Serialize Date → ISO string for transport
	 * @example Date(2024-01-15) → "2024-01-15T00:00:00.000Z"
	 */
	serialize(value: Date): string {
		if (!(value instanceof Date)) {
			throw new Error(`Expected Date instance, got ${typeof value}`);
		}
		return value.toISOString();
	}

	/**
	 * Deserialize ISO string → Date
	 * @example "2024-01-15T00:00:00.000Z" → Date(2024-01-15)
	 */
	deserialize(value: string): Date {
		if (typeof value !== "string") {
			throw new Error(`Expected string, got ${typeof value}`);
		}
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			throw new Error(`Invalid date string: ${value}`);
		}
		return date;
	}

	validate(value: unknown): boolean {
		return value instanceof Date && !Number.isNaN(value.getTime());
	}
}

/** Decimal field type (serialized as string for precision) */
export class DecimalType extends FieldType<number, string> {
	readonly _type = "decimal" as const;
	readonly _tsType!: number;

	/**
	 * Serialize number → string to preserve precision
	 * @example 123.456789 → "123.456789"
	 *
	 * **Why string?** JavaScript numbers lose precision for large/small values.
	 * Decimal/currency values must maintain exact precision during transport.
	 */
	serialize(value: number): string {
		if (typeof value !== "number" || Number.isNaN(value)) {
			throw new Error(`Expected number, got ${typeof value}`);
		}
		return value.toString();
	}

	/**
	 * Deserialize string → number
	 * @example "123.456789" → 123.456789
	 */
	deserialize(value: string): number {
		if (typeof value !== "string") {
			throw new Error(`Expected string, got ${typeof value}`);
		}
		const num = Number.parseFloat(value);
		if (Number.isNaN(num)) {
			throw new Error(`Invalid decimal string: ${value}`);
		}
		return num;
	}

	validate(value: unknown): boolean {
		return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
	}
}

/** Enum field type */
export class EnumType<T extends readonly string[]> extends FieldType<T[number]> {
	readonly _type = "enum" as const;
	readonly _tsType!: T[number];

	constructor(public readonly values: T) {
		super();
	}
}

/** Typed object field type */
export class ObjectType<T> extends FieldType<T> {
	readonly _type = "object" as const;
	readonly _tsType!: T;
}

/** Array field type */
export class ArrayType<T> extends FieldType<T[]> {
	readonly _type = "array" as const;
	readonly _tsType!: T[];

	constructor(public readonly itemType: FieldType<T>) {
		super();
	}
}

// =============================================================================
// Custom Types
// =============================================================================

/**
 * Custom type definition interface
 * Used with defineType() to create reusable type definitions
 */
export interface CustomTypeDefinition<T, SerializedT = T> {
	/** Type name (for debugging/introspection) */
	name: string;

	/** Base type for runtime validation (e.g., 'object', 'string') */
	baseType?: string;

	/** TypeScript type (runtime value, not used - only for type inference) */
	type?: T;

	/** Serialize value for transport (T → SerializedT) */
	serialize: (value: T) => SerializedT;

	/** Deserialize value from transport (SerializedT → T) */
	deserialize: (value: SerializedT) => T;

	/** Optional validation before serialization */
	validate?: (value: unknown) => boolean;
}

/**
 * Custom field type with user-defined serialization
 * Created via defineType() for reusability
 *
 * @example
 * ```typescript
 * const PointType = defineType({
 *   name: 'Point',
 *   serialize: (p: Point) => ({ lat: p.lat, lng: p.lng }),
 *   deserialize: (data) => new Point(data.lat, data.lng),
 * })
 *
 * // Reuse across entities
 * const schema = {
 *   Store: { location: t.custom(PointType) },
 *   Event: { location: t.custom(PointType) },
 * }
 * ```
 */
export class CustomType<T, SerializedT = T> extends FieldType<T, SerializedT> {
	readonly _type = "custom" as const;
	readonly _tsType!: T;

	constructor(public readonly definition: CustomTypeDefinition<T, SerializedT>) {
		super();
	}

	serialize(value: T): SerializedT {
		// Run validation if provided
		if (this.definition.validate && !this.definition.validate(value)) {
			throw new Error(`Validation failed for custom type: ${this.definition.name}`);
		}
		return this.definition.serialize(value);
	}

	deserialize(value: SerializedT): T {
		return this.definition.deserialize(value);
	}

	validate(value: unknown): boolean {
		return this.definition.validate ? this.definition.validate(value) : true;
	}
}

/**
 * Define a reusable custom type
 *
 * **Why this pattern?**
 * 1. Reusability - define once, use in multiple entities
 * 2. Type Safety - TypeScript infers correct types
 * 3. Type Libraries - create shareable packages
 * 4. Consistency - same serialization logic everywhere
 *
 * @example
 * ```typescript
 * // Define custom Point type
 * const PointType = defineType({
 *   name: 'Point',
 *   serialize: (p: Point) => ({ lat: p.lat, lng: p.lng }),
 *   deserialize: (data) => new Point(data.lat, data.lng),
 *   validate: (v) => v instanceof Point,
 * })
 *
 * // Use in schema
 * const Store = {
 *   location: t.custom(PointType),  // ✅ Reusable!
 * }
 * ```
 */
export function defineType<T, SerializedT = T>(
	definition: CustomTypeDefinition<T, SerializedT>,
): CustomTypeDefinition<T, SerializedT> {
	return definition;
}

// =============================================================================
// Relation Types
// =============================================================================

/** Relation type brand */
export type RelationBrand = Brand<string, "relation">;

/** HasOne relation (1:1, owns the relation) */
export class HasOneType<Target extends string> extends FieldType<RelationBrand> {
	readonly _type = "hasOne" as const;
	readonly _tsType!: RelationBrand;
	readonly _relationKind = "hasOne" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

/** HasMany relation (1:N) */
export class HasManyType<Target extends string> extends FieldType<RelationBrand[]> {
	readonly _type = "hasMany" as const;
	readonly _tsType!: RelationBrand[];
	readonly _relationKind = "hasMany" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

/** BelongsTo relation (N:1, foreign key side) */
export class BelongsToType<Target extends string> extends FieldType<RelationBrand> {
	readonly _type = "belongsTo" as const;
	readonly _tsType!: RelationBrand;
	readonly _relationKind = "belongsTo" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

// =============================================================================
// Type Builders (t.*)
// =============================================================================

/**
 * Type builder DSL
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   User: {
 *     id: t.id(),
 *     name: t.string(),
 *     age: t.int().nullable(),
 *     status: t.enum(['active', 'inactive']),
 *     posts: t.hasMany('Post'),
 *   },
 * });
 * ```
 */
export const t = {
	/** Primary key (string UUID/CUID) */
	id: () => new IdType(),

	/** Text field */
	string: () => new StringType(),

	/** Integer number */
	int: () => new IntType(),

	/** Floating point number */
	float: () => new FloatType(),

	/** Boolean value */
	boolean: () => new BooleanType(),

	/** Date/time value (auto-serialized as ISO string) */
	datetime: () => new DateTimeType(),

	/** Decimal/currency value (auto-serialized as string for precision) */
	decimal: () => new DecimalType(),

	/** Enum with specific values */
	enum: <const T extends readonly string[]>(values: T) => new EnumType(values),

	/** Typed object/JSON */
	object: <T>() => new ObjectType<T>(),

	/** Array of a type */
	array: <T>(itemType: FieldType<T>) => new ArrayType(itemType),

	/** Custom type with user-defined serialization (use defineType() to create) */
	custom: <T, SerializedT = T>(definition: CustomTypeDefinition<T, SerializedT>) =>
		new CustomType(definition),

	// Relations

	/** One-to-one relation (owns) */
	hasOne: <T extends string>(target: T) => new HasOneType(target),

	/** One-to-many relation */
	hasMany: <T extends string>(target: T) => new HasManyType(target),

	/** Many-to-one relation (foreign key) */
	belongsTo: <T extends string>(target: T) => new BelongsToType(target),
} as const;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if field is a relation type */
export function isRelationType(
	field: FieldType,
): field is HasOneType<string> | HasManyType<string> | BelongsToType<string> {
	return field._type === "hasOne" || field._type === "hasMany" || field._type === "belongsTo";
}

/** Check if field is a scalar type */
export function isScalarType(field: FieldType): boolean {
	return !isRelationType(field);
}

/** Check if field is hasMany (array relation) */
export function isHasManyType(field: FieldType): field is HasManyType<string> {
	return field._type === "hasMany";
}

// =============================================================================
// Entity Definition Types
// =============================================================================

/** Field definition (any field type) */
export type FieldDefinition = FieldType;

/** Entity definition (collection of fields) */
export type EntityDefinition = Record<string, FieldDefinition>;

/** Schema definition (collection of entities) */
export type SchemaDefinition = Record<string, EntityDefinition>;
