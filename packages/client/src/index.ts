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
	type MutationOptions,
	type MutationResult,
	type InferQueryResult,
} from "./client/client";

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
	SSESubscriptionTransport,
	createSSETransport,
	type SSELinkOptions,
	type SSEState,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
	// WebSocket subscription transport
	WebSocketSubscriptionTransport,
	createWebSocketTransport,
	websocketLink,
	type WebSocketLinkOptions,
	type WebSocketState,
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
	// ReactiveClient (new reactive client)
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
	// OptimisticManager (optimistic updates)
	OptimisticManager,
	createOptimisticManager,
	type OptimisticEntry,
	type OptimisticManagerConfig,
} from "./reactive";

// =============================================================================
// Plugin System
// =============================================================================

export {
	// Core (re-exported from @lens/core)
	defineUnifiedPlugin,
	type UnifiedPlugin,
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
	// Client plugin manager
	createPluginManager,
	type PluginManager,
	// Client-only plugins
	optimisticPlugin,
	type OptimisticPluginAPI,
	type OptimisticPluginConfig,
	// Legacy (deprecated - use @lens/core)
	definePlugin,
	type Plugin,
	type PluginInstance,
	type PluginContext,
	type PluginHooks,
} from "./plugins";
