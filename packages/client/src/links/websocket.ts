/**
 * @lens/client - WebSocket Link (Terminal)
 *
 * WebSocket terminal link for queries, mutations, and subscriptions.
 * Also includes WebSocketSubscriptionTransport for reactive systems.
 */

import type { SubscriptionTransport, ServerMessage, UpdateMessage } from "../reactive";
import type { Link, LinkFn, OperationContext, OperationResult, Observable, Observer, Unsubscribable } from "./types";

// =============================================================================
// Types
// =============================================================================

/** WebSocket link options */
export interface WebSocketLinkOptions {
	/** WebSocket URL */
	url: string;
	/** Reconnection delay in ms (default: 1000) */
	reconnectDelay?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
	/** Connection timeout in ms (default: 5000) */
	connectionTimeout?: number;
	/** Called when reconnected - use to refetch stale data */
	onReconnect?: () => void;
	/** Called when connection is lost */
	onDisconnect?: () => void;
}

/** WebSocket connection state */
export type WebSocketState = "connecting" | "connected" | "disconnected" | "reconnecting";

/** Client subscribe message */
interface ClientSubscribeMessage {
	type: "subscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Client unsubscribe message */
interface ClientUnsubscribeMessage {
	type: "unsubscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Server update message */
interface ServerUpdateMessageWS {
	type: "update";
	entity: string;
	id: string;
	field: string;
	update: {
		strategy: "value" | "delta" | "patch";
		data: unknown;
	};
}

/** Server handshake response */
interface ServerHandshakeResponse {
	type: "handshake";
	id: string;
	version: string;
	plugins: Array<{
		name: string;
		version?: string;
		config?: Record<string, unknown>;
	}>;
	schemaHash?: string;
}

/** Server message types */
type ServerMessageWS =
	| { type: "connected"; clientId: string }
	| { type: "heartbeat"; timestamp: number }
	| ServerHandshakeResponse
	| ServerUpdateMessageWS;

// =============================================================================
// WebSocketSubscriptionTransport
// =============================================================================

/**
 * WebSocket transport for real-time subscriptions.
 *
 * Implements SubscriptionTransport interface for use with SubscriptionManager.
 *
 * @example
 * ```typescript
 * const transport = new WebSocketSubscriptionTransport({
 *   url: "wss://api.example.com/subscriptions",
 * });
 *
 * // Connect to subscription manager
 * subscriptionManager.setTransport(transport);
 *
 * // Connect WebSocket
 * await transport.connect();
 * ```
 */
export class WebSocketSubscriptionTransport implements SubscriptionTransport {
	private ws: WebSocket | null = null;
	private options: Required<Omit<WebSocketLinkOptions, "onReconnect" | "onDisconnect">> & {
		onReconnect?: () => void;
		onDisconnect?: () => void;
	};
	private state: WebSocketState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private updateHandler: ((message: UpdateMessage) => void) | null = null;
	private pendingMessages: ServerMessage[] = [];
	private clientId: string | null = null;

	/** State change listeners */
	private stateListeners = new Set<(state: WebSocketState) => void>();

	/** Server handshake info */
	private serverInfo: ServerHandshakeResponse | null = null;
	private handshakeResolve: ((info: ServerHandshakeResponse) => void) | null = null;
	private handshakeHandler: ((info: ServerHandshakeResponse) => void) | null = null;

	/** Track active subscriptions for recovery */
	private activeSubscriptions = new Map<string, ServerMessage>();

	/** Whether this is a reconnection (vs initial connect) */
	private isReconnection = false;

	constructor(options: WebSocketLinkOptions) {
		this.options = {
			url: options.url,
			reconnectDelay: options.reconnectDelay ?? 1000,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
			heartbeatInterval: options.heartbeatInterval ?? 30000,
			connectionTimeout: options.connectionTimeout ?? 5000,
			onReconnect: options.onReconnect,
			onDisconnect: options.onDisconnect,
		};
	}

