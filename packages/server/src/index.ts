/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 *
 * Architecture:
 * - App = Executor with optional plugin support
 *   - Stateless (default): Pure executor
 *   - Stateful (with opLog): Cursor-based state synchronization
 * - Handlers = Pure protocol handlers (HTTP, WebSocket, SSE)
 *   - No business logic - just translate protocol to app calls
 * - Plugins = App-level middleware (opLog, auth, logger)
 *   - Configured at app level, not handler level
 *
 * @example
 * ```typescript
 * // Stateless mode (default)
 * const app = createApp({ router });
 * const wsHandler = createWSHandler(app);
 *
 * // With opLog plugin (cursor-based state sync)
 * const app = createApp({
 *   router,
 *   plugins: [opLog()],
 * });
 *
 * // With external storage for serverless (install @sylphx/lens-storage-upstash)
 * import { upstashStorage } from "@sylphx/lens-storage-upstash";
 * const app = createApp({
 *   router,
 *   plugins: [opLog({ storage: upstashStorage({ redis }) })],
 * });
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
// Protocol Handlers
// =============================================================================

export {
	// Framework Handler Utilities
	createFrameworkHandler,
	// Unified Handler (HTTP + SSE)
	createHandler,
	// HTTP Handler
	createHTTPHandler,
	createServerClientProxy,
	// SSE Handler
	createSSEHandler,
	// WebSocket Handler
	createWSHandler,
	DEFAULT_WS_HANDLER_CONFIG,
	type FrameworkHandlerOptions,
	type Handler,
	type HandlerOptions,
	type HTTPHandler,
	type HTTPHandlerOptions,
	handleWebMutation,
	handleWebQuery,
	handleWebSSE,
	type SSEHandlerOptions,
	type WSHandler,
	type WSHandlerConfig,
	type WSHandlerOptions,
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
