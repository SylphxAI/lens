/**
 * Tests for @sylphx/lens-fresh
 */

import { describe, expect, test } from "bun:test";
import {
	fetchQuery,
	executeMutation,
	serializeForIsland,
	isSerializedData,
	type SerializedData,
} from "./index";

describe("@sylphx/lens-fresh exports", () => {
	test("fetchQuery is exported", () => {
		expect(typeof fetchQuery).toBe("function");
	});

	test("executeMutation is exported", () => {
		expect(typeof executeMutation).toBe("function");
	});

	test("serializeForIsland is exported", () => {
		expect(typeof serializeForIsland).toBe("function");
	});

	test("isSerializedData is exported", () => {
		expect(typeof isSerializedData).toBe("function");
	});
});

describe("serializeForIsland", () => {
	test("creates SerializedData with correct shape", () => {
		const data = { id: "1", name: "Test" };
		const serialized = serializeForIsland(data);

		expect(serialized.__lens_data__).toBe(true);
		expect(serialized.data).toEqual(data);
		expect(typeof serialized.timestamp).toBe("number");
		expect(serialized.timestamp).toBeGreaterThan(0);
	});

	test("SerializedData type is correct", () => {
		const serialized: SerializedData<{ id: string }> = {
			__lens_data__: true,
			data: { id: "1" },
			timestamp: Date.now(),
		};

		expect(serialized.__lens_data__).toBe(true);
		expect(serialized.data.id).toBe("1");
	});
});

describe("isSerializedData", () => {
	test("returns true for SerializedData", () => {
		const serialized = serializeForIsland({ id: "1" });
		expect(isSerializedData(serialized)).toBe(true);
	});

	test("returns false for plain objects", () => {
		expect(isSerializedData({ id: "1" })).toBe(false);
		expect(isSerializedData(null)).toBe(false);
		expect(isSerializedData(undefined)).toBe(false);
		expect(isSerializedData("string")).toBe(false);
		expect(isSerializedData(123)).toBe(false);
	});

	test("returns false for objects with partial shape", () => {
		expect(isSerializedData({ __lens_data__: false, data: {} })).toBe(false);
		expect(isSerializedData({ data: {}, timestamp: 123 })).toBe(false);
	});
});

describe("fetchQuery", () => {
	test("resolves query promise", async () => {
		const mockQuery = {
			then: (resolve: (value: string) => void) => {
				resolve("test-data");
				return Promise.resolve("test-data");
			},
			subscribe: () => () => {},
			value: null,
			select: () => mockQuery,
		};

		const result = await fetchQuery(mockQuery as any);
		expect(result).toBe("test-data");
	});
});

describe("executeMutation", () => {
	test("extracts data from mutation result", async () => {
		const mockMutation = Promise.resolve({
			data: { id: "1", name: "Created" },
		});

		const result = await executeMutation(mockMutation);
		expect(result).toEqual({ id: "1", name: "Created" });
	});
});
