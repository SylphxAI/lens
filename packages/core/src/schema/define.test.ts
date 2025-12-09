/**
 * @sylphx/lens-core - Entity Definition Tests
 *
 * Tests for the type-safe entity definition.
 */

import { describe, expect, it } from "bun:test";
import { createSchema, defineEntity, entity, isEntityDef, typedEntity } from "./define";
import type { InferEntity } from "./infer";
import { createTypeBuilder, t } from "./types";

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

// =============================================================================
// Test: Function-based entity definition (Phase 3 - ADR-001)
// =============================================================================

describe("entity() - function-based API", () => {
	it("creates an entity with function builder", () => {
		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		expect(User._name).toBe("User");
		expect(User.fields.id._type).toBe("id");
		expect(User.fields.name._type).toBe("string");
		expect(User.fields.email._type).toBe("string");
	});

	it("supports all scalar types with function builder", () => {
		const AllTypes = entity("AllTypes", (t) => ({
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
		}));

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
		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			bio: t.string().nullable(),
			nickname: t.string().optional(),
		}));

		expect(User.fields.bio._nullable).toBe(true);
		expect(User.fields.nickname._optional).toBe(true);
	});

	it("supports lazy one-to-one relations", () => {
		const Profile = entity("Profile", (t) => ({
			id: t.id(),
			bio: t.string(),
		}));

		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			profile: t.one(() => Profile),
		}));

		expect(User.fields.profile._type).toBe("lazyOne");
		expect(User.fields.profile.getTarget()).toBe(Profile);
	});

	it("supports lazy one-to-many relations", () => {
		const Post = entity("Post", (t) => ({
			id: t.id(),
			title: t.string(),
		}));

		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t.many(() => Post),
		}));

		expect(User.fields.posts._type).toBe("lazyMany");
		expect(User.fields.posts.getTarget()).toBe(Post);
	});

	it("supports circular references with lazy evaluation", () => {
		// This tests the actual circular reference use case
		interface UserEntity {
			fields: {
				id: { _type: "id" };
				name: { _type: "string" };
				posts: { _type: "lazyMany" };
			};
		}

		interface PostEntity {
			fields: {
				id: { _type: "id" };
				title: { _type: "string" };
				author: { _type: "lazyOne" };
			};
		}

		// Define User first - Post is not yet defined
		const User: UserEntity = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t.many(() => Post),
		})) as unknown as UserEntity;

		// Now define Post - User is already defined
		const Post: PostEntity = entity("Post", (t) => ({
			id: t.id(),
			title: t.string(),
			author: t.one(() => User),
		})) as unknown as PostEntity;

		// Verify lazy references work
		expect(User.fields.posts._type).toBe("lazyMany");
		expect(Post.fields.author._type).toBe("lazyOne");

		// Verify the lazy refs resolve to correct entities
		const userPostsField = User.fields.posts as unknown as { getTarget: () => PostEntity };
		const postAuthorField = Post.fields.author as unknown as { getTarget: () => UserEntity };
		expect(userPostsField.getTarget()).toBe(Post);
		expect(postAuthorField.getTarget()).toBe(User);
	});

	it("supports inline resolvers", () => {
		const User = entity("User", (t) => ({
			id: t.id(),
			firstName: t.string(),
			lastName: t.string(),
			fullName: t.string().resolve(({ parent }) => `${parent.firstName} ${parent.lastName}`),
		}));

		expect(User.fields.fullName._resolutionMode).toBe("resolve");
		expect(User.fields.fullName._resolver).toBeDefined();
	});

	it("supports inline subscriptions", () => {
		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			status: t.json().subscribe(({ emit }) => {
				emit({ isActive: true });
			}),
		}));

		expect(User.fields.status._resolutionMode).toBe("subscribe");
		expect(User.fields.status._subscriptionResolver).toBeDefined();
	});

	it("supports resolvers on lazy relations", () => {
		interface DB {
			posts: Array<{ id: string; title: string; authorId: string }>;
		}

		const Post = entity("Post", (t) => ({
			id: t.id(),
			title: t.string(),
			authorId: t.string(),
		}));

		const User = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t
				.many(() => Post)
				.resolve(({ parent, ctx }) => {
					const db = ctx as DB;
					return db.posts.filter((p) => p.authorId === parent.id);
				}),
		}));

		expect(User.fields.posts._type).toBe("lazyMany");
		expect(User.fields.posts._resolutionMode).toBe("resolve");
		expect(User.fields.posts._resolver).toBeDefined();
	});

	it("function-based and object-based entities are equivalent", () => {
		const UserObject = entity("User", {
			id: t.id(),
			name: t.string(),
			email: t.string(),
		});

		const UserFunction = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		// Both should have same structure
		expect(UserObject._name).toBe(UserFunction._name);
		expect(UserObject.fields.id._type).toBe(UserFunction.fields.id._type);
		expect(UserObject.fields.name._type).toBe(UserFunction.fields.name._type);
		expect(UserObject.fields.email._type).toBe(UserFunction.fields.email._type);
	});
});

