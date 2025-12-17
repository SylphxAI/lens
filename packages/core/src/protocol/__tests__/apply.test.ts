/**
 * @sylphx/lens-core - Protocol Apply Tests
 */

import { describe, expect, it } from "bun:test";
import { applyOp, applyOps } from "../apply.js";
import type { Op } from "../types.js";

describe("applyOps", () => {
	describe("set operation", () => {
		it("sets value at root path", () => {
			const state = { name: "Alice" };
			const ops: Op[] = [{ o: "set", p: "name", v: "Bob" }];
			expect(applyOps(state, ops)).toEqual({ name: "Bob" });
		});

		it("sets value at nested path", () => {
			const state = { user: { profile: { name: "Alice" } } };
			const ops: Op[] = [{ o: "set", p: "user.profile.name", v: "Bob" }];
			expect(applyOps(state, ops)).toEqual({ user: { profile: { name: "Bob" } } });
		});

		it("creates intermediate objects", () => {
			const state = {};
			const ops: Op[] = [{ o: "set", p: "a.b.c", v: 42 }];
			expect(applyOps(state, ops)).toEqual({ a: { b: { c: 42 } } });
		});

		it("handles array indices in path", () => {
			const state = { users: [{ name: "Alice" }, { name: "Bob" }] };
			const ops: Op[] = [{ o: "set", p: "users.1.name", v: "Charlie" }];
			expect(applyOps(state, ops)).toEqual({
				users: [{ name: "Alice" }, { name: "Charlie" }],
			});
		});
	});

	describe("del operation", () => {
		it("deletes key from object", () => {
			const state = { name: "Alice", age: 30 };
			const ops: Op[] = [{ o: "del", p: "age" }];
			expect(applyOps(state, ops)).toEqual({ name: "Alice" });
		});

		it("deletes nested key", () => {
			const state = { user: { name: "Alice", age: 30 } };
			const ops: Op[] = [{ o: "del", p: "user.age" }];
			expect(applyOps(state, ops)).toEqual({ user: { name: "Alice" } });
		});

		it("deletes array element by index", () => {
			const state = { items: ["a", "b", "c"] };
			const ops: Op[] = [{ o: "del", p: "items.1" }];
			expect(applyOps(state, ops)).toEqual({ items: ["a", "c"] });
		});
	});

	describe("merge operation", () => {
		it("merges into existing object", () => {
			const state = { user: { name: "Alice", age: 30 } };
			const ops: Op[] = [{ o: "merge", p: "user", v: { age: 31, city: "NYC" } }];
			expect(applyOps(state, ops)).toEqual({
				user: { name: "Alice", age: 31, city: "NYC" },
			});
		});

		it("creates object if path doesn't exist", () => {
			const state = {};
			const ops: Op[] = [{ o: "merge", p: "user", v: { name: "Alice" } }];
			expect(applyOps(state, ops)).toEqual({ user: { name: "Alice" } });
		});
	});

	describe("array push operation", () => {
		it("pushes items to array", () => {
			const state = { items: [1, 2] };
			const ops: Op[] = [{ o: "push", p: "items", v: [3, 4] }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 2, 3, 4] });
		});

		it("creates array if doesn't exist", () => {
			const state = {};
			const ops: Op[] = [{ o: "push", p: "items", v: [1, 2] }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 2] });
		});
	});

	describe("array unshift operation", () => {
		it("unshifts items to array", () => {
			const state = { items: [3, 4] };
			const ops: Op[] = [{ o: "unshift", p: "items", v: [1, 2] }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 2, 3, 4] });
		});
	});

	describe("array splice operation", () => {
		it("removes items from array", () => {
			const state = { items: [1, 2, 3, 4] };
			const ops: Op[] = [{ o: "splice", p: "items", i: 1, dc: 2 }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 4] });
		});

		it("inserts items at position", () => {
			const state = { items: [1, 4] };
			const ops: Op[] = [{ o: "splice", p: "items", i: 1, dc: 0, v: [2, 3] }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 2, 3, 4] });
		});

		it("replaces items", () => {
			const state = { items: [1, 2, 3] };
			const ops: Op[] = [{ o: "splice", p: "items", i: 1, dc: 1, v: [99] }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 99, 3] });
		});
	});

	describe("array arrSet operation", () => {
		it("sets item at index", () => {
			const state = { items: [1, 2, 3] };
			const ops: Op[] = [{ o: "arrSet", p: "items", i: 1, v: 99 }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 99, 3] });
		});
	});

	describe("array arrDel operation", () => {
		it("deletes item at index", () => {
			const state = { items: [1, 2, 3] };
			const ops: Op[] = [{ o: "arrDel", p: "items", i: 1 }];
			expect(applyOps(state, ops)).toEqual({ items: [1, 3] });
		});
	});

	describe("array arrSetId operation", () => {
		it("sets item by id", () => {
			const state = {
				users: [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				],
			};
			const ops: Op[] = [{ o: "arrSetId", p: "users", id: "2", v: { id: "2", name: "Charlie" } }];
			expect(applyOps(state, ops)).toEqual({
				users: [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Charlie" },
				],
			});
		});

		it("appends if id not found", () => {
			const state = { users: [{ id: "1", name: "Alice" }] };
			const ops: Op[] = [{ o: "arrSetId", p: "users", id: "2", v: { id: "2", name: "Bob" } }];
			expect(applyOps(state, ops)).toEqual({
				users: [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				],
			});
		});
	});

	describe("array arrDelId operation", () => {
		it("deletes item by id", () => {
			const state = {
				users: [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				],
			};
			const ops: Op[] = [{ o: "arrDelId", p: "users", id: "1" }];
			expect(applyOps(state, ops)).toEqual({
				users: [{ id: "2", name: "Bob" }],
			});
		});
	});

	describe("array arrMerge operation", () => {
		it("merges into item at index", () => {
			const state = {
				users: [
					{ id: "1", name: "Alice", age: 30 },
					{ id: "2", name: "Bob", age: 25 },
				],
			};
			const ops: Op[] = [{ o: "arrMerge", p: "users", i: 0, v: { age: 31 } }];
			expect(applyOps(state, ops)).toEqual({
				users: [
					{ id: "1", name: "Alice", age: 31 },
					{ id: "2", name: "Bob", age: 25 },
				],
			});
		});
	});

	describe("array arrMergeId operation", () => {
		it("merges into item by id", () => {
			const state = {
				users: [
					{ id: "1", name: "Alice", age: 30 },
					{ id: "2", name: "Bob", age: 25 },
				],
			};
			const ops: Op[] = [{ o: "arrMergeId", p: "users", id: "2", v: { age: 26, city: "NYC" } }];
			expect(applyOps(state, ops)).toEqual({
				users: [
					{ id: "1", name: "Alice", age: 30 },
					{ id: "2", name: "Bob", age: 26, city: "NYC" },
				],
			});
		});

		it("appends with id if not found", () => {
			const state = { users: [{ id: "1", name: "Alice" }] };
			const ops: Op[] = [{ o: "arrMergeId", p: "users", id: "2", v: { name: "Bob" } }];
			expect(applyOps(state, ops)).toEqual({
				users: [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				],
			});
		});
	});

	describe("multiple operations", () => {
		it("applies operations in order", () => {
			const state = { counter: 0, items: [] as number[] };
			const ops: Op[] = [
				{ o: "set", p: "counter", v: 1 },
				{ o: "push", p: "items", v: [1] },
				{ o: "set", p: "counter", v: 2 },
				{ o: "push", p: "items", v: [2] },
			];
			expect(applyOps(state, ops)).toEqual({ counter: 2, items: [1, 2] });
		});
	});

	describe("immutability", () => {
		it("does not mutate original state", () => {
			const state = { user: { name: "Alice" } };
			const ops: Op[] = [{ o: "set", p: "user.name", v: "Bob" }];
			const newState = applyOps(state, ops);

			expect(state.user.name).toBe("Alice");
			expect(newState.user.name).toBe("Bob");
			expect(state).not.toBe(newState);
			expect(state.user).not.toBe(newState.user);
		});

		it("does not mutate arrays", () => {
			const state = { items: [1, 2, 3] };
			const ops: Op[] = [{ o: "push", p: "items", v: [4] }];
			const newState = applyOps(state, ops);

			expect(state.items).toEqual([1, 2, 3]);
			expect(newState.items).toEqual([1, 2, 3, 4]);
			expect(state.items).not.toBe(newState.items);
		});
	});
});

