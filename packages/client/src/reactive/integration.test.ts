/**
 * @sylphx/client - Reactive Integration Tests
 *
 * End-to-end tests for the reactive architecture.
 * Tests: client → subscription manager → server (GraphStateManager) → push update → client
 */

import { describe, it, expect } from "bun:test";
import {
	createSubscriptionManager,
	createQueryResolver,
	type SubscriptionTransport,
	type UpdateMessage,
	type ServerMessage,
} from "./index";
import { GraphStateManager, type StateClient } from "@sylphx/server";

describe("Reactive Integration", () => {
	describe("Client ↔ Server Subscription Flow", () => {
		it("complete flow: subscribe → push update → receive", async () => {
			// Create client-side components
			const clientManager = createSubscriptionManager();
			const resolver = createQueryResolver(clientManager);

			// Create server-side state manager
			const stateManager = new GraphStateManager();

			// Track messages between client and server
			const clientToServer: ServerMessage[] = [];

			// Set up mock transport (simulates WebSocket)
			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					clientToServer.push(msg);
					// Simulate server processing message
					if (msg.type === "subscribe") {
						stateManager.subscribe("client-1", msg.entity, msg.id, msg.fields);
					} else if (msg.type === "unsubscribe") {
						stateManager.unsubscribe("client-1", msg.entity, msg.id);
					}
				},
				onUpdate: (handler) => {
					// Store handler for server to call
					(clientTransport as { _handler?: (msg: UpdateMessage) => void })._handler = handler;
				},
			};

			// Set up server client
			const serverClient: StateClient = {
				id: "client-1",
				send: (msg) => {
					// Convert GraphStateManager message format to client UpdateMessage format
					const updates = msg.updates;
					for (const [field, update] of Object.entries(updates)) {
						const updateMsg: UpdateMessage = {
							type: "update",
							entity: msg.entity,
							id: msg.id,
							field,
							update,
						};
						const handler = (clientTransport as { _handler?: (msg: UpdateMessage) => void })._handler;
						if (handler) {
							handler(updateMsg);
						}
					}
				},
			};
			stateManager.addClient(serverClient);

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
			expect(stateManager.hasSubscribers("User", "123")).toBe(true);

			// Step 3: Server pushes update via emit
			stateManager.emit("User", "123", { name: "Updated Name" });

			// Step 4: Verify client received update
			expect(result.signal.$.name.value).toBe("Updated Name");
		});

		it("field-level subscription: only subscribed fields updated", async () => {
			const clientManager = createSubscriptionManager();
			const stateManager = new GraphStateManager();

			// Set up transport
			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					if (msg.type === "subscribe") {
						stateManager.subscribe("client-1", msg.entity, msg.id, msg.fields);
					}
				},
				onUpdate: () => {},
			};

			let lastUpdate: UpdateMessage | null = null;
			const serverClient: StateClient = {
				id: "client-1",
				send: (msg) => {
					for (const [field, update] of Object.entries(msg.updates)) {
						const updateMsg: UpdateMessage = {
							type: "update",
							entity: msg.entity,
							id: msg.id,
							field,
							update,
						};
						lastUpdate = updateMsg;
						clientManager.handleServerUpdate(updateMsg);
					}
				},
			};
			stateManager.addClient(serverClient);

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

			// Server pushes update - GraphStateManager will only send subscribed fields
			stateManager.emit("User", "123", { name: "Jane", bio: "New bio" });

			expect(sub.signal.$.name.value).toBe("Jane");
			expect(lastUpdate?.field).toBe("name");
			// bio should not have been sent since client only subscribed to 'name'
			expect(sub.signal.$.bio.value).toBe("Hello"); // Original value
		});

		it("delta update for streaming text", async () => {
			const clientManager = createSubscriptionManager();
			const stateManager = new GraphStateManager();

			// Set up transport
			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					if (msg.type === "subscribe") {
						stateManager.subscribe("client-1", msg.entity, msg.id, msg.fields);
					}
				},
				onUpdate: () => {},
			};

			const serverClient: StateClient = {
				id: "client-1",
				send: (msg) => {
					for (const [field, update] of Object.entries(msg.updates)) {
						clientManager.handleServerUpdate({
							type: "update",
							entity: msg.entity,
							id: msg.id,
							field,
							update,
						});
					}
				},
			};
			stateManager.addClient(serverClient);

			clientManager.setTransport(clientTransport);

			// Create subscription
			const sub = clientManager.getOrCreateSubscription("Message", "456", {
				content: "Hello",
			});

			clientManager.subscribeFullEntity("Message", "456");
			await new Promise((resolve) => setTimeout(resolve, 20));

			// Server pushes updates - GraphStateManager will auto-select strategy
			stateManager.emit("Message", "456", { content: "Hello World" });
			expect(sub.signal.$.content.value).toBe("Hello World");

			stateManager.emit("Message", "456", { content: "Hello World!" });
			expect(sub.signal.$.content.value).toBe("Hello World!");
		});

		it("multiple clients receive updates independently", async () => {
			const stateManager = new GraphStateManager();

			// Create two clients
			const client1Updates: string[] = [];
			const client2Updates: string[] = [];

			stateManager.addClient({
				id: "client-1",
				send: (msg) => {
					for (const field of Object.keys(msg.updates)) {
						client1Updates.push(field);
					}
				},
			});

			stateManager.addClient({
				id: "client-2",
				send: (msg) => {
					for (const field of Object.keys(msg.updates)) {
						client2Updates.push(field);
					}
				},
			});

			// Client 1 subscribes to 'name' only
			stateManager.subscribe("client-1", "User", "123", ["name"]);

			// Client 2 subscribes to all fields
			stateManager.subscribe("client-2", "User", "123", "*");

			// Push updates
			stateManager.emit("User", "123", { name: "New Name", bio: "New Bio" });

			// Client 1 only gets 'name' (subscribed field)
			expect(client1Updates).toContain("name");
			expect(client1Updates).not.toContain("bio");

			// Client 2 gets both (subscribed to *)
			expect(client2Updates).toContain("name");
			expect(client2Updates).toContain("bio");
		});

		it("refCount tracking: unsubscribe when no more refs", async () => {
			const clientManager = createSubscriptionManager();
			const stateManager = new GraphStateManager();

			const unsubscribeMessages: ServerMessage[] = [];

			const clientTransport: SubscriptionTransport = {
				send: (msg) => {
					if (msg.type === "subscribe") {
						stateManager.subscribe("client-1", msg.entity, msg.id, msg.fields);
					} else if (msg.type === "unsubscribe") {
						unsubscribeMessages.push(msg);
						stateManager.unsubscribe("client-1", msg.entity, msg.id);
					}
				},
				onUpdate: () => {},
			};

			stateManager.addClient({
				id: "client-1",
				send: () => {},
			});

			clientManager.setTransport(clientTransport);

			// Create subscription
			clientManager.getOrCreateSubscription("User", "123", { name: "John" });

			// Subscribe twice
			clientManager.subscribeField("User", "123", "name");
			clientManager.subscribeField("User", "123", "name");

			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(stateManager.hasSubscribers("User", "123")).toBe(true);

			// Unsubscribe once - still subscribed (refCount = 1)
			clientManager.unsubscribeField("User", "123", "name");
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(unsubscribeMessages.length).toBe(0);
			expect(stateManager.hasSubscribers("User", "123")).toBe(true);

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
