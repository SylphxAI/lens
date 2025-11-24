/**
 * @lens/server
 *
 * Server runtime for Lens API framework.
 * Resolvers, execution engine, GraphStateManager, and WebSocket handler.
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
// Server
// =============================================================================

export {
	// Factory
	createServer,
	// Types
	type ServerConfig,
	type LensServer,
	type WebSocketLike,
} from "./server/create";

// =============================================================================
// State Management (Single source of truth for subscriptions)
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
// Deprecated (kept for backward compatibility, will be removed)
// =============================================================================

/**
 * @deprecated Use GraphStateManager instead. SSEHandler will be removed in next major version.
 */
export {
	SSEHandler,
	createSSEHandler,
	type SSEClient,
	type SSESubscription,
	type SSEHandlerConfig,
} from "./sse/handler";

/**
 * @deprecated Use GraphStateManager instead. SubscriptionHandler will be removed in next major version.
 */
export {
	SubscriptionHandler,
	createSubscriptionHandler,
	type SubscriptionClient,
	type ClientSubscribeMessage,
	type ClientUnsubscribeMessage,
	type ClientMessage,
	type ServerUpdateMessage,
	type FieldSubscriptionState,
	type EntitySubscriptionState,
	type SubscriptionHandlerConfig,
} from "./subscriptions";
