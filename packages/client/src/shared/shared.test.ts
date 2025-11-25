/**
 * @sylphx/client - Shared Utilities Tests
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { makeQueryKey, makeQueryKeyWithFields, parseQueryKey } from "./keys";
import { BatchScheduler } from "./batching";
import { RequestDeduplicator } from "./dedup";

// =============================================================================
// Key Utilities Tests
// =============================================================================

describe("Key Utilities", () => {
	describe("Query Keys", () => {
		it("creates query key without input", () => {
			expect(makeQueryKey("whoami", undefined)).toBe("whoami:");
		});

		it("creates query key with input", () => {
			expect(makeQueryKey("getUser", { id: "123" })).toBe('getUser:{"id":"123"}');
		});

		it("creates query key with fields", () => {
			expect(makeQueryKeyWithFields("getUser", { id: "123" }, ["name", "email"])).toBe(
				'getUser:{"id":"123"}:email,name',
			);
		});

		it("sorts fields for consistent keys", () => {
			const key1 = makeQueryKeyWithFields("getUser", { id: "123" }, ["name", "email"]);
			const key2 = makeQueryKeyWithFields("getUser", { id: "123" }, ["email", "name"]);
			expect(key1).toBe(key2);
		});

		it("parses query key", () => {
			expect(parseQueryKey("whoami:")).toEqual({ operation: "whoami", input: undefined });
			expect(parseQueryKey('getUser:{"id":"123"}')).toEqual({
				operation: "getUser",
				input: { id: "123" },
			});
		});
	});
});

// =============================================================================
// BatchScheduler Tests
// =============================================================================

describe("BatchScheduler", () => {
	it("batches items and processes after delay", async () => {
		const processed: number[][] = [];
		const scheduler = new BatchScheduler<number>(
			(items) => {
				processed.push([...items]);
			},
			{ delay: 10 },
		);

		scheduler.add(1);
		scheduler.add(2);
		scheduler.add(3);

		expect(processed).toHaveLength(0);
		expect(scheduler.pending).toBe(3);

		await new Promise((r) => setTimeout(r, 20));

		expect(processed).toHaveLength(1);
		expect(processed[0]).toEqual([1, 2, 3]);
		expect(scheduler.pending).toBe(0);
	});

	it("flushes immediately when called", () => {
		const processed: number[][] = [];
		const scheduler = new BatchScheduler<number>(
			(items) => {
				processed.push([...items]);
			},
			{ delay: 1000 },
		);

		scheduler.add(1);
		scheduler.add(2);
		scheduler.flush();

		expect(processed).toHaveLength(1);
		expect(processed[0]).toEqual([1, 2]);
	});

	it("auto-flushes at max size", () => {
		const processed: number[][] = [];
		const scheduler = new BatchScheduler<number>(
			(items) => {
				processed.push([...items]);
			},
			{ delay: 1000, maxSize: 3 },
		);

		scheduler.add(1);
		scheduler.add(2);
		expect(processed).toHaveLength(0);

		scheduler.add(3);
		expect(processed).toHaveLength(1);
		expect(processed[0]).toEqual([1, 2, 3]);
	});

	it("cancels pending batch", () => {
		const processed: number[][] = [];
		const scheduler = new BatchScheduler<number>(
			(items) => {
				processed.push([...items]);
			},
			{ delay: 10 },
		);

		scheduler.add(1);
		scheduler.add(2);
		scheduler.cancel();

		expect(scheduler.pending).toBe(0);
		expect(processed).toHaveLength(0);
	});
});

// =============================================================================
// RequestDeduplicator Tests
// =============================================================================

describe("RequestDeduplicator", () => {
	it("deduplicates concurrent requests", async () => {
		let callCount = 0;
		const dedup = new RequestDeduplicator<number>();

		const factory = async () => {
			callCount++;
			await new Promise((r) => setTimeout(r, 50));
			return 42;
		};

		const [result1, result2, result3] = await Promise.all([
			dedup.dedupe("key", factory),
			dedup.dedupe("key", factory),
			dedup.dedupe("key", factory),
		]);

		expect(callCount).toBe(1);
		expect(result1).toBe(42);
		expect(result2).toBe(42);
		expect(result3).toBe(42);
	});

	it("makes separate requests for different keys", async () => {
		let callCount = 0;
		const dedup = new RequestDeduplicator<string>();

		const factory = (key: string) => async () => {
			callCount++;
			return key;
		};

		const [result1, result2] = await Promise.all([
			dedup.dedupe("key1", factory("key1")),
			dedup.dedupe("key2", factory("key2")),
		]);

		expect(callCount).toBe(2);
		expect(result1).toBe("key1");
		expect(result2).toBe("key2");
	});

	it("allows new request after previous completes", async () => {
		let callCount = 0;
		const dedup = new RequestDeduplicator<number>();

		const result1 = await dedup.dedupe("key", async () => {
			callCount++;
			return 1;
		});

		const result2 = await dedup.dedupe("key", async () => {
			callCount++;
			return 2;
		});

		expect(callCount).toBe(2);
		expect(result1).toBe(1);
		expect(result2).toBe(2);
	});

	it("cleans up after error", async () => {
		const dedup = new RequestDeduplicator<number>();

		try {
			await dedup.dedupe("key", async () => {
				throw new Error("test error");
			});
		} catch {
			// Expected
		}

		expect(dedup.has("key")).toBe(false);

		// Should allow new request
		const result = await dedup.dedupe("key", async () => 42);
		expect(result).toBe(42);
	});
});
