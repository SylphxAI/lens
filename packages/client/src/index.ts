/**
 * @lens/client
 *
 * Reactive client for Lens API framework.
 * Signals, store, and transport for real-time data access.
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
	type OptimisticEntry,
	type StoreConfig,
} from "./store/reactive-store";

// =============================================================================
// Client
// =============================================================================

export {
	// Factory
	createClient,
	// Types
	type Client,
	type ClientConfig,
	type EntityAccessor,
	type QueryOptions,
	type ListOptions,
	type MutationResult,
} from "./client/client";

// =============================================================================
// Transport
// =============================================================================

export {
	// Types
	type Transport,
	type TransportConfig,
	type ConnectionState,
	type SubscribeInput,
	type QueryInput,
	type MutateInput,
	// Messages
	type ClientMessage,
	type ServerMessage,
	type SubscribeMessage,
	type UnsubscribeMessage,
	type MutateMessage,
	type QueryMessage,
	type DataMessage,
	type UpdateMessage,
	type ResultMessage,
	type ErrorMessage,
} from "./transport/types";

export { WebSocketTransport } from "./transport/websocket";
export { HttpTransport, type HttpTransportConfig } from "./transport/http";
export { SSETransport, type SSETransportConfig } from "./transport/sse";
export {
	InProcessTransport,
	createInProcessTransport,
	type InProcessTransportConfig,
	type InProcessResolvers as InProcessTransportResolvers,
} from "./transport/in-process";

// =============================================================================
// Links (tRPC-style middleware chain)
// =============================================================================

export {
	// Types
	type OperationType,
	type OperationContext,
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
	// Terminal links
	httpLink,
	httpBatchLink,
	type HttpLinkOptions,
	sseLink,
	type SSELinkOptions,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
} from "./links";
