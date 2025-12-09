/**
 * Tests for Schema Type Builders
 */

import { describe, expect, test } from "bun:test";
import {
	ArrayType,
	BelongsToType,
	BooleanType,
	CustomType,
	DateTimeType,
	defineType,
	EnumType,
	FloatType,
	HasManyType,
	HasOneType,
	IdType,
	IntType,
	isHasManyType,
	isRelationType,
	isScalarType,
	ObjectType,
	StringType,
	t,
} from "./types";

describe("Type Builders (t.*)", () => {
	describe("Scalar Types", () => {
		test("t.id() creates IdType", () => {
			const id = t.id();
			expect(id).toBeInstanceOf(IdType);
			expect(id._type).toBe("id");
		});

		test("t.string() creates StringType", () => {
			const str = t.string();
			expect(str).toBeInstanceOf(StringType);
			expect(str._type).toBe("string");
		});

		test("t.int() creates IntType", () => {
			const int = t.int();
			expect(int).toBeInstanceOf(IntType);
			expect(int._type).toBe("int");
		});

		test("t.float() creates FloatType", () => {
			const float = t.float();
			expect(float).toBeInstanceOf(FloatType);
			expect(float._type).toBe("float");
		});

		test("t.boolean() creates BooleanType", () => {
			const bool = t.boolean();
			expect(bool).toBeInstanceOf(BooleanType);
			expect(bool._type).toBe("boolean");
		});

		test("t.datetime() creates DateTimeType", () => {
			const dt = t.datetime();
			expect(dt).toBeInstanceOf(DateTimeType);
			expect(dt._type).toBe("datetime");
		});

		test("t.enum() creates EnumType with values", () => {
			const status = t.enum(["active", "inactive", "pending"] as const);
			expect(status).toBeInstanceOf(EnumType);
			expect(status._type).toBe("enum");
			expect(status.values).toEqual(["active", "inactive", "pending"]);
		});

		test("t.object() creates ObjectType", () => {
			const obj = t.object<{ foo: string }>();
			expect(obj).toBeInstanceOf(ObjectType);
			expect(obj._type).toBe("object");
		});

		test("t.array() creates ArrayType", () => {
			const arr = t.array(t.string());
			expect(arr).toBeInstanceOf(ArrayType);
			expect(arr._type).toBe("array");
			expect(arr.itemType).toBeInstanceOf(StringType);
		});
	});

	describe("Relation Types", () => {
		test("t.hasOne() creates HasOneType", () => {
			const profile = t.hasOne("Profile");
			expect(profile).toBeInstanceOf(HasOneType);
			expect(profile._type).toBe("hasOne");
			expect(profile.target).toBe("Profile");
		});

		test("t.hasMany() creates HasManyType", () => {
			const posts = t.hasMany("Post");
			expect(posts).toBeInstanceOf(HasManyType);
			expect(posts._type).toBe("hasMany");
			expect(posts.target).toBe("Post");
		});

		test("t.belongsTo() creates BelongsToType", () => {
			const author = t.belongsTo("User");
			expect(author).toBeInstanceOf(BelongsToType);
			expect(author._type).toBe("belongsTo");
			expect(author.target).toBe("User");
		});
	});

	describe("Modifiers", () => {
		test(".nullable() makes field nullable", () => {
			const name = t.string().nullable();
			expect(name.isNullable()).toBe(true);
		});

		test(".default() sets default value", () => {
			const count = t.int().default(0);
			expect(count.getDefault()).toBe(0);
		});

		test("modifiers can be chained", () => {
			const bio = t.string().nullable().default("No bio");
			expect(bio.isNullable()).toBe(true);
			expect(bio.getDefault()).toBe("No bio");
		});
	});

	describe("Type Guards", () => {
		test("isRelationType() correctly identifies relations", () => {
			expect(isRelationType(t.hasOne("Profile"))).toBe(true);
			expect(isRelationType(t.hasMany("Post"))).toBe(true);
			expect(isRelationType(t.belongsTo("User"))).toBe(true);
			expect(isRelationType(t.string())).toBe(false);
			expect(isRelationType(t.int())).toBe(false);
		});

		test("isScalarType() correctly identifies scalars", () => {
			expect(isScalarType(t.string())).toBe(true);
			expect(isScalarType(t.int())).toBe(true);
			expect(isScalarType(t.hasOne("Profile"))).toBe(false);
		});

		test("isHasManyType() correctly identifies hasMany", () => {
			expect(isHasManyType(t.hasMany("Post"))).toBe(true);
			expect(isHasManyType(t.hasOne("Profile"))).toBe(false);
			expect(isHasManyType(t.belongsTo("User"))).toBe(false);
		});
	});
});

