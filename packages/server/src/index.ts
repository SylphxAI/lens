/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 *
 * Architecture:
 * - App = Executor with optional plugin support
 *   - Stateless (default): Pure executor
 *   - Stateful (with clientState): Tracks per-client state
 * - Handlers = Pure protocol handlers (HTTP, WebSocket, SSE)
 *   - No business logic - just translate protocol to app calls
 * - Plugins = App-level middleware (clientState, auth, logger)
 *   - Configured at app level, not handler level
 *
 * @example
 * ```typescript
 * // Stateless mode (default)
 * const app = createApp({ router });
 * const wsHandler = createWSHandler(app);
 *
 * // Stateful mode (with clientState plugin)
 * const app = createApp({
 *   router,
 *   plugins: [clientState()],
 * });
 * const wsHandler = createWSHandler(app); // Tracks per-client state
 * ```
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
// Context System (Server-side implementation)
// =============================================================================

export {
	createContext,
	extendContext,
	hasContext,
	runWithContext,
	runWithContextAsync,
	tryUseContext,
	useContext,
} from "./context/index.js";

// =============================================================================
// Server (Pure Executor)
// =============================================================================

export {
	// Types
	type ClientSendFn,
	// Factory
	createApp,
	/** @deprecated Use `createApp` instead */
	createServer,
	type EntitiesMap,
	type InferApi,
	type InferInput,
	type InferOutput,
	type LensOperation,
	type LensResult,
	type LensServer,
	type LensServerConfig as ServerConfig,
	type MutationsMap,
	type OperationMeta,
	type OperationsMap,
	type QueriesMap,
	type SelectionObject,
	type ServerMetadata,
	type WebSocketLike,
} from "./server/create.js";

// =============================================================================
// Protocol Handlers
// =============================================================================

export {
	// Framework Handler Utilities
	createFrameworkHandler,
	// Unified Handler (HTTP + SSE)
	createHandler,
	// Deprecated aliases
	createHTTPAdapter,
	// HTTP Handler
	createHTTPHandler,
	createServerClientProxy,
	createSSEAdapter,
	// SSE Handler
	createSSEHandler,
	createWSAdapter,
	// WebSocket Handler
	createWSHandler,
	type FrameworkHandlerOptions,
	type Handler,
	type HandlerOptions,
	type HTTPAdapter,
	type HTTPAdapterOptions,
	type HTTPHandler,
	type HTTPHandlerOptions,
	handleWebMutation,
	handleWebQuery,
	handleWebSSE,
	type SSEAdapterOptions,
	type SSEHandlerOptions,
	type WSAdapter,
	type WSAdapterOptions,
	type WSHandler,
	type WSHandlerOptions,
} from "./handlers/index.js";

// =============================================================================
// State Management
// =============================================================================

// GraphStateManager is internal to clientState plugin - not exported
// Use clientState() plugin for per-client state tracking

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
	type DisconnectContext,
	type EnhanceOperationMetaContext,
	// Optimistic Plugin
	isOptimisticPlugin,
	type OptimisticPluginOptions,
	optimisticPlugin,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	// Client State Plugin
	type ClientStateOptions,
	clientState,
	isClientStatePlugin,
	type SubscribeContext,
	type UnsubscribeContext,
	// Deprecated aliases (backwards compatibility)
	type StateSyncOptions,
	stateSync,
	isStateSyncPlugin,
	type DiffOptimizerOptions,
	diffOptimizer,
	isDiffOptimizerPlugin,
} from "./plugin/index.js";

// =============================================================================
// SSE Handler (additional exports not in handlers/index.js)
// =============================================================================

export {
	// Types
	type SSEClient,
	// Class
	SSEHandler,
	type SSEHandlerConfig,
} from "./sse/handler.js";

// =============================================================================
// Subscription Helpers (for third-party services)
// =============================================================================

export {
	createPusherSubscription,
	type PusherLike,
	type PusherTransportOptions,
} from "./transport/index.js";

// =============================================================================
// Reconnection (Server-side)
// =============================================================================

export { coalescePatches, estimatePatchSize, OperationLog } from "./reconnect/index.js";
