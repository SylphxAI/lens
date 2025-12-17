/**
 * @sylphx/lens-core - Lens with Plugins Tests
 *
 * Tests for the lens() factory with plugin configuration.
 */

import { describe, expect, it } from "bun:test";
import type { Lens, LensConfig, LensWithPlugins } from "./lens.js";
import { lens } from "./lens.js";
import type { PluginExtension, RuntimePlugin } from "./plugin/types.js";

// =============================================================================
// Test Context
// =============================================================================

interface TestContext {
	db: { find: (id: string) => unknown };
	user: { id: string; name: string } | null;
}

// =============================================================================
// Mock Plugins for Testing
// =============================================================================

interface MockPluginExtension extends PluginExtension {
	readonly name: "mock";
	readonly MutationBuilderWithReturns: {
		mockMethod(): void;
	};
}

// Mock runtime plugin that satisfies RuntimePlugin interface
function mockPlugin(): RuntimePlugin<MockPluginExtension> {
	return {
		name: "mock",
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("lens() factory", () => {
	describe("without config", () => {
		it("should return Lens type without plugins", () => {
			const result = lens<TestContext>();

			// Type assertion - result should be Lens<TestContext>
			const _typeCheck: Lens<TestContext> = result;

			expect(result).toBeDefined();
			expect(typeof result.query).toBe("function");
			expect(typeof result.mutation).toBe("function");
			expect(typeof result.resolver).toBe("function");
		});

		it("should not have plugins property", () => {
			const result = lens<TestContext>();

			// @ts-expect-error - plugins should not exist on Lens
			expect(result.plugins).toBeUndefined();
		});

		it("should create working query builder", () => {
			const { query } = lens<TestContext>();

			const builder = query();
			expect(builder).toBeDefined();
			expect(typeof builder.args).toBe("function");
			expect(typeof builder.returns).toBe("function");
			expect(typeof builder.resolve).toBe("function");
		});

		it("should create working mutation builder", () => {
			const { mutation } = lens<TestContext>();

			const builder = mutation();
			expect(builder).toBeDefined();
			expect(typeof builder.args).toBe("function");
		});
	});

	describe("with empty config", () => {
		it("should return Lens type when plugins is undefined", () => {
			const result = lens<TestContext>({});

			// Should still work like base Lens
			expect(result).toBeDefined();
			expect(typeof result.query).toBe("function");
			expect(typeof result.mutation).toBe("function");
		});

		it("should return Lens type when plugins array is empty", () => {
			const result = lens<TestContext>({ plugins: [] as const });

			expect(result).toBeDefined();
			expect(typeof result.query).toBe("function");
			expect(typeof result.mutation).toBe("function");
		});
	});

	describe("with plugins config", () => {
		it("should return LensWithPlugins when plugins are provided", () => {
			const plugins = [mockPlugin()] as const;
			const result = lens<TestContext>({ plugins });

			// Type assertion - result should be LensWithPlugins
			const _typeCheck: LensWithPlugins<TestContext, typeof plugins> = result;

			expect(result).toBeDefined();
			expect(typeof result.query).toBe("function");
			expect(typeof result.mutation).toBe("function");
			expect(typeof result.resolver).toBe("function");
		});

		it("should include plugins property", () => {
			const plugins = [mockPlugin()] as const;
			const result = lens<TestContext>({ plugins });

			expect(result.plugins).toBeDefined();
			expect(Array.isArray(result.plugins)).toBe(true);
			expect(result.plugins.length).toBe(1);
			expect(result.plugins[0].name).toBe("mock");
		});

		it("should preserve plugin array", () => {
			const plugin1 = mockPlugin();
			const plugin2 = { name: "other" } as RuntimePlugin;
			const plugins = [plugin1, plugin2] as const;

			const result = lens<TestContext>({ plugins });

			expect(result.plugins).toHaveLength(2);
			expect(result.plugins[0]).toBe(plugin1);
			expect(result.plugins[1]).toBe(plugin2);
		});
	});

	describe("type inference", () => {
		it("should infer context type correctly", () => {
			const { query } = lens<TestContext>();

			// The builders should have the correct context type
			// This is a compile-time check
			const q = query().resolve(({ ctx }) => {
				// ctx should be LensContext<TestContext>
				const _db = ctx.db;
				const _user = ctx.user;
				return { id: "1" };
			});

			expect(q).toBeDefined();
		});

		it("should infer plugin extensions (compile-time)", () => {
			// This test verifies that plugin extensions are properly typed
			// The actual runtime behavior depends on builder implementation

			// With mock plugin
			const plugins = [mockPlugin()] as const;
			type PluginTypes = typeof plugins;
			type Result = LensWithPlugins<TestContext, PluginTypes>;

			// The type should include plugins
			const _check: Result["plugins"] extends RuntimePlugin[] ? true : false = true;
			expect(_check).toBe(true);
		});
	});
});

describe("LensConfig type", () => {
	it("should accept empty object", () => {
		const config: LensConfig = {};
		expect(config).toBeDefined();
	});

	it("should accept plugins array", () => {
		const config: LensConfig<[MockPluginExtension]> = {
			plugins: [mockPlugin()] as [RuntimePlugin<MockPluginExtension>],
		};
		expect(config.plugins).toBeDefined();
	});

	it("should accept readonly plugins array", () => {
		const plugins = [mockPlugin()] as const;
		const config: LensConfig<readonly [RuntimePlugin<MockPluginExtension>]> = {
			plugins,
		};
		expect(config.plugins).toBeDefined();
	});
});

describe("Integration with existing builders", () => {
	it("should work with query().args().returns().resolve() chain", () => {
		const { query } = lens<TestContext>();

		// This should compile and work at runtime
		const getUser = query()
			.args({
				parse: (x: unknown) => x as { id: string },
				safeParse: () => ({ success: true, data: { id: "1" } }),
				_output: { id: "1" },
			})
			.resolve(({ input, ctx }) => {
				return { id: input.id, found: ctx.db !== null };
			});

		expect(getUser).toBeDefined();
		expect(getUser._type).toBe("query");
	});

	it("should work with mutation().args().resolve() chain", () => {
		const { mutation } = lens<TestContext>();

		const createUser = mutation()
			.args({
				parse: (x: unknown) => x as { name: string },
				safeParse: () => ({ success: true, data: { name: "test" } }),
				_output: { name: "test" },
			})
			.resolve(({ input }) => {
				return { id: "new", name: input.name };
			});

		expect(createUser).toBeDefined();
		expect(createUser._type).toBe("mutation");
	});
});
