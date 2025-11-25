/**
 * Tests for Update Strategies
 */

import { describe, expect, test } from "bun:test";
import {
	type DeltaUpdate,
	type PatchUpdate,
	type ValueUpdate,
	applyUpdate,
	createUpdate,
	deltaStrategy,
	patchStrategy,
	selectStrategy,
	valueStrategy,
} from "./strategies";

describe("Value Strategy", () => {
	test("encodes value as-is", () => {
		const update = valueStrategy.encode("old", "new");
		expect(update.strategy).toBe("value");
		expect(update.data).toBe("new");
	});

	test("decodes by replacing", () => {
		const result = valueStrategy.decode("old", { strategy: "value", data: "new" });
		expect(result).toBe("new");
	});

	test("works with objects", () => {
		const prev = { a: 1 };
		const next = { a: 2, b: 3 };
		const update = valueStrategy.encode(prev, next);
		expect(update.data).toEqual(next);

		const result = valueStrategy.decode(prev, update);
		expect(result).toEqual(next);
	});

	test("works with arrays", () => {
		const prev = [1, 2, 3];
		const next = [4, 5, 6];
		const update = valueStrategy.encode(prev, next);
		const result = valueStrategy.decode(prev, update);
		expect(result).toEqual(next);
	});
});

describe("Delta Strategy", () => {
	// Note: Delta strategy falls back to value when diff >= value size
	// This is correct behavior for efficiency

	test("falls back to value for short strings (more efficient)", () => {
		const update = deltaStrategy.encode("Hello", "Hello World");
		// For short strings, value is more efficient than delta
		expect(update.strategy).toBe("value");
		expect((update as ValueUpdate<string>).data).toBe("Hello World");
	});

	test("uses delta for long strings with small changes", () => {
		// Long base string where delta is more efficient
		const base =
			"This is a very long string that needs to be long enough to make delta encoding worthwhile for bandwidth savings";
		const updated = `${base} appended`;

		const update = deltaStrategy.encode(base, updated);
		// For long strings with small changes, delta is more efficient
		expect(update.strategy).toBe("delta");

		const delta = update as DeltaUpdate;
		expect(delta.data).toHaveLength(1);
		expect(delta.data[0].position).toBe(base.length);
		expect(delta.data[0].insert).toBe(" appended");
	});

	test("decodes delta operations correctly", () => {
		// Use a long string where delta is efficient
		const original =
			"This is a long enough string to test delta decoding properly with real content";
		const expected = original.replace("test", "verify");

		const update = deltaStrategy.encode(original, expected);
		const result = deltaStrategy.decode(original, update);

		expect(result).toBe(expected);
	});

	test("decodes value fallback correctly", () => {
		const original = "short";
		const expected = "different";

		const update = deltaStrategy.encode(original, expected);
		const result = deltaStrategy.decode(original, update);

		expect(result).toBe(expected);
	});

	test("handles streaming append (LLM-style)", () => {
		// Start with long enough content
		let content =
			"This is the beginning of a long LLM response that will have streaming tokens appended to it as the model generates";

		// Simulate streaming tokens
		const tokens = [" more", " content", " here", " and", " here"];
		for (const token of tokens) {
			const newContent = content + token;
			const update = deltaStrategy.encode(content, newContent);

			// For streaming appends to long strings, delta should be used
			if (content.length > 100) {
				expect(update.strategy).toBe("delta");
				const delta = update as DeltaUpdate;
				expect(delta.data[0].position).toBe(content.length);
				expect(delta.data[0].insert).toBe(token);
			}

			content = deltaStrategy.decode(content, update);
		}

		expect(content).toBe(
			"This is the beginning of a long LLM response that will have streaming tokens appended to it as the model generates more content here and here",
		);
	});
});

