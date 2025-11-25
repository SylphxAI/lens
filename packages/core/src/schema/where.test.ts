/**
 * @sylphx/lens-core - Type-Safe Where/OrderBy Tests
 *
 * Tests for type inference of WhereInput and OrderByInput.
 * These are compile-time type tests - if they compile, the types are correct.
 */

import { describe, expect, it } from "bun:test";
import { belongsTo, createSchema, entity, hasMany } from "./define";
import type { CreateInput, OrderByInput, Select, UpdateInput, WhereInput } from "./infer";
import { t } from "./types";

// =============================================================================
// Test Entities (using new entity() API)
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	age: t.int().nullable(),
	score: t.float(),
	isActive: t.boolean(),
	createdAt: t.datetime(),
	role: t.enum(["admin", "user", "guest"] as const),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	views: t.int(),
	published: t.boolean(),
});

// Create schema with relations using direct entity references
const schema = createSchema({
	User: User.with({ posts: hasMany(Post) }),
	Post: Post.with({ author: belongsTo(User) }),
});

type UserDef = (typeof schema)["definition"]["User"];
type PostDef = (typeof schema)["definition"]["Post"];

// =============================================================================
// Type-Level Tests (compile-time)
// =============================================================================

describe("WhereInput type safety", () => {
	it("allows string filters on string fields", () => {
		const where: WhereInput<UserDef> = {
			name: { equals: "John" },
		};
		expect(where).toBeDefined();
	});

	it("allows string filters with contains, startsWith, endsWith", () => {
		const where: WhereInput<UserDef> = {
			name: { contains: "oh" },
			email: { startsWith: "john", endsWith: ".com" },
		};
		expect(where).toBeDefined();
	});

	it("allows direct value for simple equality", () => {
		const where: WhereInput<UserDef> = {
			name: "John",
			isActive: true,
		};
		expect(where).toBeDefined();
	});

	it("allows number filters on int/float fields", () => {
		const where: WhereInput<UserDef> = {
			age: { gt: 18, lte: 65 },
			score: { gte: 0, lt: 100 },
		};
		expect(where).toBeDefined();
	});

	it("allows boolean filters", () => {
		const where: WhereInput<UserDef> = {
			isActive: { equals: true },
		};
		expect(where).toBeDefined();
	});

	it("allows datetime filters", () => {
		const where: WhereInput<UserDef> = {
			createdAt: { gt: new Date("2024-01-01") },
		};
		expect(where).toBeDefined();
	});

	it("allows enum filters with type-safe values", () => {
		const where: WhereInput<UserDef> = {
			role: { equals: "admin" },
		};
		expect(where).toBeDefined();

		const where2: WhereInput<UserDef> = {
			role: { in: ["admin", "user"] },
		};
		expect(where2).toBeDefined();
	});

	it("allows AND/OR/NOT logical operators", () => {
		const where: WhereInput<UserDef> = {
			AND: [{ name: { contains: "John" } }, { isActive: true }],
		};
		expect(where).toBeDefined();

		const where2: WhereInput<UserDef> = {
			OR: [{ role: "admin" }, { role: "user" }],
		};
		expect(where2).toBeDefined();

		const where3: WhereInput<UserDef> = {
			NOT: { isActive: false },
		};
		expect(where3).toBeDefined();
	});

	it("allows in/notIn array filters", () => {
		const where: WhereInput<UserDef> = {
			name: { in: ["John", "Jane", "Bob"] },
			age: { notIn: [0, 1, 2] },
		};
		expect(where).toBeDefined();
	});

	it("allows null filtering on nullable fields", () => {
		const where: WhereInput<UserDef> = {
			age: { equals: null }, // Filter for users with no age
		};
		expect(where).toBeDefined();

		const where2: WhereInput<UserDef> = {
			age: { not: null }, // Filter for users with age set
		};
		expect(where2).toBeDefined();
	});

	it("allows direct null value for nullable fields", () => {
		const where: WhereInput<UserDef> = {
			age: null, // Direct null value
		};
		expect(where).toBeDefined();
	});

	it("allows complex nested filters", () => {
		const where: WhereInput<UserDef> = {
			AND: [
				{ isActive: true },
				{
					OR: [{ role: "admin" }, { age: { gte: 21 } }],
				},
			],
			name: { contains: "John", mode: "insensitive" },
		};
		expect(where).toBeDefined();
	});
});

describe("OrderByInput type safety", () => {
	it("allows sorting on scalar fields", () => {
		const orderBy: OrderByInput<UserDef> = {
			name: "asc",
		};
		expect(orderBy).toBeDefined();
	});

	it("allows multiple sort fields", () => {
		const orderBy: OrderByInput<UserDef> = {
			role: "desc",
			name: "asc",
		};
		expect(orderBy).toBeDefined();
	});

	it("allows sort with null handling", () => {
		const orderBy: OrderByInput<UserDef> = {
			age: { sort: "asc", nulls: "last" },
		};
		expect(orderBy).toBeDefined();
	});

	it("works on Post entity too", () => {
		const orderBy: OrderByInput<PostDef> = {
			views: "desc",
			title: "asc",
		};
		expect(orderBy).toBeDefined();
	});
});

// =============================================================================
// Type Error Tests (should NOT compile - commented out)
// =============================================================================

// These would cause compile errors if uncommented (which is correct):

// ERROR: 'invalid' is not a valid field
// const badWhere1: WhereInput<UserDef> = {
//   invalid: { equals: 'foo' }
// };