	// ===========================================================================
	// SubscriptionTransport Interface
	// ===========================================================================

	/**
	 * Send message to server
	 */
	send(message: ServerMessage): void {
		// Track subscriptions for recovery
		this.trackSubscription(message);

		if (this.state !== "connected" || !this.ws) {
			// Queue message for when connected
			this.pendingMessages.push(message);
			return;
		}

		this.ws.send(JSON.stringify(message));
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
			// If unsubscribing all fields, remove tracking
			if (message.fields === "*") {
				this.activeSubscriptions.delete(key);
			}
			// For partial unsubscribe, we'd need more sophisticated tracking
			// For now, keep the subscription tracked (server handles field-level)
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
	 * Connect to WebSocket server
	 */
	async connect(): Promise<void> {
		if (this.state === "connected" || this.state === "connecting") {
			return;
		}

		this.setState("connecting");

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("WebSocket connection timeout"));
				this.ws?.close();
			}, this.options.connectionTimeout);

			try {
				this.ws = new WebSocket(this.options.url);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					this.setState("connected");
					this.reconnectAttempts = 0;
					this.startHeartbeat();
					this.flushPendingMessages();

					// Handle reconnection: resync subscriptions and notify
					if (this.isReconnection) {
						this.resyncSubscriptions();
						this.options.onReconnect?.();
					}
					this.isReconnection = true;

					resolve();
				};

				this.ws.onclose = (event) => {
					clearTimeout(timeout);
					this.handleDisconnect(event);
				};

