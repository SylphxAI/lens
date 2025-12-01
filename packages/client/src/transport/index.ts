/**
 * @sylphx/lens-client - Transport System
 *
 * Pluggable transport layer for client-server communication.
 */

// =============================================================================
// Types
// =============================================================================

export type {
	Metadata,
	// Observable types
	Observable,
	Observer,
	Operation,
	OperationMeta,
	OperationsMap,
	OptimisticDSL,
	Result,
	// Core types
	Transport,
	Unsubscribable,
} from "./types.js";

// Type guard functions (re-exported from core)
export { isOptimisticDSL } from "./types.js";

// =============================================================================
// Plugins
// =============================================================================

export {
	type AuthPluginOptions,
	auth,
	type CachePluginOptions,
	cache,
	type LoggerPluginOptions,
	// Built-in plugins
	logger,
	// Plugin interface
	type Plugin,
	type RetryPluginOptions,
	retry,
	type TimeoutPluginOptions,
	timeout,
} from "./plugin.js";

// =============================================================================
// Transports
// =============================================================================

// HTTP
export { type HttpServerTransportOptions, type HttpTransportOptions, http } from "./http.js";
// In-Process
export {
	type InProcessTransportOptions,
	inProcess,
	type LensServerInterface,
} from "./in-process.js";
// Route
export {
	type RouteByTypeConfig,
	type RouteConfig,
	route,
	// Legacy
	routeByPath,
	routeByType,
} from "./route.js";
// WebSocket
export { type WsTransportOptions, ws } from "./ws.js";
