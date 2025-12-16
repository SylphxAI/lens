/**
 * @sylphx/lens-client - SSE-Only Transport
 *
 * Pure Server-Sent Events transport for subscriptions only.
 * This is an atomic transport meant for composition with routeByType().
 *
 * For query/mutation, use http() transport.
 * For an all-in-one solution, use httpSse() instead.
 *
 * @example
 * ```typescript
 * // Compose with http() for full functionality
 * const client = createClient({
 *   transport: routeByType({
 *     default: http({ url: '/api' }),
 *     subscription: sse({ url: '/api' }),
 *   }),
 * })
 * ```
 */

import { DEFAULT_SSE_RETRY_CONFIG, SseConnectionManager } from "./sse-connection.js";
import type {
	ConnectionState,
	Metadata,
	Observable,
	Operation,
	Result,
	SubscriptionCapable,
	TransportBase,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * SSE-only transport options.
 */
export interface SseTransportOptions {
	/** Server URL for SSE endpoint */
	url: string;
	/** Default headers (note: EventSource has limited header support) */
	headers?: Record<string, string>;
	/** EventSource implementation (default: global EventSource) */
	EventSource?: typeof EventSource;
	/** Fetch implementation for metadata (default: global fetch) */
	fetch?: typeof fetch;
	/** Retry options for SSE reconnection */
	retry?: {
		/** Enable automatic reconnection (default: true) */
		enabled?: boolean;
		/** Maximum retry attempts (default: 10) */
		maxAttempts?: number;
		/** Base delay in ms (default: 1000) */
		baseDelay?: number;
		/** Maximum delay in ms (default: 30000) */
		maxDelay?: number;
	};
	/** Callback when connection state changes */
	onConnectionStateChange?: (state: ConnectionState) => void;
}

/**
 * SSE-only transport instance.
 */
export interface SseTransportInstance extends TransportBase, SubscriptionCapable {
	/** Get current connection state */
	getConnectionState(): ConnectionState;
	/** Get active subscription count */
	getSubscriptionCount(): number;
	/** Close all connections */
	close(): void;
}

// =============================================================================
// SSE-Only Transport
// =============================================================================

/**
 * Create SSE-only transport for subscriptions.
 *
 * This is a pure, atomic transport that only handles subscriptions via EventSource.
 * Use with routeByType() to combine with http() for query/mutation support.
 *
 * @example
 * ```typescript
 * import { http, sse, routeByType } from '@sylphx/lens-client/transport'
 *
 * const client = createClient({
 *   transport: routeByType({
 *     default: http({ url: '/api' }),
 *     subscription: sse({ url: '/api/events' }),
 *   }),
 * })
 *
 * // Subscriptions use SSE
 * client.messages.stream().subscribe((msg) => {
 *   console.log('New message:', msg)
 * })
 * ```
 */
export function sse(options: SseTransportOptions): SseTransportInstance {
	const {
		url,
		headers: defaultHeaders = {},
		EventSource: EventSourceImpl = EventSource,
		fetch: fetchImpl = fetch,
		retry = {},
		onConnectionStateChange,
	} = options;

	// Normalize URL (remove trailing slash)
	const baseUrl = url.replace(/\/$/, "");

	// Create connection manager for SSE subscriptions
	const connectionManager = new SseConnectionManager({
		baseUrl,
		EventSource: EventSourceImpl,
		retry: {
			...DEFAULT_SSE_RETRY_CONFIG,
			...retry,
		},
		onConnectionStateChange,
		headers: defaultHeaders,
	});

	return {
		/**
		 * Connect and get metadata from server.
		 */
		async connect(): Promise<Metadata> {
			const response = await fetchImpl(`${baseUrl}/__lens/metadata`, {
				method: "GET",
				headers: {
					Accept: "application/json",
					...defaultHeaders,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to connect: ${response.status} ${response.statusText}`);
			}

			return response.json();
		},

		/**
		 * Execute subscription operation.
		 * Only subscriptions are supported - use http() for query/mutation.
		 */
		subscription(op: Operation): Observable<Result> {
			return connectionManager.createSubscription(op);
		},

		/**
		 * Get current connection state.
		 */
		getConnectionState(): ConnectionState {
			return connectionManager.getConnectionState();
		},

		/**
		 * Get active subscription count.
		 */
		getSubscriptionCount(): number {
			return connectionManager.getSubscriptionCount();
		},

		/**
		 * Close all connections.
		 */
		close(): void {
			connectionManager.close();
		},
	};
}
