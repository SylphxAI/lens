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
	type TypedClientConfig,
} from "./client/create.js";

// =============================================================================
// Transport
// =============================================================================

export {
	// Direct transport (primary)
	type DirectTransportOptions,
	direct,
	// Transport capability interfaces
	type FullTransport,
	type HttpServerTransportOptions,
	// HTTP + SSE bundled transport
	type HttpSseTransportInstance,
	type HttpSseTransportOptions,
	type HttpTransportOptions,
	// Transports
	http,
	httpSse,
	// Type guards
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
	// Route
	routeByType,
	type SseTransportInstance,
	type SseTransportOptions,
	type SubscriptionCapable,
	type SubscriptionOnlyTransport,
	// SSE (atomic - subscriptions only)
	sse,
	// Types
	type TransportBase,
	type TypeSafeRouteByTypeConfig,
	type Unsubscribable,
	type WsTransportInstance,
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
