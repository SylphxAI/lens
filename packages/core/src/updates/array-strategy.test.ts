/**
 * @sylphx/lens-core - Array Strategy Tests
 *
 * Tests for array diff computation and application.
 */

import { describe, expect, it } from "bun:test";
import {
	applyArrayDiff,
	computeArrayDiff,
	createArrayUpdate,
	type ArrayDiffOperation,
} from "./array-strategy.js";

// =============================================================================
// Test Helpers
// =============================================================================

interface TestItem {
	id: string;
	name: string;
	value?: number;
}

function item(id: string, name: string, value?: number): TestItem {
	return value !== undefined ? { id, name, value } : { id, name };
}

// =============================================================================
// computeArrayDiff Tests
// =============================================================================

describe("computeArrayDiff", () => {
	describe("empty array transitions", () => {
		it("returns empty array for empty to empty", () => {
			const ops = computeArrayDiff([], []);
			expect(ops).toEqual([]);
		});

		it("returns replace for empty to non-empty", () => {
			const next = [item("1", "a"), item("2", "b")];
			const ops = computeArrayDiff([], next);
			expect(ops).toEqual([{ op: "replace", items: next }]);
		});

		it("returns replace for non-empty to empty", () => {
			const prev = [item("1", "a"), item("2", "b")];
			const ops = computeArrayDiff(prev, []);
			expect(ops).toEqual([{ op: "replace", items: [] }]);
		});
	});

	describe("id-based diffing", () => {
		it("detects no changes", () => {
			const arr = [item("1", "a"), item("2", "b")];
			const ops = computeArrayDiff(arr, arr);
			expect(ops).toEqual([]);
		});

		it("detects item removal", () => {
			const prev = [item("1", "a"), item("2", "b"), item("3", "c")];
			const next = [item("1", "a"), item("3", "c")];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toContainEqual({ op: "remove", index: 1 });
		});

		it("detects item addition at end", () => {
			const prev = [item("1", "a")];
			const next = [item("1", "a"), item("2", "b")];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toContainEqual({ op: "push", item: item("2", "b") });
		});

		it("detects item addition in middle", () => {
			const prev = [item("1", "a"), item("3", "c")];
			const next = [item("1", "a"), item("2", "b"), item("3", "c")];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toContainEqual({ op: "insert", index: 1, item: item("2", "b") });
		});

		it("detects item update", () => {
			const prev = [item("1", "a", 1), item("2", "b", 2)];
			const next = [item("1", "a", 1), item("2", "updated", 99)];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toContainEqual({ op: "update", index: 1, item: item("2", "updated", 99) });
		});

		it("handles multiple operations", () => {
			const prev = [item("1", "a"), item("2", "b"), item("3", "c")];
			const next = [item("1", "updated"), item("4", "d")];
			const ops = computeArrayDiff(prev, next);
			expect(ops).not.toBeNull();
			// Should have removes for 2 and 3, add for 4, update for 1
			const opTypes = ops!.map((op) => op.op);
			expect(opTypes).toContain("remove");
			expect(opTypes).toContain("update");
		});
	});

	describe("positional diffing (no ids)", () => {
		it("detects append-only changes", () => {
			const prev = [1, 2, 3];
			const next = [1, 2, 3, 4, 5];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toEqual([
				{ op: "push", item: 4 },
				{ op: "push", item: 5 },
			]);
		});

		it("detects prepend-only changes", () => {
			const prev = [3, 4, 5];
			const next = [1, 2, 3, 4, 5];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toEqual([
				{ op: "unshift", item: 2 },
				{ op: "unshift", item: 1 },
			]);
		});

		it("detects remove from end", () => {
			const prev = [1, 2, 3, 4, 5];
			const next = [1, 2, 3];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toEqual([
				{ op: "remove", index: 4 },
				{ op: "remove", index: 3 },
			]);
		});

		it("returns null for complex changes", () => {
			const prev = [1, 2, 3];
			const next = [3, 1, 2]; // Reordered
			const ops = computeArrayDiff(prev, next);
			expect(ops).toBeNull();
		});

		it("returns null for very different lengths", () => {
			const prev = [1, 2];
			const next = [1, 2, 3, 4, 5, 6, 7, 8];
			const ops = computeArrayDiff(prev, next);
			expect(ops).toBeNull();
		});
	});

	describe("efficiency decisions", () => {
		it("prefers diff for small changes", () => {
			const prev = [item("1", "a"), item("2", "b")];
			const next = [item("1", "updated"), item("2", "b")];
			const ops = computeArrayDiff(prev, next);
			expect(ops).not.toBeNull();
			expect(ops!.length).toBeLessThan(prev.length);
		});
	});
});

// =============================================================================
// applyArrayDiff Tests
// =============================================================================

