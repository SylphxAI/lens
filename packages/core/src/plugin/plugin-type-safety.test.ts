/**
 * @sylphx/lens-core - Plugin Type Safety Tests
 *
 * Tests verifying that plugin extensions are type-safe:
 * - .optimistic() is NOT available without optimisticPlugin
 * - .optimistic() IS available with optimisticPlugin
 */

import { describe, expect, it } from "bun:test";
import type { LensWithPlugins, MutationBuilderWithExtensions, MutationBuilderWithReturnsExtended } from "../lens.js";
import { lens } from "../lens.js";
import type { OptimisticPluginExtension } from "./optimistic-extension.js";
import type { HasPlugin, NoExtension, RuntimePlugin } from "./types.js";

// =============================================================================
// Test Context
// =============================================================================

interface TestContext {
	db: { find: (id: string) => unknown };
}

// =============================================================================
// Mock Optimistic Plugin (for testing)
// =============================================================================

/**
 * Mock runtime plugin that provides OptimisticPluginExtension type.
 */
function mockOptimisticPlugin(): RuntimePlugin<OptimisticPluginExtension> {
	return {
		name: "optimistic",
		builderExtensions: {
			MutationBuilderWithReturns: () => ({
				optimistic: () => ({
					resolve: () => ({ _type: "mutation" as const }),
				}),
			}),
		},
	};
}

// =============================================================================
// Type-Level Tests
// =============================================================================

describe("Plugin Type Safety", () => {
	describe("HasPlugin type utility", () => {
		it("should return true when plugin is present", () => {
			type Plugins = readonly [RuntimePlugin<OptimisticPluginExtension>];
			type Result = HasPlugin<Plugins, "optimistic">;

			// Type assertion - should be true
			const check: Result = true;
			expect(check).toBe(true);
		});

		it("should return false when plugin is absent", () => {
			type Plugins = readonly [RuntimePlugin<NoExtension>];
			type Result = HasPlugin<Plugins, "optimistic">;

			// Type assertion - should be false
			const check: Result = false;
			expect(check).toBe(false);
		});

		it("should return false for empty plugins array", () => {
			type Plugins = readonly [];
			type Result = HasPlugin<Plugins, "optimistic">;

			// Type assertion - should be false
			const check: Result = false;
			expect(check).toBe(false);
		});
	});

	describe("MutationBuilderWithReturnsExtended", () => {
		it("should have resolve() with any plugin configuration", () => {
			// Without plugins - resolve should exist
			type NoPluginsBuilder = MutationBuilderWithReturnsExtended<
				{ id: string },
				{ id: string; name: string },
				TestContext,
				readonly []
			>;
			type HasResolve = NoPluginsBuilder["resolve"];

			// Type should be a function
			const _check: HasResolve extends (...args: unknown[]) => unknown ? true : false = true;
			expect(_check).toBe(true);
		});

		it("should NOT have optimistic() without optimisticPlugin (compile-time)", () => {
			type NoPluginsBuilder = MutationBuilderWithReturnsExtended<
				{ id: string },
				{ id: string; name: string },
				TestContext,
				readonly []
			>;

			// This should NOT exist on the type
			// We verify by checking the type doesn't have 'optimistic' as a known key
			type HasOptimistic = "optimistic" extends keyof NoPluginsBuilder ? true : false;

			const check: HasOptimistic = false;
			expect(check).toBe(false);
		});

		it("should have optimistic() with optimisticPlugin (compile-time)", () => {
			type WithPluginsBuilder = MutationBuilderWithReturnsExtended<
				{ id: string },
				{ id: string; name: string },
				TestContext,
				readonly [RuntimePlugin<OptimisticPluginExtension>]
			>;

			// This SHOULD exist on the type
			type HasOptimistic = "optimistic" extends keyof WithPluginsBuilder ? true : false;

			const check: HasOptimistic = true;
			expect(check).toBe(true);
		});
	});

	describe("LensWithPlugins type", () => {
		it("should expose plugins array", () => {
			type LensResult = LensWithPlugins<TestContext, readonly [RuntimePlugin<OptimisticPluginExtension>]>;
			type HasPlugins = LensResult["plugins"] extends RuntimePlugin[] ? true : false;

			const check: HasPlugins = true;
			expect(check).toBe(true);
		});

		it("should have plugin-extended mutation factory", () => {
			type Plugins = readonly [RuntimePlugin<OptimisticPluginExtension>];
			type LensResult = LensWithPlugins<TestContext, Plugins>;
			type MutationFactory = LensResult["mutation"];

			// Should be a callable that returns MutationBuilderWithExtensions
			type Returns = ReturnType<MutationFactory>;
			type IsExtended = Returns extends MutationBuilderWithExtensions<TestContext, Plugins> ? true : false;

			const check: IsExtended = true;
			expect(check).toBe(true);
		});
	});
});

