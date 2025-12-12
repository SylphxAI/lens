/**
 * @sylphx/lens-client - HTTP Transport
 *
 * HTTP transport for Lens client.
 * Handles query/mutation via POST, subscriptions via polling.
 */

import { isError, isOps, isSnapshot } from "@sylphx/lens-core";
import type {
	LensServerInterface,
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
 * HTTP transport options.
 */
export interface HttpTransportOptions {
	/** Server URL */
	url: string;
	/** Default headers */
	headers?: HeadersInit;
	/** Fetch implementation (default: global fetch) */
	fetch?: typeof fetch;
	/** Polling options for subscriptions */
	polling?: {
		/** Polling interval in ms (default: 1000) */
		interval?: number;
		/** Maximum retries on error (default: 3) */
		maxRetries?: number;
	};
}

// =============================================================================
// HTTP Transport
// =============================================================================

/**
 * HTTP transport function with server method
 */
export interface HttpTransport {
	(options: HttpTransportOptions): Transport;
	server(options: HttpServerTransportOptions): ServerTransport;
}

/**
 * Create HTTP transport.
 *
 * Handles:
 * - Queries via POST
 * - Mutations via POST
 * - Subscriptions via polling (fallback for HTTP-only environments)
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 * })
 * ```
 */
export const http: HttpTransport = function http(options: HttpTransportOptions): Transport {
	const { url, headers: defaultHeaders = {}, fetch: fetchImpl = fetch, polling = {} } = options;

	const { interval: pollInterval = 1000, maxRetries = 3 } = polling;

	// Normalize URL (remove trailing slash)
	const baseUrl = url.replace(/\/$/, "");

	return {
		/**
		 * Connect and get metadata from server.
		 * GET /__lens/metadata
		 */
		async connect(): Promise<Metadata> {
			const response = await fetchImpl(`${baseUrl}/__lens/metadata`, {
				method: "GET",
				headers: {
					Accept: "application/json",
					...defaultHeaders,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to connect: ${response.status} ${response.statusText}`);
			}

			return response.json();
		},

		/**
		 * Execute operation.
		 * POST for query/mutation, polling for subscription.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			if (op.type === "subscription") {
				return createPollingObservable(baseUrl, op, {
					interval: pollInterval,
					maxRetries,
					headers: defaultHeaders,
					fetch: fetchImpl,
				});
			}

			return executeRequest(baseUrl, op, {
				headers: {
					...defaultHeaders,
					...((op.meta?.headers as Record<string, string>) ?? {}),
				},
				fetch: fetchImpl,
				timeout: op.meta?.timeout as number | undefined,
			});
		},
	};
};

// =============================================================================
// Internal Helpers
// =============================================================================

interface RequestOptions {
	headers: HeadersInit;
	fetch: typeof fetch;
	timeout?: number | undefined;
}

/**
 * Execute single request.
 */
async function executeRequest(
	baseUrl: string,
	op: Operation,
	options: RequestOptions,
): Promise<Result> {
	const { headers, fetch: fetchImpl, timeout } = options;

	try {
		const controller = new AbortController();
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		if (timeout) {
			timeoutId = setTimeout(() => controller.abort(), timeout);
		}

		const response = await fetchImpl(baseUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				...headers,
			},
			body: JSON.stringify({
				id: op.id,
				path: op.path,
				type: op.type,
				input: op.input,
			}),
			signal: controller.signal,
		});

		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			return {
				$: "error",
				error: `HTTP ${response.status}: ${response.statusText}`,
			};
		}

		const result = await response.json();
		return result as Result;
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return { $: "error", error: "Request timeout" };
		}
		return { $: "error", error: error instanceof Error ? error.message : String(error) };
	}
}

interface PollingOptions {
	interval: number;
	maxRetries: number;
	headers: HeadersInit;
	fetch: typeof fetch;
}

/**
 * Create polling observable for subscriptions.
 */
function createPollingObservable(
	baseUrl: string,
	op: Operation,
	options: PollingOptions,
): Observable<Result> {
	return {
		subscribe(observer) {
			let active = true;
			let retries = 0;
			let lastValue: unknown;

			const poll = async () => {
				if (!active) return;

				try {
					const message = await executeRequest(baseUrl, op, {
						headers: options.headers,
						fetch: options.fetch,
					});

					if (!active) return;

					if (isError(message)) {
						retries++;
						if (retries > options.maxRetries) {
							observer.error?.(new Error(message.error));
							return;
						}
					} else {
						retries = 0;

						// Emit if data changed OR if ops message (stateless architecture)
						if (isSnapshot(message)) {
							const hasDataChange = JSON.stringify(message.data) !== JSON.stringify(lastValue);
							if (hasDataChange) {
								lastValue = message.data;
								observer.next?.(message);
							}
						} else if (isOps(message)) {
							// Ops messages always trigger update
							observer.next?.(message);
						}
					}

					// Schedule next poll
					if (active) {
						setTimeout(poll, options.interval);
					}
				} catch (error) {
					if (active) {
						observer.error?.(error as Error);
					}
				}
			};

			// Start polling
			poll();

			return {
				unsubscribe() {
					active = false;
				},
			};
		},
	};
}

// =============================================================================
// Server Transport
// =============================================================================

/**
 * HTTP server transport options.
 */
export interface HttpServerTransportOptions {
	/** Port to listen on */
	port: number;
	/** Path prefix (default: '') */
	path?: string;
	/** Hostname (default: '0.0.0.0') */
	hostname?: string;
}

/**
 * Server transport interface.
 */
export interface ServerTransport {
	/** Start listening and route requests to server */
	listen(server: LensServerInterface): void;
}

/**
 * Create HTTP server transport.
 *
 * @example
 * ```typescript
 * const server = createApp({
 *   transport: http.server({ port: 3000 }),
 *   router: appRouter,
 * })
 * ```
 */
http.server = function httpServer(options: HttpServerTransportOptions): ServerTransport {
	const { port, path = "", hostname = "0.0.0.0" } = options;

	return {
		listen(server: LensServerInterface) {
			Bun.serve({
				port,
				hostname,
				async fetch(req) {
					const url = new URL(req.url);
					const basePath = path.replace(/\/$/, "");

					// Metadata endpoint
					if (url.pathname === `${basePath}/__lens/metadata` && req.method === "GET") {
						return Response.json(server.getMetadata());
					}

					// Operation endpoint
					if (url.pathname === basePath && req.method === "POST") {
						try {
							const body = (await req.json()) as Operation;
							const result = await server.execute(body);
							return Response.json(result);
						} catch (error) {
							return Response.json(
								{ error: { message: (error as Error).message } },
								{ status: 500 },
							);
						}
					}

					return new Response("Not Found", { status: 404 });
				},
			});
		},
	};
};
