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
// Client (Legacy V1 - CRUD-based)
// =============================================================================

export {
	// Factory (V1 Legacy - use createClient from unified instead)
	createClient as createClientV1,
	// Types
	type Client as ClientV1,
	type ClientConfig as ClientV1Config,
	type EntityAccessor,
	type QueryOptions,
	type ListOptions,
	type MutationOptions,
	type MutationResult,
	type InferQueryResult,
} from "./client/client";

export {
	// Factory (V2 - Operations-based)
	createClientV2,
	// Types
	type ClientV2,
	type ClientV2Config,
	type QueriesMap,
	type MutationsMap,
	type QueryAccessor,
	type MutationAccessor,
	type QueryAccessors,
	type MutationAccessors,
	type MutationV2Options,
	type MutationV2Result,
	type InferInput,
	type InferOutput,
} from "./client/client-v2";

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
	// HTTP V2 (operations protocol)
	httpLinkV2,
	type HttpLinkV2Options,
	sseLink,
	SSESubscriptionTransport,
	createSSETransport,
	type SSELinkOptions,
	type SSEState,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
	// In-process V2 (operations protocol)
	inProcessLinkV2,
	createInProcessLinkV2,
	type InProcessLinkV2Options,
	type InProcessServerV2,
	// WebSocket subscription transport (V1 - for legacy client)
	WebSocketSubscriptionTransport,
	createWebSocketTransport,
	websocketLink as websocketLinkV1,
	type WebSocketLinkOptions as WebSocketLinkV1Options,
	type WebSocketState,
	// WebSocket V2 (operations protocol)
	WebSocketTransportV2,
	createWebSocketTransportV2,
	websocketLinkV2,
	type WebSocketLinkV2Options,
	type WebSocketV2State,
} from "./links";

// =============================================================================
// Reactive System (Fine-grained reactivity)
// =============================================================================

export {
	// EntitySignal (field-level signals)
	EntitySignal,
	createEntitySignal,
	deriveEntitySignal,
	type FieldSignals,
	type EntitySignalOptions,
	type DisposeCallback,
	// SubscriptionManager (field-level subscriptions)
	SubscriptionManager,
	createSubscriptionManager,
	type FieldSubscription,
	type EntitySubscription,
	type SubscribeMessage,
	type UnsubscribeMessage,
	type UpdateMessage,
	type ServerMessage,
	type SubscriptionTransport,
	// QueryResolver (query deduplication)
	QueryResolver,
	createQueryResolver,
	type QueryDef,
	type QueryResult,
	type ListQueryResult,
	type QueryTransport,
	// ReactiveClient
	createReactiveClient,
	type ReactiveClient,
	type ReactiveClientConfig,
	type ReactiveEntityAccessor,
	type EntityResult,
	type ListResult,
	type ReactiveMutationResult,
	type ReactiveQueryOptions,
	type ReactiveListOptions,
	type ReactiveInferQueryResult,
} from "./reactive";

// =============================================================================
// Unified Client (V2 Operations + V1 Optimization Layer)
// =============================================================================

export {
	// Factory
	createUnifiedClient,
	// Types
	type UnifiedClient,
	type UnifiedClientConfig,
	type UnifiedTransport,
	type QueryResult as UnifiedQueryResult,
	type MutationResult as UnifiedMutationResult,
	type SelectionObject,
	type QueriesMap as UnifiedQueriesMap,
	type MutationsMap as UnifiedMutationsMap,
	type InferInput as UnifiedInferInput,
	type InferOutput as UnifiedInferOutput,
	// Unified link types
	type UnifiedLink,
	type UnifiedLinkFn,
	type UnifiedOperationContext,
} from "./client/unified";

export {
	// Unified middleware links
	unifiedLoggerLink,
	unifiedRetryLink,
	unifiedTimingLink,
	unifiedErrorHandlerLink,
	// Types
	type UnifiedLoggerOptions,
	type UnifiedRetryOptions,
	type UnifiedTimingOptions,
	type UnifiedErrorHandlerOptions,
} from "./client/unified-links";

export {
	// WebSocket Transport for Unified Client
	WebSocketUnifiedTransport,
	createWebSocketUnifiedTransport,
	websocketUnifiedTransport,
	// Types
	type WebSocketUnifiedTransportOptions,
	type WebSocketUnifiedState,
} from "./client/unified-transport";

// =============================================================================
// Primary API (README-compatible aliases)
// =============================================================================

// createClient = unified client (recommended)
export { createUnifiedClient as createClient } from "./client/unified";
export type { UnifiedClient as LensClient } from "./client/unified";
export type { UnifiedClientConfig as ClientConfig } from "./client/unified";

// websocketLink = unified transport for unified client (README-compatible alias)
export { websocketUnifiedTransport as websocketLink } from "./client/unified-transport";
export type { WebSocketUnifiedTransportOptions as WebSocketLinkOptions } from "./client/unified-transport";
