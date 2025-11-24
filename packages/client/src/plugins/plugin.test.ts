/**
 * @lens/client - Plugin System Tests
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPluginManager, definePlugin } from "./manager";
import { optimisticPlugin } from "./optimistic";
import { devToolsPlugin } from "./devtools";
import type { PluginContext } from "./types";
import { SubscriptionManager } from "../reactive/subscription-manager";
import { QueryResolver } from "../reactive/query-resolver";

// Mock context factory
function createMockContext(): PluginContext {
	const subscriptions = new SubscriptionManager();
	const resolver = new QueryResolver(subscriptions);

	return {
		subscriptions,
		resolver,
		execute: async () => ({ data: {} }),
	};
}

describe("Plugin System", () => {
	describe("Plugin Manager", () => {
		it("registers plugins", () => {
			const manager = createPluginManager();
			const plugin = definePlugin({
				name: "test-plugin",
				create: () => ({ name: "test-plugin" }),
			});

			manager.register(plugin);

			expect(manager.has("test-plugin")).toBe(true);
			expect(manager.list()).toContain("test-plugin");
		});

		it("prevents duplicate registration", () => {
			const manager = createPluginManager();
			const plugin = definePlugin({
				name: "test-plugin",
				create: () => ({ name: "test-plugin" }),
			});

			manager.register(plugin);
			manager.register(plugin); // Should warn but not throw

			expect(manager.list().filter((n) => n === "test-plugin").length).toBe(1);
		});

		it("checks dependencies", () => {
			const manager = createPluginManager();

			const childPlugin = definePlugin({
				name: "child",
				dependencies: ["parent"],
				create: () => ({ name: "child" }),
			});

			expect(() => manager.register(childPlugin)).toThrow(/requires "parent"/);
		});

		it("allows registration with satisfied dependencies", () => {
			const manager = createPluginManager();

			const parentPlugin = definePlugin({
				name: "parent",
				create: () => ({ name: "parent" }),
			});

			const childPlugin = definePlugin({
				name: "child",
				dependencies: ["parent"],
				create: () => ({ name: "child" }),
			});

			manager.register(parentPlugin);
			manager.register(childPlugin);

			expect(manager.has("child")).toBe(true);
		});

		it("initializes plugins", async () => {
			const manager = createPluginManager();
			let initialized = false;

			const plugin = definePlugin({
				name: "test-plugin",
				create: () => ({
					name: "test-plugin",
					onInit: () => {
						initialized = true;
					},
				}),
			});

			manager.register(plugin);
			await manager.init(createMockContext());

			expect(initialized).toBe(true);
		});

		it("exposes plugin API", async () => {
			const manager = createPluginManager();

			const plugin = definePlugin({
				name: "test-plugin",
				create: () => ({
					name: "test-plugin",
					api: {
						getValue: () => 42,
					},
				}),
			});

			manager.register(plugin);
			await manager.init(createMockContext());

			const api = manager.get<{ getValue: () => number }>("test-plugin");
			expect(api?.getValue()).toBe(42);
		});

		it("calls hooks on all plugins", async () => {
			const manager = createPluginManager();
			const calls: string[] = [];

			const plugin1 = definePlugin({
				name: "plugin-1",
				create: () => ({
					name: "plugin-1",
					onConnect: () => calls.push("plugin-1"),
				}),
			});

			const plugin2 = definePlugin({
				name: "plugin-2",
				create: () => ({
					name: "plugin-2",
					onConnect: () => calls.push("plugin-2"),
				}),
			});

			manager.register(plugin1);
			manager.register(plugin2);
			await manager.init(createMockContext());

			manager.callHook("onConnect", createMockContext());

			expect(calls).toContain("plugin-1");
			expect(calls).toContain("plugin-2");
		});

		it("destroys plugins", async () => {
			const manager = createPluginManager();
			let destroyed = false;

			const plugin = definePlugin({
				name: "test-plugin",
				create: () => ({
					name: "test-plugin",
					destroy: () => {
						destroyed = true;
					},
				}),
			});

			manager.register(plugin);
			await manager.init(createMockContext());

			manager.destroy();

			expect(destroyed).toBe(true);
		});
	});

	describe("definePlugin Helper", () => {
		it("creates plugin definition", () => {
			const plugin = definePlugin({
				name: "my-plugin",
				version: "1.0.0",
				defaultConfig: { enabled: true },
				create: (config) => ({
					name: "my-plugin",
					api: { isEnabled: () => config?.enabled },
				}),
			});

			expect(plugin.name).toBe("my-plugin");
			expect(plugin.version).toBe("1.0.0");
			expect(plugin.defaultConfig).toEqual({ enabled: true });
		});

		it("merges config with defaults", async () => {
			const manager = createPluginManager();

			const plugin = definePlugin<{ a: number; b: number }>({
				name: "config-plugin",
				defaultConfig: { a: 1, b: 2 },
				create: (config) => ({
					name: "config-plugin",
					api: { getConfig: () => config },
				}),
			});

			manager.register(plugin, { a: 10 }); // Override only 'a'
			await manager.init(createMockContext());

			const api = manager.get<{ getConfig: () => { a: number; b: number } }>("config-plugin");
			expect(api?.getConfig()).toEqual({ a: 10, b: 2 });
		});
	});

	describe("Optimistic Plugin", () => {
		it("creates with default config", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ isEnabled: () => boolean }>("optimistic");
			expect(api?.isEnabled()).toBe(true);
		});

		it("can be disabled", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin, { enabled: false });
			await manager.init(createMockContext());

			const api = manager.get<{ isEnabled: () => boolean }>("optimistic");
			expect(api?.isEnabled()).toBe(false);
		});

		it("exposes getPending API", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ getPending: () => unknown[] }>("optimistic");
			expect(api?.getPending()).toEqual([]);
		});

		it("exposes getPendingCount API", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ getPendingCount: () => number }>("optimistic");
			expect(api?.getPendingCount()).toBe(0);
		});
	});

	describe("DevTools Plugin", () => {
		it("creates with default config", async () => {
			const manager = createPluginManager();
			manager.register(devToolsPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ isEnabled: () => boolean }>("devtools");
			// Enabled in test environment (not production)
			expect(api?.isEnabled()).toBe(true);
		});

		it("exposes getLogs API", async () => {
			const manager = createPluginManager();
			manager.register(devToolsPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ getLogs: () => unknown[] }>("devtools");
			expect(api?.getLogs()).toEqual([]);
		});

		it("exposes getStats API", async () => {
			const manager = createPluginManager();
			manager.register(devToolsPlugin);
			await manager.init(createMockContext());

			const api = manager.get<{ getStats: () => object }>("devtools");
			expect(api?.getStats()).toEqual({
				queries: 0,
				mutations: 0,
				subscriptions: 0,
				errors: 0,
			});
		});

		it("tracks stats on hooks", async () => {
			const manager = createPluginManager();
			manager.register(devToolsPlugin);
			const ctx = createMockContext();
			await manager.init(ctx);

			// Simulate mutation hooks
			manager.callHook("onBeforeMutation", ctx, "User", "create", { name: "Test" });
			manager.callHook("onAfterMutation", ctx, "User", "create", { data: {} }, {});

			const api = manager.get<{ getStats: () => { mutations: number } }>("devtools");
			expect(api?.getStats().mutations).toBe(1);
		});

		it("can clear logs", async () => {
			const manager = createPluginManager();
			manager.register(devToolsPlugin);
			const ctx = createMockContext();
			await manager.init(ctx);

			// Add some logs
			manager.callHook("onConnect", ctx);

			const api = manager.get<{ getLogs: () => unknown[]; clear: () => void }>("devtools");
			expect(api?.getLogs().length).toBeGreaterThan(0);

			api?.clear();
			expect(api?.getLogs().length).toBe(0);
		});
	});
});
