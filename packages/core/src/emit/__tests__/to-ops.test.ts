/**
 * @sylphx/lens-core - toOps Converter Tests
 */

import { describe, expect, it } from "bun:test";
import type { EmitCommand } from "../index.js";
import { toOps } from "../to-ops.js";

describe("toOps", () => {
	describe("full data emission", () => {
		it("converts replace mode to set operation", () => {
			const command: EmitCommand = {
				type: "full",
				data: { name: "Alice", age: 30 },
				replace: true,
			};
			expect(toOps(command)).toEqual([{ o: "set", p: "", v: { name: "Alice", age: 30 } }]);
		});

		it("converts merge mode to merge operation for objects", () => {
			const command: EmitCommand = {
				type: "full",
				data: { name: "Alice" },
				replace: false,
			};
			expect(toOps(command)).toEqual([{ o: "merge", p: "", v: { name: "Alice" } }]);
		});

		it("converts merge mode to set for non-objects", () => {
			const command: EmitCommand = {
				type: "full",
				data: [1, 2, 3],
				replace: false,
			};
			expect(toOps(command)).toEqual([{ o: "set", p: "", v: [1, 2, 3] }]);
		});

		it("uses base path when provided", () => {
			const command: EmitCommand = {
				type: "full",
				data: { name: "Alice" },
				replace: true,
			};
			expect(toOps(command, "user")).toEqual([{ o: "set", p: "user", v: { name: "Alice" } }]);
		});
	});

	describe("field update", () => {
		it("converts value strategy to set operation", () => {
			const command: EmitCommand = {
				type: "field",
				field: "name",
				update: { strategy: "value", data: "Bob" },
			};
			expect(toOps(command)).toEqual([{ o: "set", p: "name", v: "Bob" }]);
		});

		it("converts delta strategy to delta operation", () => {
			const command: EmitCommand = {
				type: "field",
				field: "content",
				update: { strategy: "delta", data: [{ position: 0, insert: "Hello" }] },
			};
			expect(toOps(command)).toEqual([{ o: "delta", p: "content", d: [{ position: 0, insert: "Hello" }] }]);
		});

		it("converts patch strategy to patch operation", () => {
			const command: EmitCommand = {
				type: "field",
				field: "metadata",
				update: { strategy: "patch", data: [{ op: "add", path: "/views", value: 100 }] },
			};
			expect(toOps(command)).toEqual([{ o: "patch", p: "metadata", d: [{ op: "add", path: "/views", value: 100 }] }]);
		});

		it("combines base path with field", () => {
			const command: EmitCommand = {
				type: "field",
				field: "name",
				update: { strategy: "value", data: "Bob" },
			};
			expect(toOps(command, "user")).toEqual([{ o: "set", p: "user.name", v: "Bob" }]);
		});
	});

	describe("batch updates", () => {
		it("converts batch to multiple operations", () => {
			const command: EmitCommand = {
				type: "batch",
				updates: [
					{ field: "name", update: { strategy: "value", data: "Alice" } },
					{ field: "age", update: { strategy: "value", data: 30 } },
				],
			};
			expect(toOps(command)).toEqual([
				{ o: "set", p: "name", v: "Alice" },
				{ o: "set", p: "age", v: 30 },
			]);
		});

		it("uses base path for batch", () => {
			const command: EmitCommand = {
				type: "batch",
				updates: [{ field: "name", update: { strategy: "value", data: "Alice" } }],
			};
			expect(toOps(command, "user")).toEqual([{ o: "set", p: "user.name", v: "Alice" }]);
		});
	});

	describe("array operations", () => {
		it("converts push to push operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "push", item: { id: "1", name: "Alice" } },
			};
			expect(toOps(command, "users")).toEqual([{ o: "push", p: "users", v: [{ id: "1", name: "Alice" }] }]);
		});

		it("converts unshift to unshift operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "unshift", item: { id: "1" } },
			};
			expect(toOps(command, "items")).toEqual([{ o: "unshift", p: "items", v: [{ id: "1" }] }]);
		});

		it("converts insert to splice operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "insert", index: 2, item: { id: "1" } },
			};
			expect(toOps(command, "items")).toEqual([{ o: "splice", p: "items", i: 2, dc: 0, v: [{ id: "1" }] }]);
		});

		it("converts remove to arrDel operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "remove", index: 1 },
			};
			expect(toOps(command, "items")).toEqual([{ o: "arrDel", p: "items", i: 1 }]);
		});

		it("converts removeById to arrDelId operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "removeById", id: "user-123" },
			};
			expect(toOps(command, "users")).toEqual([{ o: "arrDelId", p: "users", id: "user-123" }]);
		});

		it("converts update to arrSet operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "update", index: 0, item: { id: "1", name: "Bob" } },
			};
			expect(toOps(command, "users")).toEqual([{ o: "arrSet", p: "users", i: 0, v: { id: "1", name: "Bob" } }]);
		});

		it("converts updateById to arrSetId operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "updateById", id: "1", item: { id: "1", name: "Bob" } },
			};
			expect(toOps(command, "users")).toEqual([{ o: "arrSetId", p: "users", id: "1", v: { id: "1", name: "Bob" } }]);
		});

		it("converts merge to arrMerge operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "merge", index: 0, partial: { name: "Bob" } },
			};
			expect(toOps(command, "users")).toEqual([{ o: "arrMerge", p: "users", i: 0, v: { name: "Bob" } }]);
		});

		it("converts mergeById to arrMergeId operation", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "mergeById", id: "1", partial: { name: "Bob" } },
			};
			expect(toOps(command, "users")).toEqual([{ o: "arrMergeId", p: "users", id: "1", v: { name: "Bob" } }]);
		});

		it("uses command.field over path parameter", () => {
			const command: EmitCommand = {
				type: "array",
				operation: { op: "push", item: { id: "1" } },
				field: "nested.items",
			};
			expect(toOps(command, "ignored")).toEqual([{ o: "push", p: "nested.items", v: [{ id: "1" }] }]);
		});
	});
});
