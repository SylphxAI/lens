/**
 * Tests for @sylphx/lens umbrella package
 */

import { describe, expect, test } from "bun:test";

// Re-exports from core
import { defineType, entity, mutation, query, resolver, t } from "./index";

describe("@sylphx/lens", () => {
	describe("core re-exports", () => {
		test("t type builders exist", () => {
			expect(t.id).toBeDefined();
			expect(t.string).toBeDefined();
			expect(t.int).toBeDefined();
			expect(t.float).toBeDefined();
			expect(t.boolean).toBeDefined();
			expect(t.datetime).toBeDefined();
			expect(t.date).toBeDefined();
			expect(t.decimal).toBeDefined();
			expect(t.bigint).toBeDefined();
			expect(t.bytes).toBeDefined();
			expect(t.json).toBeDefined();
			expect(t.enum).toBeDefined();
			expect(t.object).toBeDefined();
			expect(t.array).toBeDefined();
			expect(t.custom).toBeDefined();
		});

		test("entity function exists", () => {
			expect(entity).toBeDefined();
			expect(typeof entity).toBe("function");
		});

		test("operation builders exist", () => {
			expect(query).toBeDefined();
			expect(mutation).toBeDefined();
		});

		test("resolver function exists", () => {
			expect(resolver).toBeDefined();
			expect(typeof resolver).toBe("function");
		});

		test("defineType helper exists", () => {
			expect(defineType).toBeDefined();
			expect(typeof defineType).toBe("function");
		});
	});

	describe("new type builders", () => {
		test("t.date() creates DateType", () => {
			const dateType = t.date();
			expect(dateType._type).toBe("date");
		});

		test("t.bigint() creates BigIntType", () => {
			const bigintType = t.bigint();
			expect(bigintType._type).toBe("bigint");
		});

		test("t.bytes() creates BytesType", () => {
			const bytesType = t.bytes();
			expect(bytesType._type).toBe("bytes");
		});

		test("t.json() creates JsonType", () => {
			const jsonType = t.json();
			expect(jsonType._type).toBe("json");
		});
	});

	describe("modifiers", () => {
		test(".nullable() works", () => {
			const type = t.string().nullable();
			expect(type.isNullable()).toBe(true);
		});

		test(".optional() works", () => {
			const type = t.string().optional();
			expect(type.isOptional()).toBe(true);
		});

		test(".default() works", () => {
			const type = t.string().default("test");
			expect(type.getDefault()).toBe("test");
		});
	});
});
