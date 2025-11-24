/**
 * @lens/client - Links
 *
 * Composable middleware for request/response processing.
 * Inspired by tRPC's link system.
 *
 * @example
 * ```typescript
 * import { createClient, loggerLink, retryLink, cacheLink, httpLink } from "@lens/client";
 *
 * const client = createClient({
 *   schema,
 *   links: [
 *     loggerLink({ enabled: process.env.NODE_ENV === "development" }),
 *     retryLink({ maxRetries: 3 }),
 *     cacheLink({ ttl: 5000 }),
 *     httpLink({ url: "http://localhost:3000/api" }),
 *   ],
 * });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export {
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
	composeLinks,
	createOperationContext,
} from "./types";

// =============================================================================
// Middleware Links
// =============================================================================

export { deserializeLink, type DeserializeLinkOptions } from "./deserialize";
export { loggerLink, type LoggerLinkOptions } from "./logger";
export { retryLink, type RetryLinkOptions } from "./retry";
export { cacheLink, createCacheStore, type CacheLinkOptions } from "./cache";
export { splitLink, splitByType, type SplitLinkOptions } from "./split";
export { queryOptimizerLink, type QueryOptimizerOptions } from "./query-optimizer";
export { compressionLink, type CompressionLinkOptions } from "./compression";
export {
	msgpackLink,
	serializeMsgpack,
	deserializeMsgpack,
	compareSizes,
	type MsgpackLinkOptions,
} from "./msgpack";

// =============================================================================
// Terminal Links
// =============================================================================

export { httpLink, httpBatchLink, type HttpLinkOptions } from "./http";
export {
	sseLink,
	SSESubscriptionTransport,
	createSSETransport,
	type SSELinkOptions,
	type SSEState,
} from "./sse";
export {
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
} from "./in-process";

// =============================================================================
// Subscription Transport (WebSocket)
// =============================================================================

export {
	WebSocketSubscriptionTransport,
	createWebSocketTransport,
	websocketLink,
	type WebSocketLinkOptions,
	type WebSocketState,
} from "./websocket";

// =============================================================================
// WebSocket V2 (Operations Protocol)
// =============================================================================

export {
	WebSocketTransportV2,
	createWebSocketTransportV2,
	websocketLinkV2,
	type WebSocketLinkV2Options,
	type WebSocketV2State,
} from "./websocket-v2";