describe("applyArrayDiff", () => {
	it("applies push operation", () => {
		const arr = [1, 2, 3];
		const ops: ArrayDiffOperation[] = [{ op: "push", item: 4 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies unshift operation", () => {
		const arr = [2, 3, 4];
		const ops: ArrayDiffOperation[] = [{ op: "unshift", item: 1 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies insert operation", () => {
		const arr = [1, 3, 4];
		const ops: ArrayDiffOperation[] = [{ op: "insert", index: 1, item: 2 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies remove operation", () => {
		const arr = [1, 2, 3, 4];
		const ops: ArrayDiffOperation[] = [{ op: "remove", index: 1 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([1, 3, 4]);
	});

	it("applies update operation", () => {
		const arr = [1, 2, 3, 4];
		const ops: ArrayDiffOperation[] = [{ op: "update", index: 1, item: 99 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([1, 99, 3, 4]);
	});

	it("applies move operation", () => {
		const arr = [1, 2, 3, 4];
		const ops: ArrayDiffOperation[] = [{ op: "move", from: 0, to: 3 }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([2, 3, 4, 1]);
	});

	it("applies replace operation", () => {
		const arr = [1, 2, 3];
		const ops: ArrayDiffOperation[] = [{ op: "replace", items: [4, 5, 6] }];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([4, 5, 6]);
	});

	it("applies multiple operations in sequence", () => {
		const arr = [1, 2, 3];
		const ops: ArrayDiffOperation[] = [
			{ op: "push", item: 4 },
			{ op: "remove", index: 0 },
			{ op: "update", index: 0, item: 99 },
		];
		const result = applyArrayDiff(arr, ops);
		expect(result).toEqual([99, 3, 4]);
	});

	it("does not mutate original array", () => {
		const arr = [1, 2, 3];
		const ops: ArrayDiffOperation[] = [{ op: "push", item: 4 }];
		applyArrayDiff(arr, ops);
		expect(arr).toEqual([1, 2, 3]);
	});
});

// =============================================================================
// createArrayUpdate Tests
// =============================================================================

describe("createArrayUpdate", () => {
	it("returns value strategy for no changes", () => {
		const arr = [item("1", "a")];
		const update = createArrayUpdate(arr, arr);
		expect(update.strategy).toBe("value");
	});

	it("returns value strategy when diff is null", () => {
		const prev = [1, 2, 3];
		const next = [3, 1, 2]; // Reordered - returns null diff
		const update = createArrayUpdate(prev, next);
		expect(update.strategy).toBe("value");
		expect(update.data).toEqual(next);
	});

	it("returns value strategy for single replace op", () => {
		const prev: TestItem[] = [];
		const next = [item("1", "a")];
		const update = createArrayUpdate(prev, next);
		expect(update.strategy).toBe("value");
	});

	it("returns array strategy for multiple operations", () => {
		const prev = [item("1", "a")];
		const next = [item("1", "updated"), item("2", "b")];
		const update = createArrayUpdate(prev, next);
		expect(update.strategy).toBe("array");
		expect(Array.isArray(update.data)).toBe(true);
	});
});

// =============================================================================
// Round-trip Tests
// =============================================================================

describe("round-trip (diff + apply)", () => {
	it("reconstructs array after append", () => {
		const prev = [item("1", "a"), item("2", "b")];
		const next = [item("1", "a"), item("2", "b"), item("3", "c")];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		const result = applyArrayDiff(prev, ops!);
		expect(result).toEqual(next);
	});

	it("reconstructs array after remove", () => {
		const prev = [item("1", "a"), item("2", "b"), item("3", "c")];
		const next = [item("1", "a"), item("3", "c")];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		const result = applyArrayDiff(prev, ops!);
		expect(result).toEqual(next);
	});

	it("reconstructs array after update", () => {
		const prev = [item("1", "a", 1), item("2", "b", 2)];
		const next = [item("1", "a", 1), item("2", "updated", 99)];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		const result = applyArrayDiff(prev, ops!);
		expect(result).toEqual(next);
	});

	it("reconstructs array after prepend (positional)", () => {
		const prev = [1, 2, 3];
		const next = [0, 1, 2, 3];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		const result = applyArrayDiff(prev, ops!);
		expect(result).toEqual(next);
	});

	it("reconstructs array after append (positional)", () => {
		const prev = [1, 2, 3];
		const next = [1, 2, 3, 4];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		const result = applyArrayDiff(prev, ops!);
		expect(result).toEqual(next);
	});
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
	it("handles single item arrays", () => {
		const prev = [item("1", "a")];
		const next = [item("1", "updated")];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
	});

	it("handles arrays with duplicate ids gracefully", () => {
		const prev = [item("1", "a"), item("1", "b")]; // Duplicate id
		const next = [item("1", "a")];
		// Should not crash
		const ops = computeArrayDiff(prev, next);
		expect(ops).toBeDefined();
	});

	it("handles deeply nested objects", () => {
		const prev = [{ id: "1", data: { nested: { deep: 1 } } }];
		const next = [{ id: "1", data: { nested: { deep: 2 } } }];
		const ops = computeArrayDiff(prev, next);
		expect(ops).not.toBeNull();
		expect(ops!.some((op) => op.op === "update")).toBe(true);
	});

	it("handles mixed primitive arrays", () => {
		const prev = ["a", "b", "c"];
		const next = ["a", "b", "c", "d"];
		const ops = computeArrayDiff(prev, next);
		expect(ops).toEqual([{ op: "push", item: "d" }]);
	});

	it("handles null values in arrays", () => {
		const prev = [null, 1, 2];
		const next = [null, 1, 2, 3];
		const ops = computeArrayDiff(prev, next);
		expect(ops).toEqual([{ op: "push", item: 3 }]);
	});

	it("handles empty operations array", () => {
		const arr = [1, 2, 3];
		const result = applyArrayDiff(arr, []);
		expect(result).toEqual([1, 2, 3]);
	});
});
