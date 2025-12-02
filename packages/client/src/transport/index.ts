/**
 * @sylphx/lens-client - Transport System
 *
 * Pluggable transport layer for client-server communication.
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Transport capability interfaces
	FullTransport,
	Metadata,
	MutationCapable,
	// Observable types
	Observable,
	Observer,
	Operation,
	OperationMeta,
	OperationsMap,
	OptimisticDSL,
	QueryCapable,
	RequestTransport,
	Result,
	SubscriptionCapable,
	SubscriptionOnlyTransport,
	// Core types
	Transport,
	TransportBase,
	Unsubscribable,
} from "./types.js";

// Type guard functions
export {
	isLegacyTransport,
	isMutationCapable,
	// Re-exported from core
	isOptimisticDSL,
	isQueryCapable,
	isSubscriptionCapable,
} from "./types.js";

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
	type TypeSafeRouteByTypeConfig,
} from "./route.js";
// SSE (Server-Sent Events)
export {
	type SseConnectionState,
	type SseTransportInstance,
	type SseTransportOptions,
	sse,
} from "./sse.js";
// WebSocket
export {
	type ConnectionState,
	type WsTransportInstance,
	type WsTransportOptions,
	ws,
} from "./ws.js";
