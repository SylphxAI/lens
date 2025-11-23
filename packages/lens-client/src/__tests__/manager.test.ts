/**
 * OptimisticManager Lifecycle Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { OptimisticManager } from "../optimistic/manager.js";
import type { OptimisticConfig } from "@sylphx/lens-core";

describe("OptimisticManager Lifecycle", () => {
	let manager: OptimisticManager;

	beforeEach(() => {
		manager = new OptimisticManager({ debug: false });
	});

	it("should apply optimistic update before mutation", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		// Set base data
		manager.setBase("Session", "sess-1", { title: "Old Title" });

		// Before mutation
		const mutationId = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New Title",
		});

		expect(mutationId).not.toBeNull();

		// Check optimistic update applied
		const data = manager.get("Session", "sess-1");
		expect(data?.title).toBe("New Title");
		expect(manager.hasOptimistic("Session", "sess-1")).toBe(true);
	});

	it("should confirm optimistic update on success", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Old Title" });

		const mutationId = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New Title",
		});

		// On success
		manager.onSuccess(mutationId);

		// Check confirmed (merged into base)
		const data = manager.get("Session", "sess-1");
		expect(data?.title).toBe("New Title");
		expect(manager.hasOptimistic("Session", "sess-1")).toBe(false);
	});

	it("should rollback optimistic update on error", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Old Title" });

		const mutationId = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New Title",
		});

		// On error
		manager.onError(mutationId);

		// Check rolled back
		const data = manager.get("Session", "sess-1");
		expect(data?.title).toBe("Old Title");
		expect(manager.hasOptimistic("Session", "sess-1")).toBe(false);
	});

	it("should handle multiple pending mutations", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Original" });

		// Apply two optimistic updates
		const mutationId1 = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "Update 1",
		});

		const mutationId2 = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "Update 2",
		});

		// Last update should win
		const data = manager.get("Session", "sess-1");
		expect(data?.title).toBe("Update 2");

		// Both mutations pending
		const pending = manager.getPendingMutations();
		expect(pending.length).toBe(2);
	});

	it("should notify subscribers on entity change", (done) => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Old Title" });

		const updates: any[] = [];

		// Subscribe to entity
		manager.subscribe("Session", "sess-1").subscribe({
			next: (data: any) => {
				updates.push(data?.title);
			},
		});

		// Trigger updates synchronously
		const mutationId1 = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New Title",
		});

		manager.onSuccess(mutationId1);

		const mutationId2 = manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "Another",
		});

		manager.onError(mutationId2);

		// Check updates
		expect(updates.length).toBe(5);
		expect(updates[0]).toBe("Old Title"); // Initial
		expect(updates[1]).toBe("New Title"); // After beforeMutation
		expect(updates[2]).toBe("New Title"); // After onSuccess (no change, but notified)
		expect(updates[3]).toBe("Another"); // After second beforeMutation
		expect(updates[4]).toBe("New Title"); // After onError (rollback)

		done();
	});

	it("should provide cache statistics", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Old" });
		manager.setBase("Session", "sess-2", { title: "Old 2" });

		manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New",
		});

		const stats = manager.getStats();
		expect(stats.totalEntities).toBe(2);
		expect(stats.entitiesWithOptimistic).toBe(1);
		expect(stats.totalOptimisticLayers).toBe(1);
		expect(stats.pendingMutations).toBe(1);
	});

	it("should handle missing optimistic config gracefully", () => {
		const mutationId = manager.beforeMutation(undefined, {
			sessionId: "sess-1",
		});

		expect(mutationId).toBeNull();
	});

	it("should clear all optimistic updates", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		manager.setBase("Session", "sess-1", { title: "Old" });

		manager.beforeMutation(config, {
			sessionId: "sess-1",
			newTitle: "New",
		});

		manager.clearOptimistic("Session", "sess-1");

		const data = manager.get("Session", "sess-1");
		expect(data?.title).toBe("Old");
		expect(manager.hasOptimistic("Session", "sess-1")).toBe(false);
	});
});
