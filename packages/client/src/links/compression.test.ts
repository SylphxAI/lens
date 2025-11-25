/**
 * Tests for Compression Link
 */

import { describe, expect, mock, test } from "bun:test";
import { compressionLink } from "./compression";
import { createOperationContext } from "./types";

describe("compressionLink", () => {
	test("passes through queries without compression", async () => {
		const mockNext = mock(async (op) => ({
			data: { id: "1", name: "Test" },
		}));

		const link = compressionLink();
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		// Should not compress query
		expect(result.data).toEqual({ id: "1", name: "Test" });
		expect(mockNext).toHaveBeenCalledWith(op); // Original operation unchanged
	});

	test("skips compression for small payloads", async () => {
		const mockNext = mock(async (op) => ({
			data: { id: "new-id", name: "Created" },
		}));

		const link = compressionLink({ threshold: 10000 }); // 10KB threshold
		const linkFn = link();

		// Small mutation payload
		const op = createOperationContext("mutation", "User", "create", {
			name: "John",
			email: "john@test.com",
		});

		const result = await linkFn(op, mockNext);

		// Should not compress (below threshold)
		expect(result.data).toEqual({ id: "new-id", name: "Created" });

		// Check that operation was passed through unchanged
		const calledOp = mockNext.mock.calls[0][0];
		expect(calledOp.meta?.compressed).toBeUndefined();
	});

	test("compresses large mutation payloads", async () => {
		const mockNext = mock(async (op) => {
			// Verify operation was compressed
			expect(op.meta?.compressed).toBe(true);
			expect(op.meta?.compressionAlgorithm).toBe("gzip");
			expect(op.meta?.originalSize).toBeGreaterThan(0);
			expect(op.meta?.compressedSize).toBeLessThan(op.meta?.originalSize);

			return {
				data: { id: "new-id", name: "Created" },
			};
		});

		const link = compressionLink({ threshold: 100 }); // 100 bytes threshold
		const linkFn = link();

		// Large mutation payload (> 100 bytes)
		const largeData = {
			name: "John Doe",
			email: "john@example.com",
			bio: "A".repeat(500), // Large bio field
			metadata: {
				key1: "value1",
				key2: "value2",
				key3: "value3",
			},
		};

		const op = createOperationContext("mutation", "User", "create", largeData);

		const result = await linkFn(op, mockNext);

		expect(result.data).toEqual({ id: "new-id", name: "Created" });
		expect(mockNext).toHaveBeenCalledTimes(1);
	});

	test("decompresses response when marked as compressed", async () => {
		// Create compressed response
		const data = { id: "1", name: "Test", value: "Result" };
		const jsonData = JSON.stringify(data);

		// Mock Node.js zlib for compression
		const zlib = await import("zlib");
		const { promisify } = await import("util");
		const gzip = promisify(zlib.gzip);
		const compressed = await gzip(Buffer.from(jsonData, "utf-8"));

		const mockNext = mock(async () => ({
			data: compressed.buffer as ArrayBuffer,
			meta: { compressed: true },
		}));

		const link = compressionLink();
		const linkFn = link();

		const op = createOperationContext("query", "User", "get", { id: "1" });
		const result = await linkFn(op, mockNext);

		// Should decompress and parse
		expect(result.data).toEqual(data);
		expect(result.meta?.decompressed).toBe(true);
	});

	test("supports brotli compression", async () => {
		const mockNext = mock(async (op) => {
			expect(op.meta?.compressionAlgorithm).toBe("brotli");
			return {
				data: { id: "new-id", name: "Created" },
			};
		});

		const link = compressionLink({
			algorithm: "brotli",
			threshold: 100,
		});
		const linkFn = link();

		// Large payload
		const largeData = {
			content: "X".repeat(500),
		};

		const op = createOperationContext("mutation", "Post", "create", largeData);
		await linkFn(op, mockNext);

		expect(mockNext).toHaveBeenCalledTimes(1);
	});

	test("handles compression errors gracefully", async () => {
		const mockNext = mock(async (op) => ({
			data: { id: "new-id", name: "Created" },
		}));

		const link = compressionLink({ threshold: 100 });
		const linkFn = link();

		// Create operation with circular reference (cannot be JSON.stringify'd)
		const circularData: Record<string, unknown> = { name: "Test" };
		circularData.self = circularData; // Circular reference

		const op = createOperationContext("mutation", "User", "create", circularData);

		// Should handle error and pass through uncompressed
		const result = await linkFn(op, mockNext);

		// Result should still be returned (operation passed through)
		expect(result.data).toEqual({ id: "new-id", name: "Created" });
	});

	test("can disable request compression", async () => {
		const mockNext = mock(async (op) => {
			// Should not be compressed
			expect(op.meta?.compressed).toBeUndefined();
			return { data: { id: "new-id" } };
		});

		const link = compressionLink({
			compressRequests: false,
			threshold: 100,
		});
		const linkFn = link();

		const largeData = { content: "X".repeat(500) };
		const op = createOperationContext("mutation", "Post", "create", largeData);

		await linkFn(op, mockNext);
		expect(mockNext).toHaveBeenCalledTimes(1);
	});
});
