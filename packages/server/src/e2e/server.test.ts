/**
 * @lens - E2E Tests
 *
 * End-to-end tests for the pure executor server.
 * Tests: execute(), getMetadata(), context, selections, entity resolvers
 *
 * For WebSocket protocol tests, see adapters/*.test.ts
 */

import { describe, expect, it } from "bun:test";
import { entity, firstValueFrom, isError, isSnapshot, lens, mutation, query, t } from "@sylphx/lens-core";
import { z } from "zod";
import { optimisticPlugin } from "../plugin/optimistic.js";
import { createApp } from "../server/create.js";

// =============================================================================
// Test Fixtures
// =============================================================================

// Entities
const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	status: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// Mock data
const mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@example.com", status: "online" },
	{ id: "user-2", name: "Bob", email: "bob@example.com", status: "offline" },
];

const _mockPosts = [
	{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" },
	{ id: "post-2", title: "Test", content: "Post", authorId: "user-1" },
];

// =============================================================================
// Test: Basic Operations
// =============================================================================

describe("E2E - Basic Operations", () => {
	it("query without input", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createApp({
			entities: { User },
			queries: { getUsers },
		});

		const result = await firstValueFrom(server.execute({ path: "getUsers" }));

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toEqual(mockUsers);
		}
	});

	it("query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				const user = mockUsers.find((u) => u.id === input.id);
				if (!user) throw new Error("User not found");
				return user;
			});

		const server = createApp({
			entities: { User },
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { id: "user-1" },
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toEqual(mockUsers[0]);
		}
	});

	it("mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "user-new",
				name: input.name,
				email: input.email,
				status: "offline",
			}));

		const server = createApp({
			entities: { User },
			mutations: { createUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "createUser",
				input: { name: "Charlie", email: "charlie@example.com" },
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toEqual({
				id: "user-new",
				name: "Charlie",
				email: "charlie@example.com",
				status: "offline",
			});
		}
	});

	it("handles query errors", async () => {
		const failingQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(() => {
				throw new Error("Query failed");
			});

		const server = createApp({
			queries: { failingQuery },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "failingQuery",
				input: { id: "123" },
			}),
		);

		expect(isError(result)).toBe(true);
		if (isError(result)) {
			expect(result.error).toBe("Query failed");
		}
	});

	it("handles unknown operation", async () => {
		const server = createApp({});

		const result = await firstValueFrom(
			server.execute({
				path: "unknownOperation",
				input: {},
			}),
		);

		expect(isError(result)).toBe(true);
		if (isError(result)) {
			expect(result.error).toContain("not found");
		}
	});
});

// =============================================================================
// Test: Context
// =============================================================================

describe("E2E - Context", () => {
	it("passes context to resolver", async () => {
		let capturedContext: unknown = null;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return mockUsers[0];
			});

		const server = createApp({
			queries: { getUser },
			context: () => ({ userId: "ctx-user-1", role: "admin" }),
		});

		await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { id: "user-1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "ctx-user-1",
			role: "admin",
		});
	});

	it("supports async context factory", async () => {
		let capturedContext: unknown = null;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return mockUsers[0];
			});

		const server = createApp({
			queries: { getUser },
			context: async () => {
				await new Promise((r) => setTimeout(r, 10));
				return { userId: "async-user" };
			},
		});

		await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { id: "user-1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "async-user",
		});
	});
});

// =============================================================================
// Test: Selection ($select)
// =============================================================================

describe("E2E - Selection", () => {
	it("applies $select to filter fields", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				const user = mockUsers.find((u) => u.id === input.id);
				if (!user) throw new Error("User not found");
				return user;
			});

		const server = createApp({
			entities: { User },
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: {
					id: "user-1",
					$select: { name: true },
				},
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			// Should include id (always) and selected fields
			expect(result.data).toEqual({
				id: "user-1",
				name: "Alice",
			});
			// Should not include unselected fields
			expect((result.data as Record<string, unknown>).email).toBeUndefined();
			expect((result.data as Record<string, unknown>).status).toBeUndefined();
		}
	});

	it("includes id by default in selection", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id)!);

		const server = createApp({
			entities: { User },
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: {
					id: "user-1",
					$select: { email: true },
				},
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toEqual({
				id: "user-1",
				email: "alice@example.com",
			});
		}
	});
});

