/**
 * @sylphx/lens-client - Subscription Registry Tests
 */

import { describe, expect, it } from "bun:test";
import { hashEntityState } from "@sylphx/lens-core";
import { createSubscriptionRegistry, SubscriptionRegistry, type TrackedSubscription } from "./subscription-registry.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createSubscription(
	id: string,
	entity: string,
	entityId: string,
	options: Partial<
		Omit<TrackedSubscription, "id" | "entity" | "entityId" | "state" | "lastDataHash" | "createdAt" | "lastUpdateAt">
	> = {},
): Omit<TrackedSubscription, "state" | "lastDataHash" | "createdAt" | "lastUpdateAt"> {
	return {
		id,
		entity,
		entityId,
		fields: options.fields ?? "*",
		version: options.version ?? 0,
		lastData: options.lastData ?? null,
		observer: options.observer ?? {},
		input: options.input ?? { id: entityId },
	};
}

// =============================================================================
// SubscriptionRegistry Tests
// =============================================================================

describe("SubscriptionRegistry", () => {
	// ===========================================================================
	// Basic Operations
	// ===========================================================================

	describe("add / get / has / remove", () => {
		it("adds subscription correctly", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			expect(registry.has("sub1")).toBe(true);
			expect(registry.size).toBe(1);
		});

		it("gets subscription by ID", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const sub = registry.get("sub1");
			expect(sub).toBeDefined();
			expect(sub!.entity).toBe("user");
			expect(sub!.entityId).toBe("123");
		});

		it("returns undefined for unknown subscription", () => {
			const registry = new SubscriptionRegistry();
			expect(registry.get("unknown")).toBeUndefined();
		});

		it("removes subscription correctly", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.remove("sub1");

			expect(registry.has("sub1")).toBe(false);
			expect(registry.size).toBe(0);
		});

		it("initializes with pending state", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const sub = registry.get("sub1");
			expect(sub!.state).toBe("pending");
		});

		it("computes lastDataHash when lastData provided", () => {
			const registry = new SubscriptionRegistry();
			const lastData = { name: "Alice", age: 30 };
			registry.add(createSubscription("sub1", "user", "123", { lastData }));

			const sub = registry.get("sub1");
			expect(sub!.lastDataHash).toBe(hashEntityState(lastData));
		});
	});

	describe("getByEntity", () => {
		it("returns subscriptions for entity", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "123"));
			registry.add(createSubscription("sub3", "post", "456"));

			const subs = registry.getByEntity("user", "123");
			expect(subs.length).toBe(2);
		});

		it("returns empty array for unknown entity", () => {
			const registry = new SubscriptionRegistry();
			const subs = registry.getByEntity("user", "123");
			expect(subs).toEqual([]);
		});
	});

	// ===========================================================================
	// Version & Data Updates
	// ===========================================================================

	describe("updateVersion", () => {
		it("updates version correctly", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			registry.updateVersion("sub1", 5);

			const sub = registry.get("sub1");
			expect(sub!.version).toBe(5);
		});

		it("updates lastData and hash when data provided", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const newData = { name: "Bob" };
			registry.updateVersion("sub1", 5, newData);

			const sub = registry.get("sub1");
			expect(sub!.lastData).toEqual(newData);
			expect(sub!.lastDataHash).toBe(hashEntityState(newData));
		});

		it("marks subscription as active", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			registry.updateVersion("sub1", 1);

			const sub = registry.get("sub1");
			expect(sub!.state).toBe("active");
		});

		it("updates lastUpdateAt", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const before = Date.now();
			registry.updateVersion("sub1", 1);
			const after = Date.now();

			const sub = registry.get("sub1");
			expect(sub!.lastUpdateAt).toBeGreaterThanOrEqual(before);
			expect(sub!.lastUpdateAt).toBeLessThanOrEqual(after);
		});
	});

	describe("updateData", () => {
		it("updates lastData without changing version", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { version: 5 }));

			registry.updateData("sub1", { name: "Alice" });

			const sub = registry.get("sub1");
			expect(sub!.version).toBe(5);
			expect(sub!.lastData).toEqual({ name: "Alice" });
		});
	});

	describe("getLastData / getVersion", () => {
		it("returns last data", () => {
			const registry = new SubscriptionRegistry();
			const data = { name: "Alice" };
			registry.add(createSubscription("sub1", "user", "123", { lastData: data }));

			expect(registry.getLastData("sub1")).toEqual(data);
		});

		it("returns version", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { version: 10 }));

			expect(registry.getVersion("sub1")).toBe(10);
		});

		it("returns null for unknown subscription", () => {
			const registry = new SubscriptionRegistry();
			expect(registry.getLastData("unknown")).toBeNull();
			expect(registry.getVersion("unknown")).toBeNull();
		});
	});

	// ===========================================================================
	// State Management
	// ===========================================================================

	describe("state management", () => {
		it("markActive updates state", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			registry.markActive("sub1");

			expect(registry.get("sub1")!.state).toBe("active");
		});

		it("markError updates state", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			registry.markError("sub1");

			expect(registry.get("sub1")!.state).toBe("error");
		});

		it("markAllReconnecting updates active subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));
			registry.markActive("sub1");
			registry.markActive("sub2");

			registry.markAllReconnecting();

			expect(registry.get("sub1")!.state).toBe("reconnecting");
			expect(registry.get("sub2")!.state).toBe("reconnecting");
		});

		it("markAllReconnecting does not affect pending subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			registry.markAllReconnecting();

			expect(registry.get("sub1")!.state).toBe("pending");
		});

		it("getByState returns correct subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));
			registry.markActive("sub1");
			registry.markError("sub2");

			expect(registry.getByState("active").length).toBe(1);
			expect(registry.getByState("error").length).toBe(1);
			expect(registry.getByState("pending").length).toBe(0);
		});
	});

	// ===========================================================================
	// Reconnection Support
	// ===========================================================================

	describe("getAllForReconnect", () => {
		it("returns active subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { version: 5 }));
			registry.markActive("sub1");

			const subs = registry.getAllForReconnect();
			expect(subs.length).toBe(1);
			expect(subs[0].id).toBe("sub1");
			expect(subs[0].version).toBe(5);
		});

		it("returns reconnecting subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.markActive("sub1");
			registry.markAllReconnecting();

			const subs = registry.getAllForReconnect();
			expect(subs.length).toBe(1);
		});

		it("excludes pending subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const subs = registry.getAllForReconnect();
			expect(subs.length).toBe(0);
		});

		it("excludes error subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.markActive("sub1");
			registry.markError("sub1");

			const subs = registry.getAllForReconnect();
			expect(subs.length).toBe(0);
		});

		it("includes dataHash when available", () => {
			const registry = new SubscriptionRegistry();
			const data = { name: "Alice" };
			registry.add(createSubscription("sub1", "user", "123", { lastData: data }));
			registry.markActive("sub1");

			const subs = registry.getAllForReconnect();
			expect(subs[0].dataHash).toBe(hashEntityState(data));
		});
	});

	describe("processReconnectResult", () => {
		it("updates version and marks active", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.markActive("sub1");
			registry.markAllReconnecting();

			registry.processReconnectResult("sub1", 10, { name: "Bob" });

			const sub = registry.get("sub1");
			expect(sub!.version).toBe(10);
			expect(sub!.state).toBe("active");
			expect(sub!.lastData).toEqual({ name: "Bob" });
		});
	});

	// ===========================================================================
	// Observer Management
	// ===========================================================================

	describe("observer management", () => {
		it("getObserver returns observer", () => {
			const observer = { next: () => {} };
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { observer }));

			expect(registry.getObserver("sub1")).toBe(observer);
		});

		it("updateObserver updates observer", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));

			const newObserver = { next: () => {} };
			registry.updateObserver("sub1", newObserver);

			expect(registry.getObserver("sub1")).toBe(newObserver);
		});

		it("notifyNext calls observer.next", () => {
			let receivedData: unknown = null;
			const observer = {
				next: (result: { data: unknown }) => {
					receivedData = result.data;
				},
			};

			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { observer }));

			registry.notifyNext("sub1", { name: "Alice" });
			expect(receivedData).toEqual({ name: "Alice" });
		});

		it("notifyError calls observer.error", () => {
			let receivedError: Error | null = null;
			const observer = {
				error: (err: Error) => {
					receivedError = err;
				},
			};

			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { observer }));

			registry.notifyError("sub1", new Error("Test error"));
			expect(receivedError?.message).toBe("Test error");
		});

		it("notifyAllReconnectingError notifies all reconnecting", () => {
			const errors: Error[] = [];
			const observer = {
				error: (err: Error) => {
					errors.push(err);
				},
			};

			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { observer }));
			registry.add(createSubscription("sub2", "user", "456", { observer }));
			registry.markActive("sub1");
			registry.markActive("sub2");
			registry.markAllReconnecting();

			registry.notifyAllReconnectingError(new Error("Reconnect failed"));
			expect(errors.length).toBe(2);
		});
	});

	// ===========================================================================
	// Statistics & Utilities
	// ===========================================================================

	describe("statistics", () => {
		it("getIds returns all IDs", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));

			const ids = registry.getIds();
			expect(ids).toContain("sub1");
			expect(ids).toContain("sub2");
		});

		it("getStats returns correct statistics", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));
			registry.add(createSubscription("sub3", "post", "789"));
			registry.markActive("sub1");
			registry.markError("sub2");

			const stats = registry.getStats();
			expect(stats.total).toBe(3);
			expect(stats.byState.active).toBe(1);
			expect(stats.byState.pending).toBe(1);
			expect(stats.byState.error).toBe(1);
			expect(stats.byEntity["user:123"]).toBe(1);
			expect(stats.byEntity["user:456"]).toBe(1);
			expect(stats.byEntity["post:789"]).toBe(1);
		});

		it("values iterator works", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));

			const subs = Array.from(registry.values());
			expect(subs.length).toBe(2);
		});
	});

	describe("clear", () => {
		it("clears all subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));

			registry.clear();

			expect(registry.size).toBe(0);
		});

		it("calls observer.complete for each subscription", () => {
			let completeCalled = 0;
			const observer = {
				complete: () => {
					completeCalled++;
				},
			};

			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123", { observer }));
			registry.add(createSubscription("sub2", "user", "456", { observer }));

			registry.clear();
			expect(completeCalled).toBe(2);
		});
	});

	describe("clearErrors", () => {
		it("removes only error subscriptions", () => {
			const registry = new SubscriptionRegistry();
			registry.add(createSubscription("sub1", "user", "123"));
			registry.add(createSubscription("sub2", "user", "456"));
			registry.markActive("sub1");
			registry.markError("sub2");

			registry.clearErrors();

			expect(registry.has("sub1")).toBe(true);
			expect(registry.has("sub2")).toBe(false);
		});
	});

	// ===========================================================================
	// Factory Function
	// ===========================================================================

	describe("createSubscriptionRegistry", () => {
		it("creates new registry instance", () => {
			const registry = createSubscriptionRegistry();
			expect(registry).toBeInstanceOf(SubscriptionRegistry);
		});
	});
});
