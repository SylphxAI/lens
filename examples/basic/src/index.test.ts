/**
 * Test the Lens example app
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { app, db, type AppRouter } from "./server";
import { createClient, direct } from "@sylphx/lens-client";
import type { InferRouterClient } from "@sylphx/lens-core";
import { firstValueFrom, isError, isSnapshot } from "@sylphx/lens-core";

// =============================================================================
// Setup
// =============================================================================

// Create typed client from router
type Client = InferRouterClient<AppRouter>;

// Create client with in-process transport (direct execution)
function createTestClient(): Client {
	return createClient({
		transport: direct({ app }),
	}) as unknown as Client;
}

// Reset database before each test
beforeEach(() => {
	db.users.clear();
	db.posts.clear();

	// Re-seed
	db.users.set("user-1", { id: "user-1", name: "Alice", email: "alice@example.com", createdAt: new Date() });
	db.users.set("user-2", { id: "user-2", name: "Bob", email: "bob@example.com", createdAt: new Date() });
	db.posts.set("post-1", { id: "post-1", title: "Hello World", content: "My first post", published: true, authorId: "user-1", createdAt: new Date() });
});

// =============================================================================
// Tests
// =============================================================================

describe("Server Direct Execution", () => {
	it("executes queries via app.execute()", async () => {
		const result = await firstValueFrom(
			app.execute({
				path: "user.get",
				input: { id: "user-1" },
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toBeDefined();
			expect((result.data as { name: string }).name).toBe("Alice");
		}
	});

	it("executes mutations via app.execute()", async () => {
		const result = await firstValueFrom(
			app.execute({
				path: "user.create",
				input: { name: "Charlie", email: "charlie@example.com" },
			}),
		);

		expect(isSnapshot(result)).toBe(true);
		if (isSnapshot(result)) {
			expect(result.data).toBeDefined();
			expect((result.data as { name: string }).name).toBe("Charlie");
			expect(db.users.size).toBe(3);
		}
	});

	it("returns error for non-existent entity", async () => {
		const result = await firstValueFrom(
			app.execute({
				path: "user.get",
				input: { id: "non-existent" },
			}),
		);

		expect(isError(result)).toBe(true);
		if (isError(result)) {
			expect(result.error).toBe("User not found");
		}
	});
});

describe("Client Type Inference", () => {
	it("creates typed client from router", () => {
		const client = createTestClient();

		// These should all be defined (type check)
		expect(client.user).toBeDefined();
		expect(client.post).toBeDefined();
	});

	it("queries user by id", async () => {
		const client = createTestClient();
		const user = await client.user.get({ id: "user-1" }) as { id: string; name: string; email: string };

		expect(user.id).toBe("user-1");
		expect(user.name).toBe("Alice");
		expect(user.email).toBe("alice@example.com");
	});

	it("lists all users", async () => {
		const client = createTestClient();
		const users = await client.user.list();

		expect(users.length).toBe(2);
		expect(users.map(u => u.name).sort()).toEqual(["Alice", "Bob"]);
	});

	it("creates new user", async () => {
		const client = createTestClient();
		const result = await client.user.create({ name: "Charlie", email: "charlie@example.com" });
		const user = result.data;

		expect(user.name).toBe("Charlie");
		expect(user.id).toBeDefined();

		// Verify in database
		expect(db.users.size).toBe(3);
	});
});

describe("Post Operations", () => {
	it("queries posts by author", async () => {
		const client = createTestClient();
		const posts = await client.post.byAuthor({ authorId: "user-1" }) as { title: string }[];

		expect(posts.length).toBe(1);
		expect(posts[0].title).toBe("Hello World");
	});

	it("creates and publishes post", async () => {
		const client = createTestClient();

		const createResult = await client.post.create({
			title: "New Post",
			content: "Some content",
			authorId: "user-1",
		}) as { data: { id: string; published: boolean } };
		const post = createResult.data;

		expect(post.published).toBe(false);

		// Publish it
		const publishResult = await client.post.publish({ id: post.id }) as { data: { published: boolean } };
		expect(publishResult.data.published).toBe(true);
	});

	it("updates post", async () => {
		const client = createTestClient();

		const result = await client.post.update({
			id: "post-1",
			title: "Updated Title",
		}) as { data: { title: string; content: string } };
		const updated = result.data;

		expect(updated.title).toBe("Updated Title");
		expect(updated.content).toBe("My first post"); // unchanged
	});

	it("deletes post", async () => {
		const client = createTestClient();

		const result = await client.post.delete({ id: "post-1" }) as { data: { success: boolean } };
		expect(result.data.success).toBe(true);
		expect(db.posts.size).toBe(0);
	});
});

describe("Server Metadata", () => {
	it("returns metadata with operations", () => {
		const metadata = app.getMetadata();

		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations).toBeDefined();

		// Check nested structure
		expect(metadata.operations.user).toBeDefined();
		expect(metadata.operations.post).toBeDefined();

		// Check that publish is a mutation
		const postOps = metadata.operations.post as Record<string, { type: string }>;
		expect(postOps.publish.type).toBe("mutation");
	});

	it("includes optimistic config in metadata", () => {
		const metadata = app.getMetadata();

		// Check optimistic configs are present (sugar is converted to Reify Pipeline)
		const userCreate = metadata.operations.user as unknown as { create: { optimistic?: { $pipe: unknown[] } } };
		expect(userCreate.create.optimistic?.$pipe).toBeDefined();
		expect((userCreate.create.optimistic?.$pipe[0] as { $do: string }).$do).toBe("entity.create");

		const postPublish = metadata.operations.post as unknown as { publish: { optimistic?: { $pipe: unknown[] } } };
		expect(postPublish.publish.optimistic?.$pipe).toBeDefined();
		expect((postPublish.publish.optimistic?.$pipe[0] as { $do: string }).$do).toBe("entity.update");
	});
});
