/**
 * @sylphx/lens-client - WebSocket Transport
 *
 * WebSocket transport for Lens client.
 * Handles all operations over WebSocket with native streaming for subscriptions.
 * Supports version-based reconnection for seamless state recovery.
 */

import {
	applyPatch,
	DEFAULT_RECONNECT_CONFIG,
	decompressIfNeeded,
	generateReconnectId,
	isCompressedPayload,
	type PatchOperation,
	PROTOCOL_VERSION,
	type ReconnectAckMessage,
	type ReconnectConfig,
	type ReconnectMessage,
	type ReconnectResult,
	type Version,
} from "@sylphx/lens-core";
import { SubscriptionRegistry } from "../reconnect/subscription-registry.js";
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
 * WebSocket transport options.
 */
export interface WsTransportOptions {
	/** WebSocket URL */
	url: string;
	/** Reconnect options */
	reconnect?: Partial<ReconnectConfig>;
	/** Connection timeout in ms (default: 10000) */
	timeout?: number;
	/** Callback when connection state changes */
	onConnectionStateChange?: (state: ConnectionState) => void;
	/** Callback when reconnection completes */
	onReconnect?: (results: ReconnectResult[]) => void;
}

// Re-export ConnectionState from types for convenience
export type { ConnectionState } from "./types.js";

/**
 * Internal message types.
 */
