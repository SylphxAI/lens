/**
 * @sylphx/lens-core - Plugin Extension Type Tests
 *
 * Type-level tests for the plugin extension protocol.
 * These tests verify compile-time type safety.
 */

import { describe, expect, it } from "bun:test";
import type { OptimisticPluginExtension } from "./optimistic-extension.js";
import type {
	ExtractExtension,
	HasPlugin,
	IfPlugin,
	MergeExtensions,
	NoExtension,
	PluginExtension,
	RuntimePlugin,
} from "./types.js";
import { isRuntimePlugin } from "./types.js";

// =============================================================================
// Test Plugin Definitions
// =============================================================================

interface TestPluginA extends PluginExtension {
	readonly name: "test-a";
	readonly MutationBuilderWithReturns: {
		methodA(): void;
	};
}

interface TestPluginB extends PluginExtension {
	readonly name: "test-b";
	readonly MutationBuilderWithReturns: {
		methodB(): void;
	};
	readonly QueryBuilder: {
		queryMethodB(): void;
	};
}

interface TestPluginC extends PluginExtension {
	readonly name: "test-c";
	readonly MutationBuilderWithArgs: {
		argsMethodC(): void;
	};
}

// =============================================================================
// Type-Level Tests (Compile-Time)
// =============================================================================

describe("Plugin Extension Types", () => {
	describe("ExtractExtension", () => {
		it("should extract MutationBuilderWithReturns from single plugin", () => {
			type Result = ExtractExtension<[TestPluginA], "MutationBuilderWithReturns">;

			// Type assertion - if this compiles, the type is correct
			const _check: Result = { methodA: () => {} };
			expect(_check).toBeDefined();
		});

		it("should merge MutationBuilderWithReturns from multiple plugins", () => {
			type Result = ExtractExtension<[TestPluginA, TestPluginB], "MutationBuilderWithReturns">;

			// Should have both methodA and methodB
			const _check: Result = {
				methodA: () => {},
				methodB: () => {},
			};
			expect(_check).toBeDefined();
		});

		it("should extract QueryBuilder extensions", () => {
			type Result = ExtractExtension<[TestPluginB], "QueryBuilder">;

			const _check: Result = { queryMethodB: () => {} };
			expect(_check).toBeDefined();
		});

		it("should return empty object when no plugins have extension", () => {
			type Result = ExtractExtension<[TestPluginC], "MutationBuilderWithReturns">;

			// TestPluginC doesn't have MutationBuilderWithReturns
			const _check: Result = {};
			expect(_check).toBeDefined();
		});
	});

	describe("MergeExtensions", () => {
		it("should merge all extension categories", () => {
			type Result = MergeExtensions<[TestPluginA, TestPluginB, TestPluginC]>;

			// Verify each category is merged correctly
			type MutationReturns = Result["MutationBuilderWithReturns"];
			type MutationArgs = Result["MutationBuilderWithArgs"];
			type Query = Result["QueryBuilder"];

			const _mutationReturns: MutationReturns = {
				methodA: () => {},
				methodB: () => {},
			};
			const _mutationArgs: MutationArgs = {
				argsMethodC: () => {},
			};
			const _query: Query = {
				queryMethodB: () => {},
			};

			expect(_mutationReturns).toBeDefined();
			expect(_mutationArgs).toBeDefined();
			expect(_query).toBeDefined();
		});
	});

	describe("HasPlugin", () => {
		it("should return true when plugin exists", () => {
			type Result = HasPlugin<[TestPluginA, TestPluginB], "test-a">;
			const _check: Result = true;
			expect(_check).toBe(true);
		});

		it("should return false when plugin does not exist", () => {
			type Result = HasPlugin<[TestPluginA, TestPluginB], "test-c">;
			const _check: Result = false;
			expect(_check).toBe(false);
		});

		it("should work with OptimisticPluginExtension", () => {
			type WithOptimistic = HasPlugin<[OptimisticPluginExtension], "optimistic">;
			type WithoutOptimistic = HasPlugin<[TestPluginA], "optimistic">;

			const _with: WithOptimistic = true;
			const _without: WithoutOptimistic = false;

			expect(_with).toBe(true);
			expect(_without).toBe(false);
		});
	});

	describe("IfPlugin", () => {
		it("should return Then type when plugin exists", () => {
			type Result = IfPlugin<[TestPluginA], "test-a", { available: true }, { available: false }>;
			const _check: Result = { available: true };
			expect(_check.available).toBe(true);
		});

		it("should return Else type when plugin does not exist", () => {
			type Result = IfPlugin<[TestPluginB], "test-a", { available: true }, { available: false }>;
			const _check: Result = { available: false };
			expect(_check.available).toBe(false);
		});
	});

	describe("NoExtension", () => {
		it("should have empty extension objects", () => {
			type Result = MergeExtensions<[NoExtension]>;

			// All categories should be empty objects (Record<string, never>)
			const _mutationReturns: Result["MutationBuilderWithReturns"] = {} as Result["MutationBuilderWithReturns"];
			const _mutationArgs: Result["MutationBuilderWithArgs"] = {} as Result["MutationBuilderWithArgs"];
			const _query: Result["QueryBuilder"] = {} as Result["QueryBuilder"];

			expect(_mutationReturns).toEqual({});
			expect(_mutationArgs).toEqual({});
			expect(_query).toEqual({});
		});
	});
});