// ERROR: 'posts' is a relation, not allowed in where
// const badWhere2: WhereInput<UserDef> = {
//   posts: { equals: [] }
// };

// ERROR: number filter on string field
// const badWhere3: WhereInput<UserDef> = {
//   name: { gt: 5 }
// };

// ERROR: 'superadmin' is not a valid enum value
// const badWhere4: WhereInput<UserDef> = {
//   role: { equals: 'superadmin' }
// };

// ERROR: cannot orderBy relation field
// const badOrderBy: OrderByInput<UserDef> = {
//   posts: 'asc'
// };

// =============================================================================
// Nested Relation Select Type Tests
// =============================================================================

describe("Nested relation select type safety", () => {
	it("allows type-safe where in nested relation select", () => {
		type UserSelect = Select<UserDef, typeof schema.definition>;

		const select: UserSelect = {
			id: true,
			name: true,
			posts: {
				select: { title: true, views: true },
				where: { title: { contains: "Hello" } }, // Type-safe!
				orderBy: { views: "desc" }, // Type-safe!
				take: 10,
			},
		};

		expect(select).toBeDefined();
	});

	it("allows nested select on belongsTo relations", () => {
		type PostSelect = Select<PostDef, typeof schema.definition>;

		const select: PostSelect = {
			title: true,
			author: {
				select: { id: true, name: true },
				// author is belongsTo, so no where/orderBy needed (single result)
			},
		};

		expect(select).toBeDefined();
	});

	it("type-checks nested where filters", () => {
		type UserSelect = Select<UserDef, typeof schema.definition>;

		const select: UserSelect = {
			posts: {
				where: {
					views: { gt: 100 }, // NumberFilter on Post.views
					published: true, // BooleanFilter on Post.published
				},
				orderBy: [{ views: "desc" }, { title: "asc" }],
			},
		};

		expect(select).toBeDefined();
	});
});

// =============================================================================
// CreateInput Type Tests
// =============================================================================

describe("CreateInput type safety", () => {
	it("makes nullable fields optional", () => {
		type UserCreate = CreateInput<UserDef>;

		// Required fields (not nullable, not id)
		const create: UserCreate = {
			name: "John",
			email: "john@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "user",
			// age is nullable, so it's optional
		};

		expect(create).toBeDefined();
	});

	it("allows nullable fields to be provided", () => {
		type UserCreate = CreateInput<UserDef>;

		const create: UserCreate = {
			name: "John",
			email: "john@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "user",
			age: 30, // Optional but can be provided
		};

		expect(create).toBeDefined();
	});

	it("allows nullable fields to be null", () => {
		type UserCreate = CreateInput<UserDef>;

		const create: UserCreate = {
			name: "John",
			email: "john@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "user",
			age: null, // Can be null
		};

		expect(create).toBeDefined();
	});

	it("handles belongsTo relations as string IDs", () => {
		type PostCreate = CreateInput<PostDef>;

		const create: PostCreate = {
			title: "Hello World",
			content: "My first post",
			views: 0,
			published: true,
			author: "user-123", // Foreign key as string
		};

		expect(create).toBeDefined();
	});

	it("omits id field from create input", () => {
		type UserCreate = CreateInput<UserDef>;

		// id should not be present in UserCreate
		const create: UserCreate = {
			name: "John",
			email: "john@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "user",
		};

		// @ts-expect-error - id should not exist in CreateInput
		create.id = "123";

		expect(create).toBeDefined();
	});
});

describe("UpdateInput type safety", () => {
	it("requires id and makes everything else optional", () => {
		type UserUpdate = UpdateInput<UserDef>;

		const update: UserUpdate = {
			id: "user-123",
			// Everything else is optional
		};

		expect(update).toBeDefined();
	});

	it("allows partial updates", () => {
		type UserUpdate = UpdateInput<UserDef>;

		const update: UserUpdate = {
			id: "user-123",
			name: "New Name",
			// Only updating name, not other fields
		};

		expect(update).toBeDefined();
	});
});

// =============================================================================
// Relation Validation Type Tests
// =============================================================================

describe("Relation validation", () => {
	it("valid schema compiles without error", () => {
		// This schema has valid relations using direct entity references
		const Author = entity("Author", { id: t.id() });
		const Book = entity("Book", { id: t.id() });

		const validSchema = createSchema({
			Author: Author.with({ books: hasMany(Book) }),
			Book: Book.with({ author: belongsTo(Author) }),
		});

		expect(validSchema.entities.size).toBe(2);
	});

	it("validates relations at runtime", () => {
		// Runtime validation should throw for invalid relations
		const UserOnly = entity("User", { id: t.id() });

		expect(() =>
			createSchema({
				// @ts-expect-error - 'InvalidEntity' doesn't exist
				User: UserOnly.with({ profile: t.hasOne("InvalidEntity") }),
			} as any),
		).toThrow("does not exist");
	});
});

describe("Runtime behavior", () => {
	it("where objects are plain JavaScript objects", () => {
		const where: WhereInput<UserDef> = {
			name: { contains: "test" },
			age: { gt: 18 },
		};

		expect(typeof where).toBe("object");
		expect(where.name).toEqual({ contains: "test" });
		expect(where.age).toEqual({ gt: 18 });
	});

	it("orderBy objects are plain JavaScript objects", () => {
		const orderBy: OrderByInput<UserDef> = {
			createdAt: "desc",
		};

		expect(typeof orderBy).toBe("object");
		expect(orderBy.createdAt).toBe("desc");
	});
});
