/**
 * Tests for GraphStateManager
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { GraphStateManager, type StateClient, type StateUpdateMessage } from "./graph-state-manager";

describe("GraphStateManager", () => {
	let manager: GraphStateManager;
	let mockClient: StateClient & { messages: StateUpdateMessage[] };

	beforeEach(() => {
		manager = new GraphStateManager();
		mockClient = {
			id: "client-1",
			messages: [],
			send: mock((msg: StateUpdateMessage) => {
				mockClient.messages.push(msg);
			}),
		};
		manager.addClient(mockClient);
	});

	describe("client management", () => {
		it("adds and removes clients", () => {
			expect(manager.getStats().clients).toBe(1);

			manager.removeClient("client-1");
			expect(manager.getStats().clients).toBe(0);
		});

		it("handles removing non-existent client", () => {
			expect(() => manager.removeClient("non-existent")).not.toThrow();
		});
	});

	describe("subscription", () => {
		it("subscribes client to entity", () => {
			manager.subscribe("client-1", "Post", "123", ["title", "content"]);

			expect(manager.hasSubscribers("Post", "123")).toBe(true);
		});

		it("unsubscribes client from entity", () => {
			manager.subscribe("client-1", "Post", "123");
			manager.unsubscribe("client-1", "Post", "123");

			expect(manager.hasSubscribers("Post", "123")).toBe(false);
		});

		it("sends initial data when subscribing to existing state", () => {
			// Emit data first
			manager.emit("Post", "123", { title: "Hello", content: "World" });

			// Then subscribe
			manager.subscribe("client-1", "Post", "123", ["title"]);

			// Should receive initial data
			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0]).toMatchObject({
				type: "update",
				entity: "Post",
				id: "123",
			});
			expect(mockClient.messages[0].updates.title).toMatchObject({
				strategy: "value",
				data: "Hello",
			});
		});

		it("subscribes to all fields with *", () => {
			manager.emit("Post", "123", { title: "Hello", content: "World" });
			manager.subscribe("client-1", "Post", "123", "*");

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0].updates).toHaveProperty("title");
			expect(mockClient.messages[0].updates).toHaveProperty("content");
		});
	});

	describe("emit", () => {
		it("updates canonical state", () => {
			manager.emit("Post", "123", { title: "Hello" });

			expect(manager.getState("Post", "123")).toEqual({ title: "Hello" });
		});

		it("merges partial updates by default", () => {
			manager.emit("Post", "123", { title: "Hello" });
			manager.emit("Post", "123", { content: "World" });

			expect(manager.getState("Post", "123")).toEqual({
				title: "Hello",
				content: "World",
			});
		});

		it("replaces state when replace option is true", () => {
			manager.emit("Post", "123", { title: "Hello", content: "World" });
			manager.emit("Post", "123", { title: "New" }, { replace: true });

			expect(manager.getState("Post", "123")).toEqual({ title: "New" });
		});

		it("pushes updates to subscribed clients", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			mockClient.messages = []; // Clear initial subscription message

			manager.emit("Post", "123", { title: "Hello" });

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0]).toMatchObject({
				type: "update",
				entity: "Post",
				id: "123",
			});
		});

		it("only sends updates for changed fields", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", { title: "Hello", content: "World" });
			mockClient.messages = [];

			// Emit same title, different content
			manager.emit("Post", "123", { title: "Hello", content: "Updated" });

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0].updates).toHaveProperty("content");
			expect(mockClient.messages[0].updates).not.toHaveProperty("title");
		});

		it("does not send if no fields changed", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", { title: "Hello" });
			mockClient.messages = [];

			// Emit same data
			manager.emit("Post", "123", { title: "Hello" });

			expect(mockClient.messages.length).toBe(0);
		});

		it("only sends subscribed fields", () => {
			manager.subscribe("client-1", "Post", "123", ["title"]);
			mockClient.messages = [];

			manager.emit("Post", "123", { title: "Hello", content: "World" });

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0].updates).toHaveProperty("title");
			expect(mockClient.messages[0].updates).not.toHaveProperty("content");
		});

		it("does not send to unsubscribed clients", () => {
			const otherClient = {
				id: "client-2",
				messages: [] as StateUpdateMessage[],
				send: mock((msg: StateUpdateMessage) => {
					otherClient.messages.push(msg);
				}),
			};
			manager.addClient(otherClient);

			manager.subscribe("client-1", "Post", "123", "*");
			// client-2 not subscribed

			manager.emit("Post", "123", { title: "Hello" });

			expect(mockClient.messages.length).toBe(1);
			expect(otherClient.messages.length).toBe(0);
		});
	});

	describe("update strategies", () => {
		it("uses value strategy for short strings", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", { title: "Hello" });
			mockClient.messages = [];

			manager.emit("Post", "123", { title: "World" });

			expect(mockClient.messages[0].updates.title.strategy).toBe("value");
		});

		it("uses delta strategy for long strings with small changes", () => {
			const longText = "A".repeat(200);
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", { content: longText });
			mockClient.messages = [];

			manager.emit("Post", "123", { content: `${longText} appended` });

			// Should use delta for efficient transfer
			const update = mockClient.messages[0].updates.content;
			expect(["delta", "value"]).toContain(update.strategy);
		});

		it("uses patch strategy for objects", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", {
				metadata: { views: 100, likes: 10, tags: ["a", "b"] },
			});
			mockClient.messages = [];

			manager.emit("Post", "123", {
				metadata: { views: 101, likes: 10, tags: ["a", "b"] },
			});

			const update = mockClient.messages[0].updates.metadata;
			expect(["patch", "value"]).toContain(update.strategy);
		});
	});

	describe("multiple clients", () => {
		it("sends updates to all subscribed clients", () => {
			const client2 = {
				id: "client-2",
				messages: [] as StateUpdateMessage[],
				send: mock((msg: StateUpdateMessage) => {
					client2.messages.push(msg);
				}),
			};
			manager.addClient(client2);

			manager.subscribe("client-1", "Post", "123", "*");
			manager.subscribe("client-2", "Post", "123", "*");
			mockClient.messages = [];
			client2.messages = [];

			manager.emit("Post", "123", { title: "Hello" });

			expect(mockClient.messages.length).toBe(1);
			expect(client2.messages.length).toBe(1);
		});

		it("tracks state independently per client", () => {
			const client2 = {
				id: "client-2",
				messages: [] as StateUpdateMessage[],
				send: mock((msg: StateUpdateMessage) => {
					client2.messages.push(msg);
				}),
			};
			manager.addClient(client2);

			// Emit initial state
			manager.emit("Post", "123", { title: "Hello", content: "World" });

			// Subscribe clients at different times
			manager.subscribe("client-1", "Post", "123", "*");
			mockClient.messages = [];

			// Emit update
			manager.emit("Post", "123", { title: "Updated" });

			// Now subscribe client-2 (should get current state)
			manager.subscribe("client-2", "Post", "123", "*");

			// client-1 got incremental update
			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0].updates.title.data).toBe("Updated");

			// client-2 got full current state
			expect(client2.messages.length).toBe(1);
			expect(client2.messages[0].updates.title.data).toBe("Updated");
			expect(client2.messages[0].updates.content.data).toBe("World");
		});
	});

	describe("cleanup", () => {
		it("calls onEntityUnsubscribed when last client unsubscribes", () => {
			const onUnsubscribe = mock(() => {});
			const mgr = new GraphStateManager({
				onEntityUnsubscribed: onUnsubscribe,
			});

			const client = {
				id: "c1",
				send: mock(() => {}),
			};
			mgr.addClient(client);
			mgr.subscribe("c1", "Post", "123", "*");
			mgr.unsubscribe("c1", "Post", "123");

			expect(onUnsubscribe).toHaveBeenCalledWith("Post", "123");
		});

		it("cleans up subscriptions when client is removed", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.subscribe("client-1", "Post", "456", "*");

			manager.removeClient("client-1");

			expect(manager.hasSubscribers("Post", "123")).toBe(false);
			expect(manager.hasSubscribers("Post", "456")).toBe(false);
		});

		it("clear() removes all state", () => {
			manager.subscribe("client-1", "Post", "123", "*");
			manager.emit("Post", "123", { title: "Hello" });

			manager.clear();

			expect(manager.getStats()).toEqual({
				clients: 0,
				entities: 0,
				totalSubscriptions: 0,
			});
		});
	});

	describe("stats", () => {
		it("returns correct stats", () => {
			const client2 = { id: "client-2", send: mock(() => {}) };
			manager.addClient(client2);

			manager.emit("Post", "123", { title: "Hello" });
			manager.emit("Post", "456", { title: "World" });

			manager.subscribe("client-1", "Post", "123", "*");
			manager.subscribe("client-1", "Post", "456", "*");
			manager.subscribe("client-2", "Post", "123", "*");

			const stats = manager.getStats();
			expect(stats.clients).toBe(2);
			expect(stats.entities).toBe(2);
			expect(stats.totalSubscriptions).toBe(3);
		});
	});

	describe("array operations", () => {
		interface User {
			id: string;
			name: string;
		}

		it("emits array data", () => {
			manager.subscribe("client-1", "Users", "list", "*");
			mockClient.messages = [];

			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);

			expect(mockClient.messages.length).toBe(1);
			expect(mockClient.messages[0]).toMatchObject({
				type: "update",
				entity: "Users",
				id: "list",
			});
			expect(mockClient.messages[0].updates._items.data).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("gets array state", () => {
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);

			expect(manager.getArrayState("Users", "list")).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("applies push operation", () => {
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);
			manager.emitArrayOperation("Users", "list", {
				op: "push",
				item: { id: "2", name: "Bob" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("applies unshift operation", () => {
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);
			manager.emitArrayOperation("Users", "list", {
				op: "unshift",
				item: { id: "0", name: "Zero" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "0", name: "Zero" },
				{ id: "1", name: "Alice" },
			]);
		});

		it("applies insert operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "3", name: "Charlie" },
			]);
			manager.emitArrayOperation("Users", "list", {
				op: "insert",
				index: 1,
				item: { id: "2", name: "Bob" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
				{ id: "3", name: "Charlie" },
			]);
		});

		it("applies remove operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", { op: "remove", index: 0 });

			expect(manager.getArrayState("Users", "list")).toEqual([{ id: "2", name: "Bob" }]);
		});

		it("applies removeById operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", { op: "removeById", id: "1" });

			expect(manager.getArrayState("Users", "list")).toEqual([{ id: "2", name: "Bob" }]);
		});

		it("handles removeById for non-existent id", () => {
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);
			manager.emitArrayOperation("Users", "list", { op: "removeById", id: "999" });

			expect(manager.getArrayState("Users", "list")).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("applies update operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", {
				op: "update",
				index: 1,
				item: { id: "2", name: "Robert" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Robert" },
			]);
		});

		it("applies updateById operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", {
				op: "updateById",
				id: "2",
				item: { id: "2", name: "Robert" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Robert" },
			]);
		});

		it("applies merge operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", {
				op: "merge",
				index: 0,
				partial: { name: "Alicia" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alicia" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("applies mergeById operation", () => {
			manager.emitArray("Users", "list", [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
			manager.emitArrayOperation("Users", "list", {
				op: "mergeById",
				id: "2",
				partial: { name: "Bobby" },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bobby" },
			]);
		});

		it("processCommand handles array operations", () => {
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);

			manager.processCommand("Users", "list", {
				type: "array",
				operation: { op: "push", item: { id: "2", name: "Bob" } },
			});

			expect(manager.getArrayState("Users", "list")).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("sends array updates to subscribed clients", () => {
			manager.subscribe("client-1", "Users", "list", "*");
			mockClient.messages = [];

			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);
			manager.emitArrayOperation("Users", "list", {
				op: "push",
				item: { id: "2", name: "Bob" },
			});

			expect(mockClient.messages.length).toBe(2);
			expect(mockClient.messages[1].updates._items.data).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("does not send update if array unchanged", () => {
			manager.subscribe("client-1", "Users", "list", "*");
			manager.emitArray("Users", "list", [{ id: "1", name: "Alice" }]);
			mockClient.messages = [];

			// Remove by non-existent id (no change)
			manager.emitArrayOperation("Users", "list", { op: "removeById", id: "999" });

			expect(mockClient.messages.length).toBe(0);
		});
	});
});
