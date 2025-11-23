/**
 * @lens/client - SSE Link (Terminal)
 *
 * Terminal link that uses SSE for subscriptions and HTTP for queries/mutations.
 */

import type { Link, LinkFn, OperationResult, Observable, Observer, Unsubscribable } from "./types";

export interface SSELinkOptions {
	/** Base URL for HTTP operations */
	url: string;
	/** SSE endpoint URL (defaults to url + '/stream') */
	sseUrl?: string;
	/** Request headers */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Custom fetch implementation */
	fetch?: typeof fetch;
}

/**
 * SSE link - uses Server-Sent Events for real-time subscriptions
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink(),
 *     sseLink({
 *       url: "http://localhost:3000/api",
 *       sseUrl: "http://localhost:3000/stream",
 *     }),
 *   ],
 * });
 * ```
 */
export function sseLink(options: SSELinkOptions): Link {
	const {
		url,
		sseUrl = `${url}/stream`,
		headers = {},
		fetch: customFetch = fetch,
	} = options;

	let eventSource: EventSource | null = null;
	const subscriptions = new Map<string, Observer<unknown>>();

	function ensureConnection() {
		if (eventSource) return;

		eventSource = new EventSource(sseUrl);

		eventSource.addEventListener("data", (event) => {
			try {
				const data = JSON.parse((event as MessageEvent).data) as {
					subscriptionId: string;
					data: unknown;
				};
				const observer = subscriptions.get(data.subscriptionId);
				if (observer) {
					observer.next(data.data);
				}
			} catch {
				// Ignore parse errors
			}
		});

		eventSource.addEventListener("error", () => {
			// Notify all subscriptions of error
			for (const observer of subscriptions.values()) {
				observer.error(new Error("SSE connection error"));
			}
		});
	}

	return (): LinkFn => {
		return async (op, _next): Promise<OperationResult> => {
			const resolvedHeaders =
				typeof headers === "function" ? await headers() : headers;

			// Subscriptions use SSE
			if (op.type === "subscription") {
				ensureConnection();

				// Register subscription with server
				const response = await customFetch(`${url}/subscribe`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...resolvedHeaders,
					},
					body: JSON.stringify({
						subscriptionId: op.id,
						entity: op.entity,
						operation: op.op,
						input: op.input,
					}),
				});

				if (!response.ok) {
					return { error: new Error(`Subscription failed: HTTP ${response.status}`) };
				}

				const result = (await response.json()) as { data: unknown };

				// Return observable in meta
				const observable: Observable<unknown> = {
					subscribe(observer: Observer<unknown>): Unsubscribable {
						subscriptions.set(op.id, observer);

						// Send initial data
						observer.next(result.data);

						return {
							unsubscribe() {
								subscriptions.delete(op.id);
								// Notify server
								customFetch(`${url}/unsubscribe`, {
									method: "POST",
									headers: {
										"Content-Type": "application/json",
										...resolvedHeaders,
									},
									body: JSON.stringify({ subscriptionId: op.id }),
								}).catch(() => {});
							},
						};
					},
				};

				return { data: result.data, meta: { observable } };
			}

			// Queries and mutations use HTTP
			const response = await customFetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...resolvedHeaders,
				},
				body: JSON.stringify({
					entity: op.entity,
					operation: op.op,
					type: op.type,
					input: op.input,
				}),
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { message?: string };
				return { error: new Error(errorData.message || `HTTP ${response.status}`) };
			}

			const result = (await response.json()) as { data: unknown };
			return { data: result.data };
		};
	};
}

/**
 * Close SSE connection and cleanup
 */
export function closeSSELink(link: ReturnType<typeof sseLink>): void {
	// This is a simplified version - in practice you'd expose this differently
	// The actual cleanup would be handled when the client is destroyed
}
