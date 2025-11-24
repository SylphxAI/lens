/**
 * @lens/client - Reactive Integration Tests
 *
 * End-to-end tests for the reactive architecture.
 * Tests: client → subscription manager → server handler → push update → client
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
	createSubscriptionManager,
	createQueryResolver,
	type SubscriptionTransport,
	type UpdateMessage,
	type ServerMessage,
} from "./index";
import { createSubscriptionHandler, type SubscriptionClient } from "@lens/server";

describe("Reactive Integration", () => {
	describe("Client ↔ Server Subscription Flow", () => {
		it("complete flow: subscribe → push update → receive", async () => {
			// Create client-side components
			const clientManager = createSubscriptionManager();
			const resolver = createQueryResolver(clientManager);

			// Create server-side handler
			const serverHandler = createSubscriptionHandler();

			// Track messages between client and server
			const clientToServer: ServerMessage[] = [];
			const serverToClient: UpdateMessage[] = [];

			// Set up mock transport (simulates WebSocket)
			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					clientToServer.push(msg);
					// Simulate server receiving message
					serverHandler.handleMessage("client-1", msg);
				},
				onUpdate: (handler) => {
					// Store handler for server to call
					(clientTransport as { _handler?: (msg: UpdateMessage) => void })._handler = handler;
				},
			};

			// Set up server client
			serverHandler.addClient({
				id: "client-1",
				send: (msg) => {
					serverToClient.push(msg);
					// Simulate client receiving update
					const handler = (clientTransport as { _handler?: (msg: UpdateMessage) => void })._handler;
					if (handler) {
						handler(msg);
					}
				},
				close: () => {},
			});

			// Connect transport
			clientManager.setTransport(clientTransport);

			// Set up query transport
			resolver.setTransport({
				fetch: async (entityName, entityId) => ({
					id: entityId,
					name: `User ${entityId}`,
					bio: "Hello",
				}),
				fetchList: async () => [],
			});

			// Step 1: Client subscribes to entity
			const result = await resolver.resolveEntity<{ id: string; name: string; bio: string }>(
				"User",
				"123",
			);

			expect(result.signal.$.name.value).toBe("User 123");

			// Wait for batched subscription to send
			await new Promise((resolve) => setTimeout(resolve, 20));

			// Step 2: Verify server received subscription
			expect(serverHandler.hasSubscribers("User", "123")).toBe(true);

			// Step 3: Server pushes update
			serverHandler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "Updated Name",
			});

			// Step 4: Verify client received update
			expect(result.signal.$.name.value).toBe("Updated Name");
		});

		it("field-level subscription: only subscribed fields updated", async () => {
			const clientManager = createSubscriptionManager();
			const serverHandler = createSubscriptionHandler();

			// Set up transport
			const clientTransport: SubscriptionTransport = {
				send: (msg) => serverHandler.handleMessage("client-1", msg),
				onUpdate: () => {},
			};

			let lastUpdate: UpdateMessage | null = null;
			serverHandler.addClient({
				id: "client-1",
				send: (msg) => {
					lastUpdate = msg;
					clientManager.handleServerUpdate(msg);
				},
				close: () => {},
			});

			clientManager.setTransport(clientTransport);

			// Create subscription for only 'name' field
			const sub = clientManager.getOrCreateSubscription("User", "123", {
				name: "John",
				bio: "Hello",
				email: "john@example.com",
			});

			// Subscribe to only 'name'
			clientManager.subscribeField("User", "123", "name");

			await new Promise((resolve) => setTimeout(resolve, 20));

			// Server pushes update to 'name' - should be received
			serverHandler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "Jane",
			});

			expect(sub.signal.$.name.value).toBe("Jane");
			expect(lastUpdate?.field).toBe("name");

			// Server pushes update to 'bio' - should NOT be received (not subscribed)
			lastUpdate = null;
			serverHandler.pushUpdate("User", "123", "bio", {
				strategy: "value",
				data: "New bio",
			});

			// Client is not subscribed to 'bio', so no update
			expect(lastUpdate).toBe(null);
			expect(sub.signal.$.bio.value).toBe("Hello"); // Original value
		});

		it("delta update for streaming text", async () => {
			const clientManager = createSubscriptionManager();
			const serverHandler = createSubscriptionHandler();

			// Set up transport
			const clientTransport: SubscriptionTransport = {
				send: (msg) => serverHandler.handleMessage("client-1", msg),
				onUpdate: () => {},
			};

			serverHandler.addClient({
				id: "client-1",
				send: (msg) => clientManager.handleServerUpdate(msg),
				close: () => {},
			});

			clientManager.setTransport(clientTransport);

			// Create subscription
			const sub = clientManager.getOrCreateSubscription("Message", "456", {
				content: "Hello",
			});

			clientManager.subscribeFullEntity("Message", "456");
			await new Promise((resolve) => setTimeout(resolve, 20));

			// Server pushes delta update (streaming text)
			serverHandler.pushUpdate("Message", "456", "content", {
				strategy: "delta",
				data: [{ position: 5, insert: " World" }],
			});

			expect(sub.signal.$.content.value).toBe("Hello World");

			// Another delta
			serverHandler.pushUpdate("Message", "456", "content", {
				strategy: "delta",
				data: [{ position: 11, insert: "!" }],
			});

			expect(sub.signal.$.content.value).toBe("Hello World!");
		});

		it("multiple clients receive updates independently", async () => {
			const serverHandler = createSubscriptionHandler();

			// Create two clients
			const client1Updates: UpdateMessage[] = [];
			const client2Updates: UpdateMessage[] = [];

			serverHandler.addClient({
				id: "client-1",
				send: (msg) => client1Updates.push(msg),
				close: () => {},
			});

			serverHandler.addClient({
				id: "client-2",
				send: (msg) => client2Updates.push(msg),
				close: () => {},
			});

			// Client 1 subscribes to 'name' only
			serverHandler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			// Client 2 subscribes to all fields
			serverHandler.handleMessage("client-2", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			// Push name update
			serverHandler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "New Name",
			});

			expect(client1Updates.length).toBe(1);
			expect(client2Updates.length).toBe(1);

			// Push bio update
			serverHandler.pushUpdate("User", "123", "bio", {
				strategy: "value",
				data: "New Bio",
			});

			// Only client 2 should receive bio update
			expect(client1Updates.length).toBe(1); // Still 1
			expect(client2Updates.length).toBe(2); // Now 2
		});

		it("refCount tracking: unsubscribe when no more refs", async () => {
			const clientManager = createSubscriptionManager();
			const serverHandler = createSubscriptionHandler();

			const unsubscribeMessages: ServerMessage[] = [];

			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					if (msg.type === "unsubscribe") {
						unsubscribeMessages.push(msg);
					}
					serverHandler.handleMessage("client-1", msg);
				},
				onUpdate: () => {},
			};

			serverHandler.addClient({
				id: "client-1",
				send: () => {},
				close: () => {},
			});

			clientManager.setTransport(clientTransport);

			// Create subscription
			clientManager.getOrCreateSubscription("User", "123", { name: "John" });

			// Subscribe twice
			clientManager.subscribeField("User", "123", "name");
			clientManager.subscribeField("User", "123", "name");

			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(serverHandler.hasSubscribers("User", "123")).toBe(true);

			// Unsubscribe once - still subscribed (refCount = 1)
			clientManager.unsubscribeField("User", "123", "name");
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(unsubscribeMessages.length).toBe(0);
			expect(serverHandler.hasSubscribers("User", "123")).toBe(true);

			// Unsubscribe again - now fully unsubscribed (refCount = 0)
			clientManager.unsubscribeField("User", "123", "name");
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(unsubscribeMessages.length).toBe(1);
		});
	});

	describe("Query Deduplication", () => {
		it("derives partial query from full subscription", async () => {
			const clientManager = createSubscriptionManager();
			const resolver = createQueryResolver(clientManager);

			let fetchCount = 0;
			resolver.setTransport({
				fetch: async (entityName, entityId) => {
					fetchCount++;
					return { id: entityId, name: "John", bio: "Hello", email: "john@example.com" };
				},
				fetchList: async () => [],
			});

			// First query: full entity
			const fullResult = await resolver.resolveEntity<{
				id: string;
				name: string;
				bio: string;
				email: string;
			}>("User", "123");

			expect(fetchCount).toBe(1);
			expect(fullResult.derived).toBe(false);

			// Second query: partial (name only) - should derive
			const partialResult = await resolver.resolveEntity<{ name: string }>(
				"User",
				"123",
				["name"],
			);

			expect(fetchCount).toBe(1); // No additional fetch
			expect(partialResult.derived).toBe(true);
			expect(partialResult.signal.$.name.value).toBe("John");
		});

		it("concurrent queries deduplicated", async () => {
			const clientManager = createSubscriptionManager();
			const resolver = createQueryResolver(clientManager);

			let fetchCount = 0;
			resolver.setTransport({
				fetch: async (entityName, entityId) => {
					fetchCount++;
					await new Promise((resolve) => setTimeout(resolve, 10));
					return { id: entityId, name: "John" };
				},
				fetchList: async () => [],
			});

			// Three concurrent queries for same entity
			const [r1, r2, r3] = await Promise.all([
				resolver.resolveEntity<{ id: string; name: string }>("User", "123"),
				resolver.resolveEntity<{ id: string; name: string }>("User", "123"),
				resolver.resolveEntity<{ id: string; name: string }>("User", "123"),
			]);

			expect(fetchCount).toBe(1); // Only one fetch
			expect(r1.signal).toBe(r2.signal);
			expect(r2.signal).toBe(r3.signal);
		});
	});
});
