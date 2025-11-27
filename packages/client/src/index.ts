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
} from "./client/create";

// =============================================================================
// Transport
// =============================================================================

export {
	type HttpServerTransportOptions,
	type HttpTransportOptions,
	// Transports
	http,
	type InProcessTransportOptions,
	inProcess,
	type LensServerInterface,
	type Metadata,
	type Observable,
	type Observer,
	type Operation,
	type OperationMeta,
	type OperationsMap,
	type OptimisticDSL,
	type Result,
	type RouteByTypeConfig,
	type RouteConfig,
	// Route
	route,
	routeByPath,
	routeByType,
	// Types
	type Transport,
	type Unsubscribable,
	type WsServerTransportOptions,
	type WsTransportOptions,
	ws,
} from "./transport";

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
} from "./transport";

// =============================================================================
// Signals
// =============================================================================

export {
	batch,
	computed,
	derive,
	effect,
	isSignal,
	// Types
	type Signal,
	type Subscriber,
	// Functions
	signal,
	toPromise,
	type Unsubscribe,
	type WritableSignal,
} from "./signals/signal";

// =============================================================================
// Store
// =============================================================================

export {
	createStore,
	type EntityKey,
	type EntityState,
	type OptimisticEntry as StoreOptimisticEntry,
	ReactiveStore,
	type StoreConfig,
} from "./store/reactive-store";
