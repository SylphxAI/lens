/**
 * Tests for Reactive Store
 */

import { describe, expect, test } from "bun:test";
import { ReactiveStore, createStore } from "./reactive-store";

describe("ReactiveStore", () => {
	describe("Entity Management", () => {
		test("creates entity signal on first access", () => {
			const store = createStore();
			const entity = store.getEntity("User", "123");

			expect(entity.value).toEqual({
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		});

		test("returns same signal for same entity", () => {
			const store = createStore();
			const entity1 = store.getEntity("User", "123");
			const entity2 = store.getEntity("User", "123");

			expect(entity1).toBe(entity2);
		});

		test("setEntity updates signal value", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.setEntity("User", "123", { id: "123", name: "John" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "John" });
			expect(entity.value.loading).toBe(false);
		});

		test("setEntityError sets error state", () => {
			const store = createStore();
			store.getEntity("User", "123");

			const error = new Error("Not found");
			store.setEntityError("User", "123", error);

			const entity = store.getEntity("User", "123");
			expect(entity.value.error).toBe(error);
			expect(entity.value.loading).toBe(false);
		});

		test("removeEntity clears from cache", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123" });

			expect(store.hasEntity("User", "123")).toBe(true);

			store.removeEntity("User", "123");

			expect(store.hasEntity("User", "123")).toBe(false);
		});
	});

	describe("List Management", () => {
		test("creates list signal on first access", () => {
			const store = createStore();
			const list = store.getList("users:all");

			expect(list.value).toEqual({
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		});

		test("setList updates list signal", () => {
			const store = createStore();
			const users = [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			];

			store.setList("users:all", users);

			const list = store.getList("users:all");
			expect(list.value.data).toEqual(users);
			expect(list.value.loading).toBe(false);
		});
	});

	describe("Optimistic Updates", () => {
		test("applyOptimistic creates temporary entity", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			expect(optimisticId).toBeTruthy();

			const entity = store.getEntity("User", "temp_123");
			expect(entity.value.data).toEqual({ id: "temp_123", name: "New User" });
		});

		test("applyOptimistic updates existing entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John", age: 30 });

			store.applyOptimistic("User", "update", {
				id: "123",
				name: "John Doe",
			});

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "John Doe", age: 30 });
		});

		test("applyOptimistic deletes entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John" });

			store.applyOptimistic("User", "delete", { id: "123" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toBeNull();
		});

		test("confirmOptimistic with server data", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			store.confirmOptimistic(optimisticId, {
				id: "real_123",
				name: "New User",
				createdAt: "2024-01-01",
			});

			// Server data should be applied
			const pending = store.getPendingOptimistic();
			expect(pending).toHaveLength(0);
		});

		test("rollbackOptimistic reverts create", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			store.rollbackOptimistic(optimisticId);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
		});

		test("rollbackOptimistic reverts update", () => {
			const store = createStore();
			const original = { id: "123", name: "John", age: 30 };
			store.setEntity("User", "123", original);

			const optimisticId = store.applyOptimistic("User", "update", {
				id: "123",
				name: "Changed",
			});

			store.rollbackOptimistic(optimisticId);

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual(original);
		});

		test("rollbackOptimistic reverts delete", () => {
			const store = createStore();
			const original = { id: "123", name: "John" };
			store.setEntity("User", "123", original);

			const optimisticId = store.applyOptimistic("User", "delete", { id: "123" });

			store.rollbackOptimistic(optimisticId);

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual(original);
		});

		test("disables optimistic when configured", () => {
			const store = createStore({ optimistic: false });

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			expect(optimisticId).toBe("");
		});
	});

	describe("Reference Counting", () => {
		test("retain increments refCount", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.retain("User", "123");
			store.retain("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(2);
		});

		test("release decrements refCount", () => {
			const store = createStore();
			store.getEntity("User", "123");
			store.retain("User", "123");
			store.retain("User", "123");

			store.release("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(1);
		});

		test("release marks stale when refCount reaches 0", () => {
			const store = createStore();
			store.getEntity("User", "123");
			store.retain("User", "123");

			store.release("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(0);
			expect(entity.value.stale).toBe(true);
		});

		test("gc clears stale entities", () => {
			const store = createStore();

			// Create some entities
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("User", "3", { id: "3" });

			// Mark some as stale
			store.retain("User", "1");
			store.release("User", "1"); // Now stale

			store.retain("User", "2"); // Not stale (still retained)

			store.retain("User", "3");
			store.release("User", "3"); // Now stale

			const cleared = store.gc();

			expect(cleared).toBe(2);
			expect(store.hasEntity("User", "1")).toBe(false);
			expect(store.hasEntity("User", "2")).toBe(true);
			expect(store.hasEntity("User", "3")).toBe(false);
		});
	});

	describe("Statistics", () => {
		test("getStats returns current cache state", () => {
			const store = createStore();

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setList("users:all", []);

			store.applyOptimistic("User", "create", { id: "temp", name: "New" });

			const stats = store.getStats();
			expect(stats.entities).toBe(3);
			expect(stats.lists).toBe(1);
			expect(stats.pendingOptimistic).toBe(1);
		});

		test("clear removes everything", () => {
			const store = createStore();

			store.setEntity("User", "1", { id: "1" });
			store.setList("users:all", []);
			store.applyOptimistic("User", "create", { id: "temp", name: "New" });

			store.clear();

			const stats = store.getStats();
			expect(stats.entities).toBe(0);
			expect(stats.lists).toBe(0);
			expect(stats.pendingOptimistic).toBe(0);
		});
	});

	describe("Cache Invalidation", () => {
		test("invalidate marks entity as stale", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John" });

			store.invalidate("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.stale).toBe(true);
		});

		test("invalidateEntity marks all entities of type as stale", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("Post", "1", { id: "1" });

			store.invalidateEntity("User");

			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(true);
			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("invalidateByTags marks tagged entities as stale", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" }, ["team-a"]);
			store.setEntity("User", "2", { id: "2" }, ["team-b"]);
			store.setEntity("User", "3", { id: "3" }, ["team-a", "admin"]);

			const count = store.invalidateByTags(["team-a"]);

			expect(count).toBe(2);
			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(false);
			expect(store.getEntity("User", "3").value.stale).toBe(true);
		});

		test("invalidateByPattern matches glob patterns", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("Post", "1", { id: "1" });

			const count = store.invalidateByPattern("User:*");

			expect(count).toBe(2);
			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(true);
			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("tagEntity adds tags to existing entity", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });

			store.tagEntity("User", "1", ["featured", "premium"]);

			const entity = store.getEntity("User", "1");
			expect(entity.value.tags).toContain("featured");
			expect(entity.value.tags).toContain("premium");
		});

		test("isStale returns true for stale entities", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });

			expect(store.isStale("User", "1")).toBe(false);

			store.invalidate("User", "1");

			expect(store.isStale("User", "1")).toBe(true);
		});

		test("isStale returns true for non-existent entities", () => {
			const store = createStore();

			expect(store.isStale("User", "nonexistent")).toBe(true);
		});

		test("cascade invalidation triggers related entity invalidation", () => {
			const store = createStore({
				cascadeRules: [{ source: "User", targets: ["Post", "Comment"] }],
			});

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("Post", "1", { id: "1" });
			store.setEntity("Comment", "1", { id: "1" });
			store.setEntity("Tag", "1", { id: "1" });

			store.invalidateEntity("User");

			expect(store.getEntity("Post", "1").value.stale).toBe(true);
			expect(store.getEntity("Comment", "1").value.stale).toBe(true);
			expect(store.getEntity("Tag", "1").value.stale).toBe(false);
		});
	});

	describe("Stale While Revalidate", () => {
		test("returns stale data with revalidation promise", async () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1", name: "Old" });
			// Manually mark as stale
			store.invalidate("User", "1", { cascade: false });

			const result = store.getStaleWhileRevalidate("User", "1", async () => ({
				id: "1",
				name: "New",
			}));

			// Returns old data immediately
			expect(result.data).toEqual({ id: "1", name: "Old" });
			expect(result.isStale).toBe(true);
			expect(result.revalidating).not.toBeNull();

			// Wait for revalidation
			if (result.revalidating) {
				await result.revalidating;
			}

			// Data should be updated
			const entity = store.getEntity("User", "1");
			expect(entity.value.data).toEqual({ id: "1", name: "New" });
		});

		test("returns null with null revalidation for missing data", () => {
			const store = createStore();

			const result = store.getStaleWhileRevalidate("User", "nonexistent", async () => ({
				id: "1",
				name: "New",
			}));

			expect(result.data).toBeNull();
			expect(result.isStale).toBe(true);
			expect(result.revalidating).toBeNull();
		});
	});
});
