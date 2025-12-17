/**
 * Tests for Schema Type Builders
 */

import { describe, expect, test } from "bun:test";
import { bigint, boolean, bytes, datetime, decimal, enumType, float, id, int, json, object, string } from "./fields";
import {
	ArrayType,
	BelongsToType,
	BooleanType,
	DateTimeType,
	DateType,
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
	LazyManyType,
	LazyOneType,
	ObjectType,
	ScalarType,
	StringType,
} from "./types";

// Lazy relation helpers
const one = <Target>(targetRef: () => Target) => new LazyOneType(targetRef);
const many = <Target>(targetRef: () => Target) => new LazyManyType(targetRef);
const date = () => new DateType();

// For legacy relation tests
const hasOne = <T extends string>(target: T) => new HasOneType(target);
const hasMany = <T extends string>(target: T) => new HasManyType(target);
const belongsTo = <T extends string>(target: T) => new BelongsToType(target);
const array = <_T>(itemType: any) => new ArrayType(itemType);
const custom = <_T, _S = _T>(def: any) => new ScalarType(def);

describe("Field Type Builders", () => {
	describe("Scalar Types", () => {
		test("id() creates IdType", () => {
			const idField = id();
			expect(idField).toBeInstanceOf(IdType);
			expect(idField._type).toBe("id");
		});

		test("string() creates StringType", () => {
			const str = string();
			expect(str).toBeInstanceOf(StringType);
			expect(str._type).toBe("string");
		});

		test("int() creates IntType", () => {
			const intField = int();
			expect(intField).toBeInstanceOf(IntType);
			expect(intField._type).toBe("int");
		});

		test("float() creates FloatType", () => {
			const floatField = float();
			expect(floatField).toBeInstanceOf(FloatType);
			expect(floatField._type).toBe("float");
		});

		test("boolean() creates BooleanType", () => {
			const bool = boolean();
			expect(bool).toBeInstanceOf(BooleanType);
			expect(bool._type).toBe("boolean");
		});

		test("datetime() creates DateTimeType", () => {
			const dt = datetime();
			expect(dt).toBeInstanceOf(DateTimeType);
			expect(dt._type).toBe("datetime");
		});

		test("enumType() creates EnumType with values", () => {
			const status = enumType(["active", "inactive", "pending"] as const);
			expect(status).toBeInstanceOf(EnumType);
			expect(status._type).toBe("enum");
			expect(status.values).toEqual(["active", "inactive", "pending"]);
		});

		test("object() creates ObjectType", () => {
			const obj = object<{ foo: string }>();
			expect(obj).toBeInstanceOf(ObjectType);
			expect(obj._type).toBe("object");
		});

		test("array() creates ArrayType", () => {
			const arr = array(string());
			expect(arr).toBeInstanceOf(ArrayType);
			expect(arr._type).toBe("array");
			expect(arr.itemType).toBeInstanceOf(StringType);
		});
	});

	describe("Relation Types", () => {
		test("hasOne() creates HasOneType", () => {
			const profile = hasOne("Profile");
			expect(profile).toBeInstanceOf(HasOneType);
			expect(profile._type).toBe("hasOne");
			expect(profile.target).toBe("Profile");
		});

		test("hasMany() creates HasManyType", () => {
			const posts = hasMany("Post");
			expect(posts).toBeInstanceOf(HasManyType);
			expect(posts._type).toBe("hasMany");
			expect(posts.target).toBe("Post");
		});

		test("belongsTo() creates BelongsToType", () => {
			const author = belongsTo("User");
			expect(author).toBeInstanceOf(BelongsToType);
			expect(author._type).toBe("belongsTo");
			expect(author.target).toBe("User");
		});
	});

	describe("Modifiers", () => {
		test(".nullable() makes field nullable", () => {
			const name = string().nullable();
			expect(name.isNullable()).toBe(true);
		});

		test(".default() sets default value", () => {
			const count = int().default(0);
			expect(count.getDefault()).toBe(0);
		});

		test("modifiers can be chained", () => {
			const bio = string().nullable().default("No bio");
			expect(bio.isNullable()).toBe(true);
			expect(bio.getDefault()).toBe("No bio");
		});
	});

	describe("Type Guards", () => {
		test("isRelationType() correctly identifies relations", () => {
			expect(isRelationType(hasOne("Profile"))).toBe(true);
			expect(isRelationType(hasMany("Post"))).toBe(true);
			expect(isRelationType(belongsTo("User"))).toBe(true);
			expect(isRelationType(string())).toBe(false);
			expect(isRelationType(int())).toBe(false);
		});

		test("isScalarType() correctly identifies scalars", () => {
			expect(isScalarType(string())).toBe(true);
			expect(isScalarType(int())).toBe(true);
			expect(isScalarType(hasOne("Profile"))).toBe(false);
		});

		test("isHasManyType() correctly identifies hasMany", () => {
			expect(isHasManyType(hasMany("Post"))).toBe(true);
			expect(isHasManyType(hasOne("Profile"))).toBe(false);
			expect(isHasManyType(belongsTo("User"))).toBe(false);
		});
	});
});

