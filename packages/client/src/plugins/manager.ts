/**
 * @lens/client - Plugin Manager
 *
 * Manages plugin registration, lifecycle, and hook execution.
 */

import type {
	Plugin,
	PluginInstance,
	PluginContext,
	PluginManager,
	PluginHooks,
} from "./types";

// =============================================================================
// Plugin Manager Implementation
// =============================================================================

/**
 * Create a plugin manager
 */
export function createPluginManager(): PluginManager {
	const plugins = new Map<string, PluginInstance>();
	const pendingPlugins: Array<{ plugin: Plugin<unknown>; config: unknown }> = [];
	let initialized = false;
	let context: PluginContext | null = null;

	return {
		/**
		 * Register a plugin
		 */
		register<T>(plugin: Plugin<T>, config?: T): void {
			if (plugins.has(plugin.name) || pendingPlugins.some((p) => p.plugin.name === plugin.name)) {
				console.warn(`Plugin "${plugin.name}" is already registered`);
				return;
			}

			// Check dependencies
			if (plugin.dependencies) {
				for (const dep of plugin.dependencies) {
					if (!plugins.has(dep) && !pendingPlugins.some((p) => p.plugin.name === dep)) {
						throw new Error(
							`Plugin "${plugin.name}" requires "${dep}" but it's not registered`,
						);
					}
				}
			}

			// Merge config with defaults
			const mergedConfig = {
				...plugin.defaultConfig,
				...config,
			} as T;

			// Create instance
			const instance = plugin.create(mergedConfig);

			if (initialized && context) {
				// Initialize immediately if manager is already initialized
				instance.onInit?.(context);
				plugins.set(plugin.name, instance);
			} else {
				// Queue for later initialization
				pendingPlugins.push({ plugin: plugin as Plugin<unknown>, config: mergedConfig });
			}
		},

		/**
		 * Get plugin API
		 */
		get<T = unknown>(name: string): T | undefined {
			const instance = plugins.get(name);
			return instance?.api as T | undefined;
		},

		/**
		 * Check if plugin is registered
		 */
		has(name: string): boolean {
			return plugins.has(name) || pendingPlugins.some((p) => p.plugin.name === name);
		},

		/**
		 * List all registered plugins
		 */
		list(): string[] {
			return [
				...Array.from(plugins.keys()),
				...pendingPlugins.map((p) => p.plugin.name),
			];
		},

		/**
		 * Initialize all plugins
		 */
		async init(ctx: PluginContext): Promise<void> {
			if (initialized) return;

			context = ctx;
			initialized = true;

			// Initialize pending plugins in order
			for (const { plugin, config } of pendingPlugins) {
				const instance = plugin.create(config);
				await instance.onInit?.(ctx);
				plugins.set(plugin.name, instance);
			}

			pendingPlugins.length = 0;
		},

		/**
		 * Destroy all plugins
		 */
		destroy(): void {
			for (const instance of plugins.values()) {
				instance.destroy?.();
				if (context) {
					instance.onDestroy?.(context);
				}
			}
			plugins.clear();
			initialized = false;
			context = null;
		},

		/**
		 * Call hook on all plugins
		 */
		callHook<K extends keyof PluginHooks>(
			hook: K,
			...args: Parameters<NonNullable<PluginHooks[K]>>
		): void {
			for (const instance of plugins.values()) {
				const hookFn = instance[hook] as ((...a: unknown[]) => void) | undefined;
				if (hookFn) {
					try {
						hookFn(...args);
					} catch (error) {
						console.error(`Plugin "${instance.name}" hook "${hook}" failed:`, error);
					}
				}
			}
		},
	};
}

// =============================================================================
// Helper: Define Plugin
// =============================================================================

/**
 * Helper to define a plugin with type safety
 *
 * @example
 * ```typescript
 * const myPlugin = definePlugin({
 *   name: "my-plugin",
 *   defaultConfig: { enabled: true },
 *   create: (config) => ({
 *     name: "my-plugin",
 *     onInit: (ctx) => console.log("Initialized!"),
 *     api: {
 *       doSomething: () => console.log("Did something!"),
 *     },
 *   }),
 * });
 * ```
 */
export function definePlugin<TConfig = void>(
	plugin: Plugin<TConfig>,
): Plugin<TConfig> {
	return plugin;
}
