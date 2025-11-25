/**
 * @sylphx/lens-client - SSE Link (Terminal)
 *
 * Terminal link that uses SSE for real-time subscriptions and HTTP for queries/mutations.
 * Updated to support field-level subscriptions protocol.
 */

import type { ServerMessage, SubscriptionTransport, UpdateMessage } from "../reactive";
import type { Link, LinkFn, Observable, Observer, OperationResult, Unsubscribable } from "./types";

export interface SSELinkOptions {
	/** Base URL for HTTP operations */
	url: string;
	/** SSE endpoint URL (defaults to url + '/stream') */
	sseUrl?: string;
	/** Request headers */
	headers?:
		| Record<string, string>
		| (() => Record<string, string> | Promise<Record<string, string>>);
	/** Custom fetch implementation */
	fetch?: typeof fetch;
	/** Reconnection delay in ms (default: 3000) */
	reconnectDelay?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Called when reconnected */
	onReconnect?: () => void;
	/** Called when disconnected */
	onDisconnect?: () => void;
}

/** SSE connection state */
export type SSEState = "connecting" | "connected" | "disconnected" | "reconnecting";

// =============================================================================
// SSESubscriptionTransport
// =============================================================================

/**
 * SSE transport for real-time subscriptions.
 *
 * Implements SubscriptionTransport interface for use with SubscriptionManager.
 * Uses HTTP POST for subscription management and SSE for receiving updates.
 *
 * @example
 * ```typescript
 * const transport = new SSESubscriptionTransport({
 *   url: "https://api.example.com/api",
 *   sseUrl: "https://api.example.com/stream",
 * });
 *
 * // Connect to subscription manager
 * subscriptionManager.setTransport(transport);
 *
 * // Connect SSE
 * await transport.connect();
 * ```
 */
export class SSESubscriptionTransport implements SubscriptionTransport {
	private eventSource: EventSource | null = null;
	private options: Required<Omit<SSELinkOptions, "onReconnect" | "onDisconnect" | "headers">> & {
		headers?: SSELinkOptions["headers"];
		onReconnect?: () => void;
		onDisconnect?: () => void;
	};
	private state: SSEState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private updateHandler: ((message: UpdateMessage) => void) | null = null;
	private pendingMessages: ServerMessage[] = [];
	private clientId: string | null = null;

	/** State change listeners */
	private stateListeners = new Set<(state: SSEState) => void>();

	/** Track active subscriptions for recovery */
	private activeSubscriptions = new Map<string, ServerMessage>();

	/** Whether this is a reconnection (vs initial connect) */
	private isReconnection = false;

	constructor(options: SSELinkOptions) {
		this.options = {
			url: options.url,
			sseUrl: options.sseUrl ?? `${options.url}/stream`,
			headers: options.headers,
			fetch: options.fetch ?? fetch,
			reconnectDelay: options.reconnectDelay ?? 3000,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
			onReconnect: options.onReconnect,
			onDisconnect: options.onDisconnect,
		};
	}

	// ===========================================================================
	// SubscriptionTransport Interface
	// ===========================================================================

	/**
	 * Send subscription message to server
	 */
	send(message: ServerMessage): void {
		// Track subscriptions for recovery
		this.trackSubscription(message);

		if (this.state !== "connected") {
			// Queue message for when connected
			this.pendingMessages.push(message);
			return;
		}

		// Send via HTTP POST
		this.sendToServer(message);
	}

	/**
	 * Track subscription for recovery after reconnect
	 */
	private trackSubscription(message: ServerMessage): void {
		if (message.type === "subscribe") {
			const key = `${message.entity}:${message.id}`;
			this.activeSubscriptions.set(key, message);
		} else if (message.type === "unsubscribe") {
			const key = `${message.entity}:${message.id}`;
			if (message.fields === "*") {
				this.activeSubscriptions.delete(key);
			}
		}
	}