// =============================================================================
// Test: typedEntity() - Context-Aware Entity Factory
// =============================================================================

describe("typedEntity() - context-aware entity factory", () => {
	interface MyContext {
		db: {
			posts: Array<{ id: string; title: string; authorId: string }>;
			users: Array<{ id: string; name: string }>;
		};
		currentUserId: string;
	}

	it("creates entity factory with typed context", () => {
		const myEntity = typedEntity<MyContext>();

		const User = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
		}));

		expect(User._name).toBe("User");
		expect(User.fields.id._type).toBe("id");
		expect(User.fields.name._type).toBe("string");
	});

	it("resolve() gets typed context", () => {
		const myEntity = typedEntity<MyContext>();

		const Post = myEntity("Post", (t) => ({
			id: t.id(),
			title: t.string(),
		}));

		const User = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t
				.many(() => Post)
				.resolve(({ parent, ctx }) => {
					// This test verifies the types work at runtime
					// TypeScript ensures ctx.db.posts is typed as Array<...>
					return ctx.db.posts.filter((p) => p.authorId === parent.id);
				}),
		}));

		expect(User.fields.posts._resolutionMode).toBe("resolve");
		expect(User.fields.posts._resolver).toBeDefined();
	});

	it("subscribe() gets typed context", () => {
		const myEntity = typedEntity<MyContext>();

		const User = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			status: t.object<{ isActive: boolean }>().subscribe(({ ctx, emit }) => {
				// ctx is typed as MyContext
				emit({ isActive: ctx.currentUserId !== "" });
			}),
		}));

		expect(User.fields.status._resolutionMode).toBe("subscribe");
		expect(User.fields.status._subscriptionResolver).toBeDefined();
	});

	it("supports all field modifiers", () => {
		const myEntity = typedEntity<MyContext>();

		const User = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			bio: t.string().nullable(),
			nickname: t.string().optional(),
			role: t.string().default("user"),
		}));

		expect(User.fields.bio._nullable).toBe(true);
		expect(User.fields.nickname._optional).toBe(true);
		expect(User.fields.role._default).toBe("user");
	});

	it("supports all scalar types", () => {
		const myEntity = typedEntity<MyContext>();

		const AllTypes = myEntity("AllTypes", (t) => ({
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
			status: t.enum(["active", "inactive"]),
		}));

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
		expect(AllTypes.fields.status._type).toBe("enum");
	});

	it("supports lazy relations", () => {
		const myEntity = typedEntity<MyContext>();

		const Post = myEntity("Post", (t) => ({
			id: t.id(),
			title: t.string(),
		}));

		const User = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			posts: t.many(() => Post),
		}));

		expect(User.fields.posts._type).toBe("lazyMany");
		expect(User.fields.posts.getTarget()).toBe(Post);
	});

	it("produces equivalent entities to non-typed factory", () => {
		const myEntity = typedEntity<MyContext>();

		const TypedUser = myEntity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		const UntypedUser = entity("User", (t) => ({
			id: t.id(),
			name: t.string(),
			email: t.string(),
		}));

		expect(TypedUser._name).toBe(UntypedUser._name);
		expect(TypedUser.fields.id._type).toBe(UntypedUser.fields.id._type);
		expect(TypedUser.fields.name._type).toBe(UntypedUser.fields.name._type);
		expect(TypedUser.fields.email._type).toBe(UntypedUser.fields.email._type);
	});
});

// =============================================================================
// Test: createTypeBuilder() - Low-level API
// =============================================================================

describe("createTypeBuilder() - context-aware type builder", () => {
	interface TestContext {
		userId: string;
	}

	it("creates type builder with typed context", () => {
		const t = createTypeBuilder<TestContext>();

		// Verify builder creates field types
		expect(t.id()._type).toBe("id");
		expect(t.string()._type).toBe("string");
		expect(t.int()._type).toBe("int");
	});

	it("resolve() on contextual field gets typed context", () => {
		const tb = createTypeBuilder<TestContext>();

		// Build a field with resolve
		const field = tb.string().resolve(({ ctx }) => {
			// ctx is typed as TestContext
			return ctx.userId;
		});

		expect(field._resolutionMode).toBe("resolve");
		expect(field._resolver).toBeDefined();
	});

	it("subscribe() on contextual field gets typed context", () => {
		const tb = createTypeBuilder<TestContext>();

		const field = tb.object<{ active: boolean }>().subscribe(({ ctx, emit }) => {
			emit({ active: ctx.userId !== "" });
		});

		expect(field._resolutionMode).toBe("subscribe");
		expect(field._subscriptionResolver).toBeDefined();
	});

	it("modifiers chain correctly", () => {
		const tb = createTypeBuilder<TestContext>();

		const nullableField = tb.string().nullable();
		const optionalField = tb.string().optional();
		const defaultField = tb.string().default("test");

		expect(nullableField._nullable).toBe(true);
		expect(optionalField._optional).toBe(true);
		expect(defaultField._default).toBe("test");
	});
});
