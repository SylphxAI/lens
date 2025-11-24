/**
 * @lens/client - WebSocket Link V2
 *
 * WebSocket transport for operations-based API (V2 protocol).
 * Supports query/mutation message types.
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLinkV2({ url: 'ws://localhost:3000' })],
 * });
 * ```
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

// =============================================================================
// Types
// =============================================================================

/** WebSocket link V2 options */
export interface WebSocketLinkV2Options {
	/** WebSocket URL */
	url: string;
	/** Reconnection delay in ms (default: 1000) */
	reconnectDelay?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Connection timeout in ms (default: 5000) */
	connectionTimeout?: number;
	/** Called when connected */
	onConnect?: () => void;
	/** Called when disconnected */
	onDisconnect?: () => void;
	/** Called when reconnected */
	onReconnect?: () => void;
}

/** WebSocket connection state */
export type WebSocketV2State = "connecting" | "connected" | "disconnected" | "reconnecting";

/** Pending request */
interface PendingRequest {
	resolve: (result: OperationResult) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

// =============================================================================
// Message Types (V2 Protocol)
// =============================================================================

/** Client query message */
interface QueryMessage {
	type: "query";
	id: string;
	name: string;
	input?: unknown;
}

/** Client mutation message */
interface MutationMessage {
	type: "mutation";
	id: string;
	name: string;
	input: unknown;
}

/** Client handshake message */
interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

/** Server data response (for queries) */
interface DataResponse {
	type: "data";
	id: string;
	data: unknown;
}

/** Server result response (for mutations) */
interface ResultResponse {
	type: "result";
	id: string;
	data: unknown;
}

/** Server error response */
interface ErrorResponse {
	type: "error";
	id: string;
	error: {
		code: string;
		message: string;
	};
}

/** Server handshake response */
interface HandshakeResponse {
	type: "handshake";
	id: string;
	version: string;
	queries: string[];
	mutations: string[];
}

type ServerMessage = DataResponse | ResultResponse | ErrorResponse | HandshakeResponse;

// =============================================================================
// WebSocket Transport V2
// =============================================================================

/**
 * WebSocket transport for V2 operations protocol
 */
export class WebSocketTransportV2 {
	private ws: WebSocket | null = null;
	private state: WebSocketV2State = "disconnected";
	private pendingRequests = new Map<string, PendingRequest>();
	private messageId = 0;
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private options: WebSocketLinkV2Options) {}

	/** Get current state */
	getState(): WebSocketV2State {
		return this.state;
	}

