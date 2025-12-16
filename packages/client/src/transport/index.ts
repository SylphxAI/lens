/**
 * @sylphx/lens-client - Transport System
 *
 * Pluggable transport layer for client-server communication.
 *
 * ## Transport Types
 *
 * ### Atomic Transports (for composition)
 * - `http()` - HTTP POST for query/mutation
 * - `sse()` - SSE for subscriptions only
 * - `ws()` - WebSocket for all operations
 *
 * ### Bundled Transports (convenience)
 * - `httpSse()` - HTTP + SSE combined (query/mutation via HTTP, subscriptions via SSE)
 *
 * ### Composition
 * - `routeByType()` - Route different operation types to different transports
 * - `route()` - Route by path pattern
 *
 * @example
 * ```typescript
 * // Option 1: Use bundled transport (simple)
 * const client = createClient({
 *   transport: httpSse({ url: '/api' }),
 * })
 *
 * // Option 2: Compose transports (flexible)
 * const client = createClient({
 *   transport: routeByType({
 *     default: http({ url: '/api' }),
 *     subscription: sse({ url: '/api/events' }),
 *   }),
 * })
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Connection state
	ConnectionState,
	// Transport capability interfaces
	FullTransport,
	// Server interface (for in-process transport)
	LensServerInterface,
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

// Direct (formerly In-Process)
export {
	type DirectTransportOptions,
	direct,
	// Legacy aliases (deprecated)
	type InProcessTransportOptions,
	inProcess,
} from "./direct.js";

// HTTP (atomic - query/mutation with polling fallback)
export { type HttpServerTransportOptions, type HttpTransportOptions, http } from "./http.js";
// HTTP + SSE (bundled - recommended for most use cases)
export {
	type HttpSseTransportInstance,
	type HttpSseTransportOptions,
	httpSse,
	// Deprecated type aliases (for backward compatibility)
	/** @deprecated Use `ConnectionState` from types instead */
	type SseConnectionState,
} from "./http-sse.js";
// Route (composition helpers)
export {
	type RouteByTypeConfig,
	type RouteConfig,
	route,
	// Legacy
	routeByPath,
	routeByType,
	type TypeSafeRouteByTypeConfig,
} from "./route.js";
// SSE (atomic - subscriptions only, for composition)
export { type SseTransportInstance, type SseTransportOptions, sse } from "./sse.js";

// WebSocket (can handle all operations)
export { type WsTransportInstance, type WsTransportOptions, ws } from "./ws.js";
