/**
 * @sylphx/lens-client - SSE Transport
 *
 * Server-Sent Events transport for Lens client.
 * Handles query/mutation via HTTP POST, subscriptions via EventSource.
 *
 * SSE is a good middle-ground between HTTP polling and WebSocket:
 * - Simpler than WebSocket (HTTP-based, one-way)
 * - More efficient than polling (server push)
 * - Better serverless compatibility than WebSocket
 */

import type {
	ConnectionState,
	Metadata,
	Observable,
	Observer,
	Operation,
	Result,
	Transport,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * SSE transport options.
 */
export interface SseTransportOptions {
	/** Server URL (base URL for HTTP and SSE endpoints) */
	url: string;
	/** Default headers for HTTP requests */
	headers?: HeadersInit;
	/** Fetch implementation (default: global fetch) */
	fetch?: typeof fetch;
	/** EventSource implementation (default: global EventSource) */
	EventSource?: typeof EventSource;
	/** Retry options */
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
 * @deprecated Use `ConnectionState` from types.ts instead
 */
export type SseConnectionState = ConnectionState;

/**
 * SSE transport instance with additional methods.
 */
export interface SseTransportInstance extends Transport {
	/** Get current connection state */
	getConnectionState(): ConnectionState;
	/** Get active subscription count */
	getSubscriptionCount(): number;
	/** Close all connections */
	close(): void;
}

// =============================================================================
// SSE Transport
// =============================================================================

/**
 * Create SSE transport.
 *
 * Handles:
 * - Queries via HTTP POST
 * - Mutations via HTTP POST
 * - Subscriptions via Server-Sent Events (EventSource)
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   transport: sse({ url: '/api/lens' }),
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
export function sse(options: SseTransportOptions): SseTransportInstance {
	const {
		url,
		headers: defaultHeaders = {},
		fetch: fetchImpl = fetch,
		EventSource: EventSourceImpl = EventSource,
		retry = {},
		onConnectionStateChange,
	} = options;

	const {
		enabled: retryEnabled = true,
		maxAttempts = 10,
		baseDelay = 1000,
		maxDelay = 30000,
	} = retry;

	// Normalize URL (remove trailing slash)
	const baseUrl = url.replace(/\/$/, "");

	// Track active subscriptions
	const subscriptions = new Map<
		string,
		{
			eventSource: EventSource;
			observer: Observer<Result>;
			retryCount: number;
		}
	>();

	let connectionState: ConnectionState = "disconnected";

	// Helper to update connection state
	function setConnectionState(state: ConnectionState) {
		if (connectionState !== state) {
			connectionState = state;
			onConnectionStateChange?.(state);
		}
	}

	// Helper to compute retry delay with exponential backoff + jitter
	function getRetryDelay(attempt: number): number {
		const exponentialDelay = baseDelay * Math.pow(2, attempt);
		const jitter = Math.random() * 0.3 * exponentialDelay;
		return Math.min(exponentialDelay + jitter, maxDelay);
	}

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

	/**
	 * Create SSE subscription.
	 */
	function createSseSubscription(op: Operation): Observable<Result> {
		return {
			subscribe(observer: Observer<Result>) {
				const subId = op.id;
				let retryCount = 0;

				function connect() {
					// Build SSE URL with operation info
					const sseUrl = new URL(`${baseUrl}/${op.path}`);
					if (op.input !== undefined) {
						sseUrl.searchParams.set("input", JSON.stringify(op.input));
					}
					sseUrl.searchParams.set("_sse", "1"); // Mark as SSE request

					const eventSource = new EventSourceImpl(sseUrl.toString());

					// Track subscription
					subscriptions.set(subId, { eventSource, observer, retryCount });

					// Update state
					if (subscriptions.size === 1) {
						setConnectionState("connecting");
					}

					eventSource.onopen = () => {
						retryCount = 0; // Reset on successful connection
						if (subscriptions.has(subId)) {
							subscriptions.get(subId)!.retryCount = 0;
						}
						setConnectionState("connected");
					};

					eventSource.onmessage = (event) => {
						try {
							// Parse as Message type for stateless architecture
							// Server sends { $: "snapshot", data } or { $: "ops", ops }
							const message = JSON.parse(event.data) as Result;
							observer.next?.(message);
						} catch (error) {
							observer.error?.(error as Error);
						}
					};

					// Handle custom events
					eventSource.addEventListener("error", (_event) => {
						// EventSource will auto-reconnect on most errors
						// But we track state for visibility
						if (eventSource.readyState === EventSourceImpl.CLOSED) {
							if (retryEnabled && retryCount < maxAttempts) {
								setConnectionState("reconnecting");
								retryCount++;
								if (subscriptions.has(subId)) {
									subscriptions.get(subId)!.retryCount = retryCount;
								}

								// EventSource handles reconnection automatically
								// But if it's fully closed, we reconnect manually
								const delay = getRetryDelay(retryCount);
								setTimeout(() => {
									if (subscriptions.has(subId)) {
										subscriptions.delete(subId);
										connect();
									}
								}, delay);
							} else {
								observer.error?.(new Error("SSE connection failed"));
								subscriptions.delete(subId);
								if (subscriptions.size === 0) {
									setConnectionState("disconnected");
								}
							}
						}
					});

					eventSource.addEventListener("complete", () => {
						observer.complete?.();
						eventSource.close();
						subscriptions.delete(subId);
						if (subscriptions.size === 0) {
							setConnectionState("disconnected");
						}
					});

					eventSource.addEventListener("lens-error", (event) => {
						try {
							const errorData = JSON.parse((event as MessageEvent).data);
							observer.error?.(new Error(errorData.message || "SSE error"));
						} catch {
							observer.error?.(new Error("SSE error"));
						}
					});
				}

				// Start connection
				connect();

				// Return unsubscribe function
				return {
					unsubscribe() {
						const sub = subscriptions.get(subId);
						if (sub) {
							sub.eventSource.close();
							subscriptions.delete(subId);
							if (subscriptions.size === 0) {
								setConnectionState("disconnected");
							}
						}
					},
				};
			},
		};
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
				return createSseSubscription(op);
			}
			return executeHttp(op);
		},

		/**
		 * Get current connection state.
		 */
		getConnectionState(): ConnectionState {
			return connectionState;
		},

		/**
		 * Get active subscription count.
		 */
		getSubscriptionCount(): number {
			return subscriptions.size;
		},

		/**
		 * Close all connections.
		 */
		close(): void {
			for (const [id, sub] of subscriptions) {
				sub.eventSource.close();
				subscriptions.delete(id);
			}
			setConnectionState("disconnected");
		},
	};
}