describe("applyOp", () => {
	it("applies single operation", () => {
		const state = { name: "Alice" };
		const op: Op = { o: "set", p: "name", v: "Bob" };
		expect(applyOp(state, op)).toEqual({ name: "Bob" });
	});

	it("returns unchanged state for unknown operation", () => {
		const state = { name: "Alice" };
		// @ts-expect-error - testing unknown operation
		const op: Op = { o: "unknown", p: "name", v: "Bob" };
		expect(applyOp(state, op)).toBe(state);
	});
});

describe("security: prototype pollution protection", () => {
	it("throws on __proto__ path segment", () => {
		const state = { user: {} };
		const op: Op = { o: "set", p: "__proto__.polluted", v: true };
		expect(() => applyOp(state, op)).toThrow("Forbidden path segment");
	});

	it("throws on constructor path segment", () => {
		const state = { user: {} };
		const op: Op = { o: "set", p: "constructor.prototype.polluted", v: true };
		expect(() => applyOp(state, op)).toThrow("Forbidden path segment");
	});

	it("throws on prototype path segment", () => {
		const state = { user: {} };
		const op: Op = { o: "set", p: "user.prototype.toString", v: "malicious" };
		expect(() => applyOp(state, op)).toThrow("Forbidden path segment");
	});

	it("throws on __proto__ in nested path", () => {
		const state = { user: {} };
		const op: Op = { o: "merge", p: "user.__proto__", v: { admin: true } };
		expect(() => applyOp(state, op)).toThrow("Forbidden path segment");
	});

	it("allows legitimate paths with similar-looking names", () => {
		const state = { user: {} };
		const op: Op = { o: "set", p: "user.proto_type", v: "safe" };
		expect(applyOp(state, op)).toEqual({ user: { proto_type: "safe" } });
	});

	it("allows legitimate paths with constructor-like names", () => {
		const state = { user: {} };
		const op: Op = { o: "set", p: "user.constructorName", v: "MyClass" };
		expect(applyOp(state, op)).toEqual({ user: { constructorName: "MyClass" } });
	});

	it("protects Object.prototype from pollution via ops", () => {
		const state = {};
		const ops: Op[] = [{ o: "set", p: "__proto__.isAdmin", v: true }];

		expect(() => applyOps(state, ops)).toThrow("Forbidden path segment");

		// Verify Object.prototype was not polluted
		expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
	});
});
