/**
 * @sylphx/lens-client - SSE Connection Utilities
 *
 * Shared SSE connection logic used by both sse() and httpSse() transports.
 */

import type { ConnectionState, Observable, Observer, Operation, Result } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * SSE retry configuration.
 */
export interface SseRetryConfig {
	/** Enable automatic reconnection (default: true) */
	enabled: boolean;
	/** Maximum retry attempts (default: 10) */
	maxAttempts: number;
	/** Base delay in ms (default: 1000) */
	baseDelay: number;
	/** Maximum delay in ms (default: 30000) */
	maxDelay: number;
}

/**
 * Default SSE retry configuration.
 */
export const DEFAULT_SSE_RETRY_CONFIG: SseRetryConfig = {
	enabled: true,
	maxAttempts: 10,
	baseDelay: 1000,
	maxDelay: 30000,
};

/**
 * Tracked SSE subscription.
 */
export interface TrackedSseSubscription {
	eventSource: EventSource;
	observer: Observer<Result>;
	retryCount: number;
}

/**
 * SSE connection manager configuration.
 */
export interface SseConnectionConfig {
	/** Base URL for SSE endpoints */
	baseUrl: string;
	/** EventSource implementation */
	EventSource: typeof EventSource;
	/** Retry configuration */
	retry: SseRetryConfig;
	/** Callback when connection state changes */
	onConnectionStateChange?: ((state: ConnectionState) => void) | undefined;
	/** Optional headers to include as query params */
	headers?: Record<string, string> | undefined;
}

// =============================================================================
// Connection Manager
// =============================================================================

/**
 * SSE connection manager.
 * Handles subscription lifecycle, reconnection, and state tracking.
 */
export class SseConnectionManager {
	private subscriptions = new Map<string, TrackedSseSubscription>();
	private connectionState: ConnectionState = "disconnected";

	constructor(private readonly config: SseConnectionConfig) {}

	/**
	 * Get current connection state.
	 */
	getConnectionState(): ConnectionState {
		return this.connectionState;
	}

	/**
	 * Get active subscription count.
	 */
	getSubscriptionCount(): number {
		return this.subscriptions.size;
	}

	/**
	 * Update connection state and notify callback.
	 */
	private setConnectionState(state: ConnectionState): void {
		if (this.connectionState !== state) {
			this.connectionState = state;
			this.config.onConnectionStateChange?.(state);
		}
	}

	/**
	 * Compute retry delay with exponential backoff + jitter.
	 */
	private getRetryDelay(attempt: number): number {
		const { baseDelay, maxDelay } = this.config.retry;
		const exponentialDelay = baseDelay * Math.pow(2, attempt);
		const jitter = Math.random() * 0.3 * exponentialDelay;
		return Math.min(exponentialDelay + jitter, maxDelay);
	}

	/**
	 * Create SSE subscription.
	 */
	createSubscription(op: Operation): Observable<Result> {
		return {
			subscribe: (observer: Observer<Result>) => {
				const subId = op.id;
				let retryCount = 0;

				const connect = () => {
					// Build SSE URL with operation info
					const sseUrl = new URL(`${this.config.baseUrl}/${op.path}`);
					if (op.input !== undefined) {
						sseUrl.searchParams.set("input", JSON.stringify(op.input));
					}
					sseUrl.searchParams.set("_sse", "1"); // Mark as SSE request

					// Add headers as query params (EventSource doesn't support custom headers)
					if (this.config.headers) {
						for (const [key, value] of Object.entries(this.config.headers)) {
							sseUrl.searchParams.set(`_h_${key}`, value);
						}
					}

					const eventSource = new this.config.EventSource(sseUrl.toString());

					// Track subscription
					this.subscriptions.set(subId, { eventSource, observer, retryCount });

					// Update state
					if (this.subscriptions.size === 1) {
						this.setConnectionState("connecting");
					}

					eventSource.onopen = () => {
						retryCount = 0;
						const sub = this.subscriptions.get(subId);
						if (sub) {
							sub.retryCount = 0;
						}
						this.setConnectionState("connected");
					};

					eventSource.onmessage = (event) => {
						try {
							const message = JSON.parse(event.data) as Result;
							observer.next?.(message);
						} catch (error) {
							observer.error?.(error as Error);
						}
					};

					eventSource.addEventListener("error", (_event) => {
						if (eventSource.readyState === this.config.EventSource.CLOSED) {
							if (this.config.retry.enabled && retryCount < this.config.retry.maxAttempts) {
								this.setConnectionState("reconnecting");
								retryCount++;
								const sub = this.subscriptions.get(subId);
								if (sub) {
									sub.retryCount = retryCount;
								}

								const delay = this.getRetryDelay(retryCount);
								setTimeout(() => {
									if (this.subscriptions.has(subId)) {
										this.subscriptions.delete(subId);
										connect();
									}
								}, delay);
							} else {
								observer.error?.(new Error("SSE connection failed"));
								this.subscriptions.delete(subId);
								if (this.subscriptions.size === 0) {
									this.setConnectionState("disconnected");
								}
							}
						}
					});

					eventSource.addEventListener("complete", () => {
						observer.complete?.();
						eventSource.close();
						this.subscriptions.delete(subId);
						if (this.subscriptions.size === 0) {
							this.setConnectionState("disconnected");
						}
					});

					eventSource.addEventListener("lens-error", (event) => {
						try {
							const errorData = JSON.parse((event as MessageEvent).data);
							observer.error?.(new Error(errorData.message || "SSE error"));
						} catch {
							observer.error?.(new Error("SSE error"));
						}
					});
				};

				connect();

				return {
					unsubscribe: () => {
						const sub = this.subscriptions.get(subId);
						if (sub) {
							sub.eventSource.close();
							this.subscriptions.delete(subId);
							if (this.subscriptions.size === 0) {
								this.setConnectionState("disconnected");
							}
						}
					},
				};
			},
		};
	}

	/**
	 * Close all connections.
	 */
	close(): void {
		for (const [_id, sub] of this.subscriptions) {
			sub.eventSource.close();
		}
		this.subscriptions.clear();
		this.setConnectionState("disconnected");
	}
}
