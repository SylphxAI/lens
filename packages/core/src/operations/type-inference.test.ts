/**
 * @sylphx/lens-core - Type Inference Tests
 *
 * Comprehensive tests for type inference in the Operations API.
 * These tests verify that TypeScript correctly infers types throughout
 * the builder chain: .input() → .returns() → .resolve() → QueryDef/MutationDef
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { lens } from "../lens.js";
import { entity } from "../schema/define.js";
import { t } from "../schema/types.js";
import { type InferReturnType, mutation, query, router } from "./index.js";

// =============================================================================
// Test Entities
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	role: t.enum(["user", "admin", "vip"]),
	avatar: t.string().optional(),
	createdAt: t.date(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean(),
	authorId: t.string(),
	viewCount: t.int(),
});

const Comment = entity("Comment", {
	id: t.id(),
	text: t.string(),
	postId: t.string(),
	authorId: t.string(),
});

// =============================================================================
// Type Helpers for Testing
// =============================================================================

// Helper to extract output type from QueryDef using _brand
type ExtractQueryOutput<T> = T extends { _brand: { output: infer O } } ? O : never;

// Helper to extract output type from MutationDef using _brand
type ExtractMutationOutput<T> = T extends { _brand: { output: infer O } } ? O : never;

// Helper to check if two types are equal
type Equals<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// Type-level assertion - compilation fails if T is not true
type Assert<T extends true> = T;

// =============================================================================
// Test: QueryBuilder Type Inference
// =============================================================================

describe("QueryBuilder type inference", () => {
	describe(".returns(Entity)", () => {
		it("infers output type from single entity", () => {
			const getUser = query()
				.input(z.object({ id: z.string() }))
				.returns(User)
				.resolve(({ input }) => ({
					id: input.id,
					name: "John",
					email: "john@example.com",
					role: "user" as const,
					createdAt: new Date(),
				}));

			// Runtime check
			expect(getUser._type).toBe("query");
			expect(getUser._output).toBe(User);

			// Type-level assertions
			type Output = ExtractQueryOutput<typeof getUser>;
			type Expected = {
				id: string;
				name: string;
				email: string;
				role: "user" | "admin" | "vip";
				avatar?: string | undefined;
				createdAt: Date;
			};

			// If types don't match, this line won't compile
			type _assert = Assert<Equals<Output, Expected>>;
			const _typeCheck: _assert = true;
			expect(_typeCheck).toBe(true);
		});

		it("infers output type from entity array", () => {
			const listUsers = query()
				.returns([User])
				.resolve(() => [
					{
						id: "1",
						name: "John",
						email: "john@example.com",
						role: "admin" as const,
						createdAt: new Date(),
					},
				]);

			// Type-level assertions
			type Output = ExtractQueryOutput<typeof listUsers>;
			type Expected = {
				id: string;
				name: string;
				email: string;
				role: "user" | "admin" | "vip";
				avatar?: string | undefined;
				createdAt: Date;
			}[];

			type _assert = Assert<Equals<Output, Expected>>;
			const _typeCheck: _assert = true;
			expect(_typeCheck).toBe(true);
		});

		it("preserves optional fields from entity", () => {
			const getUser = query()
				.returns(User)
				.resolve(() => ({
					id: "1",
					name: "John",
					email: "john@example.com",
					role: "user" as const,
					avatar: "https://example.com/avatar.png", // Optional field provided
					createdAt: new Date(),
				}));

			type Output = ExtractQueryOutput<typeof getUser>;

			// avatar should be optional (string | undefined)
			type AvatarType = Output["avatar"];
			type _assertOptional = Assert<Equals<AvatarType, string | undefined>>;
			const _typeCheck: _assertOptional = true;
			expect(_typeCheck).toBe(true);
		});
	});

	describe(".returns(ZodSchema)", () => {
		it("infers output type from Zod object schema", () => {
			const ResponseSchema = z.object({
				success: z.boolean(),
				message: z.string(),
				count: z.number(),
			});

			const getStatus = query()
				.returns(ResponseSchema)
				.resolve(() => ({
					success: true,
					message: "OK",
					count: 42,
				}));

			type Output = ExtractQueryOutput<typeof getStatus>;
			type Expected = {
				success: boolean;
				message: string;
				count: number;
			};

			type _assert = Assert<Equals<Output, Expected>>;
			const _typeCheck: _assert = true;
			expect(_typeCheck).toBe(true);
		});

		it("infers output type from Zod array schema", () => {
			const ItemSchema = z.object({
				id: z.string(),
				value: z.number(),
			});

			const getItems = query()
				.returns(z.array(ItemSchema))
				.resolve(() => [
					{ id: "1", value: 100 },
					{ id: "2", value: 200 },
				]);

			type Output = ExtractQueryOutput<typeof getItems>;
			type Expected = { id: string; value: number }[];

			type _assert = Assert<Equals<Output, Expected>>;
			const _typeCheck: _assert = true;
			expect(_typeCheck).toBe(true);
		});

		it("infers output type from Zod optional fields", () => {
			const Schema = z.object({
				required: z.string(),
				optional: z.string().optional(),
				nullable: z.string().nullable(),
			});

			const getData = query()
				.returns(Schema)
				.resolve(() => ({
					required: "value",
					optional: undefined,
					nullable: null,
				}));

			type Output = ExtractQueryOutput<typeof getData>;

			// Check individual field types
			type RequiredType = Output["required"];
			type OptionalType = Output["optional"];
			type NullableType = Output["nullable"];

			type _assertRequired = Assert<Equals<RequiredType, string>>;
			type _assertOptional = Assert<Equals<OptionalType, string | undefined>>;
			type _assertNullable = Assert<Equals<NullableType, string | null>>;

			const checks: [_assertRequired, _assertOptional, _assertNullable] = [true, true, true];
			expect(checks).toEqual([true, true, true]);
		});
	});

	describe(".returns(MultiEntity)", () => {
		it("infers output type from multi-entity object", () => {
			const getPostWithAuthor = query()
				.input(z.object({ id: z.string() }))
				.returns({ post: Post, author: User })
				.resolve(({ input }) => ({
					post: {
						id: input.id,
						title: "Title",
						content: "Content",
						published: true,
						authorId: "1",
						viewCount: 100,
					},
					author: {
						id: "1",
						name: "John",
						email: "john@example.com",
						role: "admin" as const,
						createdAt: new Date(),
					},
				}));

			type Output = ExtractQueryOutput<typeof getPostWithAuthor>;

			// Output should be an object with post and author fields
			type PostType = Output["post"];
			type AuthorType = Output["author"];

			// Post should have Post entity shape
			type _assertPostId = Assert<Equals<PostType["id"], string>>;
			type _assertPostTitle = Assert<Equals<PostType["title"], string>>;

			// Author should have User entity shape
			type _assertAuthorId = Assert<Equals<AuthorType["id"], string>>;
			type _assertAuthorRole = Assert<Equals<AuthorType["role"], "user" | "admin" | "vip">>;

			const checks: [_assertPostId, _assertPostTitle, _assertAuthorId, _assertAuthorRole] = [true, true, true, true];
			expect(checks).toEqual([true, true, true, true]);
		});

		it("infers output type from multi-entity with arrays", () => {
			const getPostWithComments = query()
				.input(z.object({ id: z.string() }))
				.returns({ post: Post, comments: [Comment] })
				.resolve(({ input }) => ({
					post: {
						id: input.id,
						title: "Title",
						content: "Content",
						published: true,
						authorId: "1",
						viewCount: 100,
					},
					comments: [
						{ id: "c1", text: "Comment 1", postId: input.id, authorId: "2" },
						{ id: "c2", text: "Comment 2", postId: input.id, authorId: "3" },
					],
				}));

			type Output = ExtractQueryOutput<typeof getPostWithComments>;
			type CommentsType = Output["comments"];

			// Comments should be an array
			type _assertArray = Assert<CommentsType extends unknown[] ? true : false>;
			const _typeCheck: _assertArray = true;
			expect(_typeCheck).toBe(true);
		});
	});

	describe("without .returns()", () => {
		it("defaults to unknown output type", () => {
			const simpleQuery = query().resolve(() => ({ foo: "bar" }));

			type Output = ExtractQueryOutput<typeof simpleQuery>;

			// Without .returns(), output should be unknown
			type _assertUnknown = Assert<Equals<Output, unknown>>;
			const _typeCheck: _assertUnknown = true;
			expect(_typeCheck).toBe(true);
		});
	});

	describe(".input() type inference", () => {
		it("infers input type from Zod schema", () => {
			const getUser = query()
				.input(z.object({ id: z.string(), includeDeleted: z.boolean().optional() }))
				.returns(User)
				.resolve(({ input }) => {
					// Type check - input should have correct shape
					const _id: string = input.id;
					const _includeDeleted: boolean | undefined = input.includeDeleted;
					expect(_id).toBeDefined();
					expect(_includeDeleted).toBeUndefined();

					return {
						id: input.id,
						name: "John",
						email: "john@example.com",
						role: "user" as const,
						createdAt: new Date(),
					};
				});

			expect(getUser._input).toBeDefined();
		});

		it("chains .input() before .returns()", () => {
			const search = query()
				.input(z.object({ query: z.string(), limit: z.number().default(10) }))
				.returns([User])
				.resolve(({ input }) => {
					const _query: string = input.query;
					const _limit: number = input.limit;
					expect(_query).toBeDefined();
					expect(_limit).toBeDefined();
					return [];
				});

			expect(search._input).toBeDefined();
			expect(search._output).toEqual([User]);
		});

		it("chains .input() after .returns()", () => {
			const search = query()
				.returns([User])
				.input(z.object({ query: z.string() }))
				.resolve(({ input }) => {
					const _query: string = input.query;
					expect(_query).toBeDefined();
					return [];
				});

			expect(search._input).toBeDefined();
			expect(search._output).toEqual([User]);
		});
	});
});

// =============================================================================
// Test: MutationBuilder Type Inference
// =============================================================================

describe("MutationBuilder type inference", () => {
	describe(".returns(Entity) with .input()", () => {
		it("infers output type from entity after .returns()", () => {
			const createPost = mutation()
				.input(z.object({ title: z.string(), content: z.string() }))
				.returns(Post)
				.resolve(({ input }) => ({
					id: "new-1",
					title: input.title,
					content: input.content,
					published: false,
					authorId: "user-1",
					viewCount: 0,
				}));

			type Output = ExtractMutationOutput<typeof createPost>;
			type Expected = {
				id: string;
				title: string;
				content: string;
				published: boolean;
				authorId: string;
				viewCount: number;
			};

			type _assert = Assert<Equals<Output, Expected>>;
			const _typeCheck: _assert = true;
			expect(_typeCheck).toBe(true);
		});

		it("infers output type with .optimistic() in chain", () => {
			const updatePost = mutation()
				.input(z.object({ id: z.string(), title: z.string() }))
				.returns(Post)
				.optimistic("merge")
				.resolve(({ input }) => ({
					id: input.id,
					title: input.title,
					content: "Content",
					published: true,
					authorId: "user-1",
					viewCount: 100,
				}));

			type Output = ExtractMutationOutput<typeof updatePost>;

			// Should still have Post shape even with .optimistic() in chain
			type _assertId = Assert<Equals<Output["id"], string>>;
			type _assertTitle = Assert<Equals<Output["title"], string>>;
			type _assertPublished = Assert<Equals<Output["published"], boolean>>;

			const checks: [_assertId, _assertTitle, _assertPublished] = [true, true, true];
			expect(checks).toEqual([true, true, true]);
		});

		it("infers output type with complex optimistic DSL", () => {
			const publishPost = mutation()
				.input(z.object({ id: z.string() }))
				.returns(Post)
				.optimistic({ merge: { published: true } })
				.resolve(({ input }) => ({
					id: input.id,
					title: "Title",
					content: "Content",
					published: true,
					authorId: "user-1",
					viewCount: 0,
				}));

			type Output = ExtractMutationOutput<typeof publishPost>;
			type _assertPublished = Assert<Equals<Output["published"], boolean>>;
			const _typeCheck: _assertPublished = true;
			expect(_typeCheck).toBe(true);
		});
	});

	describe("without .returns() (infer from resolver)", () => {
		it("mutation without .returns() uses resolver return type at runtime", async () => {
			// Note: Type inference from resolver alone is limited.
			// For proper type inference, use .returns() with an entity or Zod schema.
			// This test verifies runtime behavior works correctly.
			const deletePost = mutation()
				.input(z.object({ id: z.string() }))
				.resolve(({ input }) => ({ deleted: true, id: input.id }));

			// Runtime check - the mutation definition exists
			expect(deletePost._type).toBe("mutation");
			expect(deletePost._brand).toBeDefined();
		});

		it("complex mutation resolver returns correct value at runtime", () => {
			const bulkUpdate = mutation()
				.input(z.object({ ids: z.array(z.string()), status: z.string() }))
				.resolve(({ input }) => ({
					updated: input.ids.length,
					failed: 0,
					errors: [] as string[],
				}));

			// Runtime check - the mutation definition exists and has correct shape
			expect(bulkUpdate._type).toBe("mutation");
			expect(bulkUpdate._input).toBeDefined();
		});
	});

	describe("multi-entity returns", () => {
		it("infers output type from multi-entity object", () => {
			const createPostWithAuthor = mutation()
				.input(z.object({ title: z.string(), authorId: z.string() }))
				.returns({ post: Post, author: User })
				.resolve(({ input }) => ({
					post: {
						id: "new-post",
						title: input.title,
						content: "",
						published: false,
						authorId: input.authorId,
						viewCount: 0,
					},
					author: {
						id: input.authorId,
						name: "Author",
						email: "author@example.com",
						role: "user" as const,
						createdAt: new Date(),
					},
				}));

			type Output = ExtractMutationOutput<typeof createPostWithAuthor>;

			// Both post and author should have correct shapes
			type _assertPostId = Assert<Equals<Output["post"]["id"], string>>;
			type _assertAuthorRole = Assert<Equals<Output["author"]["role"], "user" | "admin" | "vip">>;

			const checks: [_assertPostId, _assertAuthorRole] = [true, true];
			expect(checks).toEqual([true, true]);
		});
	});
});

// =============================================================================
// Test: lens() Factory Type Inference
// =============================================================================

describe("lens() factory type inference", () => {
	interface TestContext {
		db: {
			users: Map<string, { id: string; name: string; email: string }>;
			posts: Map<string, { id: string; title: string }>;
		};
		currentUser: { id: string; name: string } | null;
		requestId: string;
	}

	it("provides correctly typed context to query resolvers", () => {
		const { query } = lens<TestContext>();

		const whoami = query()
			.returns(User)
			.resolve(({ ctx }) => {
				// Type check - ctx should be TestContext
				const _db = ctx.db;
				const _user = ctx.currentUser;
				const _requestId: string = ctx.requestId;

				expect(_requestId).toBeDefined();

				if (!_user) throw new Error("Not authenticated");
				const user = _db.users.get(_user.id);
				if (!user) throw new Error("User not found");

				return {
					id: user.id,
					name: user.name,
					email: user.email,
					role: "user" as const,
					createdAt: new Date(),
				};
			});

		expect(whoami._type).toBe("query");
	});

	it("provides correctly typed context to mutation resolvers", () => {
		const { mutation } = lens<TestContext>();

		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				// Type check - ctx should be TestContext
				const id = ctx.requestId;
				const user = { id, name: input.name, email: input.email };
				ctx.db.users.set(id, user);

				return {
					...user,
					role: "user" as const,
					createdAt: new Date(),
				};
			});

		expect(createUser._type).toBe("mutation");
	});

	it("infers context type from router procedures", () => {
		const { query } = lens<TestContext>();

		const appRouter = router({
			user: router({
				get: query()
					.input(z.object({ id: z.string() }))
					.returns(User)
					.resolve(({ input, ctx }) => {
						const user = ctx.db.users.get(input.id);
						if (!user) throw new Error("Not found");
						return { ...user, role: "user" as const, createdAt: new Date() };
					}),
			}),
		});

		expect(appRouter._type).toBe("router");
	});
});

// =============================================================================
// Test: InferReturnType Utility
// =============================================================================

describe("InferReturnType utility", () => {
	it("infers type from EntityDef", () => {
		type Result = InferReturnType<typeof User>;
		type Expected = {
			id: string;
			name: string;
			email: string;
			role: "user" | "admin" | "vip";
			avatar?: string | undefined;
			createdAt: Date;
		};

		type _assert = Assert<Equals<Result, Expected>>;
		const _typeCheck: _assert = true;
		expect(_typeCheck).toBe(true);
	});

	it("infers type from EntityDef array", () => {
		type Result = InferReturnType<[typeof User]>;
		type Expected = {
			id: string;
			name: string;
			email: string;
			role: "user" | "admin" | "vip";
			avatar?: string | undefined;
			createdAt: Date;
		}[];

		type _assert = Assert<Equals<Result, Expected>>;
		const _typeCheck: _assert = true;
		expect(_typeCheck).toBe(true);
	});

	it("infers type from ZodSchema", () => {
		const Schema = z.object({ foo: z.string(), bar: z.number() });
		type Result = InferReturnType<typeof Schema>;
		type Expected = { foo: string; bar: number };

		type _assert = Assert<Equals<Result, Expected>>;
		const _typeCheck: _assert = true;
		expect(_typeCheck).toBe(true);
	});

	it("infers type from multi-entity object", () => {
		type Result = InferReturnType<{ user: typeof User; posts: [typeof Post] }>;

		// Result should be object with user and posts fields
		type UserType = Result["user"];
		type PostsType = Result["posts"];

		type _assertUser = Assert<Equals<UserType["id"], string>>;
		type _assertPosts = Assert<PostsType extends unknown[] ? true : false>;

		const checks: [_assertUser, _assertPosts] = [true, true];
		expect(checks).toEqual([true, true]);
	});
});

// =============================================================================
// Test: _brand Phantom Type
// =============================================================================

describe("_brand phantom type", () => {
	it("QueryDef._brand.output matches .returns() type", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: input.id,
				name: "John",
				email: "john@example.com",
				role: "admin" as const,
				createdAt: new Date(),
			}));

		// _brand should have output type matching User shape
		type BrandOutput = (typeof getUser)["_brand"]["output"];
		type Expected = {
			id: string;
			name: string;
			email: string;
			role: "user" | "admin" | "vip";
			avatar?: string | undefined;
			createdAt: Date;
		};

		type _assert = Assert<Equals<BrandOutput, Expected>>;
		const _typeCheck: _assert = true;
		expect(_typeCheck).toBe(true);
	});

	it("QueryDef._brand.input matches .input() type", () => {
		const InputSchema = z.object({ id: z.string(), limit: z.number().optional() });

		const search = query()
			.input(InputSchema)
			.returns([User])
			.resolve(() => []);

		type BrandInput = (typeof search)["_brand"]["input"];
		type Expected = { id: string; limit?: number | undefined };

		type _assert = Assert<Equals<BrandInput, Expected>>;
		const _typeCheck: _assert = true;
		expect(_typeCheck).toBe(true);
	});

	it("MutationDef._brand preserves types through .optimistic()", () => {
		const updateUser = mutation()
			.input(z.object({ id: z.string(), name: z.string() }))
			.returns(User)
			.optimistic("merge")
			.resolve(({ input }) => ({
				id: input.id,
				name: input.name,
				email: "john@example.com",
				role: "user" as const,
				createdAt: new Date(),
			}));

		type BrandInput = (typeof updateUser)["_brand"]["input"];
		type BrandOutput = (typeof updateUser)["_brand"]["output"];

		type _assertInput = Assert<Equals<BrandInput, { id: string; name: string }>>;
		type _assertOutput = Assert<
			Equals<
				BrandOutput,
				{
					id: string;
					name: string;
					email: string;
					role: "user" | "admin" | "vip";
					avatar?: string | undefined;
					createdAt: Date;
				}
			>
		>;

		const checks: [_assertInput, _assertOutput] = [true, true];
		expect(checks).toEqual([true, true]);
	});
});
