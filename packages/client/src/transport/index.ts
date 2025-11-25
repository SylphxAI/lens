/**
 * @sylphx/lens-client - Transport System
 *
 * Pluggable transport layer for client-server communication.
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Observable types
	Observable,
	Observer,
	Unsubscribable,
	// Core types
	Transport,
	Operation,
	Result,
	Metadata,
	OperationMeta,
	OptimisticDSL,
} from "./types";

// =============================================================================
// Plugins
// =============================================================================

export {
	// Plugin interface
	type Plugin,
	// Built-in plugins
	logger,
	type LoggerPluginOptions,
	auth,
	type AuthPluginOptions,
	retry,
	type RetryPluginOptions,
	cache,
	type CachePluginOptions,
	timeout,
	type TimeoutPluginOptions,
} from "./plugin";

// =============================================================================
// Transports
// =============================================================================

// HTTP
export { http, type HttpTransportOptions, type HttpServerTransportOptions } from "./http";

// WebSocket
export { ws, type WsTransportOptions, type WsServerTransportOptions } from "./ws";

// In-Process
export { inProcess, type InProcessTransportOptions, type LensServerInterface } from "./in-process";

// Route
export {
	route,
	type RouteConfig,
	routeByType,
	type RouteByTypeConfig,
	// Legacy
	routeByPath,
} from "./route";
