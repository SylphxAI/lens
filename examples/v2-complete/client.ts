/**
 * V2 Complete Example - Client
 *
 * Demonstrates tRPC-style type inference:
 * - Import TYPE from server (not runtime)
 * - Links as middleware chain
 * - Automatic optimistic updates (requires mutation defs)
 */

import {
	createClient,
	// Links (middleware chain)
	loggerLink,
	retryLink,
	websocketLink,
	// Reactive utilities
	signal,
	effect,
} from "@lens/client";

// TYPE-only import from server!
import type { Api } from "./server";

// For optimistic updates, we need the mutation definitions
// (they contain the _optimistic function)
import { mutations } from "./operations";

// =============================================================================
// Create Client - tRPC Style
// =============================================================================

const client = createClient<Api>({
	// Mutations needed for optimistic updates (contains _optimistic functions)
	mutations,

	// Links = middleware chain (like tRPC)
	links: [
		// Logging middleware
		loggerLink({ enabled: process.env.NODE_ENV === "development" }),

		// Retry on failure
		retryLink({ retries: 3, delay: 1000 }),

		// Terminal link (must be last)
		websocketLink({
			url: "ws://localhost:3000/ws",
			reconnect: true,
			reconnectDelay: 1000,
		}),
	],
});

// =============================================================================
// Basic Usage - Type-safe from Server Definition
// =============================================================================

async function basicQueries() {
	console.log("\n=== Basic Queries (Type-safe) ===\n");

	// TypeScript knows: whoami() returns User
	const me = await client.whoami();
	console.log("Current user:", me);

	// TypeScript knows: getUser requires { id: string }, returns User
	const user = await client.getUser({ id: "2" });
	console.log("User:", user);

	// TypeScript knows: searchUsers requires { query: string, limit?: number }
	const results = await client.searchUsers({ query: "al", limit: 5 });
	console.log("Search results:", results.length);

	// @ts-expect-error - TypeScript catches invalid operations
	// await client.invalidOperation();

	// @ts-expect-error - TypeScript catches wrong input type
	// await client.getUser({ wrong: 123 });
}

// =============================================================================
// Field Selection
// =============================================================================

async function fieldSelection() {
	console.log("\n=== Field Selection ===\n");

	// Only fetch specific fields
	const post = await client.getPost({ id: "1" }).select({
		id: true,
		title: true,
		// Nested selection for relations
		author: {
			select: {
				name: true,
				role: true,
			},
		},
	});
	console.log("Post (selected):", post);
	// → { id: "1", title: "Hello", author: { name: "Alice", role: "admin" } }
}

// =============================================================================
// Real-time Subscriptions
// =============================================================================

async function realtimeSubscriptions() {
	console.log("\n=== Real-time Subscriptions ===\n");

	// Subscribe to user updates
	const unsub = client.getUser({ id: "1" }).subscribe((user) => {
		console.log("User 1 updated:", user?.name);
	});

	// Field-level subscription (Maximum Principle)
	const unsubName = client
		.getUser({ id: "1" })
		.select({ name: true })
		.subscribe((user) => {
			console.log("Name only:", user?.name);
		});

	// Clean up after 5 seconds
	setTimeout(() => {
		unsub();
		unsubName();
	}, 5000);
}

// =============================================================================
// Mutations with Automatic Optimistic Updates
// =============================================================================

async function mutationsDemo() {
	console.log("\n=== Mutations (Optimistic) ===\n");

	// Subscribe to see real-time updates
	const unsub = client.getUser({ id: "1" }).subscribe((user) => {
		console.log("User state:", user?.name);
	});

	await new Promise((r) => setTimeout(r, 100));

	// Mutation with automatic optimistic update
	// Timeline:
	// 1. Immediately: UI shows "Alice Updated" (from _optimistic)
	// 2. ~100ms: Server confirms, UI shows authoritative data
	// 3. If error: Auto-rollback to previous state
	console.log("Updating user...");
	const result = await client.updateUser({
		id: "1",
		name: "Alice Updated",
	});
	console.log("Server confirmed:", result.data.name);

	// Create with tempId
	console.log("Creating post...");
	const post = await client.createPost({
		title: "New Post",
		content: "Created with optimistic update!",
	});
	console.log("Post created:", post.data.id);

	// Cross-entity optimistic update
	console.log("Bulk promoting users...");
	const bulk = await client.bulkPromoteUsers({
		userIds: ["2", "3"],
		newRole: "vip",
	});
	console.log("Promoted:", bulk.data.count, "users");

	unsub();
}

// =============================================================================
// Reactive Signals (for frameworks)
// =============================================================================

async function reactiveSignals() {
	console.log("\n=== Reactive Signals ===\n");

	const userQuery = client.getUser({ id: "1" });

	// Get reactive signals
	const userSignal = userQuery.signal;
	const loadingSignal = userQuery.loading;
	const errorSignal = userQuery.error;

	// Computed value
	const displayName = signal(() => {
		if (loadingSignal.value) return "Loading...";
		if (errorSignal.value) return "Error!";
		return userSignal.value?.name ?? "Unknown";
	});

	// React to changes
	effect(() => {
		console.log("Display:", displayName.value);
	});

	// Start subscription
	userQuery.subscribe();
}

// =============================================================================
// Run Demo
// =============================================================================

async function main() {
	try {
		await basicQueries();
		await fieldSelection();
		await mutationsDemo();
		// await realtimeSubscriptions();
		// await reactiveSignals();
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
