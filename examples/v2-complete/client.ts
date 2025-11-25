/**
 * V2 Complete Example - Client
 *
 * Demonstrates all client features:
 * - Flat namespace API (client.whoami vs client.query.whoami)
 * - Field selection (.select())
 * - Subscriptions (real-time updates)
 * - Automatic optimistic updates
 * - Query deduplication (canDerive)
 */

import { createClient, websocketLink, signal, effect } from "@lens/client";
import { queries, mutations } from "./operations";

// =============================================================================
// Create Client
// =============================================================================

const client = createClient({
	queries,
	mutations,
	transport: websocketLink({
		url: "ws://localhost:3000/ws",
		// Auto-reconnect on disconnect
		reconnect: true,
		reconnectDelay: 1000,
	}),
	// Optimistic updates enabled by default
	optimistic: true,
});

// =============================================================================
// Basic Usage - One-time Queries
// =============================================================================

async function basicQueries() {
	console.log("\n=== Basic Queries ===\n");

	// 1. Simple query (no input)
	const me = await client.whoami();
	console.log("Current user:", me);
	// → { id: "1", name: "Alice", email: "alice@test.com", role: "admin" }

	// 2. Query with input
	const user = await client.getUser({ id: "2" });
	console.log("User 2:", user);
	// → { id: "2", name: "Bob", ... }

	// 3. Search query (free-form operation)
	const results = await client.searchUsers({ query: "al", limit: 5 });
	console.log("Search results:", results);
	// → [{ id: "1", name: "Alice", ... }]

	// 4. Query with field selection (only fetch what you need)
	const post = await client.getPost({ id: "1" }).select({
		id: true,
		title: true,
		// Nested selection for relations
		author: {
			select: {
				name: true,
			},
		},
	});
	console.log("Post (selected fields):", post);
	// → { id: "1", title: "Hello World", author: { name: "Alice" } }
}

// =============================================================================
// Subscriptions - Real-time Updates
// =============================================================================

async function realtimeSubscriptions() {
	console.log("\n=== Real-time Subscriptions ===\n");

	// 1. Subscribe to current user (全部 fields)
	const unsubMe = client.whoami().subscribe((user) => {
		console.log("whoami updated:", user);
	});

	// 2. Subscribe with field selection (只收特定 fields 嘅更新)
	const unsubUser = client
		.getUser({ id: "1" })
		.select({ name: true, role: true })
		.subscribe((user) => {
			console.log("User 1 name/role changed:", user);
		});

	// 3. 最大原則 (Maximum Principle)
	//    - 如果已經有全部 fields 嘅 subscription
	//    - 新嘅 field subscription 會 share 同一個 connection
	const unsubName = client
		.getUser({ id: "1" })
		.select({ name: true }) // ← shares existing subscription!
		.subscribe((user) => {
			console.log("User 1 name:", user.name);
		});

	// Clean up after 10 seconds
	setTimeout(() => {
		unsubMe();
		unsubUser();
		unsubName();
		console.log("Unsubscribed all");
	}, 10000);
}

// =============================================================================
// Reactive Signals
// =============================================================================

async function reactiveSignals() {
	console.log("\n=== Reactive Signals ===\n");

	// Get reactive signal
	const userResult = client.getUser({ id: "1" });

	// Access signal for reactive frameworks
	const userSignal = userResult.signal;
	const loadingSignal = userResult.loading;
	const errorSignal = userResult.error;

	// Create derived computation
	const displayName = signal(() => {
		const user = userSignal.value;
		const loading = loadingSignal.value;
		if (loading) return "Loading...";
		if (!user) return "Unknown";
		return `${user.name} (${user.role})`;
	});

	// React to changes
	effect(() => {
		console.log("Display name:", displayName.value);
	});

	// Subscribe to start receiving updates
	userResult.subscribe();
}

// =============================================================================
// Mutations with Optimistic Updates
// =============================================================================

