/**
 * @sylphx/lens-core - Advanced Operation Type Tests
 *
 * Tests for aggregation, batch, relation mutations, and find types.
 * These are compile-time type tests - if they compile, the types are correct.
 */

import { describe, expect, it } from "bun:test";
import { belongsTo, createSchema, entity, hasMany, hasOne } from "./define";
import type {
	// Aggregation
	AggregateInput,
	CountInput,
	// Relation mutations
	CreateInputWithRelations,
	// Batch operations
	CreateManyInput,
	DeleteManyInput,
	// Find types
	FindFirstInput,
	FindManyInput,
	FindUniqueInput,
	GroupByInput,
	ManyRelationInput,
	NumericFields,
	SingleRelationInput,
	UpdateInputWithRelations,
	UpdateManyInput,
	UpsertInput,
	WhereUniqueInput,
} from "./infer";
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
	rating: t.float(),
	published: t.boolean(),
});

const Profile = entity("Profile", {
	id: t.id(),
	bio: t.string(),
	avatar: t.string().nullable(),
});

const Tag = entity("Tag", {
	id: t.id(),
	name: t.string(),
});

// Create schema with relations using direct entity references
const schema = createSchema({
	User: User.with({
		posts: hasMany(Post),
		profile: hasOne(Profile),
	}),
	Post: Post.with({
		author: belongsTo(User),
		tags: hasMany(Tag),
	}),
	Profile: Profile.with({
		user: belongsTo(User),
	}),
	Tag: Tag.with({
		posts: hasMany(Post),
	}),
});

type UserDef = (typeof schema)["definition"]["User"];
type PostDef = (typeof schema)["definition"]["Post"];
type Def = typeof schema.definition;

// =============================================================================
// Aggregation Type Tests
// =============================================================================

describe("Aggregation types", () => {
	it("NumericFields extracts only numeric fields", () => {
		// Type-level test: NumericFields<UserDef> should only include int/float fields
		type UserNumeric = NumericFields<UserDef>;

		// These should be assignable
		const numeric1: UserNumeric = "age";
		const numeric2: UserNumeric = "score";
		expect(numeric1).toBe("age");
		expect(numeric2).toBe("score");

		// @ts-expect-error - 'name' is string, not numeric
		const badNumeric: UserNumeric = "name";
	});

	it("CountInput allows type-safe count options", () => {
		const count: CountInput<UserDef> = {
			where: { isActive: true },
		};
		expect(count).toBeDefined();

		const countWithSelect: CountInput<UserDef> = {
			where: { role: "admin" },
			select: { name: true, email: true },
		};
		expect(countWithSelect).toBeDefined();

		const countAll: CountInput<UserDef> = {
			select: { _all: true },
		};
		expect(countAll).toBeDefined();
	});

	it("AggregateInput allows type-safe aggregations", () => {
		const aggregate: AggregateInput<PostDef> = {
			where: { published: true },
			_count: true,
			_sum: { views: true, rating: true },
			_avg: { views: true },
			_min: { views: true, title: true },
			_max: { rating: true },
		};
		expect(aggregate).toBeDefined();
	});

	it("AggregateInput only allows numeric fields for _sum/_avg", () => {
		const aggregate: AggregateInput<PostDef> = {
			_sum: { views: true, rating: true },
		};
		expect(aggregate).toBeDefined();
	});

	it("GroupByInput allows type-safe grouping", () => {
		const groupBy: GroupByInput<PostDef> = {
			by: ["published"],
			where: { views: { gt: 100 } },
			_count: true,
			_sum: { views: true },
			_avg: { rating: true },
			having: { views: { gt: 50 } },
			orderBy: { views: "desc" },
		};
		expect(groupBy).toBeDefined();
	});
});

// =============================================================================
// Batch Operation Type Tests
// =============================================================================

