/**
 * @lens/server - SSE Transport Adapter
 *
 * Thin transport adapter for Server-Sent Events.
 * Connects SSE streams to GraphStateManager.
 */

import { GraphStateManager, type StateClient } from "../state/graph-state-manager";

// =============================================================================
// Types
// =============================================================================

/** SSE handler configuration */
export interface SSEHandlerConfig {
	/** GraphStateManager instance (required) */
	stateManager: GraphStateManager;
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
}

/** SSE client info */
export interface SSEClientInfo {
	id: string;
	connectedAt: number;
}

// =============================================================================
// SSE Handler (Transport Adapter)
// =============================================================================

/**
 * SSE transport adapter for GraphStateManager.
 *
 * This is a thin adapter that:
 * - Creates SSE connections
 * - Registers clients with GraphStateManager
 * - Forwards updates to SSE streams
 *
 * All state/subscription logic is handled by GraphStateManager.
 *
 * @example
 * ```typescript
 * const stateManager = new GraphStateManager();
 * const sse = new SSEHandler({ stateManager });
 *
 * // Handle SSE connection
 * app.get('/events', (req) => sse.handleConnection(req));
 *
 * // Subscribe via separate endpoint or message
 * stateManager.subscribe(clientId, "Post", "123", "*");
 * ```
 */
export class SSEHandler {
	private stateManager: GraphStateManager;
	private heartbeatInterval: number;
	private clients = new Map<string, { controller: ReadableStreamDefaultController; heartbeat: ReturnType<typeof setInterval> }>();
	private clientCounter = 0;

	constructor(config: SSEHandlerConfig) {
		this.stateManager = config.stateManager;
		this.heartbeatInterval = config.heartbeatInterval ?? 30000;
	}

	/**
	 * Handle new SSE connection
	 * Returns a Response with SSE stream
	 */
	handleConnection(req?: Request): Response {
		const clientId = `sse_${++this.clientCounter}_${Date.now()}`;
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			start: (controller) => {
				// Register with GraphStateManager
				const stateClient: StateClient = {
					id: clientId,
					send: (msg) => {
						try {
							const data = `data: ${JSON.stringify(msg)}\n\n`;
							controller.enqueue(encoder.encode(data));
						} catch {
							// Connection closed
							this.removeClient(clientId);
						}
					},
				};
				this.stateManager.addClient(stateClient);

				// Send connected event
				controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`));

				// Setup heartbeat
				const heartbeat = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
					} catch {
						this.removeClient(clientId);
					}
				}, this.heartbeatInterval);

				// Track client
				this.clients.set(clientId, { controller, heartbeat });
			},
			cancel: () => {
				this.removeClient(clientId);
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	/**
	 * Remove client and cleanup
	 */
	private removeClient(clientId: string): void {
		const client = this.clients.get(clientId);
		if (client) {
			clearInterval(client.heartbeat);
			this.clients.delete(clientId);
		}
		this.stateManager.removeClient(clientId);
	}

	/**
	 * Close specific client connection
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
	 * Get connected client count
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get connected client IDs
	 */
	getClientIds(): string[] {
		return Array.from(this.clients.keys());
	}

	/**
	 * Close all connections
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
 * Create SSE handler (transport adapter)
 */
export function createSSEHandler(config: SSEHandlerConfig): SSEHandler {
	return new SSEHandler(config);
}

