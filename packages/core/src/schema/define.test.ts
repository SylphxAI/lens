/**
 * @sylphx/core - Two-Phase Schema Definition Tests
 *
 * Tests for the Drizzle-style API that uses direct entity references.
 */

import { describe, it, expect } from "bun:test";
import { t } from "./types";
import { defineEntity, createSchema, hasMany, hasOne, belongsTo } from "./define";
import type { InferEntity } from "./infer";

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

	it("provides .with() method to add relations", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
		});

		const UserWithRelations = User.with({
			posts: hasMany(Post),
		});

		expect(UserWithRelations.id).toBeDefined();
		expect(UserWithRelations.name).toBeDefined();
		expect(UserWithRelations.posts).toBeDefined();
		expect(UserWithRelations.posts._type).toBe("hasMany");
	});
});

// =============================================================================
// Test: Relation Helpers
// =============================================================================

describe("Relation helpers", () => {
	const User = defineEntity("User", {
		id: t.id(),
		name: t.string(),
	});

	const Post = defineEntity("Post", {
		id: t.id(),
		title: t.string(),
	});

	const Profile = defineEntity("Profile", {
		id: t.id(),
		bio: t.string(),
	});

	it("hasMany creates a hasMany relation", () => {
		const relation = hasMany(Post);
		expect(relation._type).toBe("hasMany");
		expect(relation.target).toBe("Post");
	});

	it("hasOne creates a hasOne relation", () => {
		const relation = hasOne(Profile);
		expect(relation._type).toBe("hasOne");
		expect(relation.target).toBe("Profile");
	});

	it("belongsTo creates a belongsTo relation", () => {
		const relation = belongsTo(User);
		expect(relation._type).toBe("belongsTo");
		expect(relation.target).toBe("User");
	});

	it("Entity methods also work", () => {
		expect(User.hasMany(Post).target).toBe("Post");
		expect(Post.belongsTo(User).target).toBe("User");
		expect(User.hasOne(Profile).target).toBe("Profile");
	});
});

// =============================================================================
// Test: createSchema
// =============================================================================

describe("createSchema", () => {
	it("creates a schema from entity definitions", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
		});

		const schema = createSchema({
			User: User.with({
				posts: hasMany(Post),
			}),
			Post: Post.with({
				author: belongsTo(User),
			}),
		});

		expect(schema.entities.size).toBe(2);
		expect(schema.hasEntity("User")).toBe(true);
		expect(schema.hasEntity("Post")).toBe(true);

		// Check relations
		const userMeta = schema.getEntity("User");
		expect(userMeta?.relations.has("posts")).toBe(true);
		expect(userMeta?.relations.get("posts")?.target).toBe("Post");

		const postMeta = schema.getEntity("Post");
		expect(postMeta?.relations.has("author")).toBe(true);
		expect(postMeta?.relations.get("author")?.target).toBe("User");
	});

	it("validates relations at runtime", () => {
		const User = defineEntity("User", {
			id: t.id(),
		});

		// This should throw because 'InvalidEntity' doesn't exist
		expect(() =>
			createSchema({
				User: User.with({
					// @ts-expect-error - Testing runtime validation
					invalid: t.hasMany("InvalidEntity"),
				}),
			}),
		).toThrow("does not exist");
	});
});

// =============================================================================
// Test: Type Inference
// =============================================================================

describe("Type inference with defineEntity", () => {
	it("infers entity types correctly", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			age: t.int().nullable(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
			views: t.int(),
		});

		const schema = createSchema({
			User: User.with({
				posts: hasMany(Post),
			}),
			Post: Post.with({
				author: belongsTo(User),
			}),
		});

		// Type-level test
		type UserType = InferEntity<(typeof schema)["definition"]["User"], (typeof schema)["definition"]>;

		const user: UserType = {
			id: "1",
			name: "John",
			age: 30,
			posts: [{ id: "p1", title: "Hello", views: 100, author: {} as any }],
		};

		expect(user.name).toBe("John");
	});
});

// =============================================================================
// Test: Simplified API (entity instead of defineEntity)
// =============================================================================

