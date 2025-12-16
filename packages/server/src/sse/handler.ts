/**
 * @sylphx/lens-server - SSE Handler
 *
 * Pure transport handler for Server-Sent Events.
 * No state management - just handles SSE connection lifecycle and message sending.
 */

// =============================================================================
// Types
// =============================================================================

/** SSE handler configuration */
export interface SSEHandlerConfig {
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
	/** Called when a client connects */
	onConnect?: (client: SSEClient) => void;
	/** Called when a client disconnects */
	onDisconnect?: (clientId: string) => void;
}

/** SSE client handle for sending messages */
export interface SSEClient {
	/** Unique client ID */
	id: string;
	/** Send a message to this client */
	send: (message: unknown) => void;
	/** Send a named event to this client */
	sendEvent: (event: string, data: unknown) => void;
	/** Close this client's connection */
	close: () => void;
}

// =============================================================================
// SSE Handler
// =============================================================================

/**
 * Pure SSE transport handler.
 *
 * This handler ONLY manages:
 * - SSE connection lifecycle
 * - Message sending to clients
 * - Heartbeat keepalive
 *
 * It does NOT know about:
 * - State management
 * - Subscriptions
 * - Plugins
 *
 * @example
 * ```typescript
 * const sse = new SSEHandler({
 *   onConnect: (client) => {
 *     console.log('Client connected:', client.id);
 *     // Register with your state management here
 *   },
 *   onDisconnect: (clientId) => {
 *     console.log('Client disconnected:', clientId);
 *     // Cleanup your state management here
 *   },
 * });
 *
 * // Handle SSE connection
 * app.get('/events', (req) => sse.handleConnection(req));
 *
 * // Send message to specific client
 * sse.send(clientId, { type: 'update', data: {...} });
 * ```
 */
export class SSEHandler {
	private heartbeatInterval: number;
	private onConnectCallback: ((client: SSEClient) => void) | undefined;
	private onDisconnectCallback: ((clientId: string) => void) | undefined;
	private clients = new Map<
		string,
		{
			controller: ReadableStreamDefaultController;
			heartbeat: ReturnType<typeof setInterval>;
			encoder: TextEncoder;
		}
	>();
	private clientCounter = 0;

	constructor(config: SSEHandlerConfig = {}) {
		this.heartbeatInterval = config.heartbeatInterval ?? 30000;
		this.onConnectCallback = config.onConnect;
		this.onDisconnectCallback = config.onDisconnect;
	}

	/**
	 * Handle new SSE connection.
	 * Returns a Response with SSE stream.
	 */
	handleConnection(_req?: Request): Response {
		const clientId = `sse_${++this.clientCounter}_${Date.now()}`;
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			start: (controller) => {
				// Setup heartbeat
				const heartbeat = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
					} catch {
						this.removeClient(clientId);
					}
				}, this.heartbeatInterval);

				// Track client
				this.clients.set(clientId, { controller, heartbeat, encoder });

				// Send connected event
				controller.enqueue(
					encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`),
				);

				// Create client handle and notify
				const client: SSEClient = {
					id: clientId,
					send: (message: unknown) => this.send(clientId, message),
					sendEvent: (event: string, data: unknown) => this.sendEvent(clientId, event, data),
					close: () => this.closeClient(clientId),
				};
				this.onConnectCallback?.(client);
			},
			cancel: () => {
				this.removeClient(clientId);
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	/**
	 * Send a message to a specific client.
	 */
	send(clientId: string, message: unknown): boolean {
		const client = this.clients.get(clientId);
		if (!client) return false;

		try {
			const data = `data: ${JSON.stringify(message)}\n\n`;
			client.controller.enqueue(client.encoder.encode(data));
			return true;
		} catch {
			this.removeClient(clientId);
			return false;
		}
	}

	/**
	 * Send a named event to a specific client.
	 * Event names are validated to prevent header injection attacks.
	 */
	sendEvent(clientId: string, event: string, data: unknown): boolean {
		const client = this.clients.get(clientId);
		if (!client) return false;

		// Validate event name to prevent SSE header injection
		// Event names must not contain newlines, carriage returns, or colons
		if (/[\r\n:]/.test(event)) {
			return false;
		}

		try {
			const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
			client.controller.enqueue(client.encoder.encode(message));
			return true;
		} catch {
			this.removeClient(clientId);
			return false;
		}
	}

	/**
	 * Broadcast a message to all connected clients.
	 */
	broadcast(message: unknown): void {
		for (const clientId of this.clients.keys()) {
			this.send(clientId, message);
		}
	}

	/**
	 * Remove client and cleanup.
	 */
	private removeClient(clientId: string): void {
		const client = this.clients.get(clientId);
		if (client) {
			clearInterval(client.heartbeat);
			this.clients.delete(clientId);
			this.onDisconnectCallback?.(clientId);
		}
	}

	/**
	 * Close specific client connection.
	 */
	closeClient(clientId: string): void {
		const client = this.clients.get(clientId);
		if (client) {
			try {
				client.controller.close();
			} catch {
				// Already closed
			}
			this.removeClient(clientId);
		}
	}

	/**
	 * Get connected client count.
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get connected client IDs.
	 */
	getClientIds(): string[] {
		return Array.from(this.clients.keys());
	}

	/**
	 * Check if a client is connected.
	 */
	hasClient(clientId: string): boolean {
		return this.clients.has(clientId);
	}

	/**
	 * Close all connections.
	 */
	closeAll(): void {
		for (const clientId of this.clients.keys()) {
			this.closeClient(clientId);
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create SSE handler (pure transport).
 */
export function createSSEHandler(config: SSEHandlerConfig = {}): SSEHandler {
	return new SSEHandler(config);
}
