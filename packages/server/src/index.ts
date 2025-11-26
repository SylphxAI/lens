/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens API framework.
 * Operations-based server with GraphStateManager for reactive updates.
 */

// =============================================================================
// Initialization (tRPC-style)
// =============================================================================

export {
	// Builder
	initLens,
	// Types
	type LensServerInstance,
	type LensServerBuilder,
	type LensServerBuilderWithContext,
	type LensServerInstanceConfig,
} from "./init";

// =============================================================================
// Re-exports from Core (commonly used with server)
// =============================================================================

export {
	// Operations
	query,
	mutation,
	router,
	// Types
	type QueryBuilder,
	type MutationBuilder,
	type QueryDef,
	type MutationDef,
	type RouterDef,
	type RouterRoutes,
	type ResolverFn,
	type ResolverContext,
	type InferRouterContext,
} from "@sylphx/lens-core";

// =============================================================================
// Server
// =============================================================================

export {
	// Factory
	createServer,
	// Types
	type LensServer,
	type LensServerConfig as ServerConfig,
	type EntitiesMap,
	type RelationsArray,
	type QueriesMap,
	type MutationsMap,
	type WebSocketLike,
	type SelectionObject,
	// Metadata types (for transport handshake)
	type ServerMetadata,
	type OperationMeta,
	type OperationsMap,
	// In-process transport types
	type LensOperation,
	type LensResult,
	// Type inference utilities (tRPC-style)
	type InferApi,
	type InferInput,
	type InferOutput,
} from "./server/create";

// =============================================================================
// State Management
// =============================================================================

export {
	// Class
	GraphStateManager,
	// Factory
	createGraphStateManager,
	// Types
	type EntityKey,
	type StateClient,
	type StateUpdateMessage,
	type StateFullMessage,
	type Subscription,
	type GraphStateManagerConfig,
} from "./state";

// =============================================================================
// SSE Transport Adapter
// =============================================================================

export {
	// Class
	SSEHandler,
	// Factory
	createSSEHandler,
	// Types
	type SSEHandlerConfig,
	type SSEClientInfo,
} from "./sse/handler";
