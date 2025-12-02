/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 *
 * Architecture:
 * - Server = Executor with optional plugin support
 *   - Stateless (default): Pure executor, sends full data
 *   - Stateful (with diffOptimizer): Tracks state, sends diffs
 * - Adapters = Pure protocol handlers (HTTP, WebSocket, SSE)
 *   - No business logic - just translate protocol to server calls
 * - Plugins = Server-level middleware (diffOptimizer, auth, logger)
 *   - Configured at server level, not adapter level
 *
 * @example
 * ```typescript
 * // Stateless mode (default)
 * const server = createServer({ router });
 * const wsAdapter = createWSAdapter(server);
 *
 * // Stateful mode (with diffOptimizer plugin)
 * const server = createServer({
 *   router,
 *   plugins: [diffOptimizer()],
 * });
 * const wsAdapter = createWSAdapter(server); // Now sends diffs
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
	// Deprecated aliases
	createHTTPAdapter,
	// HTTP Handler
	createHTTPHandler,
	createSSEAdapter,
	// SSE Handler
	createSSEHandler,
	createWSAdapter,
	// WebSocket Handler
	createWSHandler,
	type HTTPAdapter,
	type HTTPAdapterOptions,
	type HTTPHandler,
	type HTTPHandlerOptions,
	type SSEAdapterOptions,
	type SSEHandlerOptions,
	type WSAdapter,
	type WSAdapterOptions,
	type WSHandler,
	type WSHandlerOptions,
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
	type DiffOptimizerOptions,
	type DisconnectContext,
	// Diff Optimizer Plugin
	diffOptimizer,
	type EnhanceOperationMetaContext,
	isDiffOptimizerPlugin,
	// Optimistic Plugin
	isOptimisticPlugin,
	type OptimisticPluginOptions,
	optimisticPlugin,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "./plugin/index.js";

// =============================================================================
// SSE Handler (additional exports not in adapters/index.js)
// =============================================================================

export {
	type SSEClientInfo,
	// Class
	SSEHandler,
	// Types
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