	/**
	 * Send message to server via HTTP
	 */
	private async sendToServer(message: ServerMessage): Promise<void> {
		try {
			const headers = await this.resolveHeaders();

			await this.options.fetch(`${this.options.url}/subscription`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({
					clientId: this.clientId,
					...message,
				}),
			});
		} catch (error) {
			console.error("Failed to send subscription message:", error);
		}
	}

	/**
	 * Set handler for incoming updates
	 */
	onUpdate(handler: (message: UpdateMessage) => void): void {
		this.updateHandler = handler;
	}

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Connect to SSE server
	 */
	async connect(): Promise<void> {
		if (this.state === "connected" || this.state === "connecting") {
			return;
		}

		this.setState("connecting");

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("SSE connection timeout"));
				this.eventSource?.close();
			}, 10000);

			try {
				// Build SSE URL with client ID if we have one
				let sseUrl = this.options.sseUrl;
				if (this.clientId) {
					const separator = sseUrl.includes("?") ? "&" : "?";
					sseUrl = `${sseUrl}${separator}clientId=${this.clientId}`;
				}

				this.eventSource = new EventSource(sseUrl);

				this.eventSource.onopen = () => {
					clearTimeout(timeout);
					this.setState("connected");
					this.reconnectAttempts = 0;
					this.flushPendingMessages();

					// Handle reconnection
					if (this.isReconnection) {
						this.resyncSubscriptions();
						this.options.onReconnect?.();
					}
					this.isReconnection = true;

					resolve();
				};

				this.eventSource.onerror = () => {
					clearTimeout(timeout);
					if (this.state === "connecting") {
						reject(new Error("SSE connection failed"));
					}
					this.handleDisconnect();
				};

				// Handle different event types
				this.eventSource.addEventListener("connected", (event) => {
					try {
						const data = JSON.parse((event as MessageEvent).data) as { clientId: string };
						this.clientId = data.clientId;
					} catch {
						// Ignore parse errors
					}
				});

				this.eventSource.addEventListener("update", (event) => {
					this.handleUpdateMessage(event);
				});

				// Legacy: also listen for "data" event type
				this.eventSource.addEventListener("data", (event) => {
					this.handleUpdateMessage(event);
				});
			} catch (error) {
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	/**
	 * Handle update message from SSE
	 */
	private handleUpdateMessage(event: Event): void {
		try {
			const data = JSON.parse((event as MessageEvent).data) as UpdateMessage;

			if (data.type === "update" && this.updateHandler) {
				this.updateHandler(data);
			}
		} catch {
			// Ignore parse errors
		}
	}

	/**
	 * Disconnect from SSE server
	 */
	disconnect(): void {
		this.stopReconnect();

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.setState("disconnected");
	}

	/**
	 * Get current connection state
	 */
	getState(): SSEState {
		return this.state;
	}

	/**
	 * Get client ID (assigned by server)
	 */
	getClientId(): string | null {
		return this.clientId;
	}

	/**
	 * Subscribe to state changes
	 */
	onStateChange(listener: (state: SSEState) => void): () => void {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}

	// ===========================================================================
	// Reconnection
	// ===========================================================================

	private handleDisconnect(): void {
		this.eventSource = null;

		// Notify disconnect
		this.options.onDisconnect?.();

		// Attempt reconnection
		if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
			this.setState("reconnecting");
			this.scheduleReconnect();
		} else {
			this.setState("disconnected");
			console.error("SSE max reconnection attempts reached");
		}
	}

	private scheduleReconnect(): void {
		const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts);
		this.reconnectAttempts++;

		this.reconnectTimer = setTimeout(() => {
			this.connect().catch((error) => {
				console.error("SSE reconnection failed:", error);
			});
		}, delay);
	}

	private stopReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.reconnectAttempts = 0;
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	private setState(state: SSEState): void {
		this.state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private flushPendingMessages(): void {
		if (this.state !== "connected") return;

		for (const message of this.pendingMessages) {
			this.sendToServer(message);
		}
		this.pendingMessages = [];
	}

	/**
	 * Resync all active subscriptions after reconnection
	 */
	private resyncSubscriptions(): void {
		if (this.state !== "connected") return;

		for (const message of this.activeSubscriptions.values()) {
			this.sendToServer(message);
		}
	}

	private async resolveHeaders(): Promise<Record<string, string>> {
		if (!this.options.headers) return {};
		if (typeof this.options.headers === "function") {
			return this.options.headers();
		}
		return this.options.headers;
	}

	/**
	 * Clear all tracked subscriptions
	 */
	clearSubscriptions(): void {
		this.activeSubscriptions.clear();
	}

	/**
	 * Get count of tracked subscriptions
	 */
	getSubscriptionCount(): number {
		return this.activeSubscriptions.size;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create SSE subscription transport
 */
export function createSSETransport(options: SSELinkOptions): SSESubscriptionTransport {
	return new SSESubscriptionTransport(options);
}

// =============================================================================
// SSE Link (Original API for link chain)
// =============================================================================

/**
 * SSE link - uses Server-Sent Events for both queries and subscriptions
 *
 * Self-sufficient transport that handles all operation types:
 * - Queries: Open SSE, get first value, close
 * - Subscriptions: Open SSE, stream values, keep alive
 * - Mutations: HTTP POST
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink(),
 *     sseLink({
 *       url: "http://localhost:3000/api",
 *     }),
 *   ],
 * });
 *
 * // Query via SSE (get first value)
 * const user = await client.User.get("123");
 *
 * // Subscription via SSE (streaming)
 * client.User.get("123").subscribe(user => {
 *   console.log("Updated:", user);
 * });
 * ```
 */
export function sseLink(options: SSELinkOptions): Link {
	const { url, headers = {}, fetch: customFetch = fetch } = options;

	return (): LinkFn => {
		return async (op, _next): Promise<OperationResult> => {
			const resolvedHeaders = typeof headers === "function" ? await headers() : headers;

			// Mutations use HTTP POST
			if (op.type === "mutation") {
				const response = await customFetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...resolvedHeaders,
					},
					body: JSON.stringify({
						entity: op.entity,
						operation: op.op,
						type: op.type,
						input: op.input,
					}),
				});

				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as { message?: string };
					return { error: new Error(errorData.message || `HTTP ${response.status}`) };
				}

				const result = (await response.json()) as { data: unknown };
				return { data: result.data };
			}

			// Queries and Subscriptions use SSE
			// Build SSE URL with operation details
			const params = new URLSearchParams({
				entity: op.entity,
				operation: op.op,
				type: op.type,
				input: JSON.stringify(op.input),
				operationId: op.id,
			});

			const sseUrl = `${url}?${params.toString()}`;

			// For queries: Get first value and close
			if (op.type === "query") {
				return new Promise((resolve, reject) => {
					const eventSource = new EventSource(sseUrl);
					let resolved = false;

					const cleanup = () => {
						if (!resolved) {
							resolved = true;
							eventSource.close();
						}
					};

					// Set timeout for query
					const timeout = setTimeout(() => {
						cleanup();
						reject(new Error("SSE query timeout"));
					}, 30000);

					eventSource.addEventListener("data", (event) => {
						try {
							const data = JSON.parse((event as MessageEvent).data) as { data: unknown };
							clearTimeout(timeout);
							cleanup();
							resolve({ data: data.data });
						} catch (error) {
							clearTimeout(timeout);
							cleanup();
							reject(error);
						}
					});

					eventSource.addEventListener("error", (event) => {
						clearTimeout(timeout);
						cleanup();
						reject(new Error("SSE connection error"));
					});
				});
			}

			// For subscriptions: Return observable that streams values
			if (op.type === "subscription") {
				// We need to return data immediately (for compatibility)
				// The observable will be used by QueryResult.subscribe()

				// Create observable that opens SSE connection
				const observable: Observable<unknown> = {
					subscribe(observer: Observer<unknown>): Unsubscribable {
						const eventSource = new EventSource(sseUrl);
						let active = true;

						eventSource.addEventListener("data", (event) => {
							if (!active) return;
							try {
								const data = JSON.parse((event as MessageEvent).data) as { data: unknown };
								observer.next(data.data);
							} catch (error) {
								observer.error(error as Error);
							}
						});

						eventSource.addEventListener("error", () => {
							if (!active) return;
							observer.error(new Error("SSE connection error"));
						});

						return {
							unsubscribe() {
								active = false;
								eventSource.close();
								observer.complete();
							},
						};
					},
				};

				// For subscriptions, we return empty data and the observable
				// The QueryResult will use the observable for streaming
				return { data: null, meta: { observable } };
			}

			return { error: new Error(`Unsupported operation type: ${op.type}`) };
		};
	};
}
