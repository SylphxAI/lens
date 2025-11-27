/**
 * Tests for Schema Type Builders
 */

import { describe, expect, test } from "bun:test";
import {
	ArrayType,
	BelongsToType,
	BooleanType,
	DateTimeType,
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
