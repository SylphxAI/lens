/**
 * V2 Complete Example - Client
 *
 * Demonstrates: Type-safe client usage with router
 *
 * Type inference works automatically from direct transport:
 * - Server carries router type via _types phantom type
 * - direct() extracts and forwards this type
 * - createClient() infers the client type automatically
 */

import { createClient, direct } from "@sylphx/lens-client";
import { app } from "./server.js";

// =============================================================================
// Create Client
// =============================================================================

// Full type inference from server - no manual type annotation needed!
const client = createClient({
	transport: direct({ app }),
});

// =============================================================================
// Basic Usage
// =============================================================================

async function basicQueries() {
	console.log("\n=== Basic Queries ===\n");

	// Get current user (no input required)
	const me = await client.user.whoami();
	console.log("Current user:", me);

	// Get user by id - use { input: {...} } pattern
	const user = await client.user.get({ input: { id: "2" } });
	console.log("User 2:", user);

	// Search users - use { input: {...} } pattern
	const results = await client.user.search({ input: { query: "al", limit: 5 } });
	console.log("Search results:", results.length);
}

// =============================================================================
// Mutations
// =============================================================================

async function mutations() {
	console.log("\n=== Mutations ===\n");

	// Update user - use { input: {...} } pattern
	const updated = await client.user.update({
		input: { id: "1", name: "Alice Updated" },
	});
	console.log("Updated user:", updated);

	// Create post - use { input: {...} } pattern
	const post = await client.post.create({
		input: { title: "New Post", content: "Created via client!" },
	});
	console.log("Created post:", post);

	// Publish post - use { input: {...} } pattern
	const published = await client.post.publish({ input: { id: "1" } });
	console.log("Published post:", published);

	// Add comment - use { input: {...} } pattern
	const comment = await client.comment.add({
		input: { postId: "1", content: "Great post!" },
	});
	console.log("Added comment:", comment);
}

// =============================================================================
// Run Demo
// =============================================================================

async function main() {
	try {
		await basicQueries();
		await mutations();
		console.log("\n✅ All operations completed successfully!\n");
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
