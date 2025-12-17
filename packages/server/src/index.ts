/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   router: appRouter,
 *   entities: { User, Post },
 *   resolvers: [userResolver, postResolver],
 *   context: () => ({ db }),
 * })
 *
 * // App is directly callable - works with any runtime
 * Bun.serve({ fetch: app })
 * Deno.serve(app)
 * export default app  // Cloudflare Workers
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
// Streaming Handlers (WebSocket, SSE)
// =============================================================================

export {
	// SSE Handler (for live queries)
	createSSEHandler,
	// WebSocket Handler (for live queries + subscriptions)
	createWSHandler,
	DEFAULT_WS_HANDLER_CONFIG,
	type SSEHandlerOptions,
	type WSHandler,
	type WSHandlerConfig,
	type WSHandlerOptions,
} from "./handlers/index.js";

// =============================================================================
// Framework Integration Utilities (internal use)
// =============================================================================

export {
	createFrameworkHandler,
	createServerClientProxy,
	type FrameworkHandlerOptions,
	handleWebMutation,
	handleWebQuery,
	handleWebSSE,
} from "./handlers/index.js";

// =============================================================================
// Plugin System
// =============================================================================

export {
	// Context types
	type AfterMutationContext,
	type AfterSendContext,
	type BeforeMutationContext,
	type BeforeSendContext,
	// Operation Log Plugin (cursor-based state management)
	type BroadcastResult,
	type ConnectContext,
	// Plugin manager
	createPluginManager,
	type DisconnectContext,
	type EnhanceOperationMetaContext,
	isOpLogPlugin,
	// Optimistic Plugin
	isOptimisticPlugin,
	type OpLogOptions,
	type OpLogPlugin,
	type OptimisticPluginOptions,
	opLog,
	optimisticPlugin,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "./plugin/index.js";

// =============================================================================
// Storage (for opLog plugin)
// =============================================================================

export {
	// Types
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	// In-memory (default)
	memoryStorage,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredEntityState,
	type StoredPatchEntry,
} from "./storage/index.js";

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
// Reconnection (Server-side)
// =============================================================================

export { coalescePatches, estimatePatchSize, OperationLog } from "./reconnect/index.js";

// =============================================================================
// Logging
// =============================================================================

export {
	createStructuredLogger,
	type ErrorContext,
	jsonOutput,
	type LogContext,
	type LogEntry,
	type LogLevel,
	type LogOutput,
	type PerformanceContext,
	prettyOutput,
	type RequestContext,
	type StructuredLogger,
	type StructuredLoggerOptions,
	toBasicLogger,
	type WebSocketContext,
} from "./logging/index.js";
