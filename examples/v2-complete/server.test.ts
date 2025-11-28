/**
 * Test the V2 Complete Example
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { createClient, inProcess } from "@sylphx/lens-client";
import type { InferRouterClient } from "@sylphx/lens-core";
import { server, db, type AppRouter } from "./server";

// =============================================================================
// Setup
// =============================================================================

type Client = InferRouterClient<AppRouter>;

function createTestClient(): Client {
	return createClient({
		transport: inProcess({ server }),
	}) as unknown as Client;
}

// Reset database before each test
beforeEach(() => {
	db.users.clear();
	db.posts.clear();
	db.comments.clear();

	// Re-seed
	db.users.set("1", { id: "1", name: "Alice", email: "alice@test.com", role: "admin" as const, createdAt: new Date() });
	db.users.set("2", { id: "2", name: "Bob", email: "bob@test.com", role: "user" as const, createdAt: new Date() });
	db.users.set("3", { id: "3", name: "Charlie", email: "charlie@test.com", role: "vip" as const, createdAt: new Date() });
	db.posts.set("1", { id: "1", title: "Hello World", content: "First post!", published: true, authorId: "1", createdAt: new Date() });
	db.posts.set("2", { id: "2", title: "Lens Guide", content: "How to use Lens...", published: true, authorId: "1", createdAt: new Date() });
});

// =============================================================================
// Server Direct Execution Tests
// =============================================================================

describe("V2 Server Direct Execution", () => {
	it("executes user.whoami query", async () => {
		const result = await server.execute({ path: "user.whoami" });
		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect((result.data as { name: string }).name).toBe("Alice");
	});

	it("executes user.get query", async () => {
		const result = await server.execute({ path: "user.get", input: { id: "2" } });
		expect(result.error).toBeUndefined();
		expect((result.data as { name: string }).name).toBe("Bob");
	});

	it("executes user.search query", async () => {
		const result = await server.execute({ path: "user.search", input: { query: "al", limit: 5 } });
		expect(result.error).toBeUndefined();
		const users = result.data as Array<{ name: string }>;
		expect(users.length).toBe(1);
		expect(users[0].name).toBe("Alice");
	});

	it("executes post.trending query", async () => {
		const result = await server.execute({ path: "post.trending", input: { limit: 10 } });
		expect(result.error).toBeUndefined();
		const posts = result.data as Array<{ title: string }>;
		expect(posts.length).toBe(2);
	});
});

describe("V2 Mutations", () => {
	it("executes user.update mutation", async () => {
		const result = await server.execute({
			path: "user.update",
			input: { id: "1", name: "Alice Updated" },
		});
		expect(result.error).toBeUndefined();
		expect((result.data as { name: string }).name).toBe("Alice Updated");
	});

	it("executes post.create mutation", async () => {
		const result = await server.execute({
			path: "post.create",
			input: { title: "New Post", content: "Test content" },
		});
		expect(result.error).toBeUndefined();
		const post = result.data as { title: string; published: boolean };
		expect(post.title).toBe("New Post");
		expect(post.published).toBe(false);
	});

	it("executes post.publish mutation", async () => {
		// Create unpublished post first
		await server.execute({
			path: "post.create",
			input: { title: "Draft", content: "..." },
		});

		const result = await server.execute({
			path: "post.publish",
			input: { id: "3" },
		});
		expect(result.error).toBeUndefined();
		expect((result.data as { published: boolean }).published).toBe(true);
	});

	it("executes comment.add mutation", async () => {
		const result = await server.execute({
			path: "comment.add",
			input: { postId: "1", content: "Great post!" },
		});
		expect(result.error).toBeUndefined();
		const comment = result.data as { content: string; postId: string };
		expect(comment.content).toBe("Great post!");
		expect(comment.postId).toBe("1");
	});

	it("executes user.bulkPromote mutation", async () => {
		const result = await server.execute({
			path: "user.bulkPromote",
			input: { userIds: ["2", "3"], newRole: "vip" },
		});
		expect(result.error).toBeUndefined();
		expect((result.data as { count: number }).count).toBe(2);

		// Verify the users were promoted
		expect(db.users.get("2")?.role).toBe("vip");
		expect(db.users.get("3")?.role).toBe("vip");
	});
});

describe("V2 Server Metadata", () => {
	it("returns metadata with operations", () => {
		const metadata = server.getMetadata();
		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations).toBeDefined();

		// Check nested router structure
		expect(metadata.operations.user).toBeDefined();
		expect(metadata.operations.post).toBeDefined();
		expect(metadata.operations.comment).toBeDefined();
	});

	it("includes correct operation types", () => {
		const metadata = server.getMetadata();

		const userOps = metadata.operations.user as Record<string, { type: string }>;
		expect(userOps.whoami.type).toBe("query");
		expect(userOps.get.type).toBe("query");
		expect(userOps.update.type).toBe("mutation");

		const postOps = metadata.operations.post as Record<string, { type: string }>;
		expect(postOps.trending.type).toBe("query");
		expect(postOps.create.type).toBe("mutation");
		expect(postOps.publish.type).toBe("mutation");
	});
});

describe("V2 Client with In-Process Transport", () => {
	it("executes query via client", async () => {
		const client = createTestClient();
		const user = await client.user.get({ id: "1" });
		expect(user.name).toBe("Alice");
	});

	it("executes nested query via client", async () => {
		const client = createTestClient();
		const posts = await client.post.trending({ limit: 5 });
		expect(posts.length).toBe(2);
	});

	it("executes mutation via client", async () => {
		const client = createTestClient();
		const result = await client.user.update({ id: "1", name: "Alice Via Client" });
		expect(result.data.name).toBe("Alice Via Client");
	});

	it("handles errors correctly", async () => {
		const client = createTestClient();
		try {
			await client.user.get({ id: "non-existent" });
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect((error as Error).message).toBe("User not found");
		}
	});
});
