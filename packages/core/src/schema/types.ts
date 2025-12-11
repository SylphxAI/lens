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

// =============================================================================
// Resolution Types (for unified entity definition)
// =============================================================================

/** Resolver context with parent data */
export interface ResolverContext<Parent, TContext> {
	parent: Parent;
	ctx: TContext;
}

/** Subscription context with emit function */
export interface SubscriptionContext<T, Parent, TContext> {
	parent: Parent;
	ctx: TContext;
	emit: (value: T) => void;
	onCleanup?: (fn: () => void) => void;
}

/** Resolver function type */
export type ResolverFn<T, Parent, TContext> = (
	context: ResolverContext<Parent, TContext>,
) => T | Promise<T>;

/** Subscription resolver function type */
export type SubscriptionResolverFn<T, Parent, TContext> = (
	context: SubscriptionContext<T, Parent, TContext>,
) => void;

/** Field resolution mode */
export type FieldResolutionMode = "exposed" | "resolve" | "subscribe";

/** Base class for all field types */
export abstract class FieldType<T = unknown, SerializedT = T> {
	abstract readonly _type: string;
	abstract readonly _tsType: T;

	readonly _nullable: boolean = false;
	readonly _optional: boolean = false;
	readonly _default?: T;

	/** Resolution mode for this field */
	readonly _resolutionMode: FieldResolutionMode = "exposed";
	/** Resolver function (if _resolutionMode is 'resolve') */
	readonly _resolver?: ResolverFn<T, unknown, unknown>;
	/** Subscription resolver function (if _resolutionMode is 'subscribe') */
	readonly _subscriptionResolver?: SubscriptionResolverFn<T, unknown, unknown>;

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

	// =========================================================================
	// Resolution Methods (for unified entity definition)
	// =========================================================================

	/**
	 * Attach a resolver function to compute this field's value.
	 * Use when the field value needs to be computed from parent data or context.
	 *
	 * @example
	 * ```typescript
	 * const User = entity("User", (t) => ({
	 *   fullName: t.string().resolve(({ parent }) =>
	 *     `${parent.firstName} ${parent.lastName}`
	 *   ),
	 * }));
	 * ```
	 */
	resolve<Parent = unknown, TContext = unknown>(
		fn: ResolverFn<T, Parent, TContext>,
	): ResolvedFieldType<this, Parent, TContext> {
		const clone = Object.create(this);
		clone._resolutionMode = "resolve" as FieldResolutionMode;
		clone._resolver = fn;
		return clone as ResolvedFieldType<this, Parent, TContext>;
	}

	/**
	 * Attach a subscription resolver to stream this field's value.
	 * Use for real-time fields that push updates to clients.
	 *
	 * @example
	 * ```typescript
	 * const User = entity("User", (t) => ({
	 *   status: t.json<SessionStatus>().subscribe(({ ctx }) => {
	 *     ctx.emit({ isActive: true, text: "Online" });
	 *   }),
	 * }));
	 * ```
	 */
	subscribe<Parent = unknown, TContext = unknown>(
		fn: SubscriptionResolverFn<T, Parent, TContext>,
	): SubscribedFieldType<this, Parent, TContext> {
		const clone = Object.create(this);
		clone._resolutionMode = "subscribe" as FieldResolutionMode;
		clone._subscriptionResolver = fn;
		return clone as SubscribedFieldType<this, Parent, TContext>;
	}

	/**
	 * Check if this field has a resolver attached.
	 */
	hasResolver(): boolean {
		return this._resolutionMode === "resolve" && this._resolver !== undefined;
	}

	/**
	 * Check if this field has a subscription resolver attached.
	 */
	hasSubscription(): boolean {
		return this._resolutionMode === "subscribe" && this._subscriptionResolver !== undefined;
	}

	/**
	 * Get the resolution mode for this field.
	 */
	getResolutionMode(): FieldResolutionMode {
		return this._resolutionMode;
	}
}

/** Wrapper type for nullable fields */
export type NullableType<T extends FieldType<any, any>> = Omit<T, "_nullable" | "_tsType"> & {
	_nullable: true;
	_tsType: T["_tsType"] | null;
};

/** Wrapper type for optional fields (undefined, not included in response) */
export type OptionalType<T extends FieldType<any, any>> = Omit<T, "_optional" | "_tsType"> & {
	_tsType: T["_tsType"] | undefined;
	_optional: true;
};

