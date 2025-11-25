/**
 * @sylphx/client - WebSocket Transport
 *
 * WebSocket implementation of Transport for Lens client.
 * Implements the operations protocol with field-level subscriptions.
 */

import type { Transport } from "./create";
import { type Update, applyUpdate } from "@sylphx/core";

// =============================================================================
// Types
// =============================================================================

/** WebSocket transport options */
export interface WebSocketTransportOptions {
	/** WebSocket URL */
	url: string;
	/** Reconnection delay in ms (default: 1000) */
	reconnectDelay?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Connection timeout in ms (default: 5000) */
	connectionTimeout?: number;
	/** Request timeout in ms (default: 30000) */
	requestTimeout?: number;
	/** Called when connected */
	onConnect?: () => void;
	/** Called when disconnected */
	onDisconnect?: () => void;
	/** Called when reconnected */
	onReconnect?: () => void;
}

/** Transport state */
export type WebSocketState = "connecting" | "connected" | "disconnected" | "reconnecting";

/** Pending request */
interface PendingRequest {
	resolve: (data: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/** Active subscription */
interface ActiveSubscription {
	id: string;
	operation: string;
	input: unknown;
	fields: string[] | "*";
	callbacks: {
		onData: (data: unknown) => void;
		onUpdate: (updates: Record<string, Update>) => void;
		onError: (error: Error) => void;
		onComplete: () => void;
	};
	lastData: unknown;
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * WebSocket transport for Lens client.
 * Implements the operations protocol with field-level subscriptions.
 */
export class WebSocketTransport implements Transport {
	private ws: WebSocket | null = null;
	private state: WebSocketState = "disconnected";
	private messageIdCounter = 0;

	/** Pending one-time requests */
	private pending = new Map<string, PendingRequest>();

	/** Active subscriptions */
	private subscriptions = new Map<string, ActiveSubscription>();

	/** Options */
	private options: Required<WebSocketTransportOptions>;

	/** Reconnection state */
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: WebSocketTransportOptions) {
		this.options = {
			reconnectDelay: 1000,
			maxReconnectAttempts: 10,
			connectionTimeout: 5000,
			requestTimeout: 30000,
			onConnect: () => {},
			onDisconnect: () => {},
			onReconnect: () => {},
			...options,
		};
	}

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	async connect(): Promise<void> {
		if (this.state === "connected") return;

		return new Promise((resolve, reject) => {
			this.state = "connecting";

			const timeout = setTimeout(() => {
				reject(new Error("Connection timeout"));
			}, this.options.connectionTimeout);

			try {
				this.ws = new WebSocket(this.options.url);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					this.state = "connected";
					this.reconnectAttempts = 0;

					// Perform handshake
					this.sendMessage({ type: "handshake", id: this.nextId() });

					if (this.reconnectAttempts > 0) {
						this.options.onReconnect();
						this.resubscribeAll();
					} else {
						this.options.onConnect();
					}

					resolve();
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data);
				};

				this.ws.onclose = () => {
					this.handleDisconnect();
				};

				this.ws.onerror = (error) => {
					clearTimeout(timeout);
					reject(new Error("WebSocket error"));
				};
			} catch (error) {
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	disconnect(): void {
		this.state = "disconnected";

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		// Reject all pending requests
		for (const [id, { reject, timeout }] of this.pending) {
			clearTimeout(timeout);
			reject(new Error("Disconnected"));
		}
		this.pending.clear();

		// Complete all subscriptions
		for (const sub of this.subscriptions.values()) {
			sub.callbacks.onComplete();
		}
		this.subscriptions.clear();
	}

	private handleDisconnect(): void {
		const wasConnected = this.state === "connected";
		this.state = "disconnected";
		this.ws = null;

		if (wasConnected) {
			this.options.onDisconnect();
		}

		// Attempt reconnection
		if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
			this.state = "reconnecting";
			this.reconnectAttempts++;

			this.reconnectTimer = setTimeout(() => {
				this.connect().catch(() => {
					// Will retry on next disconnect
				});
			}, this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1));
		}
	}

	private resubscribeAll(): void {
		// Resubscribe all active subscriptions after reconnect
		for (const sub of this.subscriptions.values()) {
			this.sendMessage({
				type: "subscribe",
				id: sub.id,
				operation: sub.operation,
				input: sub.input,
				fields: sub.fields,
			});
		}
	}

	// ===========================================================================
	// Message Handling
	// ===========================================================================

	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data);

			switch (message.type) {
				case "handshake":
					// Handshake response - nothing to do
					break;

				case "result":
					this.handleResult(message);
					break;

				case "data":
					this.handleData(message);
					break;

				case "update":
					this.handleUpdate(message);
					break;

				case "error":
					this.handleError(message);
					break;

				case "complete":
					this.handleComplete(message);
					break;
			}
		} catch (error) {
			console.error("Failed to parse message:", error);
		}
	}

	private handleResult(message: { id: string; data: unknown }): void {
		const pending = this.pending.get(message.id);
		if (pending) {
			clearTimeout(pending.timeout);
			this.pending.delete(message.id);
			pending.resolve(message.data);
		}
	}

	private handleData(message: { id: string; data: unknown }): void {
		// Data message for subscription - full data
		const sub = this.subscriptions.get(message.id);
		if (sub) {
			sub.lastData = message.data;
			sub.callbacks.onData(message.data);
		}

		// Also check pending (for one-time queries that return data)
		const pending = this.pending.get(message.id);
		if (pending) {
			clearTimeout(pending.timeout);
			this.pending.delete(message.id);
			pending.resolve(message.data);
		}
	}

	private handleUpdate(message: { id: string; updates: Record<string, Update> }): void {
		const sub = this.subscriptions.get(message.id);
		if (sub) {
			// Apply updates to last data
			if (sub.lastData && typeof sub.lastData === "object") {
				const updated = { ...(sub.lastData as Record<string, unknown>) };
				for (const [field, update] of Object.entries(message.updates)) {
					updated[field] = applyUpdate(updated[field], update);
				}
				sub.lastData = updated;
				sub.callbacks.onUpdate(message.updates);
				sub.callbacks.onData(updated);
			}
		}
	}

	private handleError(message: { id: string; error: { code: string; message: string } }): void {
		const pending = this.pending.get(message.id);
		if (pending) {
			clearTimeout(pending.timeout);
			this.pending.delete(message.id);
			pending.reject(new Error(message.error.message));
		}

		const sub = this.subscriptions.get(message.id);
		if (sub) {
			sub.callbacks.onError(new Error(message.error.message));
		}
	}

	private handleComplete(message: { id: string }): void {
		const sub = this.subscriptions.get(message.id);
		if (sub) {
			this.subscriptions.delete(message.id);
			sub.callbacks.onComplete();
		}
	}

	// ===========================================================================
	// Transport Interface
	// ===========================================================================

	subscribe(
		operation: string,
		input: unknown,
		fields: string[] | "*",
		callbacks: {
			onData: (data: unknown) => void;
			onUpdate: (updates: Record<string, Update>) => void;
			onError: (error: Error) => void;
			onComplete: () => void;
		},
		/** SelectionObject for nested field selection */
		select?: Record<string, unknown>,
	): { unsubscribe: () => void; updateFields: (add?: string[], remove?: string[]) => void } {
		const id = this.nextId();

		const sub: ActiveSubscription = {
			id,
			operation,
			input,
			fields,
			callbacks,
			lastData: null,
		};

		this.subscriptions.set(id, sub);

		// Send subscribe message with SelectionObject
		this.sendMessage({
			type: "subscribe",
			id,
			operation,
			input,
			fields,
			select,  // Include SelectionObject for nested resolution
		});

		return {
			unsubscribe: () => {
				this.subscriptions.delete(id);
				this.sendMessage({ type: "unsubscribe", id });
			},
			updateFields: (add?: string[], remove?: string[]) => {
				// Handle 最大原則 (Maximum Principle) transitions:
				// 1. Upgrade: specific fields → "*" (add contains ["*"])
				// 2. Downgrade: "*" → specific fields (remove contains ["*"], add contains new fields)

				// Check for upgrade to full subscription
				if (add?.includes("*")) {
					sub.fields = "*";
					this.sendMessage({
						type: "updateFields",
						id,
						addFields: ["*"],
						removeFields: undefined,
					});
					return;
				}

				// Check for downgrade from full subscription
				if (sub.fields === "*" && remove?.includes("*")) {
					// Switching from "*" to specific fields
					// The 'add' array contains the fields we want to subscribe to
					sub.fields = add ? [...add] : [];
					this.sendMessage({
						type: "updateFields",
						id,
						// Tell server: switch from * to these specific fields
						setFields: sub.fields,  // New message type for replacing all fields
					});
					return;
				}

				// Normal field add/remove (when not subscribed to "*")
				if (sub.fields === "*") return;  // Already subscribed to all, no-op for regular adds

				const fieldsSet = new Set(sub.fields);
				add?.forEach((f) => fieldsSet.add(f));
				remove?.forEach((f) => fieldsSet.delete(f));
				sub.fields = Array.from(fieldsSet);

				this.sendMessage({
					type: "updateFields",
					id,
					addFields: add,
					removeFields: remove,
				});
			},
		};
	}

	async query(
		operation: string,
		input: unknown,
		fields?: string[] | "*",
		/** SelectionObject for nested field selection */
		select?: Record<string, unknown>,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = this.nextId();

			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Request timeout"));
			}, this.options.requestTimeout);

			this.pending.set(id, { resolve, reject, timeout });

			this.sendMessage({
				type: "query",
				id,
				operation,
				input,
				fields,
				select,  // Include SelectionObject for nested resolution
			});
		});
	}

	async mutate(operation: string, input: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = this.nextId();

			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Request timeout"));
			}, this.options.requestTimeout);

			this.pending.set(id, { resolve, reject, timeout });

			this.sendMessage({
				type: "mutation",
				id,
				operation,
				input,
			});
		});
	}

	// ===========================================================================
	// Helpers
	// ===========================================================================

	private nextId(): string {
		return `msg_${++this.messageIdCounter}`;
	}

	private sendMessage(message: unknown): void {
		if (this.ws && this.state === "connected") {
			this.ws.send(JSON.stringify(message));
		}
	}

	/** Get current connection state */
	getState(): WebSocketState {
		return this.state;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create WebSocket transport
 */
export function createWebSocketTransport(
	options: WebSocketTransportOptions,
): WebSocketTransport {
	return new WebSocketTransport(options);
}

/**
 * Create WebSocket transport (alias)
 */
export function websocketTransport(
	options: WebSocketTransportOptions,
): WebSocketTransport {
	return new WebSocketTransport(options);
}
