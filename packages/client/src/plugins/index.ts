/**
 * @lens/client - Plugins
 *
 * Plug-and-play feature system for Lens client.
 *
 * @example
 * ```typescript
 * import { createReactiveClient } from "@lens/client";
 * import {
 *   optimisticPlugin,
 *   devToolsPlugin,
 * } from "@lens/client/plugins";
 *
 * const client = createReactiveClient({
 *   links: [httpLink({ url: "/api" })],
 *   plugins: [
 *     optimisticPlugin({ timeout: 30000 }),
 *     devToolsPlugin({ logLevel: "debug" }),
 *   ],
 * });
 *
 * // Access plugin APIs
 * client.$plugins.optimistic.getPending();
 * client.$plugins.devtools.getLogs();
 * ```
 */

// Core
export { createPluginManager, definePlugin } from "./manager";
export type {
	Plugin,
	PluginInstance,
	PluginContext,
	PluginHooks,
	PluginManager,
	OptimisticPluginConfig,
	OfflinePluginConfig,
	DevToolsPluginConfig,
	CachePluginConfig,
	RetryPluginConfig,
} from "./types";

// Built-in plugins
export { optimisticPlugin, type OptimisticPluginAPI } from "./optimistic";
export { devToolsPlugin, type DevToolsPluginAPI } from "./devtools";
