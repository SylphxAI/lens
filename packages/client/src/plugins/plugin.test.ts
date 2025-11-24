/**
 * @lens/client - Plugin System Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginManager } from "./manager";
import { optimisticPlugin } from "./optimistic";
import { defineUnifiedPlugin, type ClientPluginContext } from "@lens/core";
import { SubscriptionManager } from "../reactive/subscription-manager";
import { QueryResolver } from "../reactive/query-resolver";

// Mock context factory
function createMockContext(): ClientPluginContext {
	return {
		execute: async () => ({ data: {} }),
	};
}

// Extended context with subscriptions for optimistic plugin
function createExtendedContext() {
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
			const plugin = defineUnifiedPlugin({
				name: "test-plugin",
				client: () => ({ name: "test-plugin" }),
			});

			manager.register(plugin);

			expect(manager.has("test-plugin")).toBe(true);
			expect(manager.list()).toContain("test-plugin");
		});

		it("prevents duplicate registration", () => {
			const manager = createPluginManager();
			const plugin = defineUnifiedPlugin({
				name: "test-plugin",
				client: () => ({ name: "test-plugin" }),
			});

			manager.register(plugin);
			manager.register(plugin); // Should warn but not throw

			expect(manager.list().filter((n) => n === "test-plugin").length).toBe(1);
		});

		it("checks dependencies", () => {
			const manager = createPluginManager();

			const childPlugin = defineUnifiedPlugin({
				name: "child",
				dependencies: ["parent"],
				client: () => ({ name: "child" }),
			});

			expect(() => manager.register(childPlugin)).toThrow(/requires "parent"/);
		});

		it("allows registration with satisfied dependencies", () => {
			const manager = createPluginManager();

			const parentPlugin = defineUnifiedPlugin({
				name: "parent",
				client: () => ({ name: "parent" }),
			});

			const childPlugin = defineUnifiedPlugin({
				name: "child",
				dependencies: ["parent"],
				client: () => ({ name: "child" }),
			});

			manager.register(parentPlugin);
			manager.register(childPlugin);

			expect(manager.has("child")).toBe(true);
		});

		it("initializes plugins", async () => {
			const manager = createPluginManager();
			let initialized = false;

			const plugin = defineUnifiedPlugin({
				name: "test-plugin",
				client: () => ({
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

			const plugin = defineUnifiedPlugin({
				name: "test-plugin",
				client: () => ({
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

			const plugin1 = defineUnifiedPlugin({
				name: "plugin-1",
				client: () => ({
					name: "plugin-1",
					onConnect: () => calls.push("plugin-1"),
				}),
			});

			const plugin2 = defineUnifiedPlugin({
				name: "plugin-2",
				client: () => ({
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

			const plugin = defineUnifiedPlugin({
				name: "test-plugin",
				client: () => ({
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

		it("skips plugins without client implementation", () => {
			const manager = createPluginManager();

			// Server-only plugin (no client part)
			const serverOnlyPlugin = defineUnifiedPlugin({
				name: "server-only",
				server: () => ({ name: "server-only" }),
			});

			manager.register(serverOnlyPlugin);

			// Should not be registered since it has no client implementation
			expect(manager.list()).not.toContain("server-only");
		});
	});

	describe("defineUnifiedPlugin Helper", () => {
		it("creates plugin definition", () => {
			const plugin = defineUnifiedPlugin({
				name: "my-plugin",
				version: "1.0.0",
				defaultConfig: { enabled: true },
				client: (config) => ({
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

			const plugin = defineUnifiedPlugin<{ a: number; b: number }>({
				name: "config-plugin",
				defaultConfig: { a: 1, b: 2 },
				client: (config) => ({
					name: "config-plugin",
					api: { getConfig: () => config },
				}),
			});

			manager.register(plugin, { a: 10 }); // Override only 'a'
			await manager.init(createMockContext());

			const api = manager.get<{ getConfig: () => { a: number; b: number } }>("config-plugin");
			expect(api?.getConfig()).toEqual({ a: 10, b: 2 });
		});

		it("supports callable plugin syntax", async () => {
			const manager = createPluginManager();

			const plugin = defineUnifiedPlugin<{ value: number }>({
				name: "callable-plugin",
				defaultConfig: { value: 0 },
				client: (config) => ({
					name: "callable-plugin",
					api: { getValue: () => config?.value },
				}),
			});

			// Call plugin with config
			manager.register(plugin({ value: 42 }));
			await manager.init(createMockContext());

			const api = manager.get<{ getValue: () => number }>("callable-plugin");
			expect(api?.getValue()).toBe(42);
		});
	});

	describe("Optimistic Plugin", () => {
		it("creates with default config", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createExtendedContext());

			const api = manager.get<{ isEnabled: () => boolean }>("optimistic");
			expect(api?.isEnabled()).toBe(true);
		});

		it("can be disabled", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin, { enabled: false });
			await manager.init(createExtendedContext());

			const api = manager.get<{ isEnabled: () => boolean }>("optimistic");
			expect(api?.isEnabled()).toBe(false);
		});

		it("exposes getPending API", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createExtendedContext());

			const api = manager.get<{ getPending: () => unknown[] }>("optimistic");
			expect(api?.getPending()).toEqual([]);
		});

		it("exposes getPendingCount API", async () => {
			const manager = createPluginManager();
			manager.register(optimisticPlugin);
			await manager.init(createExtendedContext());

			const api = manager.get<{ getPendingCount: () => number }>("optimistic");
			expect(api?.getPendingCount()).toBe(0);
		});
	});

	// Note: DevTools Plugin tests are in @lens/core/plugins/devtools.test.ts
	// since devToolsPlugin is now part of the unified plugin system
});
