/**
 * @lens/client - HTTP Transport
 *
 * HTTP-based transport for environments without WebSocket support.
 * Uses polling for subscriptions.
 */

import type {
	Transport,
	TransportConfig,
	ConnectionState,
	SubscribeInput,
	QueryInput,
	MutateInput,
	ServerMessage,
} from "./types";

// =============================================================================
// Types
// =============================================================================

export interface HttpTransportConfig extends Omit<TransportConfig, "url"> {
	/** HTTP base URL */
	url: string;
	/** Poll interval for subscriptions (ms) */
	pollInterval?: number;
	/** Request headers */
	headers?: Record<string, string>;
}

// =============================================================================
// HTTP Transport Implementation
// =============================================================================

/**
 * HTTP-based transport implementation
 *
 * @example
 * ```typescript
 * const transport = new HttpTransport({
 *   url: 'http://localhost:3000',
 *   headers: { 'Authorization': 'Bearer token' },
 * });
 * ```
 */
export class HttpTransport implements Transport {
	private config: Required<Omit<HttpTransportConfig, "httpUrl" | "autoReconnect" | "maxReconnectAttempts" | "reconnectDelay">> & Partial<HttpTransportConfig>;
	private _state: ConnectionState = "disconnected";
	private stateListeners = new Set<(state: ConnectionState) => void>();
	private messageListeners = new Set<(message: ServerMessage) => void>();
	private subscriptions = new Map<string, { input: SubscribeInput; interval: ReturnType<typeof setInterval> }>();
	private subscriptionCounter = 0;

	constructor(config: HttpTransportConfig) {
		this.config = {
			url: config.url,
			pollInterval: config.pollInterval ?? 5000,
			headers: config.headers ?? {},
		};
	}

	// ===========================================================================
	// Transport Interface
	// ===========================================================================

	get state(): ConnectionState {
		return this._state;
	}

	async connect(): Promise<void> {
		this.setState("connecting");

		try {
			// Test connection with a simple request
			const response = await fetch(`${this.config.url}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.config.headers,
				},
				body: JSON.stringify({ entity: "__ping", operation: "get", input: {} }),
			});

			// Even if we get an error response, we're connected
			if (response.ok || response.status < 500) {
				this.setState("connected");
			} else {
				throw new Error(`Server error: ${response.status}`);
			}
		} catch (error) {
			this.setState("disconnected");
			throw error;
		}
	}

	disconnect(): void {
		// Clear all polling intervals
		for (const [, sub] of this.subscriptions) {
			clearInterval(sub.interval);
		}
		this.subscriptions.clear();
		this.setState("disconnected");
	}

	async subscribe(input: SubscribeInput): Promise<unknown> {
		const subscriptionId = `sub_${++this.subscriptionCounter}`;

		// Initial fetch
		const data = await this.fetchEntity(input);

		// Set up polling
		const interval = setInterval(async () => {
			try {
				const newData = await this.fetchEntity(input);
				this.notifyMessage({
					type: "data",
					subscriptionId,
					data: newData,
				});
			} catch {
				// Ignore polling errors
			}
		}, this.config.pollInterval);

		this.subscriptions.set(subscriptionId, { input, interval });

		return data;
	}

	unsubscribe(subscriptionId: string): void {
		const sub = this.subscriptions.get(subscriptionId);
		if (sub) {
			clearInterval(sub.interval);
			this.subscriptions.delete(subscriptionId);
		}
	}

	async query(input: QueryInput): Promise<unknown> {
		const response = await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				entity: input.entity,
				operation: input.type,
				input: {
					where: input.where,
					orderBy: input.orderBy,
					take: input.take,
					skip: input.skip,
					select: input.select,
				},
			}),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}

	async mutate(input: MutateInput): Promise<unknown> {
		const response = await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				entity: input.entity,
				operation: input.operation,
				input: input.input,
			}),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}

	onStateChange(callback: (state: ConnectionState) => void): () => void {
		this.stateListeners.add(callback);
		return () => this.stateListeners.delete(callback);
	}

	onMessage(callback: (message: ServerMessage) => void): () => void {
		this.messageListeners.add(callback);
		return () => this.messageListeners.delete(callback);
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private setState(state: ConnectionState): void {
		this._state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private notifyMessage(message: ServerMessage): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}

	private async fetchEntity(input: SubscribeInput): Promise<unknown> {
		const response = await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				entity: input.entity,
				operation: "get",
				input: {
					id: input.id,
					select: input.select,
				},
			}),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}
}