describe("Patch Strategy", () => {
	// Note: Patch strategy falls back to value when patch >= value size
	// This is correct behavior for efficiency

	test("falls back to value for small objects (more efficient)", () => {
		const prev = { a: 1 };
		const next = { a: 1, b: 2 };
		const update = patchStrategy.encode(prev, next);

		// For small objects, value is often more efficient
		expect(update.strategy).toBe("value");
	});

	test("uses patch for larger objects with small changes", () => {
		const prev = {
			id: "user-123",
			name: "John Doe",
			email: "john@example.com",
			age: 30,
			address: {
				street: "123 Main St",
				city: "New York",
				zip: "10001",
			},
		};
		const next = { ...prev, age: 31 };

		const update = patchStrategy.encode(prev, next);
		expect(update.strategy).toBe("patch");

		const patch = update as PatchUpdate;
		expect(patch.data).toContainEqual({ op: "replace", path: "/age", value: 31 });
	});

	test("encodes nested object changes efficiently", () => {
		const prev = {
			user: {
				name: "John",
				age: 30,
				settings: {
					theme: "dark",
					notifications: true,
					language: "en",
				},
			},
			metadata: { version: 1, lastUpdated: "2024-01-01" },
		};
		const next = {
			...prev,
			user: {
				...prev.user,
				settings: {
					...prev.user.settings,
					theme: "light",
				},
			},
		};

		const update = patchStrategy.encode(prev, next);
		expect(update.strategy).toBe("patch");

		const patch = update as PatchUpdate;
		expect(patch.data).toContainEqual({
			op: "replace",
			path: "/user/settings/theme",
			value: "light",
		});
	});

	test("decodes patch operations correctly", () => {
		const original = {
			id: "item-1",
			name: "Test Item",
			count: 5,
			tags: ["a", "b"],
		};
		const expected = {
			id: "item-1",
			name: "Test Item",
			count: 10,
			tags: ["a", "b", "c"],
		};

		const update = patchStrategy.encode(original, expected);
		const result = patchStrategy.decode(original, update);

		expect(result).toEqual(expected);
	});

	test("handles property removal", () => {
		const prev = {
			id: "user-1",
			name: "John",
			email: "john@example.com",
			tempField: "should be removed",
			settings: { theme: "dark" },
		};
		const next = {
			id: "user-1",
			name: "John",
			email: "john@example.com",
			settings: { theme: "dark" },
		};

		const update = patchStrategy.encode(prev, next);
		const result = patchStrategy.decode(prev, update);

		expect(result).toEqual(next);
		expect((result as typeof prev).tempField).toBeUndefined();
	});
});

describe("Strategy Selection", () => {
	test("selects value for primitives", () => {
		expect(selectStrategy(1, 2).name).toBe("value");
		expect(selectStrategy(true, false).name).toBe("value");
		expect(selectStrategy(null, null).name).toBe("value");
	});

	test("selects value for short strings", () => {
		const strategy = selectStrategy("hello", "world");
		expect(strategy.name).toBe("value");
	});

	test("selects delta for long strings", () => {
		const longString = "a".repeat(150);
		const strategy = selectStrategy(longString, `${longString} appended`);
		expect(strategy.name).toBe("delta");
	});

	test("selects patch for larger objects", () => {
		const obj = {
			id: "123",
			name: "Test",
			description: "A longer description field",
			count: 42,
			nested: { a: 1, b: 2 },
		};
		const strategy = selectStrategy(obj, { ...obj, count: 43 });
		expect(strategy.name).toBe("patch");
	});

	test("selects value for small objects", () => {
		const obj = { a: 1 };
		const strategy = selectStrategy(obj, { a: 2 });
		expect(strategy.name).toBe("value");
	});
});

describe("createUpdate and applyUpdate", () => {
	test("creates and applies value update", () => {
		const update = createUpdate(1, 2);
		expect(update.strategy).toBe("value");

		const result = applyUpdate(1, update);
		expect(result).toBe(2);
	});

	test("creates and applies delta update for long strings", () => {
		const longText =
			"This is a long text that should trigger delta strategy for updates because it exceeds the minimum threshold";
		const newText = `${longText} with appended content`;

		const update = createUpdate(longText, newText);
		expect(update.strategy).toBe("delta");

		const result = applyUpdate(longText, update);
		expect(result).toBe(newText);
	});

	test("creates and applies patch update for objects", () => {
		const obj = {
			name: "John",
			age: 30,
			email: "john@example.com",
			settings: { theme: "dark" },
		};
		const newObj = {
			name: "John",
			age: 31,
			email: "john@example.com",
			settings: { theme: "dark" },
		};

		const update = createUpdate(obj, newObj);
		expect(update.strategy).toBe("patch");

		const result = applyUpdate(obj, update);
		expect(result).toEqual(newObj);
	});

	test("round-trips complex nested data", () => {
		const original = {
			user: {
				name: "Alice",
				settings: {
					theme: "dark",
					notifications: true,
				},
			},
			items: [1, 2, 3],
		};

		const updated = {
			user: {
				name: "Alice",
				settings: {
					theme: "light",
					notifications: true,
					language: "en",
				},
			},
			items: [1, 2, 3, 4],
		};

		const update = createUpdate(original, updated);
		const result = applyUpdate(original, update);

		expect(result).toEqual(updated);
	});

	test("handles null to value transitions", () => {
		const result = applyUpdate(null, { strategy: "value", data: { foo: "bar" } });
		expect(result).toEqual({ foo: "bar" });
	});

	test("handles undefined values", () => {
		const update = createUpdate(undefined, "new value");
		expect(update.strategy).toBe("value");
		expect(applyUpdate(undefined, update)).toBe("new value");
	});
});
