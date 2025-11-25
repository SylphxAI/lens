/**
 * @sylphx/client - HTTP Link (Terminal)
 *
 * Terminal link that executes operations via HTTP.
 */

import type { Link, LinkFn, OperationContext, OperationResult, Observable, Observer, Unsubscribable } from "./types";

export interface HttpLinkOptions {
	/** Base URL for API */
	url: string;
	/** Request headers */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Custom fetch implementation */
	fetch?: typeof fetch;
	/** Request timeout in ms */
	timeout?: number;
	/** Polling configuration for subscriptions */
	polling?: {
		/** Polling interval in ms (default: 1000) */
		interval?: number;
		/** Enable polling (default: false) */
		enabled?: boolean;
	};
}

/**
 * HTTP link - self-sufficient terminal link for HTTP transport
 *
 * Handles all operation types:
 * - Queries: HTTP POST (single request)
 * - Subscriptions: Polling (if enabled), otherwise error
 * - Mutations: HTTP POST
 *
 * @example
 * ```typescript
 * // Basic usage (no subscriptions)
 * const client = createClient({
 *   links: [
 *     httpLink({ url: "http://localhost:3000/api" }),
 *   ],
 * });
 *
 * // With polling for subscriptions
 * const client = createClient({
 *   links: [
 *     httpLink({
 *       url: "http://localhost:3000/api",
 *       polling: { enabled: true, interval: 1000 }
 *     }),
 *   ],
 * });
 * ```
 */
export function httpLink(options: HttpLinkOptions): Link {
	const {
		url,
		headers = {},
		fetch: customFetch = fetch,
		timeout = 30000,
		polling = { enabled: false, interval: 1000 },
	} = options;

	const pollingInterval = polling.interval ?? 1000;
	const pollingEnabled = polling.enabled ?? false;

	// Helper to execute a single HTTP request
	async function executeRequest(op: OperationContext): Promise<OperationResult> {
		try {
			const resolvedHeaders =
				typeof headers === "function" ? await headers() : headers;

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			// Combine with operation signal if provided
			if (op.signal) {
				op.signal.addEventListener("abort", () => controller.abort());
			}

			const response = await customFetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...resolvedHeaders,
				},
				body: JSON.stringify({
					entity: op.entity,
					operation: op.op,
					type: op.type === "subscription" ? "query" : op.type, // Convert subscription to query for HTTP
					input: op.input,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {
					message?: string;
				};
				return {
					error: new Error(errorData.message || `HTTP ${response.status}`),
				};
			}

			const result = (await response.json()) as { data: unknown };
			return { data: result.data };
		} catch (error) {
			if ((error as Error).name === "AbortError") {
				return { error: new Error("Request timeout") };
			}
			return { error: error as Error };
		}
	}

	return (): LinkFn => {
		return async (op, _next): Promise<OperationResult> => {
			// Handle subscriptions with polling
			if (op.type === "subscription") {
				if (!pollingEnabled) {
					return {
						error: new Error(
							"Subscriptions not supported. Enable polling: httpLink({ polling: { enabled: true } })",
						),
					};
				}

				// Create observable that polls at interval
				const observable: Observable<unknown> = {
					subscribe(observer: Observer<unknown>): Unsubscribable {
						let active = true;
						let intervalId: ReturnType<typeof setInterval> | null = null;

						// Initial fetch
						executeRequest(op).then((result) => {
							if (!active) return;
							if (result.error) {
								observer.error(result.error);
							} else {
								observer.next(result.data);
							}
						});

						// Start polling
						intervalId = setInterval(async () => {
							if (!active) return;
							const result = await executeRequest(op);
							if (!active) return;
							if (result.error) {
								observer.error(result.error);
								active = false;
								if (intervalId) clearInterval(intervalId);
							} else {
								observer.next(result.data);
							}
						}, pollingInterval);

						return {
							unsubscribe() {
								active = false;
								if (intervalId) {
									clearInterval(intervalId);
								}
								observer.complete();
							},
						};
					},
				};

				// Return observable for QueryResult to use
				return { data: null, meta: { observable } };
			}

			// Queries and mutations use single HTTP request
			return executeRequest(op);
		};
	};
}

/**
 * HTTP batch link - batches multiple operations into single request
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     httpBatchLink({
 *       url: "http://localhost:3000/api/batch",
 *       maxBatchSize: 10,
 *       batchInterval: 10,
 *     }),
 *   ],
 * });
 * ```
 */
export function httpBatchLink(
	options: HttpLinkOptions & {
		/** Maximum operations per batch (default: 10) */
		maxBatchSize?: number;
		/** Time window to collect operations in ms (default: 10) */
		batchInterval?: number;
	},
): Link {
	const {
		url,
		headers = {},
		fetch: customFetch = fetch,
		timeout = 30000,
		maxBatchSize = 10,
		batchInterval = 10,
	} = options;

	// Batch state
	let pendingOps: Array<{
		op: OperationContext;
		resolve: (result: OperationResult) => void;
		reject: (error: Error) => void;
	}> = [];
	let batchTimer: ReturnType<typeof setTimeout> | null = null;

	async function executeBatch() {
		const batch = pendingOps;
		pendingOps = [];
		batchTimer = null;

		if (batch.length === 0) return;

		try {
			const resolvedHeaders =
				typeof headers === "function" ? await headers() : headers;

			const response = await customFetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...resolvedHeaders,
				},
				body: JSON.stringify(
					batch.map(({ op }) => ({
						id: op.id,
						entity: op.entity,
						operation: op.op,
						type: op.type,
						input: op.input,
					})),
				),
				signal: AbortSignal.timeout(timeout),
			});

			if (!response.ok) {
				const error = new Error(`HTTP ${response.status}`);
				for (const { reject } of batch) {
					reject(error);
				}
				return;
			}

			const results = (await response.json()) as Array<{ id: string; data?: unknown; error?: string }>;

			// Match results to operations
			for (const { op, resolve } of batch) {
				const result = results.find((r) => r.id === op.id);
				if (result?.error) {
					resolve({ error: new Error(result.error) });
				} else {
					resolve({ data: result?.data });
				}
			}
		} catch (error) {
			for (const { reject } of batch) {
				reject(error as Error);
			}
		}
	}

	return (): LinkFn => {
		return (op, _next): Promise<OperationResult> => {
			return new Promise((resolve, reject) => {
				pendingOps.push({ op, resolve, reject });

				// Execute immediately if batch is full
				if (pendingOps.length >= maxBatchSize) {
					if (batchTimer) clearTimeout(batchTimer);
					executeBatch();
				} else if (!batchTimer) {
					// Schedule batch execution
					batchTimer = setTimeout(executeBatch, batchInterval);
				}
			});
		};
	};
}