describe("Batch operation types", () => {
	it("CreateManyInput accepts array of create inputs", () => {
		const createMany: CreateManyInput<UserDef> = {
			data: [
				{
					name: "User 1",
					email: "user1@example.com",
					age: null,
					score: 0,
					isActive: true,
					createdAt: new Date(),
					role: "user",
				},
				{
					name: "User 2",
					email: "user2@example.com",
					age: null,
					score: 100,
					isActive: false,
					createdAt: new Date(),
					role: "admin",
				},
			],
			skipDuplicates: true,
		};
		expect(createMany.data.length).toBe(2);
	});

	it("UpdateManyInput requires where and data", () => {
		const updateMany: UpdateManyInput<UserDef> = {
			where: { isActive: false },
			data: { isActive: true },
		};
		expect(updateMany).toBeDefined();
	});

	it("DeleteManyInput requires where", () => {
		const deleteMany: DeleteManyInput<UserDef> = {
			where: { isActive: false, role: "guest" },
		};
		expect(deleteMany).toBeDefined();
	});
});

// =============================================================================
// Relation Mutation Type Tests
// =============================================================================

describe("Relation mutation types", () => {
	it("SingleRelationInput supports connect", () => {
		type ProfileRelation = SingleRelationInput<(typeof schema)["definition"]["Profile"], Def>;

		const connect: ProfileRelation = {
			connect: { id: "profile-123" },
		};
		expect(connect).toBeDefined();
	});

	it("SingleRelationInput supports create", () => {
		type ProfileRelation = SingleRelationInput<(typeof schema)["definition"]["Profile"], Def>;

		const create: ProfileRelation = {
			create: {
				bio: "Hello world",
				avatar: null,
			},
		};
		expect(create).toBeDefined();
	});

	it("SingleRelationInput supports connectOrCreate", () => {
		type ProfileRelation = SingleRelationInput<(typeof schema)["definition"]["Profile"], Def>;

		const connectOrCreate: ProfileRelation = {
			connectOrCreate: {
				where: { id: "profile-123" },
				create: { bio: "New bio", avatar: null },
			},
		};
		expect(connectOrCreate).toBeDefined();
	});

	it("SingleRelationInput supports disconnect", () => {
		type ProfileRelation = SingleRelationInput<(typeof schema)["definition"]["Profile"], Def>;

		const disconnect: ProfileRelation = {
			disconnect: true,
		};
		expect(disconnect).toBeDefined();
	});

	it("ManyRelationInput supports connect array", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const connect: PostRelation = {
			connect: [{ id: "post-1" }, { id: "post-2" }],
		};
		expect(connect).toBeDefined();
	});

	it("ManyRelationInput supports set (replace all)", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const set: PostRelation = {
			set: [{ id: "post-1" }],
		};
		expect(set).toBeDefined();
	});

	it("ManyRelationInput supports create array", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const create: PostRelation = {
			create: [
				{ title: "Post 1", content: "Content 1", views: 0, rating: 0, published: true },
				{ title: "Post 2", content: "Content 2", views: 0, rating: 0, published: false },
			],
		};
		expect(create).toBeDefined();
	});

	it("ManyRelationInput supports createMany", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const createMany: PostRelation = {
			createMany: {
				data: [{ title: "Post 1", content: "Content 1", views: 0, rating: 0, published: true }],
				skipDuplicates: true,
			},
		};
		expect(createMany).toBeDefined();
	});

	it("ManyRelationInput supports update", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const update: PostRelation = {
			update: [{ where: { id: "post-1" }, data: { views: 100 } }],
		};
		expect(update).toBeDefined();
	});

	it("ManyRelationInput supports disconnect", () => {
		type PostRelation = ManyRelationInput<PostDef, Def>;

		const disconnect: PostRelation = {
			disconnect: [{ id: "post-1" }, { id: "post-2" }],
		};
		expect(disconnect).toBeDefined();
	});

	it("CreateInputWithRelations combines scalar and relation inputs", () => {
		const create: CreateInputWithRelations<UserDef, Def> = {
			name: "John",
			email: "john@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "user",
			// Relation mutations
			posts: {
				create: [{ title: "First Post", content: "Hello", views: 0, rating: 0, published: true }],
			},
			profile: {
				create: { bio: "My bio", avatar: null },
			},
		};
		expect(create.name).toBe("John");
	});

	it("UpdateInputWithRelations supports nested relation updates", () => {
		const update: UpdateInputWithRelations<UserDef, Def> = {
			id: "user-123",
			name: "New Name",
			posts: {
				connect: [{ id: "existing-post" }],
				create: [{ title: "New Post", content: "...", views: 0, rating: 0, published: false }],
				disconnect: [{ id: "old-post" }],
			},
			profile: {
				update: { bio: "Updated bio", avatar: null },
			},
		};
		expect(update.id).toBe("user-123");
	});
});

