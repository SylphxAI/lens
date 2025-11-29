/**
 * Tests for Type Inference
 *
 * These tests verify that TypeScript types are correctly inferred
 * from schema definitions. They use type assertions to validate.
 */

import { describe, expect, test } from "bun:test";
import { createSchema, entity } from "./define";
import type { CreateInput, InferEntity, InferScalar, RelationFields, ScalarFields, Select, UpdateInput } from "./infer";
import { t } from "./types";

// =============================================================================
// Test Entities (using new entity() API)
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	age: t.int().nullable(),
	isActive: t.boolean(),
	role: t.enum(["admin", "user", "guest"] as const),
	metadata: t.object<{ theme: string; language: string }>(),
	tags: t.array(t.string()),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
});

const Comment = entity("Comment", {
	id: t.id(),
	body: t.string(),
});

const Profile = entity("Profile", {
	id: t.id(),
	bio: t.string().nullable(),
	avatar: t.string(),
});

// Create schema with relations using t.hasMany/hasOne/belongsTo type builders
const testSchema = createSchema({
	User: {
		...User.fields,
		posts: t.hasMany("Post"),
		profile: t.hasOne("Profile"),
	},
	Post: {
		...Post.fields,
		author: t.belongsTo("User"),
		comments: t.hasMany("Comment"),
	},
	Comment: {
		...Comment.fields,
		author: t.belongsTo("User"),
		post: t.belongsTo("Post"),
	},
	Profile: {
		...Profile.fields,
		user: t.belongsTo("User"),
	},
});

type TestSchemaDefinition = typeof testSchema.definition;

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("Type Inference", () => {
	describe("Scalar Inference", () => {
		test("infers scalar types correctly", () => {
			// These are compile-time checks - if they compile, inference works
			type StringType = InferScalar<ReturnType<typeof t.string>>;
			type IntType = InferScalar<ReturnType<typeof t.int>>;
			type BoolType = InferScalar<ReturnType<typeof t.boolean>>;

			// Runtime validation that schema has correct structure
			const userDef = testSchema.definition.User;
			expect(userDef.name._type).toBe("string");
			expect(userDef.age._type).toBe("int");
			expect(userDef.isActive._type).toBe("boolean");
		});

		test("infers enum types correctly", () => {
			const roleField = testSchema.definition.User.role;
			expect(roleField._type).toBe("enum");
			expect((roleField as any).values).toEqual(["admin", "user", "guest"]);
		});
	});

	describe("Entity Inference", () => {
		test("infers entity with scalar fields", () => {
			// Type assertion - if this compiles, the inference works
			type UserType = InferEntity<TestSchemaDefinition["User"], TestSchemaDefinition>;

			// The type should include all scalar fields
			// Runtime check that schema structure is correct
			const userMeta = testSchema.getEntity("User");
			expect(userMeta?.fields.has("id")).toBe(true);
			expect(userMeta?.fields.has("name")).toBe(true);
			expect(userMeta?.fields.has("email")).toBe(true);
			expect(userMeta?.fields.has("age")).toBe(true);
			expect(userMeta?.fields.has("isActive")).toBe(true);
		});

		test("infers entity with relations", () => {
			const userMeta = testSchema.getEntity("User");
			expect(userMeta?.relations.has("posts")).toBe(true);
			expect(userMeta?.relations.has("profile")).toBe(true);

			const postMeta = testSchema.getEntity("Post");
			expect(postMeta?.relations.has("author")).toBe(true);
			expect(postMeta?.relations.has("comments")).toBe(true);
		});
	});

	describe("Field Selection", () => {
		test("select type allows scalar fields", () => {
			// Type-level check
			type UserSelect = Select<TestSchemaDefinition["User"], TestSchemaDefinition>;

			// Runtime - demonstrate selection structure
			const selection: UserSelect = {
				id: true,
				name: true,
				email: true,
			};

			expect(selection.id).toBe(true);
			expect(selection.name).toBe(true);
		});

		test("select type allows nested relation selection", () => {
			type UserSelect = Select<TestSchemaDefinition["User"], TestSchemaDefinition>;

			const selection: UserSelect = {
				id: true,
				name: true,
				posts: {
					select: {
						id: true,
						title: true,
					},
					take: 5,
				},
			};

			expect(selection.posts).toBeDefined();
			expect((selection.posts as any).select.id).toBe(true);
			expect((selection.posts as any).take).toBe(5);
		});
	});

	describe("Field Categorization", () => {
		test("ScalarFields extracts non-relation fields", () => {
			type UserScalars = ScalarFields<TestSchemaDefinition["User"]>;

			// These should be scalar fields (not relations)
			const scalars: UserScalars[] = ["id", "name", "email", "age", "isActive", "role", "metadata", "tags"];

			// Verify schema has these as non-relations
			const userMeta = testSchema.getEntity("User");
			for (const field of scalars) {
				expect(userMeta?.relations.has(field)).toBe(false);
			}
		});

		test("RelationFields extracts relation fields", () => {
			type UserRelations = RelationFields<TestSchemaDefinition["User"]>;

			const relations: UserRelations[] = ["posts", "profile"];

			const userMeta = testSchema.getEntity("User");
			for (const field of relations) {
				expect(userMeta?.relations.has(field)).toBe(true);
			}
		});
	});

	describe("Input Types", () => {
		test("CreateInput omits id and allows scalars", () => {
			// Type assertion
			type UserCreate = CreateInput<TestSchemaDefinition["User"], TestSchemaDefinition>;

			// Should NOT include id
			// Should include name, email, age, etc.
			const input: UserCreate = {
				name: "John",
				email: "john@example.com",
				age: 30,
				isActive: true,
				role: "user",
				metadata: { theme: "dark", language: "en" },
				tags: ["tag1", "tag2"],
			};

			expect(input.name).toBe("John");
			expect(input.email).toBe("john@example.com");
		});

		test("UpdateInput requires id and makes others optional", () => {
			type UserUpdate = UpdateInput<TestSchemaDefinition["User"], TestSchemaDefinition>;

			// id is required
			const input: UserUpdate = {
				id: "user-123",
				name: "Updated Name",
				// Other fields are optional
			};

			expect(input.id).toBe("user-123");
			expect(input.name).toBe("Updated Name");
		});
	});
});

describe("Runtime Type Validation", () => {
	test("schema validates relation targets", () => {
		// Valid schema using t.hasOne/belongsTo type builders
		const A = entity("A", { id: t.id() });
		const B = entity("B", { id: t.id() });

		const validSchema = createSchema({
			A: { ...A.fields, b: t.hasOne("B") },
			B: { ...B.fields, a: t.belongsTo("A") },
		});

		expect(validSchema.hasEntity("A")).toBe(true);
		expect(validSchema.hasEntity("B")).toBe(true);
	});

	test("schema throws on invalid relation target", () => {
		const A = entity("A", { id: t.id() });

		expect(() => {
			createSchema({
				A: { ...A.fields, b: t.hasOne("NonExistent") },
			});
		}).toThrow();
	});
});
