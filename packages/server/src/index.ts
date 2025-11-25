/**
 * @sylphx/server
 *
 * Server runtime for Lens API framework.
 * Operations-based server with GraphStateManager for reactive updates.
 */

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