// =============================================================================
// Serialization/Deserialization Tests
// =============================================================================

describe("DateTime Serialization", () => {
	test("serialize Date to ISO string", () => {
		const dt = t.datetime();
		const date = new Date("2024-01-15T12:00:00.000Z");
		expect(dt.serialize(date)).toBe("2024-01-15T12:00:00.000Z");
	});

	test("deserialize ISO string to Date", () => {
		const dt = t.datetime();
		const result = dt.deserialize("2024-01-15T12:00:00.000Z");
		expect(result).toBeInstanceOf(Date);
		expect(result.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	test("serialize throws on invalid input", () => {
		const dt = t.datetime();
		expect(() => dt.serialize("not a date" as unknown as Date)).toThrow("Expected Date instance");
	});

	test("deserialize throws on invalid string", () => {
		const dt = t.datetime();
		expect(() => dt.deserialize("invalid")).toThrow("Invalid date string");
	});

	test("deserialize throws on non-string input", () => {
		const dt = t.datetime();
		expect(() => dt.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid Date", () => {
		const dt = t.datetime();
		expect(dt.validate!(new Date())).toBe(true);
	});

	test("validate returns false for invalid Date", () => {
		const dt = t.datetime();
		expect(dt.validate!(new Date("invalid"))).toBe(false);
	});
});

describe("Date (date only) Serialization", () => {
	test("serialize Date to YYYY-MM-DD string", () => {
		const d = t.date();
		const date = new Date("2024-01-15T12:00:00.000Z");
		expect(d.serialize(date)).toBe("2024-01-15");
	});

	test("deserialize YYYY-MM-DD string to Date", () => {
		const d = t.date();
		const result = d.deserialize("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result.toISOString()).toBe("2024-01-15T00:00:00.000Z");
	});

	test("serialize throws on invalid input", () => {
		const d = t.date();
		expect(() => d.serialize("2024-01-15" as unknown as Date)).toThrow("Expected Date instance");
	});

	test("deserialize throws on invalid string", () => {
		const d = t.date();
		expect(() => d.deserialize("not-a-date")).toThrow("Invalid date string");
	});

	test("deserialize throws on non-string input", () => {
		const d = t.date();
		expect(() => d.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid Date", () => {
		const d = t.date();
		expect(d.validate!(new Date())).toBe(true);
	});
});

describe("Decimal Serialization", () => {
	test("serialize number to string", () => {
		const dec = t.decimal();
		expect(dec.serialize(123.456789)).toBe("123.456789");
	});

	test("deserialize string to number", () => {
		const dec = t.decimal();
		expect(dec.deserialize("123.456789")).toBe(123.456789);
	});

	test("serialize throws on NaN", () => {
		const dec = t.decimal();
		expect(() => dec.serialize(Number.NaN)).toThrow("Expected number");
	});

	test("serialize throws on non-number", () => {
		const dec = t.decimal();
		expect(() => dec.serialize("123" as unknown as number)).toThrow("Expected number");
	});

	test("deserialize throws on invalid string", () => {
		const dec = t.decimal();
		expect(() => dec.deserialize("not-a-number")).toThrow("Invalid decimal string");
	});

	test("deserialize throws on non-string input", () => {
		const dec = t.decimal();
		expect(() => dec.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid finite number", () => {
		const dec = t.decimal();
		expect(dec.validate!(123.45)).toBe(true);
	});

	test("validate returns false for NaN", () => {
		const dec = t.decimal();
		expect(dec.validate!(Number.NaN)).toBe(false);
	});

	test("validate returns false for Infinity", () => {
		const dec = t.decimal();
		expect(dec.validate!(Number.POSITIVE_INFINITY)).toBe(false);
	});
});

describe("BigInt Serialization", () => {
	test("serialize bigint to string", () => {
		const bi = t.bigint();
		expect(bi.serialize(9007199254740993n)).toBe("9007199254740993");
	});

	test("deserialize string to bigint", () => {
		const bi = t.bigint();
		expect(bi.deserialize("9007199254740993")).toBe(9007199254740993n);
	});

	test("serialize throws on non-bigint", () => {
		const bi = t.bigint();
		expect(() => bi.serialize(123 as unknown as bigint)).toThrow("Expected bigint");
	});

	test("deserialize throws on invalid string", () => {
		const bi = t.bigint();
		expect(() => bi.deserialize("not-a-bigint")).toThrow("Invalid bigint string");
	});

	test("deserialize throws on non-string input", () => {
		const bi = t.bigint();
		expect(() => bi.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for bigint", () => {
		const bi = t.bigint();
		expect(bi.validate!(123n)).toBe(true);
	});

	test("validate returns false for non-bigint", () => {
		const bi = t.bigint();
		expect(bi.validate!(123)).toBe(false);
	});
});

describe("Bytes Serialization", () => {
	test("serialize Uint8Array to base64", () => {
		const bytes = t.bytes();
		const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
		expect(bytes.serialize(arr)).toBe("SGVsbG8=");
	});

	test("deserialize base64 to Uint8Array", () => {
		const bytes = t.bytes();
		const result = bytes.deserialize("SGVsbG8=");
		expect(result).toBeInstanceOf(Uint8Array);
		expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
	});

	test("serialize throws on non-Uint8Array", () => {
		const bytes = t.bytes();
		expect(() => bytes.serialize([1, 2, 3] as unknown as Uint8Array)).toThrow("Expected Uint8Array");
	});

	test("deserialize throws on non-string input", () => {
		const bytes = t.bytes();
		expect(() => bytes.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for Uint8Array", () => {
		const bytes = t.bytes();
		expect(bytes.validate!(new Uint8Array([1, 2, 3]))).toBe(true);
	});

	test("validate returns false for regular array", () => {
		const bytes = t.bytes();
		expect(bytes.validate!([1, 2, 3])).toBe(false);
	});
});

describe("JSON Type", () => {
	test("serialize passes through", () => {
		const json = t.json();
		const data = { foo: "bar", nested: { num: 42 } };
		expect(json.serialize(data)).toEqual(data);
	});

	test("deserialize passes through", () => {
		const json = t.json();
		const data = { foo: "bar" };
		expect(json.deserialize(data)).toEqual(data);
	});
});

describe("Custom Type", () => {
	interface Point {
		lat: number;
		lng: number;
	}

	const PointType = defineType<Point, { lat: number; lng: number }>({
		name: "Point",
		serialize: (p) => ({ lat: p.lat, lng: p.lng }),
		deserialize: (data) => ({ lat: data.lat, lng: data.lng }),
		validate: (v): v is Point =>
			typeof v === "object" &&
			v !== null &&
			"lat" in v &&
			"lng" in v &&
			typeof (v as Point).lat === "number" &&
			typeof (v as Point).lng === "number",
	});

	test("t.custom() creates CustomType", () => {
		const point = t.custom(PointType);
		expect(point).toBeInstanceOf(CustomType);
		expect(point._type).toBe("custom");
	});

	test("serialize with custom type", () => {
		const point = t.custom(PointType);
		const result = point.serialize({ lat: 37.7749, lng: -122.4194 });
		expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
	});

	test("deserialize with custom type", () => {
		const point = t.custom(PointType);
		const result = point.deserialize({ lat: 37.7749, lng: -122.4194 });
		expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
	});

	test("validate with custom type - valid", () => {
		const point = t.custom(PointType);
		expect(point.validate!({ lat: 37.7749, lng: -122.4194 })).toBe(true);
	});

	test("validate with custom type - invalid", () => {
		const point = t.custom(PointType);
		expect(point.validate!({ lat: "not a number" })).toBe(false);
	});

	test("serialize throws on validation failure", () => {
		const point = t.custom(PointType);
		expect(() => point.serialize({ lat: "bad" } as unknown as Point)).toThrow(
			"Validation failed for custom type: Point",
		);
	});

	test("custom type without validation always validates", () => {
		const SimpleType = defineType<string, string>({
			name: "Simple",
			serialize: (s) => s.toUpperCase(),
			deserialize: (s) => s.toLowerCase(),
		});

		const simple = t.custom(SimpleType);
		expect(simple.validate!("anything")).toBe(true);
		expect(simple.serialize("hello")).toBe("HELLO");
		expect(simple.deserialize("HELLO")).toBe("hello");
	});
});

describe("Optional Modifier", () => {
	test(".optional() marks field as optional", () => {
		const name = t.string().optional();
		expect(name.isOptional()).toBe(true);
	});

	test("optional can be chained with nullable", () => {
		const field = t.string().optional().nullable();
		expect(field.isOptional()).toBe(true);
		expect(field.isNullable()).toBe(true);
	});
});

// =============================================================================
// Resolution Methods (.resolve() / .subscribe())
// =============================================================================

describe("Field Resolution Methods", () => {
	describe(".resolve()", () => {
		test("attaches resolver to field", () => {
			const resolver = ({ parent }: { parent: { firstName: string; lastName: string } }) =>
				`${parent.firstName} ${parent.lastName}`;

			const field = t.string().resolve(resolver);

			expect(field.hasResolver()).toBe(true);
			expect(field.hasSubscription()).toBe(false);
			expect(field.getResolutionMode()).toBe("resolve");
			expect(field._resolver).toBe(resolver);
		});

		test("resolver function can be called", () => {
			const field = t.string().resolve(({ parent }: { parent: { name: string } }) => parent.name.toUpperCase());

			const result = field._resolver!({ parent: { name: "alice" }, ctx: {} });
			expect(result).toBe("ALICE");
		});

		test("resolver preserves original field type", () => {
			const field = t.int().resolve(() => 42);
			expect(field._type).toBe("int");
		});

		test("resolver works with async functions", async () => {
			const field = t.string().resolve(async () => {
				await new Promise((r) => setTimeout(r, 1));
				return "async result";
			});

			const result = await field._resolver!({ parent: {}, ctx: {} });
			expect(result).toBe("async result");
		});

		test("resolver can access context", () => {
			interface TestContext {
				userId: string;
			}

			const field = t.string().resolve<unknown, TestContext>(({ ctx }) => ctx.userId);

			const result = field._resolver!({ parent: {}, ctx: { userId: "user-123" } });
			expect(result).toBe("user-123");
		});
	});

	describe(".subscribe()", () => {
		test("attaches subscription resolver to field", () => {
			const subscriptionFn = ({ emit }: { emit: (v: string) => void }) => {
				emit("hello");
			};

			const field = t.string().subscribe(subscriptionFn);

			expect(field.hasSubscription()).toBe(true);
			expect(field.hasResolver()).toBe(false);
			expect(field.getResolutionMode()).toBe("subscribe");
			expect(field._subscriptionResolver).toBeDefined();
		});

		test("subscription resolver can emit values", () => {
			const emitted: string[] = [];

			const field = t.string().subscribe(({ emit }) => {
				emit("value1");
				emit("value2");
			});

			field._subscriptionResolver!({
				parent: {},
				ctx: {},
				emit: (v) => emitted.push(v),
			});

			expect(emitted).toEqual(["value1", "value2"]);
		});

		test("subscription preserves original field type", () => {
			const field = t.boolean().subscribe(({ emit }) => emit(true));
			expect(field._type).toBe("boolean");
		});

		test("subscription can access parent and context", () => {
			interface User {
				id: string;
			}
			interface Ctx {
				db: { getStatus: (id: string) => string };
			}

			const emitted: string[] = [];

			const field = t.string().subscribe<User, Ctx>(({ parent, ctx, emit }) => {
				emit(ctx.db.getStatus(parent.id));
			});

			field._subscriptionResolver!({
				parent: { id: "user-1" },
				ctx: { db: { getStatus: (id) => `status-${id}` } },
				emit: (v) => emitted.push(v),
			});

			expect(emitted).toEqual(["status-user-1"]);
		});
	});

	describe("default resolution mode", () => {
		test("fields without .resolve() or .subscribe() are exposed", () => {
			const field = t.string();
			expect(field.getResolutionMode()).toBe("exposed");
			expect(field.hasResolver()).toBe(false);
			expect(field.hasSubscription()).toBe(false);
		});

		test("nullable fields without resolver are still exposed", () => {
			const field = t.string().nullable();
			expect(field.getResolutionMode()).toBe("exposed");
		});

		test("optional fields without resolver are still exposed", () => {
			const field = t.string().optional();
			expect(field.getResolutionMode()).toBe("exposed");
		});
	});

	describe("chaining", () => {
		test(".resolve() can be chained after .nullable()", () => {
			const field = t.string()
				.nullable()
				.resolve(() => "computed");

			expect(field.isNullable()).toBe(true);
			expect(field.hasResolver()).toBe(true);
		});

		test(".subscribe() can be chained after .optional()", () => {
			const field = t.string()
				.optional()
				.subscribe(({ emit }) => emit("streamed"));

			expect(field.isOptional()).toBe(true);
			expect(field.hasSubscription()).toBe(true);
		});
	});
});
