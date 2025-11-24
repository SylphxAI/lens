/**
 * @lens/client - WebSocket Subscription Link
 *
 * WebSocket transport for real-time field-level subscriptions.
 * Integrates with SubscriptionManager for push updates.
 */

import type { SubscriptionTransport, ServerMessage, UpdateMessage } from "../reactive";
import type { Link, LinkFn, OperationContext, OperationResult, NextLink } from "./types";

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
// WebSocket Link (for Link chain integration)
// =============================================================================

/**
 * WebSocket link for real-time subscriptions in Link chain.
 *
 * Note: This is a passthrough link that sets up WebSocket transport.
 * Actual subscription handling is done by SubscriptionManager.
 *
 * @example
 * ```typescript
 * const client = createReactiveClient({
 *   links: [
 *     loggerLink(),
 *     httpLink({ url: "/api" }),
 *   ],
 * });
 *
 * // Set up WebSocket separately
 * const wsTransport = createWebSocketTransport({ url: "wss://api.example.com/ws" });
 * await wsTransport.connect();
 * client.$setSubscriptionTransport(wsTransport);
 * ```
 */
export function websocketLink(options: WebSocketLinkOptions): Link {
	let transport: WebSocketSubscriptionTransport | null = null;

	return () => {
		// Initialize transport on first call
		if (!transport) {
			transport = new WebSocketSubscriptionTransport(options);
			// Auto-connect
			transport.connect().catch((error) => {
				console.error("WebSocket auto-connect failed:", error);
			});
		}

		// This is a passthrough link - it doesn't handle operations
		// It's only used to set up the WebSocket transport
		return async (
			operation: OperationContext,
			next: NextLink,
		): Promise<OperationResult> => {
			return next(operation);
		};
	};
}
