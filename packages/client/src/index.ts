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
	type MutationOptions,
	type MutationResult,
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
	type SSELinkOptions,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
} from "./links";
