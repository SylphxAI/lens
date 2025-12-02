/**
 * @sylphx/lens-core - Operation Log Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	OperationLog,
	applyPatch,
	coalescePatches,
	estimatePatchSize,
} from "./operation-log.js";
import type { OperationLogEntry, PatchOperation } from "./types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createEntry(
	entityKey: string,
	version: number,
	patch: PatchOperation[] = [],
	timestamp = Date.now()
): OperationLogEntry {
	return {
		entityKey,
		version,
		timestamp,
		patch,
		patchSize: JSON.stringify(patch).length,
	};
}

// =============================================================================
// OperationLog Tests
// =============================================================================

describe("OperationLog", () => {
	let log: OperationLog;

	beforeEach(() => {
		log = new OperationLog({ cleanupInterval: 0 }); // Disable auto cleanup for tests
	});

	afterEach(() => {
		log.dispose();
	});

	// ===========================================================================
	// Basic Operations
	// ===========================================================================

	describe("append", () => {
		it("appends entries correctly", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));

			const stats = log.getStats();
			expect(stats.entryCount).toBe(2);
		});

		it("tracks memory usage", () => {
			const patch = [{ op: "replace" as const, path: "/name", value: "Alice" }];
			log.append(createEntry("user:123", 1, patch));

			const stats = log.getStats();
			expect(stats.memoryUsage).toBeGreaterThan(0);
		});

		it("updates entity indices", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("post:456", 1));

			const stats = log.getStats();
			expect(stats.entityCount).toBe(2);
		});
	});

	describe("appendBatch", () => {
		it("appends multiple entries efficiently", () => {
			const entries = [
				createEntry("user:123", 1),
				createEntry("user:123", 2),
				createEntry("user:123", 3),
			];

			log.appendBatch(entries);

			const stats = log.getStats();
			expect(stats.entryCount).toBe(3);
		});
	});

	// ===========================================================================
	// Retrieval
	// ===========================================================================

	describe("getSince", () => {
		it("returns entries since version", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));
			log.append(createEntry("user:123", 3));

			const entries = log.getSince("user:123", 1);
			expect(entries).not.toBeNull();
			expect(entries!.length).toBe(2);
			expect(entries![0].version).toBe(2);
			expect(entries![1].version).toBe(3);
		});

		it("returns empty array when at latest version", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));

			const entries = log.getSince("user:123", 2);
			expect(entries).toEqual([]);
		});

		it("returns null when version too old", () => {
			log.append(createEntry("user:123", 5));
			log.append(createEntry("user:123", 6));

			const entries = log.getSince("user:123", 2);
			expect(entries).toBeNull();
		});

		it("returns empty array for unknown entity with fromVersion 0", () => {
			log.append(createEntry("user:123", 1));

			// Unknown entity with fromVersion=0 means "I've never seen this entity"
			// Return empty array because there's nothing to sync (entity doesn't exist for this client)
			const entries = log.getSince("user:456", 0);
			expect(entries).toEqual([]);
		});

		it("returns null for unknown entity with fromVersion > 0", () => {
			log.append(createEntry("user:123", 1));

			// Unknown entity with fromVersion > 0 means client had data that no longer exists
			const entries = log.getSince("user:456", 5);
			expect(entries).toBeNull();
		});

		it("returns entries in version order", () => {
			// Append out of order (simulating concurrent operations)
			log.append(createEntry("user:123", 3));
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));

			const entries = log.getSince("user:123", 0);
			expect(entries).not.toBeNull();
			expect(entries!.map((e) => e.version)).toEqual([1, 2, 3]);
		});

		it("handles version gap correctly", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 3)); // Gap at version 2

			// Asking for version 0 should fail (gap detected)
			const entries = log.getSince("user:123", 0);
			expect(entries).toBeNull();
		});
	});

	describe("hasVersion", () => {
		it("returns true for versions in range", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));
			log.append(createEntry("user:123", 3));

			expect(log.hasVersion("user:123", 1)).toBe(true);
			expect(log.hasVersion("user:123", 2)).toBe(true);
			expect(log.hasVersion("user:123", 3)).toBe(true);
		});

		it("returns false for versions out of range", () => {
			log.append(createEntry("user:123", 2));
			log.append(createEntry("user:123", 3));

			expect(log.hasVersion("user:123", 1)).toBe(false);
			expect(log.hasVersion("user:123", 4)).toBe(false);
		});

		it("returns false for unknown entity", () => {
			expect(log.hasVersion("user:123", 1)).toBe(false);
		});
	});

	describe("getOldestVersion / getNewestVersion", () => {
		it("returns correct versions", () => {
			log.append(createEntry("user:123", 5));
			log.append(createEntry("user:123", 6));
			log.append(createEntry("user:123", 7));

			expect(log.getOldestVersion("user:123")).toBe(5);
			expect(log.getNewestVersion("user:123")).toBe(7);
		});

		it("returns null for unknown entity", () => {
			expect(log.getOldestVersion("user:123")).toBeNull();
			expect(log.getNewestVersion("user:123")).toBeNull();
		});
	});

	describe("getAll", () => {
		it("returns all entries for entity", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));
			log.append(createEntry("post:456", 1));

			const entries = log.getAll("user:123");
			expect(entries.length).toBe(2);
		});

		it("returns entries in version order", () => {
			log.append(createEntry("user:123", 3));
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));

			const entries = log.getAll("user:123");
			expect(entries.map((e) => e.version)).toEqual([1, 2, 3]);
		});
	});

	// ===========================================================================
	// Eviction
	// ===========================================================================

	describe("eviction", () => {
		it("evicts based on maxEntries", () => {
			const smallLog = new OperationLog({
				maxEntries: 3,
				cleanupInterval: 0,
			});

			smallLog.append(createEntry("user:123", 1));
			smallLog.append(createEntry("user:123", 2));
			smallLog.append(createEntry("user:123", 3));
			smallLog.append(createEntry("user:123", 4));
			smallLog.append(createEntry("user:123", 5));

			const stats = smallLog.getStats();
			expect(stats.entryCount).toBeLessThanOrEqual(3);

			smallLog.dispose();
		});

		it("evicts based on maxAge", () => {
			const oldLog = new OperationLog({
				maxAge: 100, // 100ms
				cleanupInterval: 0,
			});

			const oldTimestamp = Date.now() - 200; // 200ms ago
			oldLog.append(createEntry("user:123", 1, [], oldTimestamp));
			oldLog.append(createEntry("user:123", 2, [], Date.now()));

			oldLog.cleanup();

			const stats = oldLog.getStats();
			expect(stats.entryCount).toBe(1);

			oldLog.dispose();
		});

		it("evicts based on maxMemory", () => {
			const smallMemLog = new OperationLog({
				maxMemory: 100, // 100 bytes
				cleanupInterval: 0,
			});

			const largePatch = [
				{
					op: "replace" as const,
					path: "/data",
					value: "x".repeat(50),
				},
			];

			smallMemLog.append(createEntry("user:123", 1, largePatch));
			smallMemLog.append(createEntry("user:123", 2, largePatch));
			smallMemLog.append(createEntry("user:123", 3, largePatch));

			const stats = smallMemLog.getStats();
			expect(stats.memoryUsage).toBeLessThanOrEqual(100);

			smallMemLog.dispose();
		});
	});

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	describe("lifecycle", () => {
		it("clears all entries", () => {
			log.append(createEntry("user:123", 1));
			log.append(createEntry("user:123", 2));

			log.clear();

			const stats = log.getStats();
			expect(stats.entryCount).toBe(0);
			expect(stats.entityCount).toBe(0);
		});

		it("updates config", () => {
			log.updateConfig({ maxEntries: 5 });

			const stats = log.getStats();
			expect(stats.config.maxEntries).toBe(5);
		});
	});

	// ===========================================================================
	// Statistics
	// ===========================================================================

	describe("getStats", () => {
		it("returns correct statistics", () => {
			const timestamp = Date.now();
			log.append(createEntry("user:123", 1, [], timestamp));
			log.append(createEntry("user:123", 2, [], timestamp + 100));
			log.append(createEntry("post:456", 1, [], timestamp + 200));

			const stats = log.getStats();
			expect(stats.entryCount).toBe(3);
			expect(stats.entityCount).toBe(2);
			expect(stats.oldestTimestamp).toBe(timestamp);
			expect(stats.newestTimestamp).toBe(timestamp + 200);
		});

		it("returns null timestamps for empty log", () => {
			const stats = log.getStats();
			expect(stats.oldestTimestamp).toBeNull();
			expect(stats.newestTimestamp).toBeNull();
		});
	});
});

// =============================================================================
// coalescePatches Tests
// =============================================================================

describe("coalescePatches", () => {
	it("merges sequential replace operations", () => {
		const patches: PatchOperation[][] = [
			[{ op: "replace", path: "/name", value: "Alice" }],
			[{ op: "replace", path: "/name", value: "Bob" }],
		];

		const coalesced = coalescePatches(patches);
		expect(coalesced.length).toBe(1);
		expect(coalesced[0].value).toBe("Bob");
	});

	it("preserves different paths", () => {
		const patches: PatchOperation[][] = [
			[{ op: "replace", path: "/name", value: "Alice" }],
			[{ op: "replace", path: "/age", value: 30 }],
		];

		const coalesced = coalescePatches(patches);
		expect(coalesced.length).toBe(2);
	});

	it("remove trumps add/replace", () => {
		const patches: PatchOperation[][] = [
			[{ op: "add", path: "/name", value: "Alice" }],
			[{ op: "remove", path: "/name" }],
		];

		const coalesced = coalescePatches(patches);
		expect(coalesced.length).toBe(1);
		expect(coalesced[0].op).toBe("remove");
	});

	it("handles empty patches", () => {
		const patches: PatchOperation[][] = [[], []];
		const coalesced = coalescePatches(patches);
		expect(coalesced.length).toBe(0);
	});

	it("sorts by path depth", () => {
		const patches: PatchOperation[][] = [
			[{ op: "replace", path: "/a/b/c", value: 1 }],
			[{ op: "replace", path: "/a", value: 2 }],
			[{ op: "replace", path: "/a/b", value: 3 }],
		];

		const coalesced = coalescePatches(patches);
		expect(coalesced[0].path).toBe("/a");
		expect(coalesced[1].path).toBe("/a/b");
		expect(coalesced[2].path).toBe("/a/b/c");
	});
});

// =============================================================================
// estimatePatchSize Tests
// =============================================================================

describe("estimatePatchSize", () => {
	it("estimates size correctly", () => {
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/name", value: "Alice" },
		];

		const size = estimatePatchSize(patch);
		expect(size).toBeGreaterThan(0);
		expect(size).toBe(JSON.stringify(patch).length);
	});

	it("returns 2 for empty patch", () => {
		const size = estimatePatchSize([]);
		expect(size).toBe(2); // "[]"
	});
});

// =============================================================================
// applyPatch Tests
// =============================================================================

describe("applyPatch", () => {
	it("applies replace operation", () => {
		const target = { name: "Alice", age: 30 };
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/name", value: "Bob" },
		];

		const result = applyPatch(target, patch);
		expect(result.name).toBe("Bob");
		expect(result.age).toBe(30);
	});

	it("applies add operation", () => {
		const target = { name: "Alice" };
		const patch: PatchOperation[] = [{ op: "add", path: "/age", value: 30 }];

		const result = applyPatch(target, patch);
		expect(result.name).toBe("Alice");
		expect(result.age).toBe(30);
	});

	it("applies remove operation", () => {
		const target = { name: "Alice", age: 30 };
		const patch: PatchOperation[] = [{ op: "remove", path: "/age" }];

		const result = applyPatch(target, patch);
		expect(result.name).toBe("Alice");
		expect("age" in result).toBe(false);
	});

	it("applies nested operations", () => {
		const target = { user: { name: "Alice", address: { city: "NYC" } } };
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/user/address/city", value: "LA" },
		];

		const result = applyPatch(target, patch);
		expect(result.user.address.city).toBe("LA");
	});

	it("does not mutate original", () => {
		const target = { name: "Alice" };
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/name", value: "Bob" },
		];

		applyPatch(target, patch);
		expect(target.name).toBe("Alice");
	});

	it("handles multiple operations", () => {
		const target = { name: "Alice", age: 30 };
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/name", value: "Bob" },
			{ op: "replace", path: "/age", value: 31 },
			{ op: "add", path: "/city", value: "NYC" },
		];

		const result = applyPatch(target, patch);
		expect(result.name).toBe("Bob");
		expect(result.age).toBe(31);
		expect((result as Record<string, unknown>).city).toBe("NYC");
	});

	it("handles JSON pointer escaping", () => {
		const target = { "a/b": 1, "a~b": 2 };
		const patch: PatchOperation[] = [
			{ op: "replace", path: "/a~1b", value: 10 }, // a/b
			{ op: "replace", path: "/a~0b", value: 20 }, // a~b
		];

		const result = applyPatch(target, patch);
		expect(result["a/b"]).toBe(10);
		expect(result["a~b"]).toBe(20);
	});
});