// =============================================================================
// Runtime Tests
// =============================================================================

describe("Runtime Plugin Utilities", () => {
	describe("isRuntimePlugin", () => {
		it("should return true for valid runtime plugin", () => {
			const plugin: RuntimePlugin = {
				name: "test-plugin",
			};
			expect(isRuntimePlugin(plugin)).toBe(true);
		});

		it("should return true for plugin with builderExtensions", () => {
			const plugin: RuntimePlugin = {
				name: "test-plugin",
				builderExtensions: {
					MutationBuilderWithReturns: () => ({ customMethod: () => {} }),
				},
			};
			expect(isRuntimePlugin(plugin)).toBe(true);
		});

		it("should return false for null", () => {
			expect(isRuntimePlugin(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isRuntimePlugin(undefined)).toBe(false);
		});

		it("should return false for non-object", () => {
			expect(isRuntimePlugin("not a plugin")).toBe(false);
			expect(isRuntimePlugin(123)).toBe(false);
		});

		it("should return false for object without name", () => {
			expect(isRuntimePlugin({})).toBe(false);
			expect(isRuntimePlugin({ other: "prop" })).toBe(false);
		});

		it("should return false for object with non-string name", () => {
			expect(isRuntimePlugin({ name: 123 })).toBe(false);
			expect(isRuntimePlugin({ name: null })).toBe(false);
		});
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("Type Inference", () => {
	it("should infer plugin extension from plugin array", () => {
		// This is a compile-time test - if it compiles, the inference works
		type Plugins = readonly [TestPluginA, TestPluginB];
		type Extensions = MergeExtensions<Plugins>;

		// Verify the merged type has the expected shape
		type MutationExt = Extensions["MutationBuilderWithReturns"];
		type _HasMethodA = MutationExt extends { methodA(): void } ? true : false;
		type _HasMethodB = MutationExt extends { methodB(): void } ? true : false;

		const checkA: _HasMethodA = true;
		const checkB: _HasMethodB = true;

		expect(checkA).toBe(true);
		expect(checkB).toBe(true);
	});

	it("should work with readonly arrays", () => {
		// Plugins are typically defined as const arrays (readonly)
		const plugins = [{ name: "test-a" as const }, { name: "test-b" as const }] as const;

		type Plugins = typeof plugins;
		type Names = Plugins[number]["name"];

		// Should infer literal types
		const name: Names = "test-a";
		expect(name).toBe("test-a");
	});
});
