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
	// Types
	type LensClientConfig,
	type LensClient,
	type QueryResult,
	type MutationResult,
	type SelectionObject,
	type SelectedType,
	type RouterApiShape,
	type RouterLensClient,
	type InferRouterClientType,
	type QueriesMap,
	type MutationsMap,
	type InferInput,
	type InferOutput,
} from "./client/create";

// =============================================================================
// Transport
// =============================================================================

export {
	// Types
	type Transport,
	type Operation,
	type Result,
	type Metadata,
	type OperationMeta,
	type OptimisticDSL,
	type Observable,
	type Observer,
	type Unsubscribable,
	type RouteCondition,
	type RouteEntry,
	// Transports
	http,
	type HttpTransportOptions,
	type HttpServerTransportOptions,
	ws,
	type WsTransportOptions,
	type WsServerTransportOptions,
	inProcess,
	type InProcessTransportOptions,
	type LensServerInterface,
	// Route
	route,
	routeByType,
	type RouteByTypeConfig,
	routeByPath,
	type RouteByPathConfig,
} from "./transport";

// =============================================================================
// Plugins
// =============================================================================

export {
	// Types
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
} from "./transport";

// =============================================================================
// Signals
// =============================================================================

export {
	// Types
	type Signal,
	type WritableSignal,
	type Subscriber,
	type Unsubscribe,
	// Functions
	signal,
	computed,
	effect,
	batch,
	isSignal,
	toPromise,
	derive,
} from "./signals/signal";

// =============================================================================
// Store
// =============================================================================

export {
	ReactiveStore,
	createStore,
	type EntityKey,
	type EntityState,
	type OptimisticEntry as StoreOptimisticEntry,
	type StoreConfig,
} from "./store/reactive-store";
