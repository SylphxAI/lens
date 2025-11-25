/**
 * @sylphx/lens-client - Select Type Inference Tests
 *
 * Tests for type inference when using select options.
 * These are compile-time type tests.
 */

import { describe, expect, it } from "bun:test";
import { belongsTo, createSchema, entity, hasMany, t } from "@sylphx/lens-core";
import type { InferQueryResult, ListOptions, QueryOptions } from "./client";

// =============================================================================
// Test Entities (using new entity() API)
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	age: t.int().nullable(),
	isActive: t.boolean(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	views: t.int(),
});

// Create schema with relations using direct entity references
const schema = createSchema({
	User: User.with({ posts: hasMany(Post) }),
	Post: Post.with({ author: belongsTo(User) }),
});

type S = typeof schema.definition;

// =============================================================================
// InferQueryResult Type Tests
// =============================================================================

describe("InferQueryResult type inference", () => {
	it("returns full entity when select is undefined", () => {
		// When no select, should get full entity
		type Result = InferQueryResult<S, "User", undefined>;

		// This should be the full User type
		const _typeTest: Result = {
			id: "1",
			name: "John",
			email: "john@example.com",
			age: 30,
			isActive: true,
			posts: [],
		};

		expect(_typeTest).toBeDefined();
	});

	it("returns selected fields when select is provided", () => {
		// When select is provided, should only get selected fields
		type SelectType = { id: true; name: true };
		type Result = InferQueryResult<S, "User", SelectType>;

		// This should only have id and name
		const _typeTest: Result = {
			id: "1",
			name: "John",
		};

		expect(_typeTest).toBeDefined();
	});

	it("infers correct types for selected fields", () => {
		type SelectType = { id: true; age: true; isActive: true };
		type Result = InferQueryResult<S, "User", SelectType>;

		const _typeTest: Result = {
			id: "string-id",
			age: 30, // number | null
			isActive: true,
		};

		// age can also be null
		const _typeTest2: Result = {
			id: "string-id",
			age: null,
			isActive: false,
		};

		expect(_typeTest).toBeDefined();
		expect(_typeTest2).toBeDefined();
	});
});

// =============================================================================
// QueryOptions Type Tests
// =============================================================================

describe("QueryOptions type safety", () => {
	it("allows valid select options", () => {
		const options: QueryOptions<S, "User", { id: true; name: true }> = {
			select: { id: true, name: true },
		};
		expect(options).toBeDefined();
	});

	it("allows select on Post entity", () => {
		const options: QueryOptions<S, "Post", { title: true; views: true }> = {
			select: { title: true, views: true },
		};
		expect(options).toBeDefined();
	});
});

// =============================================================================
// ListOptions Type Tests
// =============================================================================

describe("ListOptions type safety", () => {
	it("combines select with where/orderBy", () => {
		const options: ListOptions<S, "User", { id: true; name: true }> = {
			select: { id: true, name: true },
			where: { name: { contains: "John" } },
			orderBy: { name: "asc" },
			take: 10,
		};
		expect(options).toBeDefined();
	});

	it("allows complex where filters", () => {
		const options: ListOptions<S, "User"> = {
			where: {
				AND: [{ isActive: true }, { age: { gt: 18 } }],
				OR: [{ name: { startsWith: "A" } }, { email: { endsWith: ".com" } }],
			},
			orderBy: [{ name: "asc" }, { age: "desc" }],
		};
		expect(options).toBeDefined();
	});
});

// =============================================================================
// Negative Type Tests (would fail compilation if uncommented)
// =============================================================================

// These would cause TypeScript errors if uncommented:

// ERROR: 'invalid' is not a field on User
// type BadSelect = InferQueryResult<S, 'User', { invalid: true }>;

// ERROR: where filter on non-existent field
// const badWhere: ListOptions<S, 'User'> = {
//   where: { invalidField: 'foo' }
// };

// ERROR: orderBy on relation field
// const badOrderBy: ListOptions<S, 'User'> = {
//   orderBy: { posts: 'asc' }
// };

describe("Type inference completeness", () => {
	it("InferQueryResult narrows correctly based on select", () => {
		// Full entity (no select)
		type Full = InferQueryResult<S, "User", undefined>;
		const full: Full = {
			id: "1",
			name: "test",
			email: "test@test.com",
			age: null,
			isActive: true,
			posts: [],
		};

		// Partial entity (with select)
		type Partial = InferQueryResult<S, "User", { id: true; email: true }>;
		const partial: Partial = {
			id: "1",
			email: "test@test.com",
		};

		expect(full.name).toBe("test");
		expect(partial.email).toBe("test@test.com");

		// Type check: partial should NOT have 'name' property
		// @ts-expect-error - name is not selected
		const _shouldError = partial.name;
	});
});
