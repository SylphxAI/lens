/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 *
 * Architecture:
 * - Server = Pure executor (getMetadata, execute)
 * - Adapters = Protocol handlers (HTTP, WebSocket, SSE)
 * - State = Per-connection tracking (GraphStateManager)
 * - Plugins = Lifecycle hooks (diffOptimizer, logger)
 */

// =============================================================================
// Re-exports from Core (commonly used with server)
// =============================================================================

export {
	type InferRouterContext,
	type MutationDef,
	mutation,
	// Types
	type QueryDef,
	// Operations
	query,
	type ResolverContext,
	type ResolverFn,
	type RouterDef,
	type RouterRoutes,
	router,
} from "@sylphx/lens-core";

// =============================================================================
// Server (Pure Executor)
// =============================================================================

export {
	// Factory
	createServer,
	// Subscription transports (legacy - use adapters instead)
	directTransport,
	type EntitiesMap,
	// Type inference utilities (tRPC-style)
	type InferApi,
	type InferInput,
	type InferOutput,
	// In-process transport types
	type LensOperation,
	type LensResult,
	// Types
	type LensServer,
	type LensServerConfig as ServerConfig,
	type MutationsMap,
	type OperationMeta,
	type OperationsMap,
	type QueriesMap,
	type SelectionObject,
	// Metadata types (for transport handshake)
	type ServerMetadata,
	type SubscriptionTransport,
	type WebSocketLike,
} from "./server/create.js";

// =============================================================================
// Protocol Adapters
// =============================================================================

export {
	// HTTP Adapter
	createHTTPAdapter,
	type HTTPAdapter,
	type HTTPAdapterOptions,
	// WebSocket Adapter
	createWSAdapter,
	type WSAdapter,
	type WSAdapterOptions,
	// SSE Adapter (alias)
	createSSEAdapter,
	type SSEAdapterOptions,
} from "./adapters/index.js";

// =============================================================================
// State Management
// =============================================================================

export {
	// Factory
	createGraphStateManager,
	// Types
	type EntityKey,
	// Class
	GraphStateManager,
	type GraphStateManagerConfig,
	type StateClient,
	type StateFullMessage,
	type StateUpdateMessage,
	type Subscription,
} from "./state/index.js";

// =============================================================================
// Plugin System
// =============================================================================

export {
	// Context types
	type AfterMutationContext,
	type AfterSendContext,
	type BeforeMutationContext,
	type BeforeSendContext,
	type ConnectContext,
	// Plugin manager
	createPluginManager,
	// Diff Optimizer Plugin
	diffOptimizer,
	type DiffOptimizerOptions,
	type DisconnectContext,
	isDiffOptimizerPlugin,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "./plugin/index.js";

// =============================================================================
// SSE Handler (Legacy - prefer createSSEAdapter)
// =============================================================================

export {
	// Factory
	createSSEHandler,
	type SSEClientInfo,
	// Class
	SSEHandler,
	// Types
	type SSEHandlerConfig,
} from "./sse/handler.js";

// =============================================================================
// Subscription Transports (for third-party services)
// =============================================================================

export {
	// Pusher transport
	createPusherSubscription,
	pusher,
	type PusherLike,
	type PusherTransportOptions,
} from "./transport/index.js";
