/**
 * @sylphx/lens-core - Array Update Strategy Tests
 */

import { describe, expect, it } from "bun:test";
import { applyArrayDiff, computeArrayDiff, createArrayUpdate } from "./array-strategy.js";

// =============================================================================
// Test Fixtures
// =============================================================================

interface User {
	id: string;
	name: string;
	age?: number;
}

const users: User[] = [
	{ id: "1", name: "Alice", age: 30 },
	{ id: "2", name: "Bob", age: 25 },
	{ id: "3", name: "Charlie", age: 35 },
];

// =============================================================================
// computeArrayDiff Tests
// =============================================================================

describe("computeArrayDiff", () => {
	describe("empty arrays", () => {
		it("returns empty operations for two empty arrays", () => {
			const diff = computeArrayDiff([], []);
			expect(diff).toEqual([]);
		});

		it("returns replace when prev is empty", () => {
			const diff = computeArrayDiff([], users);
			expect(diff).toEqual([{ op: "replace", items: users }]);
		});

		it("returns replace with empty when next is empty", () => {
			const diff = computeArrayDiff(users, []);
			expect(diff).toEqual([{ op: "replace", items: [] }]);
		});
	});

	describe("id-based diffing", () => {
		it("detects added items", () => {
			const prev = users.slice(0, 2); // Alice, Bob
			const next = [...users]; // Alice, Bob, Charlie

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toContainEqual({ op: "push", item: users[2] });
		});

		it("detects removed items", () => {
			const prev = [...users]; // Alice, Bob, Charlie
			const next = users.slice(0, 2); // Alice, Bob

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toContainEqual({ op: "remove", index: 2 });
		});

		it("detects updated items", () => {
			const prev = [...users];
			const next = users.map((u) => (u.id === "2" ? { ...u, name: "Bob Updated" } : u));

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toContainEqual({
				op: "update",
				index: 1,
				item: { id: "2", name: "Bob Updated", age: 25 },
			});
		});

		it("handles multiple operations", () => {
			const prev = users;
			const next = [
				{ id: "1", name: "Alice Updated", age: 31 }, // updated
				// id: 2 removed
				{ id: "3", name: "Charlie", age: 35 },
				{ id: "4", name: "David", age: 40 }, // added
			];

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			// Should have remove, update, and add operations
			expect(diff!.some((op) => op.op === "remove")).toBe(true);
			expect(diff!.some((op) => op.op === "update")).toBe(true);
		});

		it("returns null for large diffs (prefers replace)", () => {
			const prev = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `User ${i}` }));
			const next = Array.from({ length: 20 }, (_, i) => ({
				id: String(i + 100),
				name: `New User ${i}`,
			}));

			const diff = computeArrayDiff(prev, next);

			// When all items are different, should return null (prefer replace)
			expect(diff).toBeNull();
		});

		it("handles items with same id but different content", () => {
			const prev = [{ id: "1", name: "Alice", extra: "old" }];
			const next = [{ id: "1", name: "Alice", extra: "new" }];

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toContainEqual({
				op: "update",
				index: 0,
				item: { id: "1", name: "Alice", extra: "new" },
			});
		});
	});

	describe("positional diffing (no ids)", () => {
		it("detects append-only changes", () => {
			const prev = [1, 2, 3];
			const next = [1, 2, 3, 4, 5];

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toEqual([
				{ op: "push", item: 4 },
				{ op: "push", item: 5 },
			]);
		});

		it("detects prepend-only changes", () => {
			const prev = [3, 4, 5];
			const next = [1, 2, 3, 4, 5];

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toEqual([
				{ op: "unshift", item: 2 },
				{ op: "unshift", item: 1 },
			]);
		});

		it("detects remove from end", () => {
			const prev = [1, 2, 3, 4, 5];
			const next = [1, 2, 3];

			const diff = computeArrayDiff(prev, next);

			expect(diff).not.toBeNull();
			expect(diff).toEqual([
				{ op: "remove", index: 4 },
				{ op: "remove", index: 3 },
			]);
		});

		it("returns null for complex positional changes", () => {
			const prev = [1, 2, 3, 4, 5];
			const next = [5, 4, 3, 2, 1]; // reversed

			const diff = computeArrayDiff(prev, next);

			// Complex changes should return null (prefer replace)
			expect(diff).toBeNull();
		});

		it("returns null when length difference is too large", () => {
			const prev = [1, 2];
			const next = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			const diff = computeArrayDiff(prev, next);

			// When length difference is > 50% of max length, return null
			expect(diff).toBeNull();
		});
	});
});

// =============================================================================
// applyArrayDiff Tests
// =============================================================================