async function mutationsWithOptimistic() {
	console.log("\n=== Mutations with Optimistic Updates ===\n");

	// First, subscribe to see the updates
	const unsubscribe = client.getUser({ id: "1" }).subscribe((user) => {
		console.log("User updated:", user?.name, user?.role);
	});

	// Wait for initial data
	await new Promise((r) => setTimeout(r, 100));

	// 1. Simple mutation with automatic optimistic update
	//    → UI updates IMMEDIATELY, before server response
	console.log("\nUpdating user name...");
	const result = await client.updateUser({
		id: "1",
		name: "Alice Updated",
	});
	console.log("Server confirmed:", result.data);

	// 2. Mutation that might fail - automatic rollback
	console.log("\nTrying invalid update...");
	try {
		await client.updateUser({
			id: "999", // doesn't exist
			name: "Ghost",
		});
	} catch (error) {
		console.log("Failed, UI rolled back automatically");
	}

	// 3. Create with tempId
	console.log("\nCreating post...");
	const post = await client.createPost({
		title: "New Post",
		content: "Created optimistically!",
	});
	console.log("Post created:", post.data);
	// During mutation: { id: "temp_0", title: "New Post", ... }
	// After server:    { id: "3", title: "New Post", ... }

	// 4. Manual rollback if needed
	const updateResult = await client.updatePost({
		id: "1",
		title: "Changed Title",
	});
	// Can manually rollback if needed
	// updateResult.rollback?.();

	unsubscribe();
}

// =============================================================================
// Cross-Entity Optimistic Updates
// =============================================================================

async function crossEntityOptimistic() {
	console.log("\n=== Cross-Entity Optimistic Updates ===\n");

	// Subscribe to multiple users
	const unsub1 = client.getUser({ id: "2" }).subscribe((u) => console.log("User 2:", u?.role));
	const unsub2 = client.getUser({ id: "3" }).subscribe((u) => console.log("User 3:", u?.role));

	await new Promise((r) => setTimeout(r, 100));

	// Bulk update - affects multiple entities at once
	console.log("\nPromoting users to VIP...");
	const result = await client.bulkPromoteUsers({
		userIds: ["2", "3"],
		newRole: "vip",
	});
	console.log("Promoted", result.data.count, "users");

	// Both User 2 and User 3 subscriptions updated immediately
	// with optimistic data, then confirmed with server data

	unsub1();
	unsub2();
}

// =============================================================================
// Query Deduplication (canDerive)
// =============================================================================

async function queryDeduplication() {
	console.log("\n=== Query Deduplication ===\n");

	// These requests are deduplicated:
	// - Same operation + input = shared request
	// - Field selection: if full subscription exists, derive from it

	console.log("Firing 3 parallel requests for same user...");
	const [user1, user2, user3] = await Promise.all([
		client.getUser({ id: "1" }),
		client.getUser({ id: "1" }),
		client.getUser({ id: "1" }),
	]);

	console.log("All resolved from single network request:");
	console.log("user1 === user2:", user1 === user2); // true (same reference)

	// Field selection derives from existing subscription
	const fullSub = client.getUser({ id: "1" }).subscribe();

	// This doesn't make a new request - derives from fullSub
	const nameOnly = await client.getUser({ id: "1" }).select({ name: true });
	console.log("Derived name:", nameOnly);

	fullSub();
}

// =============================================================================
// With React (using @lens/react)
// =============================================================================

/*
import { useQuery, useMutation } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  // Automatically subscribes, unsubscribes on unmount
  const { data: user, loading, error } = useQuery(
    client.getUser({ id: userId })
      .select({ name: true, email: true, role: true })
  );

  const updateUser = useMutation(client.updateUser);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button onClick={() => updateUser({ id: userId, role: 'vip' })}>
        Upgrade to VIP
      </button>
    </div>
  );
}
*/

// =============================================================================
// Run Demo
// =============================================================================

async function main() {
	try {
		await basicQueries();
		await mutationsWithOptimistic();
		await crossEntityOptimistic();
		await queryDeduplication();

		// Uncomment to test real-time
		// await realtimeSubscriptions();
		// await reactiveSignals();
	} catch (error) {
		console.error("Demo error:", error);
	}
}

main();
