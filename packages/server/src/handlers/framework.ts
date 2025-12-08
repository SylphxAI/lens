/**
 * @sylphx/lens-server - Framework Handler Utilities
 *
 * Shared utilities for framework integrations (Next.js, Nuxt, SolidStart, Fresh, etc.).
 * These provide common implementations that framework packages can use instead of
 * duplicating the same logic.
 *
 * @example
 * ```typescript
 * // In a framework integration package
 * import {
 *   createServerClientProxy,
 *   handleWebQuery,
 *   handleWebMutation,
 *   handleWebSSE,
 * } from '@sylphx/lens-server';
 *
 * const serverClient = createServerClientProxy(server);
 *
 * function createHandler(server, basePath) {
 *   return async (request: Request) => {
 *     const url = new URL(request.url);
 *     const path = url.pathname.replace(basePath, '').replace(/^\//, '');
 *
 *     if (request.headers.get('accept') === 'text/event-stream') {
 *       return handleWebSSE(server, path, url, request.signal);
 *     }
 *     if (request.method === 'GET') {
 *       return handleWebQuery(server, path, url);
 *     }
 *     if (request.method === 'POST') {
 *       return handleWebMutation(server, path, request);
 *     }
 *     return new Response('Method not allowed', { status: 405 });
 *   };
 * }
 * ```
 */

import { firstValueFrom, isObservable, type LensResult } from "@sylphx/lens-core";
import type { LensServer } from "../server/create.js";

/**
 * Helper to resolve server.execute() result which may be Observable or Promise.
 * This provides backwards compatibility for test mocks that return Promises.
 */
async function resolveExecuteResult<T>(result: unknown): Promise<LensResult<T>> {
	if (isObservable<LensResult<T>>(result)) {
		return firstValueFrom(result);
	}
	// Handle Promise or direct value (for backwards compatibility with test mocks)
	return result as Promise<LensResult<T>>;
}

// =============================================================================
// Server Client Proxy
// =============================================================================

/**
 * Create a proxy object that provides typed access to server procedures.
 *
 * This proxy allows calling server procedures directly without going through
 * HTTP. Useful for:
 * - Server-side rendering (SSR)
 * - Server Components
 * - Testing
 * - Same-process communication
 *
 * @example
 * ```typescript
 * const serverClient = createServerClientProxy(server);
 *
 * // Call procedures directly (typed!)
 * const users = await serverClient.user.list();
 * const user = await serverClient.user.get({ id: '123' });
 * ```
 */
export function createServerClientProxy(server: LensServer): unknown {
	function createProxy(path: string): unknown {
		return new Proxy(() => {}, {
			get(_, prop) {
				if (typeof prop === "symbol") return undefined;
				if (prop === "then") return undefined;

				const newPath = path ? `${path}.${prop}` : String(prop);
				return createProxy(newPath);
			},
			async apply(_, __, args) {
				const input = args[0];
				const result = await resolveExecuteResult(server.execute({ path, input }));

				if (result.error) {
					throw result.error;
				}

				return result.data;
			},
		});
	}

	return createProxy("");
}

// =============================================================================
// Web Request Handlers
// =============================================================================

/**
 * Handle a query request using standard Web Request/Response API.
 *
 * Expects input in URL search params as JSON string.
 *
 * @example
 * ```typescript
 * // GET /api/lens/user.get?input={"id":"123"}
 * const response = await handleWebQuery(server, 'user.get', url);
 * ```
 */
export async function handleWebQuery(
	server: LensServer,
	path: string,
	url: URL,
): Promise<Response> {
	try {
		const inputParam = url.searchParams.get("input");
		const input = inputParam ? JSON.parse(inputParam) : undefined;

		const result = await resolveExecuteResult(server.execute({ path, input }));

		if (result.error) {
			return Response.json({ error: result.error.message }, { status: 400 });
		}

		return Response.json({ data: result.data });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}

/**
 * Handle a mutation request using standard Web Request/Response API.
 *
 * Expects input in request body as JSON.
 *
 * @example
 * ```typescript
 * // POST /api/lens/user.create with body { "input": { "name": "John" } }
 * const response = await handleWebMutation(server, 'user.create', request);
 * ```
 */
export async function handleWebMutation(
	server: LensServer,
	path: string,
	request: Request,
): Promise<Response> {
	try {
		const body = (await request.json()) as { input?: unknown };
		const input = body.input;

		const result = await resolveExecuteResult(server.execute({ path, input }));

		if (result.error) {
			return Response.json({ error: result.error.message }, { status: 400 });
		}

		return Response.json({ data: result.data });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}

/**
 * Handle an SSE subscription request using standard Web Request/Response API.
 *
 * Creates a ReadableStream that emits SSE events from the subscription.
 *
 * @example
 * ```typescript
 * // GET /api/lens/events.stream with Accept: text/event-stream
 * const response = handleWebSSE(server, 'events.stream', url, request.signal);
 * ```
 */
export function handleWebSSE(
	server: LensServer,
	path: string,
	url: URL,
	signal?: AbortSignal,
): Response {
	const inputParam = url.searchParams.get("input");
	const input = inputParam ? JSON.parse(inputParam) : undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const result = server.execute({ path, input });

			if (result && typeof result === "object" && "subscribe" in result) {
				const observable = result as {
					subscribe: (handlers: {
						next: (value: { data?: unknown }) => void;
						error: (err: Error) => void;
						complete: () => void;
					}) => { unsubscribe: () => void };
				};

				const subscription = observable.subscribe({
					next: (value) => {
						const data = `data: ${JSON.stringify(value.data)}\n\n`;
						controller.enqueue(encoder.encode(data));
					},
					error: (err) => {
						const data = `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`;
						controller.enqueue(encoder.encode(data));
						controller.close();
					},
					complete: () => {
						controller.close();
					},
				});

				// Clean up on abort
				if (signal) {
					signal.addEventListener("abort", () => {
						subscription.unsubscribe();
						controller.close();
					});
				}
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

// =============================================================================
// Full Handler Factory
// =============================================================================

/**
 * Options for creating a framework handler.
 */
export interface FrameworkHandlerOptions {
	/** Base path to strip from request URLs */
	basePath?: string;
}

/**
 * Create a complete request handler for Web standard Request/Response.
 *
 * Handles:
 * - GET requests → Query execution
 * - POST requests → Mutation execution
 * - SSE requests (Accept: text/event-stream) → Subscriptions
 *
 * @example
 * ```typescript
 * const handler = createFrameworkHandler(server, { basePath: '/api/lens' });
 *
 * // In Next.js App Router:
 * export const GET = handler;
 * export const POST = handler;
 *
 * // In Fresh:
 * export const handler = { GET: lensHandler, POST: lensHandler };
 * ```
 */
export function createFrameworkHandler(
	server: LensServer,
	options: FrameworkHandlerOptions = {},
): (request: Request) => Promise<Response> {
	const basePath = options.basePath ?? "";

	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const path = url.pathname.replace(basePath, "").replace(/^\//, "");

		// Handle SSE subscription
		if (request.headers.get("accept") === "text/event-stream") {
			return handleWebSSE(server, path, url, request.signal);
		}

		// Handle query (GET)
		if (request.method === "GET") {
			return handleWebQuery(server, path, url);
		}

		// Handle mutation (POST)
		if (request.method === "POST") {
			return handleWebMutation(server, path, request);
		}

		return new Response("Method not allowed", { status: 405 });
	};
}
