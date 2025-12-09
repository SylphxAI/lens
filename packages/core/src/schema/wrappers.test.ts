/**
 * @sylphx/lens-core - Wrappers Tests
 */

import { describe, expect, it } from "bun:test";
import { model } from "./model.js";
import { isListWrapper, isNullableWrapper, LIST_SYMBOL, list, NULLABLE_SYMBOL, nullable } from "./wrappers.js";

describe("wrappers", () => {
	const User = model("User", (t) => ({
		id: t.id(),
		name: t.string(),
	}));

	describe("nullable()", () => {
		it("wraps a model as nullable", () => {
			const nullableUser = nullable(User);

			expect(NULLABLE_SYMBOL in nullableUser).toBe(true);
			expect(nullableUser._inner).toBe(User);
		});

		it("wraps a list as nullable", () => {
			const nullableList = nullable(list(User));

			expect(NULLABLE_SYMBOL in nullableList).toBe(true);
			expect(LIST_SYMBOL in nullableList._inner).toBe(true);
		});
	});

	describe("list()", () => {
		it("wraps a model as list", () => {
			const userList = list(User);

			expect(LIST_SYMBOL in userList).toBe(true);
			expect(userList._inner).toBe(User);
		});
	});

	describe("isNullableWrapper()", () => {
		it("returns true for NullableWrapper", () => {
			expect(isNullableWrapper(nullable(User))).toBe(true);
			expect(isNullableWrapper(nullable(list(User)))).toBe(true);
		});

		it("returns false for non-NullableWrapper", () => {
			expect(isNullableWrapper(User)).toBe(false);
			expect(isNullableWrapper(list(User))).toBe(false);
			expect(isNullableWrapper(null)).toBe(false);
			expect(isNullableWrapper(undefined)).toBe(false);
		});
	});

	describe("isListWrapper()", () => {
		it("returns true for ListWrapper", () => {
			expect(isListWrapper(list(User))).toBe(true);
		});

		it("returns false for non-ListWrapper", () => {
			expect(isListWrapper(User)).toBe(false);
			expect(isListWrapper(nullable(User))).toBe(false);
			expect(isListWrapper(null)).toBe(false);
			expect(isListWrapper(undefined)).toBe(false);
		});
	});

	describe("composition", () => {
		it("nullable(list(Model)) creates nested wrappers", () => {
			const result = nullable(list(User));

			expect(isNullableWrapper(result)).toBe(true);
			expect(isListWrapper(result._inner)).toBe(true);
			expect(result._inner._inner).toBe(User);
		});

		// Note: list(nullable(Model)) is not supported by design
		// Users should use optional fields instead of nullable items
	});
});