/** Wrapper type for fields with defaults */
export type DefaultType<T extends FieldType<any, any>, D> = T & {
	_default: D;
};

/** Wrapper type for fields with resolver attached */
export type ResolvedFieldType<
	T extends FieldType<any, any>,
	_Parent = unknown,
	_TContext = unknown,
> = Omit<T, "_resolutionMode" | "_resolver"> & {
	_resolutionMode: "resolve";
	_resolver: ResolverFn<T["_tsType"], _Parent, _TContext>;
};

/** Wrapper type for fields with subscription resolver attached */
export type SubscribedFieldType<
	T extends FieldType<any, any>,
	_Parent = unknown,
	_TContext = unknown,
> = Omit<T, "_resolutionMode" | "_subscriptionResolver"> & {
	_resolutionMode: "subscribe";
	_subscriptionResolver: SubscriptionResolverFn<T["_tsType"], _Parent, _TContext>;
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

/** Timestamp field type (Unix timestamp in milliseconds) */
export class TimestampType extends FieldType<number> {
	readonly _type = "timestamp" as const;
	readonly _tsType!: number;

	/**
	 * Validate timestamp is a valid Unix timestamp (milliseconds)
	 */
	validate(value: unknown): boolean {
		return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
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
// Custom Scalar Types
// =============================================================================

/**
 * Scalar type definition interface.
 * Used with `scalar()` to create custom scalar types.
 */
export interface ScalarTypeDefinition<T, SerializedT = T> {
	/** Type name (for debugging/introspection) */
	name: string;

	/** Serialize value for transport (T → SerializedT) */
	serialize: (value: T) => SerializedT;

	/** Deserialize value from transport (SerializedT → T) */
	deserialize: (value: SerializedT) => T;

	/** Optional validation before serialization */
	validate?: (value: unknown) => boolean;
}

/** @deprecated Use ScalarTypeDefinition instead */
export type CustomTypeDefinition<T, SerializedT = T> = ScalarTypeDefinition<T, SerializedT>;

/**
 * Custom scalar type with user-defined serialization.
 *
 * @example
 * ```typescript
 * const User = model('User', {
 *   location: scalar<Point>('Point', {
 *     serialize: (p) => ({ lat: p.lat, lng: p.lng }),
 *     deserialize: (data) => new Point(data.lat, data.lng),
 *   }),
 * })
 * ```
 */
export class ScalarType<T, SerializedT = T> extends FieldType<T, SerializedT> {
	readonly _type = "scalar" as const;
	readonly _tsType!: T;

	constructor(public readonly definition: ScalarTypeDefinition<T, SerializedT>) {
		super();
	}

	serialize(value: T): SerializedT {
		if (this.definition.validate && !this.definition.validate(value)) {
			throw new Error(`Validation failed for scalar type: ${this.definition.name}`);
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

/** @deprecated Use ScalarType instead */
export type CustomType<T, SerializedT = T> = ScalarType<T, SerializedT>;
/** @deprecated Use ScalarType instead */
export const CustomType: typeof ScalarType = ScalarType;

/**
 * @deprecated Use `custom()` directly instead. This function is just an identity function.
 * @internal
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
// Lazy Relation Types (for unified entity definition)
// =============================================================================

/** Type for entity reference - can be entity object or lazy function */
export type EntityRef<_T = unknown> =
	| { fields: EntityDefinition; _name?: string }
	| (() => { fields: EntityDefinition; _name?: string });

/** Extract entity type from lazy or direct reference */
export type InferEntityRef<R> = R extends () => infer E ? E : R;

/**
 * Lazy one-to-one relation.
 * Uses lazy evaluation to solve circular reference issues.
 *
 * @example
 * ```typescript
 * const User = entity("User", (t) => ({
 *   profile: t.one(() => Profile).resolve(({ parent, ctx }) =>
 *     ctx.db.profiles.find(p => p.userId === parent.id)
 *   ),
 * }));
 * ```
 */
export class LazyOneType<Target, TargetData = unknown> extends FieldType<TargetData> {
	readonly _type = "lazyOne" as const;
	readonly _tsType!: TargetData;
	readonly _relationKind = "one" as const;

	constructor(public readonly targetRef: () => Target) {
		super();
	}

	/** Get the target entity (evaluates lazy reference) */
	getTarget(): Target {
		return this.targetRef();
	}
}

/**
 * Lazy one-to-many relation.
 * Uses lazy evaluation to solve circular reference issues.
 *
 * @example
 * ```typescript
 * const User = entity("User", (t) => ({
 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === parent.id)
 *   ),
 * }));
 * ```
 */
export class LazyManyType<Target, TargetData = unknown> extends FieldType<TargetData[]> {
	readonly _type = "lazyMany" as const;
	readonly _tsType!: TargetData[];
	readonly _relationKind = "many" as const;

	constructor(public readonly targetRef: () => Target) {
		super();
	}

	/** Get the target entity (evaluates lazy reference) */
	getTarget(): Target {
		return this.targetRef();
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

	/** Timestamp (Unix timestamp in milliseconds) */
	timestamp: (): TimestampType => new TimestampType(),

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
	enum: <const T extends readonly string[]>(values: T): EnumType<T> => new EnumType(values),

	/** Typed object/JSON */
	object: <T>(): ObjectType<T> => new ObjectType<T>(),

	/** Array of a type */
	array: <T>(itemType: FieldType<T>): ArrayType<T> => new ArrayType(itemType),

	/** Custom type with user-defined serialization (use defineType() to create) */
	custom: <T, SerializedT = T>(
		definition: CustomTypeDefinition<T, SerializedT>,
	): CustomType<T, SerializedT> => new CustomType(definition),

	// Relations (legacy - string-based)

	/** One-to-one relation (owns) @deprecated Use t.one(() => Entity) instead */
	hasOne: <T extends string>(target: T): HasOneType<T> => new HasOneType(target),

	/** One-to-many relation @deprecated Use t.many(() => Entity) instead */
	hasMany: <T extends string>(target: T): HasManyType<T> => new HasManyType(target),

	/** Many-to-one relation (foreign key) */
	belongsTo: <T extends string>(target: T): BelongsToType<T> => new BelongsToType(target),

	// Lazy Relations (new - function-based for circular ref safety)

	/**
	 * One-to-one relation with lazy reference.
	 * Use arrow function to solve circular reference issues.
	 *
	 * @example
	 * ```typescript
	 * const User = entity("User", (t) => ({
	 *   profile: t.one(() => Profile).resolve(({ parent, ctx }) =>
	 *     ctx.db.profiles.find(p => p.userId === parent.id)
	 *   ),
	 * }));
	 * ```
	 */
	one: <Target, TargetData = unknown>(targetRef: () => Target): LazyOneType<Target, TargetData> =>
		new LazyOneType(targetRef),

	/**
	 * One-to-many relation with lazy reference.
	 * Use arrow function to solve circular reference issues.
	 *
	 * @example
	 * ```typescript
	 * const User = entity("User", (t) => ({
	 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
	 *     ctx.db.posts.filter(p => p.authorId === parent.id)
	 *   ),
	 * }));
	 * ```
	 */
	many: <Target, TargetData = unknown>(targetRef: () => Target): LazyManyType<Target, TargetData> =>
		new LazyManyType(targetRef),
} as const;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if field is a relation type (legacy string-based) */
export function isRelationType(
	field: FieldType<any, any>,
): field is HasOneType<string> | HasManyType<string> | BelongsToType<string> {
	return field._type === "hasOne" || field._type === "hasMany" || field._type === "belongsTo";
}

/** Check if field is a lazy relation type (new function-based) */
export function isLazyRelationType(
	field: FieldType<any, any>,
): field is LazyOneType<unknown> | LazyManyType<unknown> {
	return field._type === "lazyOne" || field._type === "lazyMany";
}

/** Check if field is any kind of relation (legacy or lazy) */
export function isAnyRelationType(field: FieldType<any, any>): boolean {
	return isRelationType(field) || isLazyRelationType(field);
}

/** Check if field is a scalar type */
export function isScalarType(field: FieldType<any, any>): boolean {
	return !isAnyRelationType(field);
}

/** Check if field is hasMany (array relation) */
export function isHasManyType(field: FieldType<any, any>): field is HasManyType<string> {
	return field._type === "hasMany";
}

/** Check if field is lazyMany (lazy array relation) */
export function isLazyManyType(field: FieldType<any, any>): field is LazyManyType<unknown> {
	return field._type === "lazyMany";
}

/** Check if field is lazyOne (lazy single relation) */
export function isLazyOneType(field: FieldType<any, any>): field is LazyOneType<unknown> {
	return field._type === "lazyOne";
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

// =============================================================================
// Context-Aware Type Builder (for typed entity definitions)
// =============================================================================

/**
 * Context-aware field wrapper that provides typed resolve/subscribe methods.
 * This allows the context type to flow through from entity definition.
 */
export interface ContextualField<F, TContext> {
	/** The underlying field type */
	readonly field: F;

	/**
	 * Attach a resolver function with typed context.
	 * Context type flows from entity<TContext>() definition.
	 */
	resolve<Parent = unknown>(
		fn: ResolverFn<F extends FieldType<infer T, any> ? T : unknown, Parent, TContext>,
	): F extends FieldType<any, any> ? ResolvedFieldType<F, Parent, TContext> : never;

	/**
	 * Attach a subscription resolver with typed context.
	 * Context type flows from entity<TContext>() definition.
	 */
	subscribe<Parent = unknown>(
		fn: SubscriptionResolverFn<F extends FieldType<infer T, any> ? T : unknown, Parent, TContext>,
	): F extends FieldType<any, any> ? SubscribedFieldType<F, Parent, TContext> : never;

	/** Make field nullable */
	nullable(): F extends FieldType<any, any> ? ContextualField<NullableType<F>, TContext> : never;

	/** Make field optional */
	optional(): F extends FieldType<any, any> ? ContextualField<OptionalType<F>, TContext> : never;

	/** Set default value */
	default(
		value: F extends FieldType<infer T, any> ? T : unknown,
	): F extends FieldType<any, any>
		? ContextualField<DefaultType<F, F extends FieldType<infer T, any> ? T : unknown>, TContext>
		: never;
}

/**
 * Create a contextual field wrapper that provides typed resolve/subscribe.
 * @internal
 */
function createContextualField<F, TContext>(field: any): ContextualField<F, TContext> & F {
	// Create proxy that wraps the field and adds contextual methods
	// All type annotations removed inside wrapper - types are enforced at interface level
	const wrapper: any = {
		field,
		resolve(fn: any) {
			return field.resolve(fn);
		},
		subscribe(fn: any) {
			return field.subscribe(fn);
		},
		nullable() {
			return createContextualField(field.nullable());
		},
		optional() {
			return createContextualField(field.optional());
		},
		default(value: any) {
			return createContextualField(field.default(value));
		},
	};

	// Return union of wrapper and field (field props accessible directly)
	return Object.assign(Object.create(field), wrapper) as ContextualField<F, TContext> & F;
}

/**
 * Context-aware type builder interface.
 * All methods return contextual fields with typed resolve/subscribe.
 */
export interface TypeBuilder<TContext> {
	/** Primary key (string UUID/CUID) */
	id(): ContextualField<IdType, TContext> & IdType;
	/** Text field */
	string(): ContextualField<StringType, TContext> & StringType;
	/** Integer number */
	int(): ContextualField<IntType, TContext> & IntType;
	/** Floating point number */
	float(): ContextualField<FloatType, TContext> & FloatType;
	/** Boolean value */
	boolean(): ContextualField<BooleanType, TContext> & BooleanType;
	/** Date/time value */
	datetime(): ContextualField<DateTimeType, TContext> & DateTimeType;
	/** Timestamp (Unix timestamp in milliseconds) */
	timestamp(): ContextualField<TimestampType, TContext> & TimestampType;
	/** Date only, no time */
	date(): ContextualField<DateType, TContext> & DateType;
	/** Decimal/currency value */
	decimal(): ContextualField<DecimalType, TContext> & DecimalType;
	/** BigInt value */
	bigint(): ContextualField<BigIntType, TContext> & BigIntType;
	/** Binary data */
	bytes(): ContextualField<BytesType, TContext> & BytesType;
	/** Arbitrary JSON data */
	json<T = unknown>(): ContextualField<ObjectType<T>, TContext> & ObjectType<T>;
	/** Enum with specific values */
	enum<const V extends readonly string[]>(
		values: V,
	): ContextualField<EnumType<V>, TContext> & EnumType<V>;
	/** Typed object/JSON */
	object<T>(): ContextualField<ObjectType<T>, TContext> & ObjectType<T>;
	/** Array of a type */
	array<T>(itemType: FieldType<T>): ContextualField<ArrayType<T>, TContext> & ArrayType<T>;
	/** Custom type */
	custom<T, SerializedT = T>(
		definition: CustomTypeDefinition<T, SerializedT>,
	): ContextualField<CustomType<T, SerializedT>, TContext> & CustomType<T, SerializedT>;

	// Legacy relations (string-based)
	/** @deprecated Use t.one(() => Entity) instead */
	hasOne<Target extends string>(
		target: Target,
	): ContextualField<HasOneType<Target>, TContext> & HasOneType<Target>;
	/** @deprecated Use t.many(() => Entity) instead */
	hasMany<Target extends string>(
		target: Target,
	): ContextualField<HasManyType<Target>, TContext> & HasManyType<Target>;
	/** Many-to-one relation */
	belongsTo<Target extends string>(
		target: Target,
	): ContextualField<BelongsToType<Target>, TContext> & BelongsToType<Target>;

	// Lazy relations (function-based)
	/** One-to-one relation with lazy reference */
	one<Target, TargetData = unknown>(
		targetRef: () => Target,
	): ContextualField<LazyOneType<Target, TargetData>, TContext> & LazyOneType<Target, TargetData>;
	/** One-to-many relation with lazy reference */
	many<Target, TargetData = unknown>(
		targetRef: () => Target,
	): ContextualField<LazyManyType<Target, TargetData>, TContext> & LazyManyType<Target, TargetData>;
}

/**
 * Create a context-aware type builder.
 * Used by entity<TContext>() to provide typed resolve/subscribe methods.
 *
 * @example
 * ```typescript
 * const t = createTypeBuilder<MyContext>();
 * const User = entity("User", (t) => ({
 *   posts: t.many(() => Post).resolve(({ ctx }) => {
 *     // ctx is typed as MyContext
 *     return ctx.db.posts.findMany();
 *   }),
 * }));
 * ```
 */
export function createTypeBuilder<TContext>(): TypeBuilder<TContext> {
	return {
		id: () => createContextualField<IdType, TContext>(new IdType() as any),
		string: () => createContextualField<StringType, TContext>(new StringType() as any),
		int: () => createContextualField<IntType, TContext>(new IntType() as any),
		float: () => createContextualField<FloatType, TContext>(new FloatType() as any),
		boolean: () => createContextualField<BooleanType, TContext>(new BooleanType() as any),
		datetime: () => createContextualField<DateTimeType, TContext>(new DateTimeType() as any),
		timestamp: () => createContextualField<TimestampType, TContext>(new TimestampType() as any),
		date: () => createContextualField<DateType, TContext>(new DateType() as any),
		decimal: () => createContextualField<DecimalType, TContext>(new DecimalType() as any),
		bigint: () => createContextualField<BigIntType, TContext>(new BigIntType() as any),
		bytes: () => createContextualField<BytesType, TContext>(new BytesType() as any),
		json: <T = unknown>() =>
			createContextualField<ObjectType<T>, TContext>(new ObjectType<T>() as any),
		enum: <const V extends readonly string[]>(values: V) =>
			createContextualField<EnumType<V>, TContext>(new EnumType(values) as any),
		object: <T>() => createContextualField<ObjectType<T>, TContext>(new ObjectType<T>() as any),
		array: <T>(itemType: FieldType<T>) =>
			createContextualField<ArrayType<T>, TContext>(new ArrayType(itemType) as any),
		custom: <T, SerializedT = T>(definition: CustomTypeDefinition<T, SerializedT>) =>
			createContextualField<CustomType<T, SerializedT>, TContext>(
				new CustomType(definition) as any,
			),
		// Legacy relations
		hasOne: <Target extends string>(target: Target) =>
			createContextualField<HasOneType<Target>, TContext>(new HasOneType(target) as any),
		hasMany: <Target extends string>(target: Target) =>
			createContextualField<HasManyType<Target>, TContext>(new HasManyType(target) as any),
		belongsTo: <Target extends string>(target: Target) =>
			createContextualField<BelongsToType<Target>, TContext>(new BelongsToType(target) as any),
		// Lazy relations
		one: <Target, TargetData = unknown>(targetRef: () => Target) =>
			createContextualField<LazyOneType<Target, TargetData>, TContext>(
				new LazyOneType(targetRef) as any,
			),
		many: <Target, TargetData = unknown>(targetRef: () => Target) =>
			createContextualField<LazyManyType<Target, TargetData>, TContext>(
				new LazyManyType(targetRef) as any,
			),
	};
}
