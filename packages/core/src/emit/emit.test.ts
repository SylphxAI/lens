/**
 * Tests for type-safe Emit API
 */
import { describe, expect, it, vi } from "vitest";
import { createEmit, createEmitArray, createEmitObject } from "./index";

describe("createEmitObject", () => {
	it("should emit full data", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ name: string; age: number }>(handler);

		emit({ name: "Alice", age: 30 });

		expect(handler).toHaveBeenCalledWith({
			type: "full",
			data: { name: "Alice", age: 30 },
			replace: false,
		});
	});

	it("should merge partial data", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ name: string; age: number }>(handler);

		emit.merge({ name: "Bob" });

		expect(handler).toHaveBeenCalledWith({
			type: "full",
			data: { name: "Bob" },
			replace: false,
		});
	});

	it("should replace entire data", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ name: string; age: number }>(handler);

		emit.replace({ name: "Charlie", age: 25 });

		expect(handler).toHaveBeenCalledWith({
			type: "full",
			data: { name: "Charlie", age: 25 },
			replace: true,
		});
	});

	it("should set a single field", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ name: string; age: number }>(handler);

		emit.set("name", "David");

		expect(handler).toHaveBeenCalledWith({
			type: "field",
			field: "name",
			update: { strategy: "value", data: "David" },
		});
	});

	it("should apply delta operations to a field", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ content: string }>(handler);

		emit.delta("content", [{ position: 0, insert: "Hello " }]);

		expect(handler).toHaveBeenCalledWith({
			type: "field",
			field: "content",
			update: {
				strategy: "delta",
				data: [{ position: 0, insert: "Hello " }],
			},
		});
	});

	it("should apply patch operations to a field", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ metadata: object }>(handler);

		emit.patch("metadata", [{ op: "add", path: "/views", value: 100 }]);

		expect(handler).toHaveBeenCalledWith({
			type: "field",
			field: "metadata",
			update: {
				strategy: "patch",
				data: [{ op: "add", path: "/views", value: 100 }],
			},
		});
	});

	it("should batch multiple updates", () => {
		const handler = vi.fn();
		const emit = createEmitObject<{ title: string; content: string }>(handler);

		emit.batch([
			{ field: "title", strategy: "value", data: "New Title" },
			{ field: "content", strategy: "delta", data: [{ position: 0, insert: "!" }] },
		]);

		expect(handler).toHaveBeenCalledWith({
			type: "batch",
			updates: [
				{ field: "title", update: { strategy: "value", data: "New Title" } },
				{ field: "content", update: { strategy: "delta", data: [{ position: 0, insert: "!" }] } },
			],
		});
	});
});

describe("createEmitArray", () => {
	interface User {
		id: string;
		name: string;
	}

	it("should replace entire array via callable", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit([{ id: "1", name: "Alice" }]);

		expect(handler).toHaveBeenCalledWith({
			type: "full",
			data: [{ id: "1", name: "Alice" }],
			replace: true,
		});
	});

	it("should replace entire array via replace method", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.replace([{ id: "2", name: "Bob" }]);

		expect(handler).toHaveBeenCalledWith({
			type: "full",
			data: [{ id: "2", name: "Bob" }],
			replace: true,
		});
	});

	it("should push item to array", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.push({ id: "3", name: "Charlie" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "push", item: { id: "3", name: "Charlie" } },
		});
	});

	it("should unshift item to array", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.unshift({ id: "4", name: "David" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "unshift", item: { id: "4", name: "David" } },
		});
	});

	it("should insert item at index", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.insert(1, { id: "5", name: "Eve" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "insert", index: 1, item: { id: "5", name: "Eve" } },
		});
	});

	it("should remove item by index", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.remove(0);

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "remove", index: 0 },
		});
	});

	it("should remove item by id", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.removeById("user-123");

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "removeById", id: "user-123" },
		});
	});

	it("should update item at index", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.update(1, { id: "1", name: "Updated" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "update", index: 1, item: { id: "1", name: "Updated" } },
		});
	});

	it("should update item by id", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.updateById("user-123", { id: "user-123", name: "Updated" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "updateById", id: "user-123", item: { id: "user-123", name: "Updated" } },
		});
	});

	it("should merge partial data into item at index", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.merge(0, { name: "Merged" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "merge", index: 0, partial: { name: "Merged" } },
		});
	});

	it("should merge partial data into item by id", () => {
		const handler = vi.fn();
		const emit = createEmitArray<User[]>(handler);

		emit.mergeById("user-123", { name: "Merged" });

		expect(handler).toHaveBeenCalledWith({
			type: "array",
			operation: { op: "mergeById", id: "user-123", partial: { name: "Merged" } },
		});
	});
});

describe("createEmit", () => {
	it("should create EmitObject for object types", () => {
		const handler = vi.fn();
		const emit = createEmit<{ name: string }>(handler, false);

		// Should have object methods
		expect(typeof emit.set).toBe("function");
		expect(typeof emit.merge).toBe("function");
		expect(typeof emit.delta).toBe("function");
		expect(typeof emit.patch).toBe("function");
		expect(typeof emit.batch).toBe("function");
	});

	it("should create EmitArray for array types", () => {
		const handler = vi.fn();
		const emit = createEmit<string[]>(handler, true);

		// Should have array methods
		expect(typeof emit.push).toBe("function");
		expect(typeof emit.unshift).toBe("function");
		expect(typeof emit.insert).toBe("function");
		expect(typeof emit.remove).toBe("function");
		expect(typeof emit.removeById).toBe("function");
		expect(typeof emit.update).toBe("function");
		expect(typeof emit.updateById).toBe("function");
	});

	it("should default to EmitObject when isArray is not specified", () => {
		const handler = vi.fn();
		const emit = createEmit<{ name: string }>(handler);

		// Should have object methods (default)
		expect(typeof emit.set).toBe("function");
	});
});
