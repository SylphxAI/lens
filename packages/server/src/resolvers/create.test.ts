/**
 * Tests for Resolver Creation
 */

import { describe, expect, test, mock } from "bun:test";
import { createSchema, t } from "@lens/core";
import { createResolvers, ResolverValidationError } from "./create";

// Test schema
const schema = createSchema({
	User: {
		id: t.id(),
		name: t.string(),
		email: t.string(),
		posts: t.hasMany("Post"),
	},
	Post: {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		author: t.belongsTo("User"),
	},
});

describe("createResolvers", () => {
	test("creates resolvers from valid definition", () => {
		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => ({ id, name: "John", email: "john@example.com", posts: [] }),
			},
			Post: {
				resolve: async (id) => ({
					id,
					title: "Test",
					content: "Content",
					author: { id: "1", name: "John", email: "john@example.com", posts: [] },
				}),
			},
		});

		expect(resolvers.hasResolver("User")).toBe(true);
		expect(resolvers.hasResolver("Post")).toBe(true);
		expect(resolvers.getResolverNames()).toContain("User");
		expect(resolvers.getResolverNames()).toContain("Post");
	});

	test("throws on resolver for unknown entity", () => {
		expect(() => {
			createResolvers(schema, {
				// @ts-expect-error - Testing invalid entity
				Unknown: {
					resolve: async (id) => null,
				},
			});
		}).toThrow(ResolverValidationError);
	});

	test("throws if resolve function is missing", () => {
		expect(() => {
			createResolvers(schema, {
				// @ts-expect-error - Testing missing resolve
				User: {
					batch: async (ids) => ids.map(() => null),
				},
			});
		}).toThrow(ResolverValidationError);
	});

	test("getResolver returns resolver for entity", () => {
		const userResolver = mock(async (id: string) => ({
			id,
			name: "John",
			email: "john@example.com",
			posts: [],
		}));

		const resolvers = createResolvers(schema, {
			User: {
				resolve: userResolver,
			},
		});

		const resolver = resolvers.getResolver("User");
		expect(resolver).toBeDefined();
		expect(resolver?.resolve).toBe(userResolver);
	});

	test("getBatchResolver returns batch resolver", () => {
		const batchFn = mock(async (ids: string[]) =>
			ids.map((id) => ({ id, name: "John", email: "john@example.com", posts: [] })),
		);

		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => ({ id, name: "John", email: "john@example.com", posts: [] }),
				batch: batchFn,
			},
		});

		const batchResolver = resolvers.getBatchResolver("User");
		expect(batchResolver).toBe(batchFn);
	});

	test("hasResolver returns false for entities without resolvers", () => {
		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => ({ id, name: "John", email: "john@example.com", posts: [] }),
			},
			// Post resolver not defined
		});

		expect(resolvers.hasResolver("User")).toBe(true);
		expect(resolvers.hasResolver("Post")).toBe(false);
	});
});

describe("Resolver with mutations", () => {
	test("supports create, update, delete resolvers", () => {
		const createFn = mock(async (input: unknown) => ({
			id: "new-id",
			name: "New User",
			email: "new@example.com",
			posts: [],
		}));

		const updateFn = mock(async (input: { id: string }) => ({
			id: input.id,
			name: "Updated",
			email: "updated@example.com",
			posts: [],
		}));

		const deleteFn = mock(async (id: string) => true);

		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => ({ id, name: "John", email: "john@example.com", posts: [] }),
				create: createFn,
				update: updateFn,
				delete: deleteFn,
			},
		});

		const resolver = resolvers.getResolver("User");
		expect(resolver?.create).toBe(createFn);
		expect(resolver?.update).toBe(updateFn);
		expect(resolver?.delete).toBe(deleteFn);
	});
});

describe("Resolver with streaming", () => {
	test("supports async generator resolvers", async () => {
		const resolvers = createResolvers(schema, {
			User: {
				resolve: async function* (id) {
					yield { id, name: "Initial", email: "test@example.com", posts: [] };
					yield { id, name: "Updated", email: "test@example.com", posts: [] };
				},
			},
		});

		const resolver = resolvers.getResolver("User");
		expect(resolver?.resolve).toBeDefined();

		// The resolve function is an async generator
		const ctx = {};
		const result = resolver!.resolve("123", ctx);

		// Check it's async iterable
		expect(Symbol.asyncIterator in (result as object)).toBe(true);
	});
});
