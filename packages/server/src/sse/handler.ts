/**
 * @lens/server - SSE Handler
 *
 * Server-Sent Events handler for streaming entity updates.
 */

// =============================================================================
// Types
// =============================================================================

/** SSE client connection */
export interface SSEClient {
	id: string;
	send: (event: string, data: unknown) => void;
	close: () => void;
}

/** SSE subscription for entity updates */
export interface SSESubscription {
	subscriptionId: string;
	entity: string;
	entityId: string;
	select?: Record<string, unknown>;
}

/** SSE handler configuration */
export interface SSEHandlerConfig {
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
}

// =============================================================================
// SSE Handler
// =============================================================================

/**
 * SSE handler for streaming entity updates
 *
 * @example
 * ```typescript
 * const sseHandler = new SSEHandler();
 *
 * // Handle SSE connection
 * app.get('/stream', (req) => sseHandler.handleConnection(req));
 *
 * // Subscribe client to entity
 * sseHandler.addSubscription(clientId, {
 *   subscriptionId: 'sub-1',
 *   entity: 'User',
 *   entityId: 'user-123',
 * });
 *
 * // Broadcast entity update
 * sseHandler.broadcastToEntity('User', 'user-123', updatedUser);
 * ```
 */
export class SSEHandler {
	private clients = new Map<string, SSEClient>();
	private subscriptions = new Map<string, SSESubscription[]>();
	private heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>();
	private config: Required<SSEHandlerConfig>;
	private clientCounter = 0;

	constructor(config: SSEHandlerConfig = {}) {
		this.config = {
			heartbeatInterval: config.heartbeatInterval ?? 30000,
		};
	}

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Handle new SSE connection
	 */
	handleConnection(req: Request): Response {
		const clientId = `sse_${++this.clientCounter}_${Date.now()}`;

		const stream = new ReadableStream({
			start: (controller) => {
				const encoder = new TextEncoder();

				const client: SSEClient = {
					id: clientId,
					send: (event: string, data: unknown) => {
						const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
						controller.enqueue(encoder.encode(message));
					},
					close: () => {
						controller.close();
						this.removeClient(clientId);
					},
				};

				this.clients.set(clientId, client);
				client.send("connected", { clientId });

				// Heartbeat
				const heartbeat = setInterval(() => {
					try {
						client.send("heartbeat", { timestamp: Date.now() });
					} catch {
						this.removeClient(clientId);
					}
				}, this.config.heartbeatInterval);

				this.heartbeatIntervals.set(clientId, heartbeat);
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

	private removeClient(clientId: string): void {
		const heartbeat = this.heartbeatIntervals.get(clientId);
		if (heartbeat) {
			clearInterval(heartbeat);
			this.heartbeatIntervals.delete(clientId);
		}
		this.clients.delete(clientId);
		this.subscriptions.delete(clientId);
	}

	// ===========================================================================
	// Entity Subscriptions
	// ===========================================================================

	/**
	 * Add subscription for entity updates
	 */
	addSubscription(clientId: string, subscription: SSESubscription): void {
		const subs = this.subscriptions.get(clientId) ?? [];
		subs.push(subscription);
		this.subscriptions.set(clientId, subs);
	}

	/**
	 * Remove subscription
	 */
	removeSubscription(clientId: string, subscriptionId: string): void {
		const subs = this.subscriptions.get(clientId);
		if (subs) {
			const filtered = subs.filter((s) => s.subscriptionId !== subscriptionId);
			this.subscriptions.set(clientId, filtered);
		}
	}

	/**
	 * Broadcast data to all subscribers of an entity
	 */
	broadcastToEntity(entity: string, entityId: string, data: unknown): void {
		for (const [clientId, subs] of this.subscriptions) {
			const client = this.clients.get(clientId);
			if (!client) continue;

			for (const sub of subs) {
				if (sub.entity === entity && sub.entityId === entityId) {
					client.send("data", {
						type: "data",
						subscriptionId: sub.subscriptionId,
						data,
					});
				}
			}
		}
	}

	/**
	 * Broadcast update to all subscribers of an entity
	 */
	broadcastUpdate(entity: string, entityId: string, update: unknown): void {
		for (const [clientId, subs] of this.subscriptions) {
			const client = this.clients.get(clientId);
			if (!client) continue;

			for (const sub of subs) {
				if (sub.entity === entity && sub.entityId === entityId) {
					client.send("update", {
						type: "update",
						subscriptionId: sub.subscriptionId,
						data: update,
					});
				}
			}
		}
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Send message to specific client
	 */
	sendToClient(clientId: string, event: string, data: unknown): void {
		const client = this.clients.get(clientId);
		if (client) {
			client.send(event, data);
		}
	}

	/**
	 * Broadcast to all clients
	 */
	broadcast(event: string, data: unknown): void {
		for (const client of this.clients.values()) {
			client.send(event, data);
		}
	}

	/**
	 * Get connected client count
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Check if client is connected
	 */
	isClientConnected(clientId: string): boolean {
		return this.clients.has(clientId);
	}

	/**
	 * Close all connections
	 */
	closeAll(): void {
		for (const client of this.clients.values()) {
			client.close();
		}
		this.clients.clear();
		this.subscriptions.clear();

		for (const heartbeat of this.heartbeatIntervals.values()) {
			clearInterval(heartbeat);
		}
		this.heartbeatIntervals.clear();
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create SSE handler
 */
export function createSSEHandler(config?: SSEHandlerConfig): SSEHandler {
	return new SSEHandler(config);
}
