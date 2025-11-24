/**
 * @lens/client - Plugins
 *
 * Plug-and-play feature system for Lens client.
 * Uses UnifiedPlugin from @lens/core for cross-cutting concerns.
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
	type UnifiedPlugin,
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
} from "@lens/core";

// Client-specific plugin manager
export { createPluginManager } from "./manager";
export type { PluginManager } from "./types";

// Client-only plugins (not in core)
export { optimisticPlugin, type OptimisticPluginAPI } from "./optimistic";

// Config types (for client-specific plugins)
export type { OptimisticPluginConfig } from "./types";

// Legacy exports - DEPRECATED, use @lens/core instead
// These will be removed in next major version
export type {
	Plugin,
	PluginInstance,
	PluginContext,
	PluginHooks,
} from "./types";
export { definePlugin } from "./manager";
