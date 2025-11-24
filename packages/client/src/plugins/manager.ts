/**
 * @lens/client - Plugin Manager
 *
 * Manages plugin registration, lifecycle, and hook execution.
 * Uses UnifiedPlugin types from @lens/core.
 */

import type {
	UnifiedPlugin,
	ClientPluginHooks,
	ClientPluginInstance,
	ClientPluginContext,
	ConfiguredPlugin,
	CallableUnifiedPlugin,
} from "@lens/core";
import { isConfiguredPlugin } from "@lens/core";

// =============================================================================
// Types
// =============================================================================

/** Plugin input - can be a UnifiedPlugin or a ConfiguredPlugin */
export type PluginInput<TConfig = unknown> =
	| UnifiedPlugin<TConfig>
	| CallableUnifiedPlugin<TConfig>
	| ConfiguredPlugin<TConfig>;

/** Plugin manager interface */
export interface PluginManager {
	/** Register a plugin */
	register<T>(plugin: PluginInput<T>, config?: T): void;
	/** Get plugin API */
	get<T = unknown>(name: string): T | undefined;
	/** Check if plugin is registered */
	has(name: string): boolean;
	/** List all registered plugins */
	list(): string[];
	/** Initialize all plugins */
	init(ctx: ClientPluginContext): Promise<void>;
	/** Destroy all plugins */
	destroy(): void;
	/** Call hook on all plugins */
	callHook<K extends keyof ClientPluginHooks>(
		hook: K,
		...args: Parameters<NonNullable<ClientPluginHooks[K]>>
	): void;
}

// =============================================================================
// Plugin Manager Implementation
// =============================================================================

interface PendingPlugin {
	plugin: UnifiedPlugin<unknown>;
	config: unknown;
}

/**
 * Create a plugin manager for client plugins
 */
export function createPluginManager(): PluginManager {
	const plugins = new Map<string, ClientPluginInstance>();
	const pendingPlugins: PendingPlugin[] = [];
	let initialized = false;
	let context: ClientPluginContext | null = null;

	return {
		/**
		 * Register a plugin
		 */
		register<T>(input: PluginInput<T>, config?: T): void {
			// Extract plugin and config from input
			let plugin: UnifiedPlugin<T>;
			let finalConfig: T | undefined;

			if (isConfiguredPlugin(input)) {
				// ConfiguredPlugin - already has config
				plugin = input.__plugin as UnifiedPlugin<T>;
				finalConfig = input.__config as T;
			} else {
				// UnifiedPlugin or CallableUnifiedPlugin
				plugin = input as UnifiedPlugin<T>;
				finalConfig = config;
			}

			if (plugins.has(plugin.name) || pendingPlugins.some((p) => p.plugin.name === plugin.name)) {
				console.warn(`Plugin "${plugin.name}" is already registered`);
				return;
			}

			// Check if plugin has client part
			if (!plugin.client) {
				console.warn(`Plugin "${plugin.name}" has no client implementation, skipping`);
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
				...finalConfig,
			} as T;

			if (initialized && context) {
				// Initialize immediately if manager is already initialized
				const instance = plugin.client(mergedConfig);
				void instance.onInit?.(context);
				plugins.set(plugin.name, instance);
			} else {
				// Queue for later initialization
				pendingPlugins.push({
					plugin: plugin as UnifiedPlugin<unknown>,
					config: mergedConfig,
				});
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
		async init(ctx: ClientPluginContext): Promise<void> {
			if (initialized) return;

			context = ctx;
			initialized = true;

			// Initialize pending plugins in order
			for (const { plugin, config } of pendingPlugins) {
				if (plugin.client) {
					const instance = plugin.client(config);
					await instance.onInit?.(ctx);
					plugins.set(plugin.name, instance);
				}
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
		callHook<K extends keyof ClientPluginHooks>(
			hook: K,
			...args: Parameters<NonNullable<ClientPluginHooks[K]>>
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
