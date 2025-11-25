/**
 * @lens/client
 *
 * Reactive client for Lens API framework.
 * Signals, store, and Links for real-time data access.
 */

// =============================================================================
// Signals (powered by @preact/signals-core)
// =============================================================================

export {
	// Types
	type Signal,
	type WritableSignal,
	type Subscriber,
	type Unsubscribe,
	// Factory functions
	signal,
	computed,
	effect,
	batch,
	// Utilities
	isSignal,
	toPromise,
	derive,
} from "./signals/signal";

// =============================================================================
// Reactive Store
// =============================================================================

export {
	// Class
	ReactiveStore,
	// Factory
	createStore,
	// Types
	type EntityKey,
	type EntityState,
	type OptimisticEntry as StoreOptimisticEntry,
	type StoreConfig,
} from "./store/reactive-store";

// =============================================================================
// Client (Primary API)
// =============================================================================

export {
	// Factory (recommended)
	createClient,
	// Types
	type LensClient,
	type LensClientConfig,
	type LensClientConfig as ClientConfig, // Alias for compatibility
	type Transport,
	type QueryResult,
	type MutationResult,
	type SelectionObject,
	type QueriesMap,
	type MutationsMap,
	type InferInput,
	type InferOutput,
	// Middleware types (deprecated - use Link from links)
	type Middleware,
	type MiddlewareFn,
	type OperationContext,
} from "./client/create";

// =============================================================================
// Links (Utility)
// =============================================================================

export {
	// New names (recommended)
	loggerLink,
	retryLink,
	timingLink,
	errorHandlerLink,
	// Deprecated aliases
	loggerMiddleware,
	retryMiddleware,
	timingMiddleware,
	errorHandlerMiddleware,
	// Types
	type LoggerOptions,
	type RetryOptions,
	type TimingOptions,
	type ErrorHandlerOptions,
} from "./client/middleware";

// =============================================================================
// WebSocket Transport (Legacy - use websocketLink from links instead)
// =============================================================================

export {
	// Class
	WebSocketTransport,
	// Factory
	createWebSocketTransport as createWebSocketTransportLegacy,
	websocketTransport,
	// Types
	type WebSocketTransportOptions,
	type WebSocketState as WebSocketTransportState,
} from "./client/transport";

// =============================================================================
// Links (tRPC-style middleware chain)
// =============================================================================

export {
	// Types
	type OperationType,
	type OperationContext as LinkOperationContext,
	type OperationResult,
	type NextLink,
	type LinkFn,
	type Link,
	type TerminalLink,
	type Observable,
	type Observer,
	type Unsubscribable,
	// Utilities
	composeLinks,
	createOperationContext,
	// Middleware links
	loggerLink as loggerLinkV2,
	type LoggerLinkOptions,
	retryLink as retryLinkV2,
	type RetryLinkOptions,
	cacheLink,
	createCacheStore,
	type CacheLinkOptions,
	splitLink,
	splitByType,
	type SplitLinkOptions,
	queryOptimizerLink,
	type QueryOptimizerOptions,
	compressionLink,
	type CompressionLinkOptions,
	msgpackLink,
	serializeMsgpack,
	deserializeMsgpack,
	compareSizes,
	type MsgpackLinkOptions,
	// Terminal links
	httpLink,
	httpBatchLink,
	type HttpLinkOptions,
	sseLink,
	SSESubscriptionTransport,
	createSSETransport,
	type SSELinkOptions,
	type SSEState,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
	// WebSocket terminal link
	websocketLink,
	WebSocketSubscriptionTransport,
	createWebSocketTransport,
	type WebSocketLinkOptions,
	type WebSocketState,
} from "./links";