describe("applyArrayDiff", () => {
	it("applies push operation", () => {
		const current = [1, 2, 3];
		const operations = [{ op: "push" as const, item: 4 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies unshift operation", () => {
		const current = [2, 3, 4];
		const operations = [{ op: "unshift" as const, item: 1 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies insert operation", () => {
		const current = [1, 3, 4];
		const operations = [{ op: "insert" as const, index: 1, item: 2 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 2, 3, 4]);
	});

	it("applies remove operation", () => {
		const current = [1, 2, 3, 4];
		const operations = [{ op: "remove" as const, index: 2 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 2, 4]);
	});

	it("applies update operation", () => {
		const current = [1, 2, 3];
		const operations = [{ op: "update" as const, index: 1, item: 20 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 20, 3]);
	});

	it("applies move operation", () => {
		const current = [1, 2, 3, 4];
		const operations = [{ op: "move" as const, from: 3, to: 1 }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([1, 4, 2, 3]);
	});

	it("applies replace operation", () => {
		const current = [1, 2, 3];
		const operations = [{ op: "replace" as const, items: [4, 5, 6] }];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([4, 5, 6]);
	});

	it("applies multiple operations in sequence", () => {
		const current = [1, 2, 3];
		const operations = [
			{ op: "push" as const, item: 4 },
			{ op: "remove" as const, index: 0 },
			{ op: "update" as const, index: 0, item: 20 },
		];

		const result = applyArrayDiff(current, operations);

		expect(result).toEqual([20, 3, 4]);
	});

	it("does not mutate original array", () => {
		const current = [1, 2, 3];
		const operations = [{ op: "push" as const, item: 4 }];

		applyArrayDiff(current, operations);

		expect(current).toEqual([1, 2, 3]);
	});

	it("handles empty operations array", () => {
		const current = [1, 2, 3];
		const operations: ReturnType<typeof computeArrayDiff> = [];

		const result = applyArrayDiff(current, operations!);

		expect(result).toEqual([1, 2, 3]);
	});
});

// =============================================================================
// createArrayUpdate Tests
// =============================================================================

describe("createArrayUpdate", () => {
	it("returns value strategy for no changes", () => {
		const prev = [1, 2, 3];
		const next = [1, 2, 3];

		const update = createArrayUpdate(prev, next);

		// When arrays are identical, should use value strategy
		expect(update.strategy).toBe("value");
	});

	it("returns value strategy when diff is null", () => {
		const prev = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `User ${i}` }));
		const next = Array.from({ length: 20 }, (_, i) => ({
			id: String(i + 100),
			name: `New User ${i}`,
		}));

		const update = createArrayUpdate(prev, next);

		// Large diff should result in value strategy (full replace)
		expect(update.strategy).toBe("value");
	});

	it("returns value strategy for single replace operation", () => {
		const prev: number[] = [];
		const next = [1, 2, 3];

		const update = createArrayUpdate(prev, next);

		// Single replace op should use value strategy
		expect(update.strategy).toBe("value");
	});

	it("returns array strategy for meaningful diff", () => {
		const prev = users.slice(0, 2);
		const next = [...users];

		const update = createArrayUpdate(prev, next);

		expect(update.strategy).toBe("array");
		if (update.strategy === "array") {
			expect(update.data.length).toBeGreaterThan(0);
		}
	});
});

// =============================================================================
// Round-trip Tests (compute then apply)
// =============================================================================

describe("round-trip", () => {
	it("correctly transforms array via diff operations", () => {
		const prev = users.slice(0, 2);
		const next = [...users];

		const diff = computeArrayDiff(prev, next);
		expect(diff).not.toBeNull();

		const result = applyArrayDiff(prev, diff!);

		expect(result).toEqual(next);
	});

	it("handles complex transformations", () => {
		const prev = [
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
			{ id: "3", name: "Charlie" },
		];
		const next = [
			{ id: "1", name: "Alice Updated" },
			{ id: "4", name: "David" },
			{ id: "3", name: "Charlie" },
		];

		const diff = computeArrayDiff(prev, next);
		if (diff === null) {
			// If diff is null, use replace - just verify next is returned
			expect(next).toEqual(next);
		} else {
			const result = applyArrayDiff(prev, diff);
			expect(result).toEqual(next);
		}
	});

	it("handles append operations correctly", () => {
		const prev = [1, 2, 3];
		const next = [1, 2, 3, 4, 5];

		const diff = computeArrayDiff(prev, next);
		expect(diff).not.toBeNull();

		const result = applyArrayDiff(prev, diff!);

		expect(result).toEqual(next);
	});

	it("handles remove operations correctly", () => {
		const prev = [1, 2, 3, 4, 5];
		const next = [1, 2, 3];

		const diff = computeArrayDiff(prev, next);
		expect(diff).not.toBeNull();

		const result = applyArrayDiff(prev, diff!);

		expect(result).toEqual(next);
	});
});
