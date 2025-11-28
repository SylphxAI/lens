/**
 * Test the V2 Complete Example
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { createServer } from "@sylphx/lens-server";
import { createClient, inProcess } from "@sylphx/lens-client";
import { mutations, queries } from "./operations";
import { Comment, Post, User, relations } from "./schema";

// =============================================================================
// Setup - Recreate server for testing (without listen)
// =============================================================================

// Mock database
const createDb = () => ({
	user: {
		data: new Map([
			["1", { id: "1", name: "Alice", email: "alice@test.com", role: "admin" as const, createdAt: new Date() }],
			["2", { id: "2", name: "Bob", email: "bob@test.com", role: "user" as const, createdAt: new Date() }],
			["3", { id: "3", name: "Charlie", email: "charlie@test.com", role: "vip" as const, createdAt: new Date() }],
		]),
		findUnique: async function ({ where }: { where: { id: string } }) {
			return this.data.get(where.id) ?? null;
		},
		findMany: async function ({ where, take }: { where?: { name?: { contains: string }; id?: { in: string[] } }; take?: number }) {
			let results = Array.from(this.data.values());
			if (where?.name?.contains) {
				results = results.filter((u) => u.name.toLowerCase().includes(where.name!.contains.toLowerCase()));
			}
			if (where?.id?.in) {
				results = results.filter((u) => where.id!.in.includes(u.id));
			}
			return take ? results.slice(0, take) : results;
		},
		update: async function ({ where, data }: { where: { id: string }; data: Partial<{ name: string; email: string; role: string }> }) {
			const user = this.data.get(where.id);
			if (!user) throw new Error("User not found");
			const updated = { ...user, ...data };
			this.data.set(where.id, updated as typeof user);
			return updated;
		},
		updateMany: async function ({ where, data }: { where: { id: { in: string[] } }; data: Partial<{ role: string }> }) {
			let count = 0;
			for (const id of where.id.in) {
				const user = this.data.get(id);
				if (user) {
					this.data.set(id, { ...user, ...data } as typeof user);
					count++;
				}
			}
			return { count };
		},
	},
	post: {
		data: new Map([
			["1", { id: "1", title: "Hello World", content: "First post!", published: true, authorId: "1", createdAt: new Date() }],
			["2", { id: "2", title: "Lens Guide", content: "How to use Lens...", published: true, authorId: "1", createdAt: new Date() }],
		]),
		findUnique: async function ({ where }: { where: { id: string } }) {
			return this.data.get(where.id) ?? null;
		},
		findMany: async function ({ where, orderBy, take }: { where?: { published?: boolean }; orderBy?: { createdAt?: string }; take?: number }) {
			let results = Array.from(this.data.values());
			if (where?.published !== undefined) {
				results = results.filter((p) => p.published === where.published);
			}
			if (orderBy?.createdAt === "desc") {
				results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			}
			return take ? results.slice(0, take) : results;
		},
		create: async function ({ data }: { data: { title: string; content: string; authorId: string; published?: boolean } }) {
			const id = String(this.data.size + 1);
			const post = { id, ...data, published: data.published ?? false, createdAt: new Date() };
			this.data.set(id, post);
			return post;
		},
		update: async function ({ where, data }: { where: { id: string }; data: Partial<{ title: string; content: string; published: boolean; updatedAt: Date }> }) {
			const post = this.data.get(where.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, ...data };
			this.data.set(where.id, updated);
			return updated;
		},
	},
	comment: {
		data: new Map<string, { id: string; content: string; postId: string; authorId: string; createdAt: Date }>(),
		create: async function ({ data }: { data: { content: string; postId: string; authorId: string } }) {
			const id = String(this.data.size + 1);
			const comment = { id, ...data, createdAt: new Date() };
			this.data.set(id, comment);
			return comment;
		},
	},
});

let db: ReturnType<typeof createDb>;

// Entity resolvers
const entityResolvers = {
	User: {
		posts: async (user: { id: string }) => {
			return Array.from(db.post.data.values()).filter((p) => p.authorId === user.id);
		},
	},
	Post: {
		author: async (post: { authorId: string }) => {
			return db.user.data.get(post.authorId);
		},
	},
};

// Create test server
function createTestServer() {
	db = createDb();

	return createServer({
		entities: { User, Post, Comment },
		relations,
		queries,
		mutations,
		resolvers: entityResolvers,
		context: async () => ({
			db,
			currentUser: db.user.data.get("1"),
			requestId: crypto.randomUUID(),
		}),
	});
}

// =============================================================================
// Tests
// =============================================================================

describe("V2 Server Direct Execution", () => {
	it("executes whoami query", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "whoami",
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect((result.data as { name: string }).name).toBe("Alice");
	});

	it("executes getUser query", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "getUser",
			input: { id: "2" },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect((result.data as { name: string }).name).toBe("Bob");
	});

	it("executes searchUsers query", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "searchUsers",
			input: { query: "al", limit: 5 },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		const users = result.data as Array<{ name: string }>;
		expect(users.length).toBe(1);
		expect(users[0].name).toBe("Alice");
	});

	it("executes trendingPosts query", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "trendingPosts",
			input: { limit: 10 },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		const posts = result.data as Array<{ title: string }>;
		expect(posts.length).toBe(2);
	});
});

describe("V2 Mutations", () => {
	it("executes updateUser mutation", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "updateUser",
			input: { id: "1", name: "Alice Updated" },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect((result.data as { name: string }).name).toBe("Alice Updated");
	});

	it("executes createPost mutation", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "createPost",
			input: { title: "New Post", content: "Test content" },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		const post = result.data as { title: string; published: boolean };
		expect(post.title).toBe("New Post");
		expect(post.published).toBe(false);
	});

	it("executes publishPost mutation", async () => {
		const server = createTestServer();

		// First create a post
		await server.execute({
			path: "createPost",
			input: { title: "Draft", content: "..." },
		});

		// Then publish it
		const result = await server.execute({
			path: "publishPost",
			input: { id: "3" }, // New post ID
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect((result.data as { published: boolean }).published).toBe(true);
	});

	it("executes addComment mutation", async () => {
		const server = createTestServer();
		const result = await server.execute({
			path: "addComment",
			input: { postId: "1", content: "Great post!" },
		});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		const comment = result.data as { content: string; postId: string };
		expect(comment.content).toBe("Great post!");
		expect(comment.postId).toBe("1");
	});
});

describe("V2 Server Metadata", () => {
	it("returns metadata with operations", () => {
		const server = createTestServer();
		const metadata = server.getMetadata();

		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations).toBeDefined();

		// Check flat operations exist
		expect(metadata.operations.whoami).toBeDefined();
		expect(metadata.operations.getUser).toBeDefined();
		expect(metadata.operations.searchUsers).toBeDefined();
		expect(metadata.operations.updateUser).toBeDefined();
		expect(metadata.operations.createPost).toBeDefined();
	});

	it("includes correct operation types", () => {
		const server = createTestServer();
		const metadata = server.getMetadata();

		// Queries
		expect((metadata.operations.whoami as { type: string }).type).toBe("query");
		expect((metadata.operations.getUser as { type: string }).type).toBe("query");

		// Mutations
		expect((metadata.operations.updateUser as { type: string }).type).toBe("mutation");
		expect((metadata.operations.createPost as { type: string }).type).toBe("mutation");
	});
});

describe("V2 Client with In-Process Transport", () => {
	it("creates client with inProcess transport", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		expect(client).toBeDefined();
	});

	it("executes query via client", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		const user = await (client as { getUser: (input: { id: string }) => Promise<{ name: string }> }).getUser({ id: "1" });
		expect(user.name).toBe("Alice");
	});

	it("executes mutation via client", async () => {
		const server = createTestServer();
		const client = createClient({
			transport: inProcess({ server }),
		});

		const result = await (client as { updateUser: (input: { id: string; name: string }) => Promise<{ data: { name: string } }> }).updateUser({
			id: "1",
			name: "Alice Via Client",
		});
		expect(result.data.name).toBe("Alice Via Client");
	});
});