				this.ws.onerror = (error) => {
					clearTimeout(timeout);
					if (this.state === "connecting") {
						reject(new Error("WebSocket connection failed"));
					}
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data);
				};
			} catch (error) {
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	/**
	 * Disconnect from WebSocket server
	 */
	disconnect(): void {
		this.stopReconnect();
		this.stopHeartbeat();

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.setState("disconnected");
	}

	/**
	 * Get current connection state
	 */
	getState(): WebSocketState {
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
	onStateChange(listener: (state: WebSocketState) => void): () => void {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}

	/**
	 * Send handshake and wait for server response
	 * Returns server info including version and enabled plugins
	 */
	async handshake(clientVersion?: string): Promise<ServerHandshakeResponse> {
		if (this.state !== "connected" || !this.ws) {
			throw new Error("Cannot handshake: not connected");
		}

		// If already have server info, return it
		if (this.serverInfo) {
			return this.serverInfo;
		}

		// Send handshake request
		const handshakeId = `handshake_${Date.now()}`;
		this.ws.send(
			JSON.stringify({
				type: "handshake",
				id: handshakeId,
				clientVersion,
			}),
		);

		// Wait for response
		return new Promise<ServerHandshakeResponse>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.handshakeResolve = null;
				reject(new Error("Handshake timeout"));
			}, this.options.connectionTimeout);

			this.handshakeResolve = (info) => {
				clearTimeout(timeout);
				this.serverInfo = info;
				resolve(info);
			};
		});
	}

	/**
	 * Get server info from last handshake
	 */
	getServerInfo(): ServerHandshakeResponse | null {
		return this.serverInfo;
	}

	/**
	 * Set handler for handshake responses
	 * Called when server sends plugin/config info
	 */
	onHandshake(handler: (info: ServerHandshakeResponse) => void): () => void {
		this.handshakeHandler = handler;
		return () => {
			this.handshakeHandler = null;
		};
	}

	// ===========================================================================
	// Message Handling
	// ===========================================================================

	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as ServerMessageWS;

			switch (message.type) {
				case "connected":
					this.clientId = message.clientId;
					break;

				case "heartbeat":
					// Server is alive
					break;

				case "handshake":
					// Server handshake response with plugin info
					if (this.handshakeResolve) {
						this.handshakeResolve(message);
						this.handshakeResolve = null;
					}
					// Also call handler if set
					this.handshakeHandler?.(message);
					break;

				case "update":
					if (this.updateHandler) {
						this.updateHandler({
							type: "update",
							entity: message.entity,
							id: message.id,
							field: message.field,
							update: message.update,
						});
					}
					break;
			}
		} catch (error) {
			console.error("Failed to parse WebSocket message:", error);
		}
	}

	// ===========================================================================
	// Reconnection
	// ===========================================================================

	private handleDisconnect(event: CloseEvent): void {
		this.stopHeartbeat();
		this.ws = null;

		// Notify disconnect
		this.options.onDisconnect?.();

		if (event.wasClean) {
			this.setState("disconnected");
			return;
		}

		// Attempt reconnection
		if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
			this.setState("reconnecting");
			this.scheduleReconnect();
		} else {
			this.setState("disconnected");
			console.error("WebSocket max reconnection attempts reached");
		}
	}

	private scheduleReconnect(): void {
		const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts);
		this.reconnectAttempts++;

		this.reconnectTimer = setTimeout(() => {
			this.connect().catch((error) => {
				console.error("WebSocket reconnection failed:", error);
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
	// Heartbeat
	// ===========================================================================

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify({ type: "ping" }));
			}
		}, this.options.heartbeatInterval);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	private setState(state: WebSocketState): void {
		this.state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private flushPendingMessages(): void {
		if (!this.ws || this.state !== "connected") return;

		for (const message of this.pendingMessages) {
			this.ws.send(JSON.stringify(message));
		}
		this.pendingMessages = [];
	}

	/**
	 * Resync all active subscriptions after reconnection
	 */
	private resyncSubscriptions(): void {
		if (!this.ws || this.state !== "connected") return;

		for (const message of this.activeSubscriptions.values()) {
			this.ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Clear all tracked subscriptions (useful for testing or reset)
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
 * Create WebSocket subscription transport
 *
 * @example
 * ```typescript
 * const transport = createWebSocketTransport({
 *   url: "wss://api.example.com/subscriptions",
 * });
 *
 * await transport.connect();
 * subscriptionManager.setTransport(transport);
 * ```
 */
export function createWebSocketTransport(
	options: WebSocketLinkOptions,
): WebSocketSubscriptionTransport {
	return new WebSocketSubscriptionTransport(options);
}

// =============================================================================
// WebSocket Link (Terminal)
// =============================================================================

/**
 * WebSocket terminal link for real-time communication.
 *
 * Handles all operation types:
 * - Queries: Send query message, wait for response
 * - Mutations: Send mutation message, wait for response
 * - Subscriptions: Return Observable that streams updates
 *
 * @example
 * ```typescript
 * const client = createClient<Api>({
 *   links: [
 *     loggerLink(),
 *     retryLink({ maxRetries: 3 }),
 *     websocketLink({ url: "ws://localhost:3000" }),  // Terminal link
 *   ],
 * });
 * ```
 */
export function websocketLink(options: WebSocketLinkOptions): Link {
	let ws: WebSocket | null = null;
	let messageIdCounter = 0;
	let connectionPromise: Promise<void> | null = null;
	let reconnectAttempts = 0;
	let isConnected = false;

	// Pending requests awaiting response
	const pending = new Map<
		string,
		{
			resolve: (result: OperationResult) => void;
			reject: (error: Error) => void;
			timeout: ReturnType<typeof setTimeout>;
		}
	>();

	// Active subscriptions
	const subscriptions = new Map<
		string,
		{
			observer: Observer<unknown>;
			operationId: string;
		}
	>();

	const {
		url,
		reconnectDelay = 1000,
		maxReconnectAttempts = 10,
		connectionTimeout = 5000,
		onReconnect,
		onDisconnect,
	} = options;
	const requestTimeout = 30000;

	function nextId(): string {
		return `msg_${++messageIdCounter}`;
	}

	function connect(): Promise<void> {
		if (connectionPromise) return connectionPromise;
		if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();

		connectionPromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("WebSocket connection timeout"));
			}, connectionTimeout);

			try {
				ws = new WebSocket(url);

				ws.onopen = () => {
					clearTimeout(timeout);
					isConnected = true;
					reconnectAttempts = 0;
					connectionPromise = null;
					resolve();
				};

				ws.onmessage = (event) => {
					handleMessage(event.data);
				};

				ws.onclose = () => {
					isConnected = false;
					connectionPromise = null;
					onDisconnect?.();
					scheduleReconnect();
				};

				ws.onerror = () => {
					clearTimeout(timeout);
					reject(new Error("WebSocket connection failed"));
				};
			} catch (error) {
				clearTimeout(timeout);
				connectionPromise = null;
				reject(error);
			}
		});

		return connectionPromise;
	}

	function scheduleReconnect(): void {
		if (reconnectAttempts >= maxReconnectAttempts) return;

		setTimeout(() => {
			reconnectAttempts++;
			connect()
				.then(() => {
					onReconnect?.();
					// Resubscribe active subscriptions
					for (const [subId, sub] of subscriptions) {
						sendMessage({
							type: "subscribe",
							id: sub.operationId,
							// Would need to store operation info to resubscribe properly
						});
					}
				})
				.catch(() => {
					// Will retry on next disconnect
				});
		}, reconnectDelay * Math.pow(2, reconnectAttempts));
	}

	function sendMessage(message: unknown): void {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	function handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as {
				type: string;
				id?: string;
				data?: unknown;
				error?: { message: string };
			};

			switch (message.type) {
				case "result":
				case "data": {
					const p = pending.get(message.id!);
					if (p) {
						clearTimeout(p.timeout);
						pending.delete(message.id!);
						p.resolve({ data: message.data });
					}
					// Also notify subscription if active
					const sub = subscriptions.get(message.id!);
					if (sub) {
						sub.observer.next(message.data);
					}
					break;
				}

				case "error": {
					const p = pending.get(message.id!);
					if (p) {
						clearTimeout(p.timeout);
						pending.delete(message.id!);
						p.resolve({ error: new Error(message.error?.message || "Unknown error") });
					}
					const sub = subscriptions.get(message.id!);
					if (sub) {
						sub.observer.error(new Error(message.error?.message || "Unknown error"));
						subscriptions.delete(message.id!);
					}
					break;
				}

				case "complete": {
					const sub = subscriptions.get(message.id!);
					if (sub) {
						sub.observer.complete();
						subscriptions.delete(message.id!);
					}
					break;
				}
			}
		} catch (error) {
			console.error("Failed to parse WebSocket message:", error);
		}
	}

	return (): LinkFn => {
		return async (op, _next): Promise<OperationResult> => {
			// Ensure connected
			try {
				await connect();
			} catch (error) {
				return { error: error as Error };
			}

			const msgId = nextId();

			// Handle subscriptions specially - return Observable
			if (op.type === "subscription") {
				const observable: Observable<unknown> = {
					subscribe(observer: Observer<unknown>): Unsubscribable {
						// Store subscription
						subscriptions.set(msgId, { observer, operationId: msgId });

						// Send subscribe message
						sendMessage({
							type: "subscribe",
							id: msgId,
							entity: op.entity,
							operation: op.op,
							input: op.input,
						});

						return {
							unsubscribe() {
								subscriptions.delete(msgId);
								sendMessage({ type: "unsubscribe", id: msgId });
							},
						};
					},
				};

				return { data: null, meta: { observable } };
			}

			// Queries and mutations: send and wait for response
			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					pending.delete(msgId);
					resolve({ error: new Error("Request timeout") });
				}, requestTimeout);

				pending.set(msgId, { resolve, reject: () => {}, timeout });

				sendMessage({
					type: op.type,
					id: msgId,
					entity: op.entity,
					operation: op.op,
					input: op.input,
				});
			});
		};
	};
}