// =============================================================================
// Runtime Integration Tests
// =============================================================================

describe("Plugin Runtime Integration", () => {
	describe("lens() without plugins", () => {
		it("should create working mutation builder", () => {
			const { mutation } = lens<TestContext>();

			const builder = mutation();
			expect(builder).toBeDefined();
			expect(typeof builder.args).toBe("function");
		});

		it("should hide optimistic method at type level (compile-time safety)", () => {
			const { mutation } = lens<TestContext>();

			const builder = mutation()
				.args({
					parse: (x: unknown) => x as { id: string },
					safeParse: () => ({ success: true, data: { id: "1" } }),
					_output: { id: "1" },
				})
				.returns({
					parse: (x: unknown) => x as { id: string; name: string },
					safeParse: () => ({ success: true, data: { id: "1", name: "test" } }),
					_output: { id: "1", name: "test" },
				});

			// The runtime method exists (part of base implementation),
			// but TypeScript types hide it without the plugin configured.
			// @ts-expect-error - optimistic should not exist on type without plugin
			const _optimistic = builder.optimistic;

			// Runtime: method exists but should not be called without plugin
			// Type-level: TypeScript prevents this call with compile error
			expect(typeof _optimistic).toBe("function");
		});
	});

	describe("lens() with optimisticPlugin", () => {
		it("should include plugins in result", () => {
			const plugins = [mockOptimisticPlugin()] as const;
			const result = lens<TestContext>({ plugins });

			expect(result.plugins).toBeDefined();
			expect(result.plugins.length).toBe(1);
			expect(result.plugins[0].name).toBe("optimistic");
		});

		it("should create mutation factory with extended types", () => {
			const plugins = [mockOptimisticPlugin()] as const;
			const { mutation } = lens<TestContext>({ plugins });

			// Type assertion - mutation should return extended builder
			type MutationType = typeof mutation;
			type Returns = ReturnType<MutationType>;
			type IsExtended = Returns extends MutationBuilderWithExtensions<TestContext, typeof plugins> ? true : false;

			const check: IsExtended = true;
			expect(check).toBe(true);
		});
	});
});

// =============================================================================
// @ts-expect-error Verification Tests
// =============================================================================

describe("TypeScript Error Verification", () => {
	it("should cause type error when calling optimistic without plugin", () => {
		const { mutation } = lens<TestContext>();

		// This chain should work fine
		const builder = mutation().args({
			parse: (x: unknown) => x as { id: string; name: string },
			safeParse: () => ({ success: true, data: { id: "1", name: "test" } }),
			_output: { id: "1", name: "test" },
		});

		// Verify builder works
		expect(builder).toBeDefined();

		// Type-level protection: TypeScript shows error for .optimistic access
		// The @ts-expect-error verifies that TypeScript correctly rejects this
		// @ts-expect-error - Property 'optimistic' does not exist on type
		const _shouldError = builder.optimistic;

		// Runtime: method exists but types prevent access
		// This test verifies COMPILE-TIME safety, not runtime removal
		expect(typeof _shouldError).toBe("function");
	});

	it("should allow optimistic call with plugin (type only)", () => {
		const plugins = [mockOptimisticPlugin()] as const;

		// Type-level verification that the lens result has the right shape
		type Result = LensWithPlugins<TestContext, typeof plugins>;
		type MutationBuilder = ReturnType<Result["mutation"]>;
		type InputBuilder = ReturnType<MutationBuilder["input"]>;

		// InputBuilder should have returns method
		type HasReturns = "returns" extends keyof InputBuilder ? true : false;
		const hasReturns: HasReturns = true;
		expect(hasReturns).toBe(true);
	});
});
