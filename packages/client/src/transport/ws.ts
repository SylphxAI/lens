/**
 * @sylphx/lens-client - WebSocket Transport
 *
 * WebSocket transport for Lens client.
 * Handles all operations over WebSocket with native streaming for subscriptions.
 */

import type { Metadata, Observable, Operation, Result, Transport } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * WebSocket transport options.
 */
export interface WsTransportOptions {
	/** WebSocket URL */
	url: string;
	/** Reconnect options */
	reconnect?: {
		/** Enable auto-reconnect (default: true) */
		enabled?: boolean;
		/** Maximum reconnect attempts (default: 10) */
		maxAttempts?: number;
		/** Base delay between reconnects in ms (default: 1000) */
		delay?: number;
	};
	/** Connection timeout in ms (default: 10000) */
	timeout?: number;
}

/**
 * Internal message types.
 */
interface WsMessage {
	type: "handshake" | "operation" | "response" | "subscription" | "unsubscribe" | "error";
	id?: string;
	data?: unknown;
	error?: { message: string };
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * WebSocket transport function
 */
export type WsTransport = (options: WsTransportOptions) => Transport;

/**
 * Create WebSocket transport.
 *
 * Handles:
 * - Queries via WebSocket message
 * - Mutations via WebSocket message
 * - Subscriptions via native WebSocket streaming
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: ws({ url: 'ws://localhost:3000' }),
 * })
 * ```
 */
export const ws: WsTransport = function ws(options: WsTransportOptions): Transport {
	const { url, reconnect = {}, timeout = 10000 } = options;

	const {
		enabled: reconnectEnabled = true,
		maxAttempts = 10,
		delay: reconnectDelay = 1000,
	} = reconnect;

	let socket: WebSocket | null = null;
	let metadata: Metadata | null = null;
	let reconnectAttempts = 0;
	let isConnecting = false;

	// Pending operations waiting for response
	const pendingOperations = new Map<
		string,
		{
			resolve: (result: Result) => void;
			reject: (error: Error) => void;
		}
	>();

	// Active subscriptions
	const subscriptions = new Map<
		string,
		{
			observer: {
				next?: (result: Result) => void;
				error?: (error: Error) => void;
				complete?: () => void;
			};
		}
	>();

	/**
	 * Create WebSocket connection.
	 */
	async function createConnection(): Promise<WebSocket> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);

			const timeoutId = setTimeout(() => {
				ws.close();
				reject(new Error("WebSocket connection timeout"));
			}, timeout);

			ws.onopen = () => {
				clearTimeout(timeoutId);
				reconnectAttempts = 0;
				resolve(ws);
			};

			ws.onerror = (_event) => {
				clearTimeout(timeoutId);
				reject(new Error("WebSocket connection error"));
			};

			ws.onclose = () => {
				handleDisconnect();
			};

			ws.onmessage = (event) => {
				handleMessage(JSON.parse(event.data as string) as WsMessage);
			};
		});
	}

	/**
	 * Handle incoming message.
	 */
	function handleMessage(message: WsMessage): void {
		switch (message.type) {
			case "response": {
				const pending = pendingOperations.get(message.id!);
				if (pending) {
					pendingOperations.delete(message.id!);
					if (message.error) {
						pending.resolve({ error: new Error(message.error.message) });
					} else {
						pending.resolve({ data: message.data });
					}
				}
				break;
			}

			case "subscription": {
				const sub = subscriptions.get(message.id!);
				if (sub) {
					if (message.error) {
						sub.observer.error?.(new Error(message.error.message));
					} else {
						sub.observer.next?.({ data: message.data });
					}
				}
				break;
			}

			case "error": {
				const pending = pendingOperations.get(message.id!);
				if (pending) {
					pendingOperations.delete(message.id!);
					pending.resolve({ error: new Error(message.error?.message ?? "Unknown error") });
				}
				break;
			}
		}
	}

	/**
	 * Handle disconnection.
	 */
	function handleDisconnect(): void {
		socket = null;

		// Reject all pending operations
		for (const [_id, pending] of pendingOperations) {
			pending.reject(new Error("WebSocket disconnected"));
		}
		pendingOperations.clear();

		// Notify all subscriptions
		for (const [_id, sub] of subscriptions) {
			sub.observer.error?.(new Error("WebSocket disconnected"));
		}

		// Attempt reconnect
		if (reconnectEnabled && reconnectAttempts < maxAttempts) {
			reconnectAttempts++;
			const delay = reconnectDelay * 2 ** (reconnectAttempts - 1);
			setTimeout(async () => {
				try {
					await ensureConnection();
					// Resubscribe all subscriptions
					// (subscriptions would need to be re-initiated by the client)
				} catch {
					// Will retry again
				}
			}, delay);
		}
	}

	/**
	 * Ensure socket is connected.
	 */
	async function ensureConnection(): Promise<WebSocket> {
		if (socket && socket.readyState === WebSocket.OPEN) {
			return socket;
		}

		if (isConnecting) {
			// Wait for existing connection attempt
			return new Promise((resolve, reject) => {
				const check = setInterval(() => {
					if (socket && socket.readyState === WebSocket.OPEN) {
						clearInterval(check);
						resolve(socket);
					} else if (!isConnecting) {
						clearInterval(check);
						reject(new Error("Connection failed"));
					}
				}, 100);
			});
		}

		isConnecting = true;
		try {
			socket = await createConnection();
			return socket;
		} finally {
			isConnecting = false;
		}
	}

	/**
	 * Send message and wait for response.
	 */
	async function sendAndWait(op: Operation): Promise<Result> {
		const ws = await ensureConnection();

		return new Promise((resolve, reject) => {
			pendingOperations.set(op.id, { resolve, reject });

			ws.send(
				JSON.stringify({
					type: "operation",
					id: op.id,
					path: op.path,
					opType: op.type,
					input: op.input,
				}),
			);

			// Timeout for response
			setTimeout(() => {
				if (pendingOperations.has(op.id)) {
					pendingOperations.delete(op.id);
					resolve({ error: new Error("Operation timeout") });
				}
			}, timeout);
		});
	}

	return {
		/**
		 * Connect and perform handshake.
		 */
		async connect(): Promise<Metadata> {
			const ws = await ensureConnection();

			return new Promise((resolve, reject) => {
				const timeoutId = setTimeout(() => {
					reject(new Error("Handshake timeout"));
				}, timeout);

				const messageHandler = (event: MessageEvent) => {
					const message = JSON.parse(event.data as string) as WsMessage;
					if (message.type === "handshake") {
						clearTimeout(timeoutId);
						ws.removeEventListener("message", messageHandler);
						metadata = message.data as Metadata;
						resolve(metadata);
					}
				};

				ws.addEventListener("message", messageHandler);
				ws.send(JSON.stringify({ type: "handshake" }));
			});
		},

		/**
		 * Execute operation.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			if (op.type === "subscription") {
				return {
					subscribe(observer) {
						// Store subscription
						subscriptions.set(op.id, { observer });

						// Send subscribe message
						ensureConnection().then((ws) => {
							ws.send(
								JSON.stringify({
									type: "subscription",
									id: op.id,
									path: op.path,
									input: op.input,
								}),
							);
						});

						return {
							unsubscribe() {
								subscriptions.delete(op.id);
								if (socket && socket.readyState === WebSocket.OPEN) {
									socket.send(
										JSON.stringify({
											type: "unsubscribe",
											id: op.id,
										}),
									);
								}
							},
						};
					},
				};
			}

			return sendAndWait(op);
		},
	};
};
