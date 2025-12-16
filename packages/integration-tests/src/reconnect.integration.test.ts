/**
 * @sylphx/lens-server - Reconnection Integration Tests
 *
 * End-to-end tests for the reconnection system.
 * Tests the complete flow of version tracking, operation log,
 * subscription registry, and reconnection protocol.
 */

import { describe, expect, it } from "bun:test";
import { SubscriptionRegistry } from "@sylphx/lens-client";
import {
	applyPatch,
	generateReconnectId,
	hashEntityState,
	type PatchOperation,
	PROTOCOL_VERSION,
	type ReconnectMessage,
	type ReconnectResult,
	type ReconnectStatus,
	type ReconnectSubscription,
	type Version,
} from "@sylphx/lens-core";
import { coalescePatches, OperationLog } from "@sylphx/lens-server";

// =============================================================================
// Test Fixtures - Simulated Server State Manager
// =============================================================================

/**
 * Simplified server-side state manager for testing.
 * Mirrors GraphStateManager's reconnection logic.
 */
class TestServerStateManager {
	private canonical = new Map<string, Record<string, unknown>>();
	private versions = new Map<string, Version>();
	private operationLog = new OperationLog({ maxEntries: 1000, maxAge: 60000 });

	/** Set entity state and track version */
	setState(entity: string, id: string, data: Record<string, unknown>): void {
		const key = `${entity}:${id}`;
		const oldData = this.canonical.get(key);
		const oldVersion = this.versions.get(key) ?? 0;
		const newVersion = oldVersion + 1;

		this.canonical.set(key, data);
		this.versions.set(key, newVersion);

		// Compute and log patch
		if (oldData) {
			const patch = this.computePatch(oldData, data);
			if (patch.length > 0) {
				this.operationLog.append({
					entityKey: key,
					version: newVersion,
					timestamp: Date.now(),
					patch,
					patchSize: JSON.stringify(patch).length,
				});
			}
		}
	}

	/** Delete entity */
	deleteEntity(entity: string, id: string): void {
		const key = `${entity}:${id}`;
		this.canonical.delete(key);
		this.versions.delete(key);
	}

	/** Get current state */
	getState(entity: string, id: string): Record<string, unknown> | undefined {
		return this.canonical.get(`${entity}:${id}`);
	}

	/** Get current version */
	getVersion(entity: string, id: string): Version {
		return this.versions.get(`${entity}:${id}`) ?? 0;
	}

	/** Handle reconnection request */
	handleReconnect(subscriptions: ReconnectSubscription[]): ReconnectResult[] {
		return subscriptions.map((sub) => this.processSubscription(sub));
	}

	private processSubscription(sub: ReconnectSubscription): ReconnectResult {
		const key = `${sub.entity}:${sub.entityId}`;
		const currentVersion = this.versions.get(key);
		const currentState = this.canonical.get(key);

		// Entity doesn't exist
		if (currentVersion === undefined || currentState === undefined) {
			return {
				id: sub.id,
				entity: sub.entity,
				entityId: sub.entityId,
				status: "deleted" as ReconnectStatus,
				version: 0,
			};
		}

		// Client is up-to-date
		if (sub.version >= currentVersion) {
			// Verify hash if provided
			if (sub.dataHash) {
				const serverHash = hashEntityState(currentState);
				if (sub.dataHash !== serverHash) {
					return {
						id: sub.id,
						entity: sub.entity,
						entityId: sub.entityId,
						status: "snapshot" as ReconnectStatus,
						version: currentVersion,
						data: currentState,
					};
				}
			}
			return {
				id: sub.id,
				entity: sub.entity,
				entityId: sub.entityId,
				status: "current" as ReconnectStatus,
				version: currentVersion,
			};
		}

		// Try patches
		const entries = this.operationLog.getSince(key, sub.version);
		if (entries !== null && entries.length > 0) {
			return {
				id: sub.id,
				entity: sub.entity,
				entityId: sub.entityId,
				status: "patched" as ReconnectStatus,
				version: currentVersion,
				patches: entries.map((e) => e.patch),
			};
		}

		// Full snapshot needed
		return {
			id: sub.id,
			entity: sub.entity,
			entityId: sub.entityId,
			status: "snapshot" as ReconnectStatus,
			version: currentVersion,
			data: currentState,
		};
	}

