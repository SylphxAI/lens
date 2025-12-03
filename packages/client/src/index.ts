/**
 * @sylphx/lens-client
 *
 * Reactive client for Lens API framework.
 * Transport + Plugin architecture for clean, extensible design.
 */

// =============================================================================
// Client
// =============================================================================

export {
	// Factory
	createClient,
	type InferInput,
	type InferOutput,
	type InferRouterClientType,
	type LensClient,
	// Types
	type LensClientConfig,
	type MutationResult,
	type MutationsMap,
	type QueriesMap,
	type QueryResult,
	type RouterApiShape,
	type RouterLensClient,
	type SelectedType,
	type SelectionObject,
} from "./client/create.js";

// =============================================================================
// Transport
// =============================================================================

export {
	// Transport capability interfaces
	type FullTransport,
	type HttpServerTransportOptions,
	type HttpTransportOptions,
	// Transports
	http,
	type InProcessTransportOptions,
	inProcess,
	// Type guards
	isLegacyTransport,
	isMutationCapable,
	isOptimisticDSL,
	isQueryCapable,
	isSubscriptionCapable,
	type LensServerInterface,
	type Metadata,
	type MutationCapable,
	type Observable,
	type Observer,
	type Operation,
	type OperationMeta,
	type OperationsMap,
	type OptimisticDSL,
	type QueryCapable,
	type RequestTransport,
	type Result,
	type RouteByTypeConfig,
	type RouteConfig,
	// Route
	route,
	routeByPath,
	routeByType,
	type SseConnectionState,
	type SseTransportInstance,
	type SseTransportOptions,
	type SubscriptionCapable,
	type SubscriptionOnlyTransport,
	// SSE
	sse,
	// Types
	type Transport,
	type TransportBase,
	type TypeSafeRouteByTypeConfig,
	type Unsubscribable,
	type WsTransportOptions,
	ws,
} from "./transport/index.js";

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
	// Types
	type Plugin,
	type RetryPluginOptions,
	retry,
	type TimeoutPluginOptions,
	timeout,
} from "./transport/index.js";

// =============================================================================
// Reconnection
// =============================================================================

export {
	createSubscriptionRegistry,
	SubscriptionRegistry,
} from "./reconnect/index.js";