// =============================================================================
// Serialization/Deserialization Tests
// =============================================================================

describe("DateTime Serialization", () => {
	test("serialize Date to ISO string", () => {
		const dt = datetime();
		const date = new Date("2024-01-15T12:00:00.000Z");
		expect(dt.serialize(date)).toBe("2024-01-15T12:00:00.000Z");
	});

	test("deserialize ISO string to Date", () => {
		const dt = datetime();
		const result = dt.deserialize("2024-01-15T12:00:00.000Z");
		expect(result).toBeInstanceOf(Date);
		expect(result.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	test("serialize throws on invalid input", () => {
		const dt = datetime();
		expect(() => dt.serialize("not a date" as unknown as Date)).toThrow("Expected Date instance");
	});

	test("deserialize throws on invalid string", () => {
		const dt = datetime();
		expect(() => dt.deserialize("invalid")).toThrow("Invalid date string");
	});

	test("deserialize throws on non-string input", () => {
		const dt = datetime();
		expect(() => dt.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid Date", () => {
		const dt = datetime();
		expect(dt.validate!(new Date())).toBe(true);
	});

	test("validate returns false for invalid Date", () => {
		const dt = datetime();
		expect(dt.validate!(new Date("invalid"))).toBe(false);
	});
});

describe("Date (date only) Serialization", () => {
	test("serialize Date to YYYY-MM-DD string", () => {
		const dateField = date();
		const testDate = new Date("2024-01-15T12:00:00.000Z");
		expect(dateField.serialize(testDate)).toBe("2024-01-15");
	});

	test("deserialize YYYY-MM-DD string to Date", () => {
		const dateField = date();
		const result = dateField.deserialize("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result.toISOString()).toBe("2024-01-15T00:00:00.000Z");
	});

	test("serialize throws on invalid input", () => {
		const dateField = date();
		expect(() => dateField.serialize("2024-01-15" as unknown as Date)).toThrow("Expected Date instance");
	});

	test("deserialize throws on invalid string", () => {
		const dateField = date();
		expect(() => dateField.deserialize("not-a-date")).toThrow("Invalid date string");
	});

	test("deserialize throws on non-string input", () => {
		const dateField = date();
		expect(() => dateField.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid Date", () => {
		const dateField = date();
		expect(dateField.validate!(new Date())).toBe(true);
	});
});

describe("Decimal Serialization", () => {
	test("serialize number to string", () => {
		const dec = decimal();
		expect(dec.serialize(123.456789)).toBe("123.456789");
	});

	test("deserialize string to number", () => {
		const dec = decimal();
		expect(dec.deserialize("123.456789")).toBe(123.456789);
	});

	test("serialize throws on NaN", () => {
		const dec = decimal();
		expect(() => dec.serialize(Number.NaN)).toThrow("Expected number");
	});

	test("serialize throws on non-number", () => {
		const dec = decimal();
		expect(() => dec.serialize("123" as unknown as number)).toThrow("Expected number");
	});

	test("deserialize throws on invalid string", () => {
		const dec = decimal();
		expect(() => dec.deserialize("not-a-number")).toThrow("Invalid decimal string");
	});

	test("deserialize throws on non-string input", () => {
		const dec = decimal();
		expect(() => dec.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for valid finite number", () => {
		const dec = decimal();
		expect(dec.validate!(123.45)).toBe(true);
	});

	test("validate returns false for NaN", () => {
		const dec = decimal();
		expect(dec.validate!(Number.NaN)).toBe(false);
	});

	test("validate returns false for Infinity", () => {
		const dec = decimal();
		expect(dec.validate!(Number.POSITIVE_INFINITY)).toBe(false);
	});
});

describe("BigInt Serialization", () => {
	test("serialize bigint to string", () => {
		const bi = bigint();
		expect(bi.serialize(9007199254740993n)).toBe("9007199254740993");
	});

	test("deserialize string to bigint", () => {
		const bi = bigint();
		expect(bi.deserialize("9007199254740993")).toBe(9007199254740993n);
	});

	test("serialize throws on non-bigint", () => {
		const bi = bigint();
		expect(() => bi.serialize(123 as unknown as bigint)).toThrow("Expected bigint");
	});

	test("deserialize throws on invalid string", () => {
		const bi = bigint();
		expect(() => bi.deserialize("not-a-bigint")).toThrow("Invalid bigint string");
	});

	test("deserialize throws on non-string input", () => {
		const bi = bigint();
		expect(() => bi.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for bigint", () => {
		const bi = bigint();
		expect(bi.validate!(123n)).toBe(true);
	});

	test("validate returns false for non-bigint", () => {
		const bi = bigint();
		expect(bi.validate!(123)).toBe(false);
	});
});

describe("Bytes Serialization", () => {
	test("serialize Uint8Array to base64", () => {
		const bytesField = bytes();
		const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
		expect(bytesField.serialize(arr)).toBe("SGVsbG8=");
	});

	test("deserialize base64 to Uint8Array", () => {
		const bytesField = bytes();
		const result = bytesField.deserialize("SGVsbG8=");
		expect(result).toBeInstanceOf(Uint8Array);
		expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
	});

	test("serialize throws on non-Uint8Array", () => {
		const bytesField = bytes();
		expect(() => bytesField.serialize([1, 2, 3] as unknown as Uint8Array)).toThrow("Expected Uint8Array");
	});

	test("deserialize throws on non-string input", () => {
		const bytesField = bytes();
		expect(() => bytesField.deserialize(123 as unknown as string)).toThrow("Expected string");
	});

	test("validate returns true for Uint8Array", () => {
		const bytesField = bytes();
		expect(bytesField.validate!(new Uint8Array([1, 2, 3]))).toBe(true);
	});

	test("validate returns false for regular array", () => {
		const bytesField = bytes();
		expect(bytesField.validate!([1, 2, 3])).toBe(false);
	});
});

describe("JSON Type", () => {
	test("serialize passes through", () => {
		const jsonField = json();
		const data = { foo: "bar", nested: { num: 42 } };
		expect(jsonField.serialize(data)).toEqual(data);
	});

	test("deserialize passes through", () => {
		const jsonField = json();
		const data = { foo: "bar" };
		expect(jsonField.deserialize(data)).toEqual(data);
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

	test("custom() creates ScalarType", () => {
		const point = custom(PointType);
		expect(point).toBeInstanceOf(ScalarType);
		expect(point._type).toBe("scalar");
	});

	test("serialize with custom type", () => {
		const point = custom(PointType);
		const result = point.serialize({ lat: 37.7749, lng: -122.4194 });
		expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
	});

	test("deserialize with custom type", () => {
		const point = custom(PointType);
		const result = point.deserialize({ lat: 37.7749, lng: -122.4194 });
		expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
	});

	test("validate with custom type - valid", () => {
		const point = custom(PointType);
		expect(point.validate!({ lat: 37.7749, lng: -122.4194 })).toBe(true);
	});

	test("validate with custom type - invalid", () => {
		const point = custom(PointType);
		expect(point.validate!({ lat: "not a number" })).toBe(false);
	});

	test("serialize throws on validation failure", () => {
		const point = custom(PointType);
		expect(() => point.serialize({ lat: "bad" } as unknown as Point)).toThrow(
			"Validation failed for scalar type: Point",
		);
	});

	test("custom type without validation always validates", () => {
		const SimpleType = defineType<string, string>({
			name: "Simple",
			serialize: (s) => s.toUpperCase(),
			deserialize: (s) => s.toLowerCase(),
		});

		const simple = custom(SimpleType);
		expect(simple.validate!("anything")).toBe(true);
		expect(simple.serialize("hello")).toBe("HELLO");
		expect(simple.deserialize("HELLO")).toBe("hello");
	});
});

describe("Optional Modifier", () => {
	test(".optional() marks field as optional", () => {
		const name = string().optional();
		expect(name.isOptional()).toBe(true);
	});

	test("optional can be chained with nullable", () => {
		const field = string().optional().nullable();
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

			const field = string().resolve(resolver);

			expect(field.hasResolver()).toBe(true);
			expect(field.hasSubscription()).toBe(false);
			expect(field.getResolutionMode()).toBe("resolve");
			expect(field._resolver).toBe(resolver);
		});

		test("resolver function can be called", () => {
			const field = string().resolve(({ parent }: { parent: { name: string } }) => parent.name.toUpperCase());

			const result = field._resolver!({ parent: { name: "alice" }, ctx: {} });
			expect(result).toBe("ALICE");
		});

		test("resolver preserves original field type", () => {
			const field = int().resolve(() => 42);
			expect(field._type).toBe("int");
		});

		test("resolver works with async functions", async () => {
			const field = string().resolve(async () => {
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

			const field = string().resolve<unknown, TestContext>(({ ctx }) => ctx.userId);

			const result = field._resolver!({ parent: {}, ctx: { userId: "user-123" } });
			expect(result).toBe("user-123");
		});
	});

	describe(".subscribe()", () => {
		test("attaches subscription resolver to field", () => {
			const subscriptionFn = ({ emit }: { emit: (v: string) => void }) => {
				emit("hello");
			};

			const field = string().subscribe(subscriptionFn);

			expect(field.hasSubscription()).toBe(true);
			expect(field.hasResolver()).toBe(false);
			expect(field.getResolutionMode()).toBe("subscribe");
			expect(field._subscriptionResolver).toBeDefined();
		});

		test("subscription resolver can emit values", () => {
			const emitted: string[] = [];

			const field = string().subscribe(({ emit }) => {
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
			const field = boolean().subscribe(({ emit }) => emit(true));
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

			const field = string().subscribe<User, Ctx>(({ parent, ctx, emit }) => {
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
			const field = string();
			expect(field.getResolutionMode()).toBe("exposed");
			expect(field.hasResolver()).toBe(false);
			expect(field.hasSubscription()).toBe(false);
		});

		test("nullable fields without resolver are still exposed", () => {
			const field = string().nullable();
			expect(field.getResolutionMode()).toBe("exposed");
		});

		test("optional fields without resolver are still exposed", () => {
			const field = string().optional();
			expect(field.getResolutionMode()).toBe("exposed");
		});
	});

	describe("chaining", () => {
		test(".resolve() can be chained after .nullable()", () => {
			const field = string()
				.nullable()
				.resolve(() => "computed");

			expect(field.isNullable()).toBe(true);
			expect(field.hasResolver()).toBe(true);
		});

		test(".subscribe() can be chained after .optional()", () => {
			const field = string()
				.optional()
				.subscribe(({ emit }) => emit("streamed"));

			expect(field.isOptional()).toBe(true);
			expect(field.hasSubscription()).toBe(true);
		});
	});
});

// =============================================================================
// Lazy Relations (one() / many())
// =============================================================================

describe("Lazy Relations", () => {
	// Mock entity for testing
	const Post = { _name: "Post", fields: { id: id(), title: string() } };
	const Profile = { _name: "Profile", fields: { id: id(), bio: string() } };

	describe("one()", () => {
		test("creates LazyOneType", () => {
			const field = one(() => Profile);
			expect(field._type).toBe("lazyOne");
			expect(field._relationKind).toBe("one");
		});

		test("getTarget() evaluates lazy reference", () => {
			const field = one(() => Profile);
			expect(field.getTarget()).toBe(Profile);
		});

		test("supports .resolve()", () => {
			const field = one(() => Profile).resolve(({ parent }: { parent: { profileId: string } }) => ({
				id: parent.profileId,
				bio: "Test bio",
			}));

			expect(field.hasResolver()).toBe(true);
			expect(field.getResolutionMode()).toBe("resolve");
		});

		test("supports .subscribe()", () => {
			const field = one(() => Profile).subscribe(({ emit }) => {
				emit({ id: "1", bio: "Live bio" });
			});

			expect(field.hasSubscription()).toBe(true);
			expect(field.getResolutionMode()).toBe("subscribe");
		});
	});

	describe("many()", () => {
		test("creates LazyManyType", () => {
			const field = many(() => Post);
			expect(field._type).toBe("lazyMany");
			expect(field._relationKind).toBe("many");
		});

		test("getTarget() evaluates lazy reference", () => {
			const field = many(() => Post);
			expect(field.getTarget()).toBe(Post);
		});

		test("supports .resolve()", () => {
			const field = many(() => Post).resolve(() => [
				{ id: "1", title: "First" },
				{ id: "2", title: "Second" },
			]);

			expect(field.hasResolver()).toBe(true);

			const result = field._resolver!({ parent: {}, ctx: {} });
			expect(result).toHaveLength(2);
		});

		test("supports .subscribe()", () => {
			const emitted: unknown[] = [];

			const field = many(() => Post).subscribe(({ emit }) => {
				emit([{ id: "1", title: "Live post" }]);
			});

			field._subscriptionResolver!({
				parent: {},
				ctx: {},
				emit: (v) => emitted.push(v),
			});

			expect(emitted[0]).toEqual([{ id: "1", title: "Live post" }]);
		});
	});

	describe("circular reference handling", () => {
		test("lazy references allow circular definitions", () => {
			// User references Post, Post references User
			const User = {
				_name: "User",
				fields: {
					id: id(),
					posts: many(() => PostEntity),
				},
			};

			const PostEntity = {
				_name: "Post",
				fields: {
					id: id(),
					author: one(() => User),
				},
			};

			// Both should resolve correctly
			const userPostsField = User.fields.posts;
			const postAuthorField = PostEntity.fields.author;

			expect(userPostsField.getTarget()).toBe(PostEntity);
			expect(postAuthorField.getTarget()).toBe(User);
		});
	});
});