	private computePatch(oldData: Record<string, unknown>, newData: Record<string, unknown>): PatchOperation[] {
		const patch: PatchOperation[] = [];
		const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

		for (const key of allKeys) {
			const oldVal = oldData[key];
			const newVal = newData[key];

			if (!(key in newData)) {
				patch.push({ op: "remove", path: `/${key}` });
			} else if (!(key in oldData)) {
				patch.push({ op: "add", path: `/${key}`, value: newVal });
			} else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
				patch.push({ op: "replace", path: `/${key}`, value: newVal });
			}
		}

		return patch;
	}

	dispose(): void {
		this.operationLog.dispose();
	}
}

// =============================================================================
// Integration Tests
// =============================================================================

describe("reconnection integration", () => {
	describe("full reconnection flow", () => {
		it("handles client that is already up-to-date", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Server has user at version 3
			server.setState("user", "123", { name: "Alice", email: "alice@example.com" });
			server.setState("user", "123", { name: "Alice", email: "alice@test.com" });
			server.setState("user", "123", { name: "Alice", email: "alice@final.com" });

			// Client subscribed and received version 3
			const data = server.getState("user", "123")!;
			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0, // Initial version
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			// Simulate receiving initial data (makes subscription active)
			clientRegistry.updateVersion("sub-1", 3, data);

			// Simulate disconnect and reconnect
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();

			// Server processes reconnect
			const results = server.handleReconnect(reconnectSubs);

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("current");
			expect(results[0].version).toBe(3);
			expect(results[0].data).toBeUndefined();
			expect(results[0].patches).toBeUndefined();

			server.dispose();
		});

		it("sends patches when client is slightly behind", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Initial state
			server.setState("user", "123", { name: "Alice", age: 25 });

			// Client subscribed and received version 1
			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			clientRegistry.updateVersion("sub-1", 1, { name: "Alice", age: 25 });

			// Server updates (while client disconnected)
			server.setState("user", "123", { name: "Alice", age: 26 }); // v2
			server.setState("user", "123", { name: "Alice", age: 27 }); // v3

			// Client reconnects
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();
			const results = server.handleReconnect(reconnectSubs);

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("patched");
			expect(results[0].version).toBe(3);
			expect(results[0].patches).toBeDefined();
			expect(results[0].patches!.length).toBe(2);

			// Apply patches to client data
			let clientData = clientRegistry.getLastData("sub-1")!;
			for (const patchSet of results[0].patches!) {
				clientData = applyPatch(clientData, patchSet);
			}

			expect(clientData).toEqual({ name: "Alice", age: 27 });

			server.dispose();
		});

		it("sends full snapshot when patches unavailable", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Server with current state
			server.setState("user", "123", { name: "Bob", email: "bob@example.com" });

			// Client has very old version (patches expired)
			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			// Mark as active with old/no data (simulating reconnection after long disconnect)
			clientRegistry.markActive("sub-1");

			// Reconnect
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();
			const results = server.handleReconnect(reconnectSubs);

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("snapshot");
			expect(results[0].version).toBe(1);
			expect(results[0].data).toEqual({ name: "Bob", email: "bob@example.com" });

			server.dispose();
		});

		it("reports deleted entities", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Server had entity but deleted it
			server.setState("user", "456", { name: "Charlie" });
			server.deleteEntity("user", "456");

			// Client still has subscription (was active before disconnect)
			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "456",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "456" },
			});
			clientRegistry.updateVersion("sub-1", 1, { name: "Charlie" });

			// Reconnect
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();
			const results = server.handleReconnect(reconnectSubs);

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("deleted");
			expect(results[0].version).toBe(0);

			server.dispose();
		});

		it("handles multiple subscriptions in single reconnect", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Set up multiple entities
			server.setState("user", "1", { name: "Alice" });
			server.setState("user", "2", { name: "Bob" });
			server.setState("post", "1", { title: "Hello" });

			// Client subscriptions at different versions
			clientRegistry.add({
				id: "sub-user-1",
				entity: "user",
				entityId: "1",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "1" },
			});
			clientRegistry.updateVersion("sub-user-1", 1, { name: "Alice" });

			clientRegistry.add({
				id: "sub-user-2",
				entity: "user",
				entityId: "2",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "2" },
			});
			// sub-user-2 is behind - only mark active but at v0
			clientRegistry.markActive("sub-user-2");

			clientRegistry.add({
				id: "sub-post-1",
				entity: "post",
				entityId: "1",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "1" },
			});
			clientRegistry.updateVersion("sub-post-1", 1, { title: "Hello" });

			// Update user 2
			server.setState("user", "2", { name: "Bobby" });

			// Reconnect
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();
			const results = server.handleReconnect(reconnectSubs);

			expect(results).toHaveLength(3);

			const user1Result = results.find((r) => r.id === "sub-user-1");
			const user2Result = results.find((r) => r.id === "sub-user-2");
			const post1Result = results.find((r) => r.id === "sub-post-1");

			expect(user1Result?.status).toBe("current");
			expect(user2Result?.status).toBe("snapshot"); // Was at v0, now v2
			expect(post1Result?.status).toBe("current");

			server.dispose();
		});
	});

	describe("hash verification", () => {
		it("detects data corruption via hash mismatch", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			// Server state
			const serverData = { name: "Alice", score: 100 };
			server.setState("user", "123", serverData);

			// Client has same version but corrupted data
			const corruptedData = { name: "Alice", score: 999 }; // Different!
			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			// Simulate client received data but it got corrupted
			clientRegistry.updateVersion("sub-1", 1, corruptedData);

			// Reconnect with hash
			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();

			// Hash will be of corrupted data
			expect(reconnectSubs[0].dataHash).toBe(hashEntityState(corruptedData));
			expect(reconnectSubs[0].dataHash).not.toBe(hashEntityState(serverData));

			// Server detects mismatch and sends snapshot
			const results = server.handleReconnect(reconnectSubs);

			expect(results[0].status).toBe("snapshot");
			expect(results[0].data).toEqual(serverData);

			server.dispose();
		});

		it("confirms data integrity via hash match", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			const data = { name: "Alice", verified: true };
			server.setState("user", "123", data);

			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			clientRegistry.updateVersion("sub-1", 1, data);

			clientRegistry.markAllReconnecting();
			const reconnectSubs = clientRegistry.getAllForReconnect();

			// Hash matches
			expect(reconnectSubs[0].dataHash).toBe(hashEntityState(data));

			const results = server.handleReconnect(reconnectSubs);
			expect(results[0].status).toBe("current");

			server.dispose();
		});
	});

	describe("patch coalescing", () => {
		it("coalesces multiple patches efficiently", () => {
			// Simulate multiple field updates
			const patches: PatchOperation[][] = [
				[{ op: "replace", path: "/name", value: "Alice" }],
				[{ op: "replace", path: "/age", value: 26 }],
				[{ op: "replace", path: "/name", value: "Alicia" }], // Overwrites first
				[{ op: "replace", path: "/status", value: "active" }],
				[{ op: "remove", path: "/temp" }],
			];

			const coalesced = coalescePatches(patches);

			// Should have unique paths only, last value wins
			expect(coalesced.find((p) => p.path === "/name")?.value).toBe("Alicia");
			expect(coalesced.find((p) => p.path === "/age")?.value).toBe(26);
			expect(coalesced.find((p) => p.path === "/status")?.value).toBe("active");
			expect(coalesced.find((p) => p.path === "/temp")?.op).toBe("remove");
		});
	});

	describe("protocol message format", () => {
		it("generates valid reconnect message", () => {
			const clientRegistry = new SubscriptionRegistry();

			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: ["name", "email"],
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			clientRegistry.updateVersion("sub-1", 5, { name: "Alice", email: "alice@example.com" });

			clientRegistry.markAllReconnecting();
			const subscriptions = clientRegistry.getAllForReconnect();

			const message: ReconnectMessage = {
				type: "reconnect",
				protocolVersion: PROTOCOL_VERSION,
				subscriptions,
				reconnectId: generateReconnectId(),
				clientTime: Date.now(),
			};

			expect(message.type).toBe("reconnect");
			expect(message.protocolVersion).toBe(PROTOCOL_VERSION);
			expect(message.subscriptions).toHaveLength(1);
			expect(message.subscriptions[0].id).toBe("sub-1");
			expect(message.subscriptions[0].entity).toBe("user");
			expect(message.subscriptions[0].entityId).toBe("123");
			expect(message.subscriptions[0].version).toBe(5);
			expect(message.subscriptions[0].dataHash).toBeDefined();
			expect(message.reconnectId).toMatch(/^rc_\d+_/);
		});
	});

	describe("edge cases", () => {
		it("handles empty subscription list", () => {
			const server = new TestServerStateManager();
			const results = server.handleReconnect([]);
			expect(results).toEqual([]);
			server.dispose();
		});

		it("handles subscription with no data hash", () => {
			const server = new TestServerStateManager();
			server.setState("user", "123", { name: "Alice" });

			const sub: ReconnectSubscription = {
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 1,
				// No dataHash
			};

			const results = server.handleReconnect([sub]);
			expect(results[0].status).toBe("current");

			server.dispose();
		});

		it("handles rapid reconnection attempts", () => {
			const server = new TestServerStateManager();
			const clientRegistry = new SubscriptionRegistry();

			server.setState("user", "123", { count: 0 });

			clientRegistry.add({
				id: "sub-1",
				entity: "user",
				entityId: "123",
				fields: "*",
				version: 0,
				lastData: null,
				observer: { next: () => {} },
				input: { id: "123" },
			});
			clientRegistry.updateVersion("sub-1", 1, { count: 0 });

			// Simulate multiple rapid reconnections
			for (let i = 0; i < 5; i++) {
				clientRegistry.markAllReconnecting();
				const subs = clientRegistry.getAllForReconnect();
				const results = server.handleReconnect(subs);

				expect(results[0].status).toBe("current");

				// Process result
				clientRegistry.processReconnectResult("sub-1", results[0].version);
			}

			expect(clientRegistry.getVersion("sub-1")).toBe(1);

			server.dispose();
		});

		it("handles concurrent entity updates during reconnection", () => {
			const server = new TestServerStateManager();

			// Initial state
			server.setState("counter", "1", { value: 10 });

			const sub: ReconnectSubscription = {
				id: "sub-1",
				entity: "counter",
				entityId: "1",
				fields: "*",
				version: 0,
			};

			// Simulate update happening during reconnection processing
			server.setState("counter", "1", { value: 11 });
			server.setState("counter", "1", { value: 12 });

			const results = server.handleReconnect([sub]);

			// Should get latest state
			expect(results[0].version).toBe(3);
			if (results[0].status === "snapshot") {
				expect(results[0].data).toEqual({ value: 12 });
			}

			server.dispose();
		});
	});

	describe("operation log behavior", () => {
		it("respects operation log limits", () => {
			const log = new OperationLog({ maxEntries: 3, maxAge: 60000, cleanupInterval: 0 });

			// Add more entries than limit
			for (let i = 1; i <= 5; i++) {
				log.append({
					entityKey: "user:1",
					version: i,
					timestamp: Date.now(),
					patch: [{ op: "replace", path: "/count", value: i }],
					patchSize: 50,
				});
			}

			// Old entries should be evicted
			const stats = log.getStats();
			expect(stats.entryCount).toBeLessThanOrEqual(3);

			// Can't get patches from very old versions
			const oldPatches = log.getSince("user:1", 0);
			expect(oldPatches).toBeNull(); // Too old

			log.dispose();
		});

		it("maintains version continuity", () => {
			const log = new OperationLog({ maxEntries: 100 });

			// Add continuous versions
			for (let i = 1; i <= 5; i++) {
				log.append({
					entityKey: "entity:1",
					version: i,
					timestamp: Date.now(),
					patch: [{ op: "replace", path: "/v", value: i }],
					patchSize: 30,
				});
			}

			// Should get all patches from version 2
			const patches = log.getSince("entity:1", 2);
			expect(patches).not.toBeNull();
			expect(patches!.length).toBe(3); // v3, v4, v5
			expect(patches![0].version).toBe(3);
			expect(patches![1].version).toBe(4);
			expect(patches![2].version).toBe(5);

			log.dispose();
		});
	});
});