describe("entity() - simplified API", () => {
	it("entity() is an alias for defineEntity()", () => {
		const { entity } = require("./define");

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
// Test: Type-Safe Relations with Field Accessor
// =============================================================================

describe("Type-safe relations with field accessor", () => {
	it("hasMany with field accessor extracts foreign key", () => {
		const { entity, hasMany: hasManyWithAccessor } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		// New API: hasMany(Target, e => e.foreignKey)
		const relation = hasManyWithAccessor(Post, (e: any) => e.authorId);

		expect(relation._type).toBe("hasMany");
		expect(relation.target).toBe("Post");
		expect(relation.foreignKey).toBe("authorId");
	});

	it("belongsTo with field accessor extracts foreign key", () => {
		const { entity, belongsTo: belongsToWithAccessor } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		// New API: belongsTo(Target, e => e.foreignKey)
		const relation = belongsToWithAccessor(User, (e: any) => e.authorId);

		expect(relation._type).toBe("belongsTo");
		expect(relation.target).toBe("User");
		expect(relation.foreignKey).toBe("authorId");
	});

	it("hasOne with field accessor extracts foreign key", () => {
		const { entity, hasOne: hasOneWithAccessor } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Profile = entity("Profile", {
			id: t.id(),
			bio: t.string(),
			userId: t.string(),
		});

		// New API: hasOne(Target, e => e.foreignKey)
		const relation = hasOneWithAccessor(Profile, (e: any) => e.userId);

		expect(relation._type).toBe("hasOne");
		expect(relation.target).toBe("Profile");
		expect(relation.foreignKey).toBe("userId");
	});

	it("relations still work without field accessor (backward compatible)", () => {
		const { entity, hasMany: hasManyCompat, belongsTo: belongsToCompat } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
		});

		// Old API still works
		const hasManyRel = hasManyCompat(Post);
		expect(hasManyRel._type).toBe("hasMany");
		expect(hasManyRel.target).toBe("Post");
		expect(hasManyRel.foreignKey).toBeUndefined();

		const belongsToRel = belongsToCompat(User);
		expect(belongsToRel._type).toBe("belongsTo");
		expect(belongsToRel.target).toBe("User");
		expect(belongsToRel.foreignKey).toBeUndefined();
	});
});

// =============================================================================
// Test: relation() Function for Separate Definition
// =============================================================================

describe("relation() - separate relation definition", () => {
	it("defines relations for an entity", () => {
		const { entity, relation, hasMany: hasManyNew, belongsTo: belongsToNew } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		});

		// Define relations separately
		const userRelations = relation(User, {
			posts: hasManyNew(Post, (e: any) => e.authorId),
		});

		const postRelations = relation(Post, {
			author: belongsToNew(User, (e: any) => e.authorId),
		});

		expect(userRelations.entity._name).toBe("User");
		expect(userRelations.relations.posts._type).toBe("hasMany");
		expect(userRelations.relations.posts.target).toBe("Post");
		expect(userRelations.relations.posts.foreignKey).toBe("authorId");

		expect(postRelations.entity._name).toBe("Post");
		expect(postRelations.relations.author._type).toBe("belongsTo");
		expect(postRelations.relations.author.foreignKey).toBe("authorId");
	});

	it("returns array format for multiple relations", () => {
		const { entity, relation, hasMany: hasManyArr, belongsTo: belongsToArr } = require("./define");

		const User = entity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = entity("Post", {
			id: t.id(),
			authorId: t.string(),
		});

		const Comment = entity("Comment", {
			id: t.id(),
			postId: t.string(),
			authorId: t.string(),
		});

		const relations = [
			relation(User, {
				posts: hasManyArr(Post, (e: any) => e.authorId),
				comments: hasManyArr(Comment, (e: any) => e.authorId),
			}),
			relation(Post, {
				author: belongsToArr(User, (e: any) => e.authorId),
				comments: hasManyArr(Comment, (e: any) => e.postId),
			}),
		];

		expect(relations).toHaveLength(2);
		expect(relations[0].entity._name).toBe("User");
		expect(relations[1].entity._name).toBe("Post");
	});
});
