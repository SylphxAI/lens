/**
 * @lens/server
 *
 * Server runtime for Lens API framework.
 * Resolvers, execution engine, and WebSocket handler.
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
	type EntityResolver,
	type BatchResolver,
	type RelationResolver,
	type ListResolver,
	type ListInput,
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
