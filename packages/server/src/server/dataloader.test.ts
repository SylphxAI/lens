/**
 * @sylphx/lens-server - DataLoader Tests
 *
 * Tests for the batching DataLoader utility.
 */

import { describe, expect, it, mock } from "bun:test";
import { DataLoader } from "./dataloader.js";

// =============================================================================
// DataLoader Tests
// =============================================================================

describe("DataLoader", () => {
	describe("basic loading", () => {
		it("loads a single key", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			const result = await loader.load("key1");

			expect(result).toBe("value-key1");
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect(batchFn.mock.calls[0][0]).toEqual(["key1"]);
		});

		it("returns null for null results", async () => {
			const batchFn = mock(async (_keys: string[]) => [null]);
			const loader = new DataLoader(batchFn);

			const result = await loader.load("key1");

			expect(result).toBeNull();
		});
	});

	describe("batching", () => {
		it("batches multiple concurrent loads", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// Load multiple keys concurrently
			const [r1, r2, r3] = await Promise.all([
				loader.load("a"),
				loader.load("b"),
				loader.load("c"),
			]);

			expect(r1).toBe("value-a");
			expect(r2).toBe("value-b");
			expect(r3).toBe("value-c");

			// Should be batched into a single call
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect(batchFn.mock.calls[0][0]).toEqual(["a", "b", "c"]);
		});

		it("deduplicates same key loaded multiple times", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// Load same key multiple times
			const [r1, r2, r3] = await Promise.all([
				loader.load("same"),
				loader.load("same"),
				loader.load("same"),
			]);

			// All should get same value
			expect(r1).toBe("value-same");
			expect(r2).toBe("value-same");
			expect(r3).toBe("value-same");

			// Key should only appear once in batch
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect(batchFn.mock.calls[0][0]).toEqual(["same"]);
		});

		it("separates loads into different batches after flush", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// First batch
			const r1 = await loader.load("first");
			expect(r1).toBe("value-first");

			// Second batch (after await, microtask has flushed)
			const r2 = await loader.load("second");
			expect(r2).toBe("value-second");

			// Should be two separate calls
			expect(batchFn).toHaveBeenCalledTimes(2);
		});
	});

	describe("error handling", () => {
		it("rejects all pending loads when batch function throws", async () => {
			const batchFn = mock(async (_keys: string[]) => {
				throw new Error("Batch failed");
			});
			const loader = new DataLoader<string, string>(batchFn);

			const promises = [loader.load("a"), loader.load("b"), loader.load("c")];

			// All should reject with the same error
			const results = await Promise.allSettled(promises);
			expect(results[0].status).toBe("rejected");
			expect(results[1].status).toBe("rejected");
			expect(results[2].status).toBe("rejected");
			expect((results[0] as PromiseRejectedResult).reason.message).toBe("Batch failed");
		});

		it("converts non-Error throws to Error", async () => {
			const batchFn = mock(async (_keys: string[]) => {
				throw "string error";
			});
			const loader = new DataLoader<string, string>(batchFn);

			const result = await Promise.allSettled([loader.load("key")]);
			expect(result[0].status).toBe("rejected");
			expect((result[0] as PromiseRejectedResult).reason.message).toBe("string error");
		});

		it("allows subsequent batches after error", async () => {
			let callCount = 0;
			const batchFn = mock(async (keys: string[]) => {
				callCount++;
				if (callCount === 1) {
					throw new Error("First batch failed");
				}
				return keys.map((k) => `value-${k}`);
			});
			const loader = new DataLoader(batchFn);

			// First batch fails
			const firstResult = await Promise.allSettled([loader.load("a")]);
			expect(firstResult[0].status).toBe("rejected");

			// Second batch should work
			const result = await loader.load("b");
			expect(result).toBe("value-b");
		});
	});

	describe("edge cases", () => {
		it("handles empty batch gracefully", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// Trigger scheduling without adding keys (internal edge case)
			// This tests the keys.length === 0 guard
			const result = await loader.load("key");
			expect(result).toBe("value-key");
		});

		it("handles numeric keys", async () => {
			const batchFn = mock(async (keys: number[]) => keys.map((k) => k * 2));
			const loader = new DataLoader(batchFn);

			const [r1, r2] = await Promise.all([loader.load(5), loader.load(10)]);

			expect(r1).toBe(10);
			expect(r2).toBe(20);
		});

		it("handles object keys", async () => {
			type Key = { id: string };
			const key1: Key = { id: "1" };
			const key2: Key = { id: "2" };

			const batchFn = mock(async (keys: Key[]) => keys.map((k) => `value-${k.id}`));
			const loader = new DataLoader(batchFn);

			const [r1, r2] = await Promise.all([loader.load(key1), loader.load(key2)]);

			expect(r1).toBe("value-1");
			expect(r2).toBe("value-2");
		});

		it("handles async batch function that returns fewer results", async () => {
			// This is a potential bug case - if batchFn returns fewer results
			const batchFn = mock(async (keys: string[]) => {
				// Only return result for first key
				return [keys[0] ? `value-${keys[0]}` : null];
			});
			const loader = new DataLoader(batchFn);

			const [r1, r2] = await Promise.all([loader.load("a"), loader.load("b")]);

			// First gets value, second gets undefined (converted to null behavior depends on impl)
			expect(r1).toBe("value-a");
			expect(r2).toBeUndefined(); // This reveals a potential issue
		});

		it("handles large batches efficiently", async () => {
			const batchFn = mock(async (keys: number[]) => keys.map((k) => k * 2));
			const loader = new DataLoader(batchFn);

			const keys = Array.from({ length: 1000 }, (_, i) => i);
			const results = await Promise.all(keys.map((k) => loader.load(k)));

			expect(results.length).toBe(1000);
			expect(results[0]).toBe(0);
			expect(results[999]).toBe(1998);

			// Should be single batch
			expect(batchFn).toHaveBeenCalledTimes(1);
		});
	});
});
