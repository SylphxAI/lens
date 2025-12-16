/**
 * @sylphx/lens-client - HTTP + SSE Transport
 *
 * Bundled transport combining HTTP and Server-Sent Events.
 * - Query/Mutation: HTTP POST
 * - Subscription: SSE (EventSource)
 *
 * This is a convenience all-in-one transport for common use cases.
 * For composition with routeByType(), use separate http() and sseOnly() transports.
 *
 * SSE is a good middle-ground between HTTP polling and WebSocket:
 * - Simpler than WebSocket (HTTP-based, one-way)
 * - More efficient than polling (server push)
 * - Better serverless compatibility than WebSocket
 */

import { DEFAULT_SSE_RETRY_CONFIG, SseConnectionManager } from "./sse-connection.js";
import type {
	ConnectionState,
	Metadata,
	Observable,
	Operation,
	Result,
	Transport,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * HTTP + SSE transport options.
 */
export interface HttpSseTransportOptions {
	/** Server URL (base URL for HTTP and SSE endpoints) */
	url: string;
	/** Default headers for HTTP requests */
	headers?: HeadersInit;
	/** Fetch implementation (default: global fetch) */
	fetch?: typeof fetch;
	/** EventSource implementation (default: global EventSource) */
	EventSource?: typeof EventSource;
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
 * @deprecated Use `HttpSseTransportOptions` instead
 */
export type SseTransportOptions = HttpSseTransportOptions;

/**
 * @deprecated Use `ConnectionState` from types.ts instead
 */
export type SseConnectionState = ConnectionState;

/**
 * HTTP + SSE transport instance with additional methods.
 */
export interface HttpSseTransportInstance extends Transport {
	/** Get current connection state */
	getConnectionState(): ConnectionState;
	/** Get active subscription count */
	getSubscriptionCount(): number;
	/** Close all connections */
	close(): void;
}

/**
 * @deprecated Use `HttpSseTransportInstance` instead
 */
export type SseTransportInstance = HttpSseTransportInstance;

// =============================================================================
// HTTP + SSE Transport
// =============================================================================

/**
 * Create HTTP + SSE bundled transport.
 *
 * This is an all-in-one convenience transport that handles:
 * - Queries via HTTP POST
 * - Mutations via HTTP POST
 * - Subscriptions via Server-Sent Events (EventSource)
 *
 * For finer control, use routeByType() with separate transports:
 * ```typescript
 * routeByType({
 *   default: http({ url: '/api' }),
 *   subscription: sseOnly({ url: '/api' }),
 * })
 * ```
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   transport: httpSse({ url: '/api/lens' }),
 * })
 *
 * // Query (HTTP POST)
 * const user = await client.user.get({ id: '123' })
 *
 * // Subscription (SSE)
 * client.user.get({ id: '123' }).subscribe((user) => {
 *   console.log('User updated:', user)
 * })
 * ```
 */
export function httpSse(options: HttpSseTransportOptions): HttpSseTransportInstance {
	const {
		url,
		headers: defaultHeaders = {},
		fetch: fetchImpl = fetch,
		EventSource: EventSourceImpl = EventSource,
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
	});

	/**
	 * Execute HTTP request for query/mutation.
	 */
	async function executeHttp(op: Operation): Promise<Result> {
		try {
			const response = await fetchImpl(baseUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					...defaultHeaders,
					...((op.meta?.headers as Record<string, string>) ?? {}),
				},
				body: JSON.stringify({
					id: op.id,
					path: op.path,
					type: op.type,
					input: op.input,
				}),
			});

			if (!response.ok) {
				return {
					$: "error",
					error: `HTTP ${response.status}: ${response.statusText}`,
				};
			}

			return (await response.json()) as Result;
		} catch (error) {
			return { $: "error", error: error instanceof Error ? error.message : String(error) };
		}
	}

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
		 * Execute operation.
		 * HTTP POST for query/mutation, SSE for subscription.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			if (op.type === "subscription") {
				return connectionManager.createSubscription(op);
			}
			return executeHttp(op);
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
