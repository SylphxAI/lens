/**
 * Optimistic Updates Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { NormalizedCache } from "../optimistic/cache.js";
import { OptimisticExecutor } from "../optimistic/executor.js";
import type { OptimisticConfig } from "@sylphx/lens-core";

describe("NormalizedCache", () => {
	let cache: NormalizedCache;

	beforeEach(() => {
		cache = new NormalizedCache();
	});

	it("should set and get base entity", () => {
		cache.setBase("Session", "1", { title: "Hello", active: true });
		const entity = cache.getBase("Session", "1");
		expect(entity).toEqual({ title: "Hello", active: true });
	});

	it("should merge base entity", () => {
		cache.setBase("Session", "1", { title: "Hello", active: true });
		cache.mergeBase("Session", "1", { title: "World" });
		const entity = cache.getBase("Session", "1");
		expect(entity).toEqual({ title: "World", active: true });
	});

	it("should apply optimistic update", () => {
		cache.setBase("Session", "1", { title: "Hello", active: true });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "Optimistic" });

		const base = cache.getBase("Session", "1");
		const merged = cache.get("Session", "1");

		expect(base).toEqual({ title: "Hello", active: true });
		expect(merged).toEqual({ title: "Optimistic", active: true });
	});

	it("should confirm optimistic update", () => {
		cache.setBase("Session", "1", { title: "Hello", active: true });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "Optimistic" });
		cache.confirmOptimistic("mut-1", "Session", "1");

		const base = cache.getBase("Session", "1");
		const merged = cache.get("Session", "1");

		expect(base).toEqual({ title: "Optimistic", active: true });
		expect(merged).toEqual({ title: "Optimistic", active: true });
	});

	it("should rollback optimistic update", () => {
		cache.setBase("Session", "1", { title: "Hello", active: true });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "Optimistic" });
		cache.rollbackOptimistic("mut-1", "Session", "1");

		const base = cache.getBase("Session", "1");
		const merged = cache.get("Session", "1");

		expect(base).toEqual({ title: "Hello", active: true });
		expect(merged).toEqual({ title: "Hello", active: true });
	});

	it("should handle multiple optimistic layers", () => {
		cache.setBase("Session", "1", { title: "Hello", count: 0 });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "First" });
		cache.applyOptimistic("mut-2", "Session", "1", { count: 1 });

		const merged = cache.get("Session", "1");
		expect(merged).toEqual({ title: "First", count: 1 });
	});

	it("should track optimistic mutations", () => {
		cache.setBase("Session", "1", { title: "Hello" });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "First" });
		cache.applyOptimistic("mut-2", "Session", "1", { title: "Second" });

		const mutations = cache.getOptimisticMutations("Session", "1");
		expect(mutations).toEqual(["mut-1", "mut-2"]);
	});

	it("should provide cache statistics", () => {
		cache.setBase("Session", "1", { title: "Hello" });
		cache.setBase("Session", "2", { title: "World" });
		cache.applyOptimistic("mut-1", "Session", "1", { title: "Optimistic" });

		const stats = cache.getStats();
		expect(stats.totalEntities).toBe(2);
		expect(stats.entitiesWithOptimistic).toBe(1);
		expect(stats.totalOptimisticLayers).toBe(1);
	});
});

describe("OptimisticExecutor", () => {
	let cache: NormalizedCache;
	let executor: OptimisticExecutor;

	beforeEach(() => {
		cache = new NormalizedCache();
		executor = new OptimisticExecutor(cache);
	});

	it("should execute simple set operation", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		cache.setBase("Session", "sess-1", { title: "Old Title" });

		executor.execute("mut-1", config, {
			sessionId: "sess-1",
			newTitle: "New Title",
		});

		const merged = cache.get("Session", "sess-1");
		expect(merged).toEqual({ title: "New Title" });
	});

	it("should execute set operation with literal value", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["active"],
					value: { type: "literal", value: true },
				},
			],
		};

		cache.setBase("Session", "sess-1", { active: false });

		executor.execute("mut-1", config, { sessionId: "sess-1" });

		const merged = cache.get("Session", "sess-1");
		expect(merged).toEqual({ active: true });
	});

	it("should execute set operation with transform", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["updatedAt"],
					value: { type: "transform", name: "now" },
				},
			],
		};

		cache.setBase("Session", "sess-1", { updatedAt: 0 });

		const beforeTime = Date.now();
		executor.execute("mut-1", config, { sessionId: "sess-1" });
		const afterTime = Date.now();

		const merged = cache.get("Session", "sess-1");
		expect(merged?.updatedAt).toBeGreaterThanOrEqual(beforeTime);
		expect(merged?.updatedAt).toBeLessThanOrEqual(afterTime);
	});

	it("should execute array-push operation", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "array-push",
					path: ["tags"],
					items: [{ type: "field", path: ["newTag"] }],
				},
			],
		};

		cache.setBase("Session", "sess-1", { tags: ["tag1", "tag2"] });

		executor.execute("mut-1", config, {
			sessionId: "sess-1",
			newTag: "tag3",
		});

		const merged = cache.get("Session", "sess-1");
		expect(merged?.tags).toEqual(["tag1", "tag2", "tag3"]);
	});

	it("should execute array-splice operation", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "array-splice",
					path: ["items"],
					start: 1,
					deleteCount: 1,
					items: [{ type: "literal", value: "new" }],
				},
			],
		};

		cache.setBase("Session", "sess-1", { items: ["a", "b", "c"] });

		executor.execute("mut-1", config, { sessionId: "sess-1" });

		const merged = cache.get("Session", "sess-1");
		expect(merged?.items).toEqual(["a", "new", "c"]);
	});

	it("should confirm optimistic update", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		cache.setBase("Session", "sess-1", { title: "Old" });
		executor.execute("mut-1", config, {
			sessionId: "sess-1",
			newTitle: "New",
		});

		executor.confirm("mut-1", "Session", "sess-1");

		const base = cache.getBase("Session", "sess-1");
		expect(base).toEqual({ title: "New" });
		expect(cache.hasOptimistic("Session", "sess-1")).toBe(false);
	});

	it("should rollback optimistic update", () => {
		const config: OptimisticConfig = {
			entity: "Session",
			id: { type: "field", path: ["sessionId"] },
			operations: [
				{
					op: "set",
					path: ["title"],
					value: { type: "field", path: ["newTitle"] },
				},
			],
		};

		cache.setBase("Session", "sess-1", { title: "Old" });
		executor.execute("mut-1", config, {
			sessionId: "sess-1",
			newTitle: "New",
		});

		executor.rollback("mut-1", "Session", "sess-1");

		const merged = cache.get("Session", "sess-1");
		expect(merged).toEqual({ title: "Old" });
		expect(cache.hasOptimistic("Session", "sess-1")).toBe(false);
	});
});