interface WsMessage {
	type:
		| "handshake"
		| "operation"
		| "response"
		| "subscription"
		| "unsubscribe"
		| "error"
		| "reconnect"
		| "reconnect_ack";
	id?: string;
	data?: unknown;
	/** Update command for incremental updates (stateless architecture) */
	update?: import("@sylphx/lens-core").EmitCommand;
	error?: { message: string };
	// For subscription updates with version
	version?: Version;
	entity?: string;
	entityId?: string;
	// For reconnect_ack
	results?: ReconnectResult[];
	serverTime?: number;
	reconnectId?: string;
	processingTime?: number;
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * Extended transport with reconnection support.
 */
export interface WsTransportInstance extends Transport {
	/** Get subscription registry for testing/debugging */
	getRegistry(): SubscriptionRegistry;
	/** Get current connection state */
	getConnectionState(): ConnectionState;
}

/**
 * WebSocket transport function
 */
export type WsTransport = (options: WsTransportOptions) => WsTransportInstance;

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
export const ws: WsTransport = function ws(options: WsTransportOptions): WsTransportInstance {
	const { url, reconnect = {}, timeout = 10000, onConnectionStateChange, onReconnect } = options;

	// Merge with defaults
	const reconnectConfig: ReconnectConfig = {
		...DEFAULT_RECONNECT_CONFIG,
		...reconnect,
	};

	let socket: WebSocket | null = null;
	let metadata: Metadata | null = null;
	let reconnectAttempts = 0;
	let isConnecting = false;
	let connectionState: ConnectionState = "disconnected";
	let pendingReconnect: string | null = null; // Pending reconnect ID

	// Subscription registry for version tracking
	const registry = new SubscriptionRegistry();

	// Pending operations waiting for response
	const pendingOperations = new Map<
		string,
		{
			resolve: (result: Result) => void;
			reject: (error: Error) => void;
		}
	>();

	// Simple subscription observer map (registry handles version tracking)
	const subscriptionObservers = new Map<
		string,
		{
			observer: {
				next?: (result: Result) => void;
				error?: (error: Error) => void;
				complete?: () => void;
			};
			// Subscription metadata for registry
			entity?: string;
			entityId?: string;
			fields?: string[] | "*";
			input?: unknown;
		}
	>();

	/**
	 * Update connection state and notify callback.
	 */
	function setConnectionState(state: ConnectionState): void {
		if (connectionState !== state) {
			connectionState = state;
			onConnectionStateChange?.(state);
		}
	}

	/**
	 * Create WebSocket connection.
	 */
	async function createConnection(): Promise<WebSocket> {
		setConnectionState("connecting");

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);

			const timeoutId = setTimeout(() => {
				ws.close();
				setConnectionState("disconnected");
				reject(new Error("WebSocket connection timeout"));
			}, timeout);

			ws.onopen = () => {
				clearTimeout(timeoutId);
				reconnectAttempts = 0;
				setConnectionState("connected");
				resolve(ws);
			};

			ws.onerror = (_event) => {
				clearTimeout(timeoutId);
				setConnectionState("disconnected");
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
				const subInfo = subscriptionObservers.get(message.id!);
				if (subInfo) {
					if (message.error) {
						registry.markError(message.id!);
						subInfo.observer.error?.(new Error(message.error.message));
					} else {
						// Update version in registry if provided
						if (message.version !== undefined && message.data !== undefined) {
							registry.updateVersion(
								message.id!,
								message.version,
								message.data as Record<string, unknown>,
							);
						}
						// Forward full Result (data and/or update) for stateless architecture
						const result: Result = {};
						if (message.data !== undefined) result.data = message.data;
						if (message.update !== undefined) result.update = message.update;
						subInfo.observer.next?.(result);
					}
				}
				break;
			}

			case "reconnect_ack": {
				handleReconnectAck(message as unknown as ReconnectAckMessage);
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
	 * Handle reconnect acknowledgment from server.
	 */
	async function handleReconnectAck(ack: ReconnectAckMessage): Promise<void> {
		// Verify this is the reconnect we're waiting for
		if (ack.reconnectId !== pendingReconnect) {
			return;
		}
		pendingReconnect = null;

		// Process each subscription result (handles decompression)
		for (const result of ack.results) {
			await processReconnectResult(result);
		}

		// Notify callback
		onReconnect?.(ack.results);
	}

	/**
	 * Process a single reconnect result.
	 * Handles decompression of compressed snapshots.
	 */
	async function processReconnectResult(result: ReconnectResult): Promise<void> {
		const subInfo = subscriptionObservers.get(result.id);
		if (!subInfo) return;

		switch (result.status) {
			case "current":
				// Client is up-to-date, just mark as active
				registry.processReconnectResult(result.id, result.version);
				registry.markActive(result.id);
				break;

			case "patched": {
				// Apply patches to bring client up-to-date
				const lastData = registry.getLastData(result.id);
				if (lastData && result.patches) {
					let current = lastData;
					// Apply each patch set in order
					for (const patchSet of result.patches) {
						current = applyPatch(current, patchSet as PatchOperation[]);
					}
					registry.processReconnectResult(result.id, result.version, current);
					// Notify observer with updated data
					subInfo.observer.next?.({ data: current });
				} else {
					// No local data to patch, treat as snapshot needed
					registry.markError(result.id);
				}
				break;
			}

			case "snapshot": {
				// Full state replacement (may be compressed)
				if (result.data) {
					// Decompress if needed
					const data = isCompressedPayload(result.data)
						? await decompressIfNeeded<Record<string, unknown>>(result.data)
						: result.data;

					registry.processReconnectResult(result.id, result.version, data);
					subInfo.observer.next?.({ data });
				}
				break;
			}

			case "deleted":
				// Entity was deleted
				registry.remove(result.id);
				subscriptionObservers.delete(result.id);
				subInfo.observer.next?.({ data: null });
				subInfo.observer.complete?.();
				break;

			case "error":
				// Error processing subscription
				registry.markError(result.id);
				subInfo.observer.error?.(new Error(result.error ?? "Reconnect failed"));
				break;
		}
	}

	/**
	 * Handle disconnection.
	 */
	function handleDisconnect(): void {
		socket = null;
		setConnectionState("disconnected");

		// Reject all pending operations
		for (const [_id, pending] of pendingOperations) {
			pending.reject(new Error("WebSocket disconnected"));
		}
		pendingOperations.clear();

		// Mark all subscriptions as reconnecting (don't notify error yet)
		registry.markAllReconnecting();

		// Notify subscriptions of disconnect (temporary error)
		for (const [_id, sub] of subscriptionObservers) {
			sub.observer.error?.(new Error("WebSocket disconnected"));
		}

		// Attempt reconnect with exponential backoff
		if (reconnectConfig.enabled && reconnectAttempts < reconnectConfig.maxAttempts) {
			reconnectAttempts++;

			// Calculate delay with exponential backoff and jitter
			let delay = reconnectConfig.baseDelay * 2 ** (reconnectAttempts - 1);
			delay = Math.min(delay, reconnectConfig.maxDelay);

			// Add jitter
			const jitter = delay * reconnectConfig.jitter * (Math.random() * 2 - 1);
			delay = Math.max(0, delay + jitter);

			setConnectionState("reconnecting");

			setTimeout(async () => {
				try {
					await ensureConnection();
					// Send reconnect message to restore subscriptions
					await sendReconnectMessage();
				} catch {
					// Will retry again via handleDisconnect
				}
			}, delay);
		} else if (reconnectAttempts >= reconnectConfig.maxAttempts) {
			// Max attempts reached, notify all subscriptions of permanent failure
			registry.notifyAllReconnectingError(new Error("Max reconnect attempts reached"));
		}
	}

	/**
	 * Send reconnect message to restore subscriptions.
	 */
	async function sendReconnectMessage(): Promise<void> {
		const ws = socket;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		// Get subscriptions to reconnect
		const subscriptions = registry.getAllForReconnect();
		if (subscriptions.length === 0) {
			return;
		}

		// Generate reconnect ID for deduplication
		const reconnectId = generateReconnectId();
		pendingReconnect = reconnectId;

		// Build and send reconnect message
		const message: ReconnectMessage = {
			type: "reconnect",
			protocolVersion: PROTOCOL_VERSION,
			subscriptions,
			reconnectId,
			clientTime: Date.now(),
		};

		ws.send(JSON.stringify(message));
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
						// Extract entity info from path and input
						// Path format: "entity.subscribe" or "entity.watch"
						const pathParts = op.path.split(".");
						const entity = pathParts[0] ?? "unknown";
						const entityId = ((op.input as Record<string, unknown>)?.id as string) ?? "unknown";
						const fields = (op.input as Record<string, unknown>)?.fields as string[] | undefined;

						// Store in observer map for message handling
						subscriptionObservers.set(op.id, {
							observer,
							entity,
							entityId,
							fields: fields ?? "*",
							input: op.input,
						});

						// Register in subscription registry for reconnection
						registry.add({
							id: op.id,
							entity,
							entityId,
							fields: fields ?? "*",
							version: 0,
							lastData: null,
							observer: {
								next: (result) => observer.next?.({ data: result.data }),
								error: (error) => observer.error?.(error),
								complete: () => observer.complete?.(),
							},
							input: op.input,
						});

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
								// Remove from registry and observers
								registry.remove(op.id);
								subscriptionObservers.delete(op.id);

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

		/**
		 * Get subscription registry for testing/debugging.
		 */
		getRegistry(): SubscriptionRegistry {
			return registry;
		},

		/**
		 * Get current connection state.
		 */
		getConnectionState(): ConnectionState {
			return connectionState;
		},
	};
};
