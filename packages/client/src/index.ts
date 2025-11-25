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
	type OperationContext,
} from "./client/create";

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
	deserializeLink,
	type DeserializeLinkOptions,
	loggerLink,
	type LoggerLinkOptions,
	retryLink,
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
	timingLink,
	type TimingLinkOptions,
	errorHandlerLink,
	type ErrorHandlerLinkOptions,
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
