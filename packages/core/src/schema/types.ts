/**
 * @sylphx/lens-core - Schema Type Builders
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
	protected _optional = false;
	protected _default?: T;

	/** Make this field nullable (value can be null) */
	nullable(): NullableType<this> {
		const clone = Object.create(this);
		clone._nullable = true;
		return clone as NullableType<this>;
	}

	/**
	 * Make this field optional (may not be included in response)
	 * Use for input types where a field is not required
	 */
	optional(): OptionalType<this> {
		const clone = Object.create(this);
		clone._optional = true;
		return clone as OptionalType<this>;
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

	/** Check if field is optional */
	isOptional(): boolean {
		return this._optional;
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

/** Wrapper type for optional fields (undefined, not included in response) */
export type OptionalType<T extends FieldType> = T & {
	_tsType: T["_tsType"] | undefined;
	_optional: true;
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

/** Date field type (date only, no time - serialized as YYYY-MM-DD) */
export class DateType extends FieldType<Date, string> {
	readonly _type = "date" as const;
	readonly _tsType!: Date;

	/**
	 * Serialize Date → YYYY-MM-DD string
	 * @example Date(2024-01-15) → "2024-01-15"
	 */
	serialize(value: Date): string {
		if (!(value instanceof Date)) {
			throw new Error(`Expected Date instance, got ${typeof value}`);
		}
		return value.toISOString().split("T")[0];
	}

	/**
	 * Deserialize YYYY-MM-DD string → Date (at midnight UTC)
	 * @example "2024-01-15" → Date(2024-01-15T00:00:00.000Z)
	 */
	deserialize(value: string): Date {
		if (typeof value !== "string") {
			throw new Error(`Expected string, got ${typeof value}`);
		}
		const date = new Date(`${value}T00:00:00.000Z`);
		if (Number.isNaN(date.getTime())) {
			throw new Error(`Invalid date string: ${value}`);
		}
		return date;
	}

	validate(value: unknown): boolean {
		return value instanceof Date && !Number.isNaN(value.getTime());
	}
}

/** BigInt field type (serialized as string for precision) */
export class BigIntType extends FieldType<bigint, string> {
	readonly _type = "bigint" as const;
	readonly _tsType!: bigint;

	/**
	 * Serialize BigInt → string
	 * @example 9007199254740993n → "9007199254740993"
	 *
	 * **Why string?** BigInt exceeds JSON number limits.
	 * String preserves exact value during transport.
	 */
	serialize(value: bigint): string {
		if (typeof value !== "bigint") {
			throw new Error(`Expected bigint, got ${typeof value}`);
		}
		return value.toString();
	}

	/**
	 * Deserialize string → BigInt
	 * @example "9007199254740993" → 9007199254740993n
	 */
	deserialize(value: string): bigint {
		if (typeof value !== "string") {
			throw new Error(`Expected string, got ${typeof value}`);
		}
		try {
			return BigInt(value);
		} catch {
			throw new Error(`Invalid bigint string: ${value}`);
		}
	}

	validate(value: unknown): boolean {
		return typeof value === "bigint";
	}
}

/** Bytes field type (serialized as base64 string) */
export class BytesType extends FieldType<Uint8Array, string> {
	readonly _type = "bytes" as const;
	readonly _tsType!: Uint8Array;

	/**
	 * Serialize Uint8Array → base64 string
	 * @example Uint8Array([72, 101, 108, 108, 111]) → "SGVsbG8="
	 */
	serialize(value: Uint8Array): string {
		if (!(value instanceof Uint8Array)) {
			throw new Error(`Expected Uint8Array, got ${typeof value}`);
		}
		// Use btoa for browser, Buffer for Node
		if (typeof btoa === "function") {
			return btoa(String.fromCharCode(...value));
		}
		return Buffer.from(value).toString("base64");
	}

	/**
	 * Deserialize base64 string → Uint8Array
	 * @example "SGVsbG8=" → Uint8Array([72, 101, 108, 108, 111])
	 */
	deserialize(value: string): Uint8Array {
		if (typeof value !== "string") {
			throw new Error(`Expected string, got ${typeof value}`);
		}
		// Use atob for browser, Buffer for Node
		if (typeof atob === "function") {
			const binary = atob(value);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return bytes;
		}
		return new Uint8Array(Buffer.from(value, "base64"));
	}

	validate(value: unknown): boolean {
		return value instanceof Uint8Array;
	}
}

/** JSON field type (arbitrary JSON data, typed as unknown) */
export class JsonType extends FieldType<unknown> {
	readonly _type = "json" as const;
	readonly _tsType!: unknown;

	/**
	 * JSON passes through as-is (already JSON-serializable)
	 * Use for schemaless/dynamic data where type isn't known at compile time
	 */
	serialize(value: unknown): unknown {
		return value;
	}

	deserialize(value: unknown): unknown {
		return value;
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

	constructor(
		public readonly target: Target,
		public readonly foreignKey?: string,
	) {
		super();
	}
}

/** HasMany relation (1:N) */
export class HasManyType<Target extends string> extends FieldType<RelationBrand[]> {
	readonly _type = "hasMany" as const;
	readonly _tsType!: RelationBrand[];
	readonly _relationKind = "hasMany" as const;

	constructor(
		public readonly target: Target,
		public readonly foreignKey?: string,
	) {
		super();
	}
}

/** BelongsTo relation (N:1, foreign key side) */
export class BelongsToType<Target extends string> extends FieldType<RelationBrand> {
	readonly _type = "belongsTo" as const;
	readonly _tsType!: RelationBrand;
	readonly _relationKind = "belongsTo" as const;

	constructor(
		public readonly target: Target,
		public readonly foreignKey?: string,
	) {
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
	id: (): IdType => new IdType(),

	/** Text field */
	string: (): StringType => new StringType(),

	/** Integer number */
	int: (): IntType => new IntType(),

	/** Floating point number */
	float: (): FloatType => new FloatType(),

	/** Boolean value */
	boolean: (): BooleanType => new BooleanType(),

	/** Date/time value (auto-serialized as ISO string) */
	datetime: (): DateTimeType => new DateTimeType(),

	/** Date only, no time (serialized as YYYY-MM-DD) */
	date: (): DateType => new DateType(),

	/** Decimal/currency value (auto-serialized as string for precision) */
	decimal: (): DecimalType => new DecimalType(),

	/** BigInt value (auto-serialized as string for precision) */
	bigint: (): BigIntType => new BigIntType(),

	/** Binary data (auto-serialized as base64 string) */
	bytes: (): BytesType => new BytesType(),

	/** Arbitrary JSON data (schemaless, typed as unknown) */
	json: (): JsonType => new JsonType(),

	/** Enum with specific values */
	enum: <const T extends readonly string[]>(values: T): EnumType<T[number]> =>
		new EnumType(values),

	/** Typed object/JSON */
	object: <T>(): ObjectType<T> => new ObjectType<T>(),

	/** Array of a type */
	array: <T>(itemType: FieldType<T>): ArrayType<T> => new ArrayType(itemType),

	/** Custom type with user-defined serialization (use defineType() to create) */
	custom: <T, SerializedT = T>(
		definition: CustomTypeDefinition<T, SerializedT>,
	): CustomType<T, SerializedT> => new CustomType(definition),

	// Relations

	/** One-to-one relation (owns) */
	hasOne: <T extends string>(target: T): HasOneType<T> => new HasOneType(target),

	/** One-to-many relation */
	hasMany: <T extends string>(target: T): HasManyType<T> => new HasManyType(target),

	/** Many-to-one relation (foreign key) */
	belongsTo: <T extends string>(target: T): BelongsToType<T> => new BelongsToType(target),
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