	/** Connect to WebSocket server */
	async connect(): Promise<void> {
		if (this.state === "connected" || this.state === "connecting") {
			return;
		}

		this.state = "connecting";

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Connection timeout"));
				this.ws?.close();
			}, this.options.connectionTimeout ?? 5000);

			try {
				this.ws = new WebSocket(this.options.url);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					this.state = "connected";
					this.reconnectAttempts = 0;
					this.options.onConnect?.();
					resolve();
				};

				this.ws.onclose = () => {
					this.handleDisconnect();
				};

				this.ws.onerror = (event) => {
					clearTimeout(timeout);
					if (this.state === "connecting") {
						reject(new Error("WebSocket connection failed"));
					}
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data as string);
				};
			} catch (err) {
				clearTimeout(timeout);
				reject(err);
			}
		});
	}

	/** Disconnect from WebSocket server */
	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.onclose = null; // Prevent reconnect
			this.ws.close();
			this.ws = null;
		}

		this.state = "disconnected";

		// Reject all pending requests
		for (const [id, request] of this.pendingRequests) {
			clearTimeout(request.timeout);
			request.reject(new Error("Connection closed"));
		}
		this.pendingRequests.clear();
	}

	/** Execute a query */
	async query(name: string, input?: unknown): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: QueryMessage = {
			type: "query",
			id,
			name,
			input,
		};

		return this.sendRequest(id, message);
	}

	/** Execute a mutation */
	async mutate(name: string, input: unknown): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: MutationMessage = {
			type: "mutation",
			id,
			name,
			input,
		};

		return this.sendRequest(id, message);
	}

	/** Perform handshake */
	async handshake(): Promise<HandshakeResponse> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: HandshakeMessage = {
			type: "handshake",
			id,
		};

		return this.sendRequest(id, message) as Promise<HandshakeResponse>;
	}

	private async ensureConnected(): Promise<void> {
		if (this.state !== "connected") {
			await this.connect();
		}
	}

	private nextId(): string {
		return `${Date.now()}-${++this.messageId}`;
	}

	private sendRequest(id: string, message: object): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error("Request timeout"));
			}, 30000); // 30 second timeout

			this.pendingRequests.set(id, { resolve, reject, timeout });

			this.ws?.send(JSON.stringify(message));
		});
	}

	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as ServerMessage;

			if (message.type === "error") {
				const request = this.pendingRequests.get(message.id);
				if (request) {
					clearTimeout(request.timeout);
					this.pendingRequests.delete(message.id);
					request.reject(new Error(message.error.message));
				}
				return;
			}

			if (message.type === "data" || message.type === "result") {
				const request = this.pendingRequests.get(message.id);
				if (request) {
					clearTimeout(request.timeout);
					this.pendingRequests.delete(message.id);
					request.resolve({ data: message.data });
				}
				return;
			}

			if (message.type === "handshake") {
				const request = this.pendingRequests.get(message.id);
				if (request) {
					clearTimeout(request.timeout);
					this.pendingRequests.delete(message.id);
					request.resolve({ data: message });
				}
				return;
			}
		} catch (err) {
			console.error("Failed to parse WebSocket message:", err);
		}
	}

	private handleDisconnect(): void {
		const wasConnected = this.state === "connected";
		this.state = "disconnected";

		if (wasConnected) {
			this.options.onDisconnect?.();
		}

		// Reject pending requests
		for (const [id, request] of this.pendingRequests) {
			clearTimeout(request.timeout);
			request.reject(new Error("Connection lost"));
		}
		this.pendingRequests.clear();

		// Attempt reconnect
		this.attemptReconnect();
	}

	private attemptReconnect(): void {
		const maxAttempts = this.options.maxReconnectAttempts ?? 10;

		if (this.reconnectAttempts >= maxAttempts) {
			return;
		}

		this.state = "reconnecting";
		this.reconnectAttempts++;

		const delay = this.options.reconnectDelay ?? 1000;

		this.reconnectTimer = setTimeout(async () => {
			try {
				await this.connect();
				this.options.onReconnect?.();
			} catch {
				this.attemptReconnect();
			}
		}, delay * this.reconnectAttempts);
	}
}

// =============================================================================
// Link Factory
// =============================================================================

/**
 * Create WebSocket link for V2 operations protocol
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [
 *     loggerLink(),
 *     websocketLinkV2({ url: 'ws://localhost:3000' }),
 *   ],
 * });
 * ```
 */
export function websocketLinkV2(options: WebSocketLinkV2Options): Link {
	let transport: WebSocketTransportV2 | null = null;

	return (): LinkFn => {
		// Lazy init transport
		if (!transport) {
			transport = new WebSocketTransportV2(options);
		}

		return async (op: OperationContext): Promise<OperationResult> => {
			try {
				if (op.type === "query") {
					const result = await transport!.query(op.op, op.input);
					// Result is already { data: ... } from transport
					return result as OperationResult;
				}

				if (op.type === "mutation") {
					const result = await transport!.mutate(op.op, op.input);
					// Result is already { data: ... } from transport
					return result as OperationResult;
				}

				return { error: new Error(`Unknown operation type: ${op.type}`) };
			} catch (err) {
				return { error: err instanceof Error ? err : new Error(String(err)) };
			}
		};
	};
}

/**
 * Create WebSocket transport V2 (for direct use)
 */
export function createWebSocketTransportV2(
	options: WebSocketLinkV2Options,
): WebSocketTransportV2 {
	return new WebSocketTransportV2(options);
}
