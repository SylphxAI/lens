/**
 * @sylphx/core - Operations API Tests
 *
 * Tests for the query() and mutation() builder pattern.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
	query,
	mutation,
	tempId,
	resetTempIdCounter,
	isTempId,
	isQueryDef,
	isMutationDef,
	isOperationDef,
} from "./index";
import { entity } from "../schema/define";
import { t } from "../schema/types";
import { z } from "zod";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// =============================================================================
// Test: query() Builder
// =============================================================================

describe("query() builder", () => {
	it("creates a query without input", () => {
		const whoami = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));

		expect(whoami._type).toBe("query");
		expect(whoami._input).toBeUndefined();
		expect(whoami._output).toBe(User);
		expect(whoami._resolve).toBeDefined();
	});

	it("creates a query with input", () => {
		const getUserById = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(getUserById._type).toBe("query");
		expect(getUserById._input).toBeDefined();
		expect(getUserById._output).toBe(User);
	});

	it("creates a query returning array", () => {
		const listUsers = query()
			.returns([User])
			.resolve(() => [
				{ id: "1", name: "John", email: "john@example.com" },
				{ id: "2", name: "Jane", email: "jane@example.com" },
			]);

		expect(listUsers._type).toBe("query");
		expect(listUsers._output).toEqual([User]);
	});

	it("executes resolver function", async () => {
		const mockDb = {
			user: {
				findUnique: async ({ where }: { where: { id: string } }) => ({
					id: where.id,
					name: "John",
					email: "john@example.com",
				}),
			},
		};

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(async ({ input }) => mockDb.user.findUnique({ where: { id: input.id } }));

		const result = await getUser._resolve!({ input: { id: "123" } });
		expect(result).toEqual({ id: "123", name: "John", email: "john@example.com" });
	});
});

// =============================================================================
// Test: mutation() Builder
// =============================================================================

describe("mutation() builder", () => {
	it("creates a mutation with input and returns", () => {
		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.resolve(({ input }) => ({
				id: "1",
				title: input.title,
				content: input.content,
				authorId: "user-1",
			}));

		expect(createPost._type).toBe("mutation");
		expect(createPost._input).toBeDefined();
		expect(createPost._output).toBe(Post);
		expect(createPost._optimistic).toBeUndefined();
	});

	it("creates a mutation with optimistic updates", () => {
		resetTempIdCounter();

		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.optimistic(({ input }) => ({
				id: tempId(),
				title: input.title,
				content: input.content,
			}))
			.resolve(({ input }) => ({
				id: "real-id",
				title: input.title,
				content: input.content,
				authorId: "user-1",
			}));

		expect(createPost._type).toBe("mutation");
		expect(createPost._optimistic).toBeDefined();

		// Test optimistic function
		const optimistic = createPost._optimistic!({ input: { title: "Hello", content: "World" } });
		expect(optimistic.id).toBe("temp_0");
		expect(optimistic.title).toBe("Hello");
		expect(optimistic.content).toBe("World");
	});

	it("executes resolver function", async () => {
		const mockDb = {
			post: {
				create: async ({ data }: { data: { title: string; content: string } }) => ({
					id: "created-1",
					...data,
					authorId: "user-1",
				}),
			},
		};

		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.resolve(async ({ input }) => mockDb.post.create({ data: input }));

		const result = await createPost._resolve({ input: { title: "Hello", content: "World" } });
		expect(result).toEqual({
			id: "created-1",
			title: "Hello",
			content: "World",
			authorId: "user-1",
		});
	});

	it("supports multi-entity returns", () => {
		const Notification = entity("Notification", {
			id: t.id(),
			userId: t.string(),
			message: t.string(),
		});

		const promoteUsers = mutation()
			.input(z.object({ userIds: z.array(z.string()), role: z.string() }))
			.returns({ users: [User], notifications: [Notification] })
			.resolve(({ input }) => ({
				users: input.userIds.map((id) => ({ id, name: "User", email: "user@example.com" })),
				notifications: input.userIds.map((id) => ({
					id: `notif-${id}`,
					userId: id,
					message: "Promoted!",
				})),
			}));

		expect(promoteUsers._type).toBe("mutation");
		expect(promoteUsers._output).toEqual({ users: [User], notifications: [Notification] });
	});
});

// =============================================================================
// Test: tempId()
// =============================================================================

describe("tempId()", () => {
	beforeEach(() => {
		resetTempIdCounter();
	});

	it("generates unique temporary IDs", () => {
		const id1 = tempId();
		const id2 = tempId();
		const id3 = tempId();

		expect(id1).toBe("temp_0");
		expect(id2).toBe("temp_1");
		expect(id3).toBe("temp_2");
	});

	it("isTempId identifies temporary IDs", () => {
		expect(isTempId("temp_0")).toBe(true);
		expect(isTempId("temp_123")).toBe(true);
		expect(isTempId("real-id")).toBe(false);
		expect(isTempId("123")).toBe(false);
	});

	it("resetTempIdCounter resets the counter", () => {
		tempId();
		tempId();
		resetTempIdCounter();
		expect(tempId()).toBe("temp_0");
	});
});

// =============================================================================
// Test: Type Guards
// =============================================================================

describe("Type guards", () => {
	it("isQueryDef identifies query definitions", () => {
		const q = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));

		expect(isQueryDef(q)).toBe(true);
		expect(isQueryDef({})).toBe(false);
		expect(isQueryDef(null)).toBe(false);
		expect(isQueryDef({ _type: "mutation" })).toBe(false);
	});

	it("isMutationDef identifies mutation definitions", () => {
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(isMutationDef(m)).toBe(true);
		expect(isMutationDef({})).toBe(false);
		expect(isMutationDef({ _type: "query" })).toBe(false);
	});

	it("isOperationDef identifies any operation", () => {
		const q = query()
			.returns(User)
			.resolve(() => ({ id: "1", name: "John", email: "john@example.com" }));
		const m = mutation()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		expect(isOperationDef(q)).toBe(true);
		expect(isOperationDef(m)).toBe(true);
		expect(isOperationDef({})).toBe(false);
	});
});

// =============================================================================
// Test: Async Generator Support (Streaming)
// =============================================================================

describe("Streaming support", () => {
	it("query supports async generators", async () => {
		const streamingQuery = query()
			.returns([User])
			.resolve(async function* () {
				yield [{ id: "1", name: "John", email: "john@example.com" }];
				yield [
					{ id: "1", name: "John", email: "john@example.com" },
					{ id: "2", name: "Jane", email: "jane@example.com" },
				];
			});

		expect(streamingQuery._type).toBe("query");
		expect(streamingQuery._resolve).toBeDefined();

		// Execute and collect results
		const generator = streamingQuery._resolve!({ input: undefined }) as AsyncGenerator<unknown[]>;
		const results: unknown[][] = [];

		for await (const result of generator) {
			results.push(result);
		}

		expect(results).toHaveLength(2);
		expect(results[0]).toHaveLength(1);
		expect(results[1]).toHaveLength(2);
	});
});

// =============================================================================
// Test: Input Validation
// =============================================================================

describe("Input validation", () => {
	it("input schema validates data", () => {
		const schema = z.object({ id: z.string() });
		const getUser = query()
			.input(schema)
			.returns(User)
			.resolve(({ input }) => ({ id: input.id, name: "John", email: "john@example.com" }));

		// Valid input
		const result = schema.safeParse({ id: "123" });
		expect(result.success).toBe(true);

		// Invalid input
		const invalid = schema.safeParse({ id: 123 });
		expect(invalid.success).toBe(false);
	});
});