// =============================================================================
// Test: Entity Resolvers
// =============================================================================

describe("E2E - Entity Resolvers", () => {
	it("executes entity resolvers for nested selection", async () => {
		const users = [
			{ id: "user-1", name: "Alice", email: "alice@example.com" },
			{ id: "user-2", name: "Bob", email: "bob@example.com" },
		];

		const posts = [
			{ id: "post-1", title: "Hello World", content: "First post", authorId: "user-1" },
			{ id: "post-2", title: "Second Post", content: "More content", authorId: "user-1" },
		];

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				const user = users.find((u) => u.id === input.id);
				if (!user) throw new Error("Not found");
				return user;
			});

		// Create entity resolvers using lens() factory
		const { resolver } = lens();
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			email: f.expose("email"),
			posts: f.many(Post).resolve(({ parent }) => posts.filter((p) => p.authorId === parent.id)),
		}));

		const server = createApp({
			entities: { User, Post },
			queries: { getUser },
			resolvers: [userResolver],
		});

		// Test with $select for nested posts
		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: {
					id: "user-1",
					$select: {
						name: true,
						posts: {
							select: {
								title: true,
							},
						},
					},
				},
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toMatchObject({
				id: "user-1",
				name: "Alice",
				posts: [
					{ id: "post-1", title: "Hello World" },
					{ id: "post-2", title: "Second Post" },
				],
			});
		}
	});

	it("handles DataLoader batching for entity resolvers", async () => {
		// Track batch calls
		let batchCallCount = 0;

		const users = [
			{ id: "user-1", name: "Alice" },
			{ id: "user-2", name: "Bob" },
		];

		const posts = [
			{ id: "post-1", title: "Post 1", authorId: "user-1" },
			{ id: "post-2", title: "Post 2", authorId: "user-2" },
		];

		const getUsers = query()
			.returns([User])
			.resolve(() => users);

		// Create entity resolvers using lens() factory
		const { resolver } = lens();
		const userResolver = resolver(User, (f) => ({
			id: f.expose("id"),
			name: f.expose("name"),
			posts: f.many(Post).resolve(({ parent }) => {
				batchCallCount++;
				return posts.filter((p) => p.authorId === parent.id);
			}),
		}));

		const server = createApp({
			entities: { User, Post },
			queries: { getUsers },
			resolvers: [userResolver],
		});

		// Execute query with nested selection for all users
		const result = await firstValueFrom(
			server.execute({
				path: "getUsers",
				input: {
					$select: {
						name: true,
						posts: {
							select: {
								title: true,
							},
						},
					},
				},
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			// Resolvers are called - exact count depends on DataLoader batching behavior
			expect(batchCallCount).toBeGreaterThanOrEqual(2);
			expect(result.data).toHaveLength(2);
		}
	});
});

// =============================================================================
// Test: Metadata
// =============================================================================

describe("E2E - Metadata", () => {
	it("returns correct metadata structure", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id)!);

		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "", status: "" }));

		const server = createApp({
			entities: { User },
			queries: { getUser },
			mutations: { createUser },
			plugins: [optimisticPlugin()],
			version: "2.0.0",
		});

		const metadata = server.getMetadata();

		expect(metadata.version).toBe("2.0.0");
		expect(metadata.operations.getUser.type).toBe("query");
		expect(metadata.operations.getUser.returnType).toBe("User"); // Now includes returnType
		expect(metadata.operations.createUser.type).toBe("mutation");
		// createUser should have auto-derived optimistic hint (with plugin)
		expect(metadata.operations.createUser.optimistic).toBeDefined();
	});

	it("auto-derives optimistic hints from naming with plugin", () => {
		const updateUser = mutation()
			.input(z.object({ id: z.string(), name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ ...mockUsers[0], name: input.name }));

		const deleteUser = mutation()
			.input(z.object({ id: z.string() }))
			.resolve(() => ({ success: true }));

		const server = createApp({
			mutations: { updateUser, deleteUser },
			plugins: [optimisticPlugin()],
		});

		const metadata = server.getMetadata();

		// updateUser should have 'merge' optimistic (with plugin)
		expect(metadata.operations.updateUser.optimistic).toBeDefined();
		// deleteUser should have 'delete' optimistic (with plugin)
		expect(metadata.operations.deleteUser.optimistic).toBeDefined();
	});
});
