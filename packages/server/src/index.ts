/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 * Operations-based server with GraphStateManager for reactive updates.
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
// Server
// =============================================================================

export {
	// Factory
	createServer,
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
	type WebSocketLike,
} from "./server/create.js";

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
// SSE Transport Adapter
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
