/**
 * @lens - End-to-End Server-Client Tests
 *
 * Full integration tests testing the complete flow:
 * Server creation → Client requests → Resolver execution → Response
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSchema, t } from "@lens/core";
import { createServer, type LensServer, createResolvers } from "../index";

// =============================================================================
// Test Schema
// =============================================================================

const schema = createSchema({
	User: {
		id: t.id(),
		name: t.string(),
		email: t.string(),
		bio: t.string().nullable(),
		posts: t.hasMany("Post"),
	},
	Post: {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		authorId: t.string(),
		author: t.belongsTo("User"),
	},
});

// =============================================================================
// Test Data Factory
// =============================================================================

function createTestData() {
	// Create users without posts (to avoid circular references)
	const users = new Map<string, { id: string; name: string; email: string; bio: string | null; posts: { id: string; title: string }[] }>([
		["1", { id: "1", name: "Alice", email: "alice@test.com", bio: "Developer", posts: [] }],
		["2", { id: "2", name: "Bob", email: "bob@test.com", bio: null, posts: [] }],
	]);

	// Create posts with author info (not actual user object to avoid cycles)
	const posts = new Map<string, { id: string; title: string; content: string; authorId: string; author: { id: string; name: string; email: string } }>([
		["p1", { id: "p1", title: "First Post", content: "Hello world", authorId: "1", author: { id: "1", name: "Alice", email: "alice@test.com" } }],
		["p2", { id: "p2", title: "Second Post", content: "Another post", authorId: "1", author: { id: "1", name: "Alice", email: "alice@test.com" } }],
	]);

	// Add post references to users (just id and title to avoid cycles)
	users.get("1")!.posts = [{ id: "p1", title: "First Post" }, { id: "p2", title: "Second Post" }];

	return { users, posts };
}

// =============================================================================
// Tests
// =============================================================================

describe("E2E: Server-Client", () => {
	let server: LensServer<typeof schema.definition, { db: object }>;
	let testData: ReturnType<typeof createTestData>;

	beforeEach(() => {
		// Create fresh test data for each test
		testData = createTestData();
		const { users, posts } = testData;

		// Create resolvers
		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => users.get(id) ?? null,
				list: async () => Array.from(users.values()),
				create: async (input) => {
					const id = `user_${Date.now()}`;
					const user = { ...input, id, posts: [] } as { id: string; name: string; email: string; bio: string | null; posts: unknown[] };
					users.set(id, user);
					return user;
				},
				update: async (input) => {
					const existing = users.get(input.id);
					if (!existing) throw new Error("User not found");
					const updated = { ...existing, ...input };
					users.set(input.id, updated);
					return updated;
				},
				delete: async (id) => {
					return users.delete(id);
				},
			},
			Post: {
				resolve: async (id) => posts.get(id) ?? null,
				list: async ({ where } = {}) => {
					const all = Array.from(posts.values());
					if (where?.authorId) {
						return all.filter((p) => p.authorId === where.authorId);
					}
					return all;
				},
			},
		});

		// Create server
		server = createServer({
			schema,
			resolvers,
			context: () => ({ db: {} }),
			version: "1.0.0",
		});
	});

	afterEach(async () => {
		await server.close();
	});

	describe("HTTP Requests", () => {
		it("handles GET operation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "get",
						input: { id: "1" },
					}),
				}),
			);

			const data = await response.json();
			if (response.status !== 200) {
				console.error("Error response:", data);
			}
			expect(response.status).toBe(200);
			expect(data.data.id).toBe("1");
			expect(data.data.name).toBe("Alice");
		});

		it("handles GET with field selection", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "get",
						input: { id: "1", select: { name: true } },
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.id).toBe("1"); // id always included
			expect(data.data.name).toBe("Alice");
			expect(data.data.email).toBeUndefined();
			expect(data.data.bio).toBeUndefined();
		});

		it("handles LIST operation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "list",
						input: {},
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(Array.isArray(data.data)).toBe(true);
			expect(data.data.length).toBeGreaterThanOrEqual(2);
		});

		it("handles CREATE operation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "create",
						input: { name: "Charlie", email: "charlie@test.com", bio: "New user" },
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.name).toBe("Charlie");
			expect(data.data.id).toBeDefined();
		});

		it("handles UPDATE operation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "update",
						input: { id: "1", name: "Alice Updated" },
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.name).toBe("Alice Updated");
		});

		it("handles DELETE operation", async () => {
			// First create a user to delete
			await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "create",
						input: { name: "ToDelete", email: "delete@test.com" },
					}),
				}),
			);

			// Find the created user
			const listResponse = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "list",
						input: {},
					}),
				}),
			);
			const listData = await listResponse.json();
			const toDelete = listData.data.find((u: { name: string }) => u.name === "ToDelete");

			if (toDelete) {
				const response = await server.handleRequest(
					new Request("http://localhost/api", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							entity: "User",
							operation: "delete",
							input: { id: toDelete.id },
						}),
					}),
				);

				expect(response.status).toBe(200);
			}
		});

		it("returns 405 for non-POST requests", async () => {
			const response = await server.handleRequest(new Request("http://localhost/api", { method: "GET" }));

			expect(response.status).toBe(405);
		});

		it("returns 400 for invalid operation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "invalid",
						input: {},
					}),
				}),
			);

			expect(response.status).toBe(400);
		});

		it("returns 500 for resolver errors", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "update",
						input: { id: "nonexistent", name: "Test" },
					}),
				}),
			);

			expect(response.status).toBe(500);
			const data = await response.json();
			expect(data.error.code).toBe("EXECUTION_ERROR");
		});
	});

	describe("Relations", () => {
		it("fetches entity with nested relation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "Post",
						operation: "get",
						input: {
							id: "p1",
							select: {
								title: true,
								author: { select: { name: true } },
							},
						},
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.title).toBe("First Post");
			expect(data.data.author.name).toBe("Alice");
			expect(data.data.author.email).toBeUndefined(); // not selected
		});

		it("fetches entity with hasMany relation", async () => {
			const response = await server.handleRequest(
				new Request("http://localhost/api", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entity: "User",
						operation: "get",
						input: {
							id: "1",
							select: {
								name: true,
								posts: { select: { title: true } },
							},
						},
					}),
				}),
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.name).toBe("Alice");
			expect(Array.isArray(data.data.posts)).toBe(true);
			expect(data.data.posts[0].title).toBeDefined();
			expect(data.data.posts[0].content).toBeUndefined(); // not selected
		});
	});

});

describe("E2E: Field Selection Edge Cases", () => {
	let server: LensServer<typeof schema.definition, { db: object }>;
	let testData: ReturnType<typeof createTestData>;

	beforeEach(() => {
		// Create fresh test data for each test
		testData = createTestData();
		const { users, posts } = testData;

		const resolvers = createResolvers(schema, {
			User: {
				resolve: async (id) => users.get(id) ?? null,
			},
			Post: {
				resolve: async (id) => posts.get(id) ?? null,
			},
		});

		server = createServer({
			schema,
			resolvers,
			context: () => ({ db: {} }),
		});
	});

	afterEach(async () => {
		await server.close();
	});

	it("returns null for non-existent entity", async () => {
		const response = await server.handleRequest(
			new Request("http://localhost/api", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					entity: "User",
					operation: "get",
					input: { id: "nonexistent" },
				}),
			}),
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.data).toBeNull();
	});

	it("handles selection with false values", async () => {
		const response = await server.handleRequest(
			new Request("http://localhost/api", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					entity: "User",
					operation: "get",
					input: {
						id: "1",
						select: { name: true, email: false, bio: true },
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.data.name).toBe("Alice");
		expect(data.data.bio).toBe("Developer");
		expect(data.data.email).toBeUndefined();
	});
});
