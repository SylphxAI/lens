/**
 * @sylphx/lens-core - Hash Tests
 */

import { describe, expect, it } from "bun:test";
import {
	FieldHashMap,
	HashCache,
	deepEqual,
	hashEntityFields,
	hashEntityState,
	hashValue,
	murmurhash3,
	stableStringify,
	valuesEqual,
} from "./hash.js";

// =============================================================================
// MurmurHash3 Tests
// =============================================================================

describe("murmurhash3", () => {
	it("returns consistent hash for same input", () => {
		const hash1 = murmurhash3("hello world");
		const hash2 = murmurhash3("hello world");
		expect(hash1).toBe(hash2);
	});

	it("returns different hash for different input", () => {
		const hash1 = murmurhash3("hello");
		const hash2 = murmurhash3("world");
		expect(hash1).not.toBe(hash2);
	});

	it("returns 8-character hex string", () => {
		const hash = murmurhash3("test");
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it("handles empty string", () => {
		const hash = murmurhash3("");
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it("handles long strings", () => {
		const longString = "a".repeat(10000);
		const hash = murmurhash3(longString);
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it("handles unicode characters", () => {
		const hash = murmurhash3("你好世界🌍");
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it("respects seed parameter", () => {
		const hash1 = murmurhash3("test", 0);
		const hash2 = murmurhash3("test", 1);
		expect(hash1).not.toBe(hash2);
	});
});

// =============================================================================
// stableStringify Tests
// =============================================================================

describe("stableStringify", () => {
	it("stringifies primitives correctly", () => {
		expect(stableStringify(null)).toBe("null");
		expect(stableStringify(123)).toBe("123");
		expect(stableStringify("hello")).toBe('"hello"');
		expect(stableStringify(true)).toBe("true");
	});

	it("sorts object keys", () => {
		const obj = { c: 1, a: 2, b: 3 };
		expect(stableStringify(obj)).toBe('{"a":2,"b":3,"c":1}');
	});

	it("handles nested objects", () => {
		const obj = { z: { b: 1, a: 2 }, y: 3 };
		expect(stableStringify(obj)).toBe('{"y":3,"z":{"a":2,"b":1}}');
	});

	it("handles arrays", () => {
		const arr = [3, 1, 2];
		expect(stableStringify(arr)).toBe("[3,1,2]");
	});

	it("handles arrays of objects", () => {
		const arr = [{ b: 1, a: 2 }];
		expect(stableStringify(arr)).toBe('[{"a":2,"b":1}]');
	});

	it("produces same output for equivalent objects", () => {
		const obj1 = { a: 1, b: 2, c: { d: 3, e: 4 } };
		const obj2 = { c: { e: 4, d: 3 }, b: 2, a: 1 };
		expect(stableStringify(obj1)).toBe(stableStringify(obj2));
	});
});

// =============================================================================
// hashValue Tests
// =============================================================================

describe("hashValue", () => {
	it("handles null", () => {
		expect(hashValue(null)).toBe("n:null");
	});

	it("handles undefined", () => {
		expect(hashValue(undefined)).toBe("u:undefined");
	});

	it("handles strings", () => {
		const hash = hashValue("hello");
		expect(hash).toMatch(/^s:[0-9a-f]{8}$/);
	});

	it("handles numbers", () => {
		const hash = hashValue(42);
		expect(hash).toMatch(/^n:[0-9a-f]{8}$/);
	});

	it("handles booleans", () => {
		expect(hashValue(true)).toBe("b:true");
		expect(hashValue(false)).toBe("b:false");
	});

	it("handles objects", () => {
		const hash = hashValue({ a: 1 });
		expect(hash).toMatch(/^o:[0-9a-f]{8}$/);
	});

	it("returns same hash for equivalent objects", () => {
		const hash1 = hashValue({ a: 1, b: 2 });
		const hash2 = hashValue({ b: 2, a: 1 });
		expect(hash1).toBe(hash2);
	});

	it("returns different hash for different objects", () => {
		const hash1 = hashValue({ a: 1 });
		const hash2 = hashValue({ a: 2 });
		expect(hash1).not.toBe(hash2);
	});

	it("handles bigint", () => {
		const hash = hashValue(BigInt(123));
		expect(hash).toMatch(/^i:[0-9a-f]{8}$/);
	});
});

// =============================================================================
// hashEntityState Tests
// =============================================================================

describe("hashEntityState", () => {
	it("returns consistent hash for same entity", () => {
		const entity = { id: "123", name: "Alice", age: 30 };
		const hash1 = hashEntityState(entity);
		const hash2 = hashEntityState(entity);
		expect(hash1).toBe(hash2);
	});

	it("returns same hash for equivalent entities", () => {
		const entity1 = { name: "Alice", age: 30, id: "123" };
		const entity2 = { id: "123", age: 30, name: "Alice" };
		expect(hashEntityState(entity1)).toBe(hashEntityState(entity2));
	});

	it("returns different hash for different entities", () => {
		const entity1 = { id: "123", name: "Alice" };
		const entity2 = { id: "123", name: "Bob" };
		expect(hashEntityState(entity1)).not.toBe(hashEntityState(entity2));
	});
});

// =============================================================================
// hashEntityFields Tests
// =============================================================================

describe("hashEntityFields", () => {
	it("hashes only specified fields", () => {
		const entity = { id: "123", name: "Alice", age: 30, email: "alice@test.com" };
		const hash1 = hashEntityFields(entity, ["name", "age"]);
		const hash2 = hashEntityFields({ ...entity, email: "changed@test.com" }, ["name", "age"]);
		expect(hash1).toBe(hash2);
	});

	it("returns different hash when specified fields differ", () => {
		const entity1 = { id: "123", name: "Alice", age: 30 };
		const entity2 = { id: "123", name: "Bob", age: 30 };
		const hash1 = hashEntityFields(entity1, ["name"]);
		const hash2 = hashEntityFields(entity2, ["name"]);
		expect(hash1).not.toBe(hash2);
	});

	it("ignores field order", () => {
		const entity = { name: "Alice", age: 30 };
		const hash1 = hashEntityFields(entity, ["name", "age"]);
		const hash2 = hashEntityFields(entity, ["age", "name"]);
		expect(hash1).toBe(hash2);
	});
});

// =============================================================================
// HashCache Tests
// =============================================================================

describe("HashCache", () => {
	it("caches primitive values", () => {
		const cache = new HashCache();
		const hash1 = cache.get(42);
		const hash2 = cache.get(42);
		expect(hash1).toBe(hash2);
	});

	it("respects maxSize", () => {
		const cache = new HashCache(3);
		cache.get(1);
		cache.get(2);
		cache.get(3);
		cache.get(4); // Should evict 1

		const stats = cache.getStats();
		expect(stats.size).toBeLessThanOrEqual(3);
	});

	it("clears cache", () => {
		const cache = new HashCache();
		cache.get(1);
		cache.get(2);
		cache.clear();

		const stats = cache.getStats();
		expect(stats.size).toBe(0);
	});
});

// =============================================================================
// FieldHashMap Tests
// =============================================================================

describe("FieldHashMap", () => {
	it("detects changed values", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");

		expect(map.hasChanged("name", "Bob")).toBe(true);
		expect(map.hasChanged("name", "Bob")).toBe(false); // Now stored
	});

	it("detects unchanged values", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");

		expect(map.hasChanged("name", "Alice")).toBe(false);
	});

	it("tracks multiple fields", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");
		map.update("age", 30);

		expect(map.hasChanged("name", "Bob")).toBe(true);
		expect(map.hasChanged("age", 30)).toBe(false);
	});

	it("returns correct hash for field", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");

		const hash = map.getHash("name");
		expect(hash).toBeDefined();
		expect(hash).toBe(hashValue("Alice"));
	});

	it("deletes field hash", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");
		map.delete("name");

		expect(map.getHash("name")).toBeUndefined();
	});

	it("clears all hashes", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");
		map.update("age", 30);
		map.clear();

		expect(map.getAll().size).toBe(0);
	});

	it("computes combined hash", () => {
		const map = new FieldHashMap();
		map.update("name", "Alice");
		map.update("age", 30);

		const combined = map.getCombinedHash();
		expect(combined).toMatch(/^[0-9a-f]{8}$/);
	});
});

// =============================================================================
// valuesEqual Tests
// =============================================================================

describe("valuesEqual", () => {
	it("handles reference equality", () => {
		const obj = { a: 1 };
		expect(valuesEqual(obj, obj)).toBe(true);
	});

	it("handles primitive equality", () => {
		expect(valuesEqual(42, 42)).toBe(true);
		expect(valuesEqual("hello", "hello")).toBe(true);
		expect(valuesEqual(true, true)).toBe(true);
	});

	it("handles primitive inequality", () => {
		expect(valuesEqual(42, 43)).toBe(false);
		expect(valuesEqual("hello", "world")).toBe(false);
	});

	it("handles type mismatch", () => {
		expect(valuesEqual(42, "42")).toBe(false);
		expect(valuesEqual(null, undefined)).toBe(false);
	});

	it("handles object equality via hash", () => {
		const obj1 = { a: 1, b: 2 };
		const obj2 = { b: 2, a: 1 };
		expect(valuesEqual(obj1, obj2)).toBe(true);
	});

	it("handles object inequality", () => {
		const obj1 = { a: 1 };
		const obj2 = { a: 2 };
		expect(valuesEqual(obj1, obj2)).toBe(false);
	});

	it("uses pre-computed hashes when provided", () => {
		const obj1 = { a: 1 };
		const obj2 = { a: 1 };
		const hash = hashValue(obj1);
		expect(valuesEqual(obj1, obj2, hash, hash)).toBe(true);
	});
});

// =============================================================================
// deepEqual Tests
// =============================================================================

describe("deepEqual", () => {
	it("handles reference equality", () => {
		const obj = { a: 1 };
		expect(deepEqual(obj, obj)).toBe(true);
	});

	it("handles primitives", () => {
		expect(deepEqual(42, 42)).toBe(true);
		expect(deepEqual(42, 43)).toBe(false);
		expect(deepEqual("a", "a")).toBe(true);
		expect(deepEqual("a", "b")).toBe(false);
	});

	it("handles null and undefined", () => {
		expect(deepEqual(null, null)).toBe(true);
		expect(deepEqual(undefined, undefined)).toBe(true);
		expect(deepEqual(null, undefined)).toBe(false);
	});

	it("handles arrays", () => {
		expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
		expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
		expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
	});

	it("handles nested objects", () => {
		const obj1 = { a: { b: { c: 1 } } };
		const obj2 = { a: { b: { c: 1 } } };
		const obj3 = { a: { b: { c: 2 } } };

		expect(deepEqual(obj1, obj2)).toBe(true);
		expect(deepEqual(obj1, obj3)).toBe(false);
	});

	it("handles mixed structures", () => {
		const obj1 = { a: [1, { b: 2 }], c: "test" };
		const obj2 = { a: [1, { b: 2 }], c: "test" };
		const obj3 = { a: [1, { b: 3 }], c: "test" };

		expect(deepEqual(obj1, obj2)).toBe(true);
		expect(deepEqual(obj1, obj3)).toBe(false);
	});

	it("handles extra keys", () => {
		const obj1 = { a: 1 };
		const obj2 = { a: 1, b: 2 };
		expect(deepEqual(obj1, obj2)).toBe(false);
	});
});
