/**
 * @sylphx/lens-core - Entity Definition Tests
 *
 * Tests for the type-safe entity definition.
 */

import { describe, expect, it } from "bun:test";
import { createSchema, defineEntity, entity, isEntityDef } from "./define";
import type { InferEntity } from "./infer";
import { t } from "./types";

// =============================================================================
// Test: defineEntity
// =============================================================================

describe("defineEntity", () => {
	it("creates an entity definition with name and fields", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			email: t.string(),
		});

		expect(User._name).toBe("User");
		expect(User.fields.id).toBeDefined();
		expect(User.fields.name).toBeDefined();
		expect(User.fields.email).toBeDefined();
	});

	it("works without explicit name", () => {
		const User = defineEntity({
			id: t.id(),
			name: t.string(),
		});

		expect(User._name).toBeUndefined();
		expect(User.fields.id).toBeDefined();
	});

	it("supports all scalar types", () => {
		const AllTypes = defineEntity("AllTypes", {
			id: t.id(),
			name: t.string(),
			age: t.int(),
			score: t.float(),
			active: t.boolean(),
			createdAt: t.datetime(),
			birthDate: t.date(),
			balance: t.decimal(),
			bigNumber: t.bigint(),
			data: t.bytes(),
			metadata: t.json(),
			status: t.enum(["active", "inactive"]),
		});

		expect(AllTypes.fields.id._type).toBe("id");
		expect(AllTypes.fields.name._type).toBe("string");
		expect(AllTypes.fields.age._type).toBe("int");
		expect(AllTypes.fields.score._type).toBe("float");
		expect(AllTypes.fields.active._type).toBe("boolean");
		expect(AllTypes.fields.createdAt._type).toBe("datetime");
		expect(AllTypes.fields.birthDate._type).toBe("date");
		expect(AllTypes.fields.balance._type).toBe("decimal");
		expect(AllTypes.fields.bigNumber._type).toBe("bigint");
		expect(AllTypes.fields.data._type).toBe("bytes");
		expect(AllTypes.fields.metadata._type).toBe("json");
		expect(AllTypes.fields.status._type).toBe("enum");
	});

	it("supports nullable and optional modifiers", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			bio: t.string().nullable(),
			nickname: t.string().optional(),
		});

		expect(User.fields.bio._nullable).toBe(true);
		expect(User.fields.nickname._optional).toBe(true);
	});

	it("supports default values", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			role: t.string().default("user"),
		});

		expect(User.fields.role._default).toBe("user");
	});
});

// =============================================================================
// Test: isEntityDef
// =============================================================================

describe("isEntityDef", () => {
	it("returns true for entity definitions", () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		expect(isEntityDef(User)).toBe(true);
	});

	it("returns false for non-entity values", () => {
		expect(isEntityDef({})).toBe(false);
		expect(isEntityDef(null)).toBe(false);
		expect(isEntityDef({ _name: "User", fields: {} })).toBe(false);
	});
});

// =============================================================================
// Test: createSchema
// =============================================================================

describe("createSchema", () => {
	it("creates a schema from entity fields", () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		const schema = createSchema({
			User: User.fields,
			Post: Post.fields,
		});

		expect(schema.entities.size).toBe(2);
		expect(schema.hasEntity("User")).toBe(true);
		expect(schema.hasEntity("Post")).toBe(true);
	});

	it("getEntity returns entity definition", () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const schema = createSchema({
			User: User.fields,
		});

		const userEntity = schema.getEntity("User");
		expect(userEntity).toBeDefined();
		expect(userEntity?.fields.get("id")?._type).toBe("id");
		expect(userEntity?.fields.get("name")?._type).toBe("string");
	});
});

// =============================================================================
// Test: entity() alias
// =============================================================================

describe("entity() - simplified API", () => {
	it("entity() is an alias for defineEntity()", () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		expect(User._name).toBe("User");
		expect(User.fields.id).toBeDefined();
		expect(User.fields.name).toBeDefined();
	});
});

// =============================================================================
// Test: Type Inference
// =============================================================================

describe("Type inference with entity", () => {
	it("entities can be used with InferEntity", () => {
		const User = entity("User", {
			id: t.id(),
			name: t.string(),
			age: t.int().nullable(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		// Type inference still works with createSchema
		const schema = createSchema({
			User: User.fields,
			Post: Post.fields,
		});

		type UserType = InferEntity<(typeof schema)["definition"]["User"], (typeof schema)["definition"]>;

		// This is a compile-time type check
		const user: UserType = {
			id: "1",
			name: "John",
			age: 30,
		};

		expect(user.name).toBe("John");
	});
});
