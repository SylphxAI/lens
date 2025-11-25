/**
 * @lens/server
 *
 * Server runtime for Lens API framework.
 * Resolvers, execution engine, GraphStateManager, and transport adapters.
 */

// =============================================================================
// Resolvers
// =============================================================================

export {
	// Factory
	createResolvers,
	// Error
	ResolverValidationError,
} from "./resolvers/create";

export {
	// Types
	type BaseContext,
	type EmitContext,
	type ResolverContext,
	type EntityResolver,
	type BatchResolver,
	type RelationResolver,
	type ListResolver,
	type PaginatedListResolver,
	type ListInput,
	type PaginatedResult,
	type PageInfo,
	type CreateResolver,
	type UpdateResolver,
	type DeleteResolver,
	type EntityResolverDef,
	type ResolverDefinition,
	type Resolvers,
} from "./resolvers/types";

// =============================================================================
// Execution
// =============================================================================

export {
	// Classes
	ExecutionEngine,
	DataLoader,
	// Errors
	ExecutionError,
	// Types
	type ExecutionEngineConfig,
	type ReactiveSubscription,
} from "./execution/engine";

// =============================================================================
// Server (Legacy V1 - CRUD-based)
// =============================================================================

export {
	// Factory (V1 Legacy - use createServer from unified instead)
	createServer as createServerV1,
	// Types
	type ServerConfig as ServerV1Config,
	type LensServer as LensServerV1,
	type WebSocketLike as WebSocketLikeV1,
} from "./server/create";

export {
	// Factory (V2 - Operations-based)
	createServerV2,
	// Types
	type ServerV2Config,
	type LensServerV2,
	type EntitiesMap,
	type RelationsArray,
	type QueriesMap,
	type MutationsMap,
	type WebSocketLike as WebSocketLikeV2,
} from "./server/create-v2";

// =============================================================================
// State Management (Single source of truth)
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

// =============================================================================
// Unified Server (V2 Operations + V1 Optimization Layer)
// =============================================================================

export {
	// Factory
	createUnifiedServer,
	// Types
	type UnifiedServer,
	type UnifiedServerConfig,
	type EntitiesMap as UnifiedEntitiesMap,
	type QueriesMap as UnifiedQueriesMap,
	type MutationsMap as UnifiedMutationsMap,
	type RelationsArray as UnifiedRelationsArray,
	type WebSocketLike as UnifiedWebSocketLike,
	type SelectionObject,
	// Type inference utilities (tRPC-style)
	type InferApi,
	type InferInput,
	type InferOutput,
} from "./server/unified";

// =============================================================================
// Primary API (README-compatible aliases)
// =============================================================================

// createServer = unified server (recommended)
export { createUnifiedServer as createServer } from "./server/unified";
export type { UnifiedServer as LensServer } from "./server/unified";
export type { UnifiedServerConfig as ServerConfig } from "./server/unified";
