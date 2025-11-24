/**
 * @lens/client - Plugins
 *
 * Plug-and-play feature system for Lens client.
 * Uses UnifiedPlugin from @lens/core.
 *
 * @example
 * ```typescript
 * import { createReactiveClient } from "@lens/client";
 * import { optimisticPlugin } from "@lens/client/plugins";
 * import { devToolsPlugin, cachePlugin } from "@lens/core";
 *
 * const client = createReactiveClient({
 *   links: [httpLink({ url: "/api" })],
 *   plugins: [
 *     optimisticPlugin({ timeout: 30000 }),
 *     devToolsPlugin({ logLevel: "debug" }),
 *   ],
 * });
 * ```
 */

// Re-export from @lens/core (canonical source)
export {
	defineUnifiedPlugin,
	isConfiguredPlugin,
	type UnifiedPlugin,
	type CallableUnifiedPlugin,
	type ConfiguredPlugin,
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
} from "@lens/core";

// Client plugin manager
export { createPluginManager, type PluginManager, type PluginInput } from "./manager";

// Client-only plugins
export { optimisticPlugin, type OptimisticPluginAPI } from "./optimistic";

// Config types (for client-specific plugins)
export type { OptimisticPluginConfig, ExtendedPluginContext } from "./types";
