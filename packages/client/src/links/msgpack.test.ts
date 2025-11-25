/**
 * Tests for MessagePack Serialization Link
 */

import { describe, expect, mock, test } from "bun:test";
import { compareSizes, deserializeMsgpack, msgpackLink, serializeMsgpack } from "./msgpack";
import { createOperationContext } from "./types";

describe("msgpackLink", () => {
	test("serializes request input to msgpack", async () => {
		const mockNext = mock(async (op) => {
			// Verify input is serialized
			expect(op.input).toBeInstanceOf(ArrayBuffer);
			expect(op.meta?.serialization).toBe("msgpack");
			expect(op.meta?.binaryMode).toBe(true);

			return {
				data: { id: "1", name: "Test" },
			};
		});

		const link = msgpackLink();
		const linkFn = link();

		const op = createOperationContext("mutation", "User", "create", {
			name: "John",
			email: "john@test.com",
		});

		await linkFn(op, mockNext);
		expect(mockNext).toHaveBeenCalledTimes(1);
	});

	test("deserializes msgpack response", async () => {
		const data = { id: "1", name: "Test", value: 42 };
		const encoded = serializeMsgpack(data);

		const mockNext = mock(async () => ({
			data: encoded,
			meta: { serialization: "msgpack" },
		}));

		const link = msgpackLink();
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		expect(result.data).toEqual(data);
		expect(result.meta?.deserialized).toBe(true);
	});

	test("supports base64 mode", async () => {
		const mockNext = mock(async (op) => {
			// In base64 mode, input should be string
			expect(typeof op.input).toBe("string");
			expect(op.meta?.binaryMode).toBe(false);

			return {
				data: { id: "1", name: "Test" },
			};
		});

		const link = msgpackLink({ binaryMode: false });
		const linkFn = link();

		const op = createOperationContext("mutation", "User", "create", {
			name: "John",
		});

		await linkFn(op, mockNext);
		expect(mockNext).toHaveBeenCalledTimes(1);
	});

	test("handles serialization errors gracefully", async () => {
		const mockNext = mock(async (op) => ({
			data: { id: "1" },
		}));

		const link = msgpackLink();
		const linkFn = link();

		// Create operation with circular reference
		const circularData: Record<string, unknown> = { name: "Test" };
		circularData.self = circularData;

		const op = createOperationContext("mutation", "User", "create", circularData);

		// Should not throw, pass through original
		const result = await linkFn(op, mockNext);
		expect(result.data).toEqual({ id: "1" });
	});

	test("handles deserialization errors", async () => {
		const mockNext = mock(async () => ({
			data: new ArrayBuffer(10), // Invalid msgpack data
			meta: { serialization: "msgpack" },
		}));

		const link = msgpackLink();
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		expect(result.error).toBeDefined();
	});

	test("passes through non-msgpack responses", async () => {
		const mockNext = mock(async () => ({
			data: { id: "1", name: "Test" },
		}));

		const link = msgpackLink();
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		// Should pass through unchanged
		expect(result.data).toEqual({ id: "1", name: "Test" });
	});

	test("can disable request serialization", async () => {
		const mockNext = mock(async (op) => {
			// Input should not be serialized
			expect(op.meta?.serialization).toBeUndefined();
			return { data: { id: "1" } };
		});

		const link = msgpackLink({ serializeRequests: false });
		const linkFn = link();

		const op = createOperationContext("mutation", "User", "create", { name: "John" });
		await linkFn(op, mockNext);

		expect(mockNext).toHaveBeenCalledTimes(1);
	});

	test("can disable response deserialization", async () => {
		const encoded = serializeMsgpack({ id: "1", name: "Test" });

		const mockNext = mock(async () => ({
			data: encoded.buffer as ArrayBuffer,
			meta: { serialization: "msgpack" },
		}));

		const link = msgpackLink({ deserializeResponses: false });
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		// Should return raw buffer
		expect(result.data).toBeInstanceOf(ArrayBuffer);
	});
});

describe("serializeMsgpack", () => {
	test("serializes basic data types", () => {
		const data = {
			string: "hello",
			number: 42,
			boolean: true,
			null: null,
			array: [1, 2, 3],
		};

		const encoded = serializeMsgpack(data);
		expect(encoded).toBeInstanceOf(Uint8Array);
		expect(encoded.byteLength).toBeGreaterThan(0);
	});

	test("preserves Date objects", () => {
		const now = new Date();
		const encoded = serializeMsgpack({ timestamp: now });
		const decoded = deserializeMsgpack(encoded) as { timestamp: Date };

		expect(decoded.timestamp).toBeInstanceOf(Date);
		expect(decoded.timestamp.getTime()).toBe(now.getTime());
	});

	test("handles binary data", () => {
		const buffer = new Uint8Array([1, 2, 3, 4, 5]);
		const encoded = serializeMsgpack({ data: buffer });
		const decoded = deserializeMsgpack(encoded) as { data: Uint8Array };

		expect(decoded.data).toEqual(buffer);
	});
});

describe("deserializeMsgpack", () => {
	test("deserializes encoded data", () => {
		const data = { name: "John", age: 30 };
		const encoded = serializeMsgpack(data);
		const decoded = deserializeMsgpack(encoded);

		expect(decoded).toEqual(data);
	});

	test("works with ArrayBuffer", () => {
		const data = { value: 42 };
		const encoded = serializeMsgpack(data);
		// Create proper ArrayBuffer from Uint8Array
		const buffer = encoded.buffer.slice(
			encoded.byteOffset,
			encoded.byteOffset + encoded.byteLength,
		);
		const decoded = deserializeMsgpack(buffer);

		expect(decoded).toEqual(data);
	});
});

describe("compareSizes", () => {
	test("shows msgpack is smaller for typical data", () => {
		const data = {
			name: "John Doe",
			email: "john@example.com",
			age: 30,
			active: true,
			tags: ["developer", "typescript", "nodejs"],
		};

		const comparison = compareSizes(data);

		expect(comparison.json).toBeGreaterThan(0);
		expect(comparison.msgpack).toBeGreaterThan(0);
		expect(comparison.msgpack).toBeLessThan(comparison.json);
		expect(comparison.smaller).toBe("msgpack");
		expect(comparison.reduction).toMatch(/\d+\.\d+%/);
	});

	test("calculates reduction percentage", () => {
		const data = { value: 42 };
		const comparison = compareSizes(data);

		const expectedReduction = ((comparison.json - comparison.msgpack) / comparison.json) * 100;

		expect(comparison.reduction).toBe(`${expectedReduction.toFixed(1)}%`);
	});
});