// =============================================================================
// Find Type Tests
// =============================================================================

describe("Find types", () => {
	it("FindFirstInput allows type-safe find first", () => {
		const findFirst: FindFirstInput<UserDef, Def> = {
			where: { isActive: true },
			orderBy: { createdAt: "desc" },
			select: { id: true, name: true },
			skip: 5,
		};
		expect(findFirst).toBeDefined();
	});

	it("FindUniqueInput requires where with unique field", () => {
		const findById: FindUniqueInput<UserDef, Def> = {
			where: { id: "user-123" },
			select: { id: true, name: true, email: true },
		};
		expect(findById).toBeDefined();
	});

	it("WhereUniqueInput allows any scalar field", () => {
		// Can use id
		const byId: WhereUniqueInput<UserDef> = { id: "123" };
		expect(byId).toBeDefined();

		// Can use other fields (for unique constraints)
		const byEmail: WhereUniqueInput<UserDef> = { email: "john@example.com" };
		expect(byEmail).toBeDefined();
	});

	it("UpsertInput requires where, create, and update", () => {
		const upsert: UpsertInput<UserDef, Def> = {
			where: { id: "user-123" },
			create: {
				name: "John",
				email: "john@example.com",
				age: null,
				score: 0,
				isActive: true,
				createdAt: new Date(),
				role: "user",
			},
			update: {
				name: "Updated John",
			},
			select: { id: true, name: true },
		};
		expect(upsert).toBeDefined();
	});

	it("FindManyInput supports distinct", () => {
		const findMany: FindManyInput<UserDef, Def> = {
			where: { isActive: true },
			orderBy: { name: "asc" },
			distinct: ["role", "isActive"],
			take: 10,
		};
		expect(findMany).toBeDefined();
	});

	it("FindManyInput supports cursor pagination", () => {
		const findMany: FindManyInput<UserDef, Def> = {
			cursor: { id: "last-seen-id" },
			take: 20,
			skip: 1, // Skip the cursor itself
			orderBy: { createdAt: "desc" },
		};
		expect(findMany).toBeDefined();
	});
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Type integration", () => {
	it("all types work together in a realistic scenario", () => {
		// Complex query with filtering, sorting, and pagination
		const query: FindManyInput<PostDef, Def> = {
			where: {
				AND: [
					{ published: true },
					{ views: { gt: 100 } },
					{
						OR: [{ title: { contains: "TypeScript" } }, { rating: { gte: 4.0 } }],
					},
				],
			},
			orderBy: [{ rating: "desc" }, { views: "desc" }],
			select: {
				id: true,
				title: true,
				views: true,
				rating: true,
				author: { select: { id: true, name: true } },
			},
			take: 10,
			skip: 0,
			distinct: ["title"],
		};

		expect(query.where?.AND).toBeDefined();
	});

	it("complex relation mutation scenario", () => {
		const createUser: CreateInputWithRelations<UserDef, Def> = {
			name: "Complete User",
			email: "complete@example.com",
			score: 0,
			isActive: true,
			createdAt: new Date(),
			role: "admin",
			age: 30,
			posts: {
				create: [
					{
						title: "My First Post",
						content: "Hello world!",
						views: 0,
						rating: 0,
						published: true,
					},
				],
				connect: [{ id: "existing-post-1" }, { id: "existing-post-2" }],
			},
			profile: {
				create: {
					bio: "Software developer",
					avatar: "https://example.com/avatar.png",
				},
			},
		};

		expect(createUser.posts?.create?.length).toBe(1);
		expect(createUser.posts?.connect?.length).toBe(2);
	});
});
