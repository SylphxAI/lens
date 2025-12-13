/**
 * @sylphx/lens-server - DataLoader Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { DataLoader } from "./dataloader.js";

// =============================================================================
// Basic Functionality Tests
// =============================================================================

describe("DataLoader", () => {
	describe("load()", () => {
		it("returns value from batch function", async () => {
			const batchFn = async (keys: string[]) => keys.map((k) => `value-${k}`);
			const loader = new DataLoader(batchFn);

			const result = await loader.load("key1");

			expect(result).toBe("value-key1");
		});

		it("returns null when batch function returns null", async () => {
			const batchFn = async (_keys: string[]) => [null];
			const loader = new DataLoader(batchFn);

			const result = await loader.load("key1");

			expect(result).toBeNull();
		});

		it("batches multiple load calls in same microtask", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// Call load multiple times synchronously
			const promise1 = loader.load("key1");
			const promise2 = loader.load("key2");
			const promise3 = loader.load("key3");

			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

			// Should have been called only once with all keys
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect(batchFn).toHaveBeenCalledWith(["key1", "key2", "key3"]);

			expect(result1).toBe("value-key1");
			expect(result2).toBe("value-key2");
			expect(result3).toBe("value-key3");
		});

		it("deduplicates same key in batch", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// Call load with same key multiple times
			const promise1 = loader.load("key1");
			const promise2 = loader.load("key1");
			const promise3 = loader.load("key1");

			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

			// Should have been called with only one key
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect(batchFn).toHaveBeenCalledWith(["key1"]);

			// All should receive same value
			expect(result1).toBe("value-key1");
			expect(result2).toBe("value-key1");
			expect(result3).toBe("value-key1");
		});

		it("processes separate batches for different microtasks", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			const loader = new DataLoader(batchFn);

			// First batch
			const result1 = await loader.load("key1");

			// Second batch (after first completes)
			const result2 = await loader.load("key2");

			// Should have been called twice (separate microtasks)
			expect(batchFn).toHaveBeenCalledTimes(2);
			expect(batchFn).toHaveBeenNthCalledWith(1, ["key1"]);
			expect(batchFn).toHaveBeenNthCalledWith(2, ["key2"]);

			expect(result1).toBe("value-key1");
			expect(result2).toBe("value-key2");
		});
	});

	describe("error handling", () => {
		it("rejects all pending loads when batch function throws", async () => {
			const batchFn = async (_keys: string[]) => {
				throw new Error("Batch failed");
			};
			const loader = new DataLoader(batchFn);

			const promise1 = loader.load("key1");
			const promise2 = loader.load("key2");

			let error1: Error | null = null;
			let error2: Error | null = null;

			try {
				await promise1;
			} catch (e) {
				error1 = e as Error;
			}

			try {
				await promise2;
			} catch (e) {
				error2 = e as Error;
			}

			expect(error1).not.toBeNull();
			expect(error1?.message).toBe("Batch failed");
			expect(error2).not.toBeNull();
			expect(error2?.message).toBe("Batch failed");
		});

		it("converts non-Error throws to Error", async () => {
			const batchFn = async (_keys: string[]) => {
				throw "string error";
			};
			const loader = new DataLoader(batchFn);

			const promise = loader.load("key1");

			let error: Error | null = null;
			try {
				await promise;
			} catch (e) {
				error = e as Error;
			}

			expect(error).not.toBeNull();
			expect(error?.message).toBe("string error");
		});

		it("handles rejected promise from batch function", async () => {
			const batchFn = async (_keys: string[]) => {
				return Promise.reject(new Error("Async failure"));
			};
			const loader = new DataLoader(batchFn);

			const promise = loader.load("key1");

			let error: Error | null = null;
			try {
				await promise;
			} catch (e) {
				error = e as Error;
			}

			expect(error).not.toBeNull();
			expect(error?.message).toBe("Async failure");
		});
	});

	describe("edge cases", () => {
		it("handles empty batch gracefully", async () => {
			const batchFn = mock(async (keys: string[]) => keys.map((k) => `value-${k}`));
			// Create loader but don't load anything - verify no crash
			const _loader = new DataLoader(batchFn);

			// Just trigger flush without any loads (edge case)
			// This shouldn't happen in practice, but verify it doesn't crash
			await new Promise((r) => queueMicrotask(r));

			expect(batchFn).not.toHaveBeenCalled();
		});

		it("handles numeric keys", async () => {
			const batchFn = async (keys: number[]) => keys.map((k) => k * 2);
			const loader = new DataLoader(batchFn);

			const [result1, result2] = await Promise.all([loader.load(5), loader.load(10)]);

			expect(result1).toBe(10);
			expect(result2).toBe(20);
		});

		it("handles object keys (by reference)", async () => {
			type ObjKey = { id: string };
			const batchFn = async (keys: ObjKey[]) => keys.map((k) => `value-${k.id}`);
			const loader = new DataLoader(batchFn);

			const key1 = { id: "1" };
			const key2 = { id: "2" };

			const [result1, result2] = await Promise.all([loader.load(key1), loader.load(key2)]);

			expect(result1).toBe("value-1");
			expect(result2).toBe("value-2");
		});

		it("handles batch function returning fewer results", async () => {
			const batchFn = async (_keys: string[]) => {
				// Return only one result for multiple keys (incorrect behavior, but should handle gracefully)
				return ["only-one"];
			};
			const loader = new DataLoader(batchFn);

			const promise1 = loader.load("key1");
			const promise2 = loader.load("key2");

			const [result1, result2] = await Promise.all([promise1, promise2]);

			// First key gets the result, second gets undefined (as it would be out of bounds)
			expect(result1).toBe("only-one");
			expect(result2).toBeUndefined();
		});

		it("continues working after error", async () => {
			let shouldFail = true;
			const batchFn = async (keys: string[]) => {
				if (shouldFail) {
					shouldFail = false;
					throw new Error("First batch fails");
				}
				return keys.map((k) => `value-${k}`);
			};
			const loader = new DataLoader(batchFn);

			// First batch fails
			let error: Error | null = null;
			try {
				await loader.load("key1");
			} catch (e) {
				error = e as Error;
			}
			expect(error?.message).toBe("First batch fails");

			// Second batch should work
			const result = await loader.load("key2");
			expect(result).toBe("value-key2");
		});

		it("handles mixed success and null results", async () => {
			const batchFn = async (keys: string[]) => {
				return keys.map((k) => (k === "missing" ? null : `value-${k}`));
			};
			const loader = new DataLoader(batchFn);

			const [result1, result2, result3] = await Promise.all([
				loader.load("key1"),
				loader.load("missing"),
				loader.load("key3"),
			]);

			expect(result1).toBe("value-key1");
			expect(result2).toBeNull();
			expect(result3).toBe("value-key3");
		});
	});

	describe("performance", () => {
		it("batches many concurrent loads", async () => {
			const batchFn = mock(async (keys: number[]) => keys.map((k) => k * 2));
			const loader = new DataLoader(batchFn);

			// Load 100 keys concurrently
			const promises = Array.from({ length: 100 }, (_, i) => loader.load(i));
			const results = await Promise.all(promises);

			// Should be single batch call with all keys
			expect(batchFn).toHaveBeenCalledTimes(1);
			expect((batchFn.mock.calls[0] as number[][])[0].length).toBe(100);

			// Verify all results
			results.forEach((result, i) => {
				expect(result).toBe(i * 2);
			});
		});
	});
});
