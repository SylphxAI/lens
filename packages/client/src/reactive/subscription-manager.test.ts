/**
 * @sylphx/client - SubscriptionManager Tests
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
	SubscriptionManager,
	createSubscriptionManager,
	type SubscriptionTransport,
	type ServerMessage,
	type UpdateMessage,
} from "./subscription-manager";

describe("SubscriptionManager", () => {
	let manager: SubscriptionManager;

	beforeEach(() => {
		manager = createSubscriptionManager();
	});

	describe("getOrCreateSubscription", () => {
		it("creates subscription with EntitySignal", () => {
			const sub = manager.getOrCreateSubscription("User", "123", {
				name: "John",
				bio: "Hello",
			});

			expect(sub.entityName).toBe("User");
			expect(sub.entityId).toBe("123");
			expect(sub.signal.$.name.value).toBe("John");
			expect(sub.signal.$.bio.value).toBe("Hello");
		});

		it("returns existing subscription for same entity", () => {
			const sub1 = manager.getOrCreateSubscription("User", "123", { name: "John" });
			const sub2 = manager.getOrCreateSubscription("User", "123", { name: "Different" });

			expect(sub1).toBe(sub2);
			expect(sub1.signal.$.name.value).toBe("John"); // Original value preserved
		});

		it("creates separate subscriptions for different entities", () => {
			const sub1 = manager.getOrCreateSubscription("User", "123", { name: "John" });
			const sub2 = manager.getOrCreateSubscription("User", "456", { name: "Jane" });

			expect(sub1).not.toBe(sub2);
			expect(sub1.signal.$.name.value).toBe("John");
			expect(sub2.signal.$.name.value).toBe("Jane");
		});
	});

	describe("subscribeField", () => {
		it("increments refCount for field subscription", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "name");

			const fields = manager.getSubscribedFields("User", "123");
			expect(fields).toContain("name");
		});

		it("creates new field subscription if not exists", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.subscribeField("User", "123", "newField");

			const fields = manager.getSubscribedFields("User", "123");
			expect(fields).toContain("newField");
		});
	});

	describe("unsubscribeField", () => {
		it("decrements refCount for field", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "name");
			manager.unsubscribeField("User", "123", "name");

			// Still subscribed (refCount = 1)
			expect(manager.getSubscribedFields("User", "123")).toContain("name");
		});

		it("removes field from subscribed when refCount reaches 0", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.subscribeField("User", "123", "name");
			manager.unsubscribeField("User", "123", "name");

			expect(manager.getSubscribedFields("User", "123")).not.toContain("name");
		});
	});

	describe("subscribeFullEntity", () => {
		it("subscribes to all fields", () => {
			manager.getOrCreateSubscription("User", "123", {
				name: "John",
				bio: "Hello",
				age: 30,
			});

			manager.subscribeFullEntity("User", "123");

			const fields = manager.getSubscribedFields("User", "123");
			expect(fields).toContain("name");
			expect(fields).toContain("bio");
			expect(fields).toContain("age");
		});
	});

	describe("canDerive", () => {
		it("returns false when entity not subscribed", () => {
			expect(manager.canDerive("User", "123", ["name"])).toBe(false);
		});

		it("returns false when field not subscribed", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John", bio: "Hello" });
			manager.subscribeField("User", "123", "name");

			expect(manager.canDerive("User", "123", ["bio"])).toBe(false);
		});

		it("returns true when all fields are subscribed", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John", bio: "Hello" });
			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "bio");

			expect(manager.canDerive("User", "123", ["name", "bio"])).toBe(true);
		});

		it("returns true for any fields when full entity subscribed", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John", bio: "Hello" });
			manager.subscribeFullEntity("User", "123");

			expect(manager.canDerive("User", "123", ["name"])).toBe(true);
			expect(manager.canDerive("User", "123", ["bio"])).toBe(true);
			expect(manager.canDerive("User", "123", ["name", "bio"])).toBe(true);
		});
	});

	describe("getSignal", () => {
		it("returns EntitySignal for existing subscription", () => {
			const sub = manager.getOrCreateSubscription("User", "123", { name: "John" });
			const signal = manager.getSignal("User", "123");

			expect(signal).toBe(sub.signal);
		});

		it("returns null for non-existent subscription", () => {
			expect(manager.getSignal("User", "123")).toBe(null);
		});
	});

	describe("handleServerUpdate", () => {
		it("applies update to EntitySignal", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.handleServerUpdate({
				type: "update",
				entity: "User",
				id: "123",
				field: "name",
				update: { strategy: "value", data: "Jane" },
			});

			const signal = manager.getSignal<{ name: string }>("User", "123");
			expect(signal?.$.name.value).toBe("Jane");
		});

		it("ignores update for non-existent entity", () => {
			// Should not throw
			manager.handleServerUpdate({
				type: "update",
				entity: "User",
				id: "999",
				field: "name",
				update: { strategy: "value", data: "Jane" },
			});
		});
	});

	describe("transport integration", () => {
		it("sends batched subscribe messages", async () => {
			const messages: ServerMessage[] = [];
			const transport: SubscriptionTransport = {
				send: (msg) => messages.push(msg),
				onUpdate: () => {},
			};

			manager.setTransport(transport);
			manager.getOrCreateSubscription("User", "123", { name: "John", bio: "Hello" });

			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "bio");

			// Wait for batch
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe("subscribe");
			expect(messages[0].entity).toBe("User");
			expect(messages[0].id).toBe("123");
			expect(messages[0].fields).toEqual(expect.arrayContaining(["name", "bio"]));
		});

		it("sends unsubscribe messages when refCount reaches 0", async () => {
			const messages: ServerMessage[] = [];
			const transport: SubscriptionTransport = {
				send: (msg) => messages.push(msg),
				onUpdate: () => {},
			};

			manager.setTransport(transport);
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.subscribeField("User", "123", "name");

			// Wait for subscribe batch
			await new Promise((resolve) => setTimeout(resolve, 20));
			messages.length = 0; // Clear

			manager.unsubscribeField("User", "123", "name");

			// Wait for unsubscribe batch
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe("unsubscribe");
			expect(messages[0].fields).toContain("name");
		});

		it("handles incoming updates via transport", () => {
			let updateHandler: ((msg: UpdateMessage) => void) | null = null;
			const transport: SubscriptionTransport = {
				send: () => {},
				onUpdate: (handler) => {
					updateHandler = handler;
				},
			};

			manager.setTransport(transport);
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			// Simulate server update
			updateHandler!({
				type: "update",
				entity: "User",
				id: "123",
				field: "name",
				update: { strategy: "value", data: "Updated" },
			});

			const signal = manager.getSignal<{ name: string }>("User", "123");
			expect(signal?.$.name.value).toBe("Updated");
		});
	});

	describe("getStats", () => {
		it("returns correct statistics", () => {
			manager.getOrCreateSubscription("User", "123", { name: "John", bio: "Hello" });
			manager.getOrCreateSubscription("User", "456", { name: "Jane" });

			manager.subscribeField("User", "123", "name");
			manager.subscribeField("User", "123", "name"); // refCount = 2
			manager.subscribeField("User", "123", "bio"); // refCount = 1
			manager.subscribeField("User", "456", "name"); // refCount = 1

			const stats = manager.getStats();
			expect(stats.entities).toBe(2);
			expect(stats.totalFieldSubscriptions).toBe(4); // 2 + 1 + 1
		});
	});

	describe("clear", () => {
		it("removes all subscriptions", async () => {
			const messages: ServerMessage[] = [];
			const transport: SubscriptionTransport = {
				send: (msg) => messages.push(msg),
				onUpdate: () => {},
			};

			manager.setTransport(transport);
			manager.getOrCreateSubscription("User", "123", { name: "John" });
			manager.getOrCreateSubscription("User", "456", { name: "Jane" });

			manager.clear();

			expect(manager.getStats().entities).toBe(0);
			// Should have sent unsubscribe for both
			const unsubscribes = messages.filter((m) => m.type === "unsubscribe");
			expect(unsubscribes.length).toBe(2);
		});
	});

	describe("unsubscribeAll", () => {
		it("removes entity and sends unsubscribe", async () => {
			const messages: ServerMessage[] = [];
			const transport: SubscriptionTransport = {
				send: (msg) => messages.push(msg),
				onUpdate: () => {},
			};

			manager.setTransport(transport);
			manager.getOrCreateSubscription("User", "123", { name: "John" });

			manager.unsubscribeAll("User", "123");

			expect(manager.getSignal("User", "123")).toBe(null);
			expect(messages[0].type).toBe("unsubscribe");
			expect(messages[0].fields).toBe("*");
		});
	});
});
