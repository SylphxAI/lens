/**
 * Tests for @sylphx/lens umbrella package
 */

import { describe, expect, test } from "bun:test";

// Re-exports from core
import {
	bigint,
	boolean,
	bytes,
	datetime,
	enumType,
	float,
	id,
	int,
	json,
	list,
	model,
	mutation,
	object,
	query,
	resolver,
	scalar,
	string,
} from "./index.js";

describe("@sylphx/lens", () => {
	describe("core re-exports", () => {
		test("field builder functions exist", () => {
			expect(id).toBeDefined();
			expect(string).toBeDefined();
			expect(int).toBeDefined();
			expect(float).toBeDefined();
			expect(boolean).toBeDefined();
			expect(datetime).toBeDefined();
			expect(bigint).toBeDefined();
			expect(bytes).toBeDefined();
			expect(json).toBeDefined();
			expect(enumType).toBeDefined();
			expect(object).toBeDefined();
			expect(list).toBeDefined();
		});

		test("model function exists", () => {
			expect(model).toBeDefined();
			expect(typeof model).toBe("function");
		});

		test("operation builders exist", () => {
			expect(query).toBeDefined();
			expect(mutation).toBeDefined();
		});

		test("resolver function exists", () => {
			expect(resolver).toBeDefined();
			expect(typeof resolver).toBe("function");
		});

		test("scalar helper exists", () => {
			expect(scalar).toBeDefined();
			expect(typeof scalar).toBe("function");
		});
	});

	describe("field type builders", () => {
		test("datetime() creates DateTimeType", () => {
			const dateType = datetime();
			expect(dateType._type).toBe("datetime");
		});

		test("bigint() creates BigIntType", () => {
			const bigintType = bigint();
			expect(bigintType._type).toBe("bigint");
		});

		test("bytes() creates BytesType", () => {
			const bytesType = bytes();
			expect(bytesType._type).toBe("bytes");
		});

		test("json() creates JsonType", () => {
			const jsonType = json();
			expect(jsonType._type).toBe("json");
		});
	});

	describe("field wrappers", () => {
		test("list() works", () => {
			const type = list(string());
			expect(type).toBeDefined();
			expect(type._inner).toBeDefined();
		});
	});
});
