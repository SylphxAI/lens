/**
 * @sylphx/lens-server - HTTP Handler
 *
 * Creates a fetch handler from a Lens app.
 * Works with Bun, Node (with adapter), Vercel, Cloudflare Workers.
 */

import { firstValueFrom, isObservable } from "@sylphx/lens-core";
import type { LensServer } from "../server/create.js";

// =============================================================================
// Types
// =============================================================================

export interface HTTPHandlerOptions {
	/**
	 * Path prefix for Lens endpoints.
	 * Default: "" (no prefix)
	 *
	 * @example
	 * ```typescript
	 * // All endpoints under /api
	 * createHTTPHandler(app, { pathPrefix: '/api' })
	 * // Metadata: GET /api/__lens/metadata
	 * // Operations: POST /api
	 * ```
	 */
	pathPrefix?: string;

	/**
	 * Custom CORS headers.
	 * Default: Allow all origins
	 */
	cors?: {
		origin?: string | string[];
		methods?: string[];
		headers?: string[];
	};
}

export interface HTTPHandler {
	/**
	 * Handle HTTP request.
	 * Compatible with fetch API (Bun, Cloudflare Workers, Vercel).
	 */
	(request: Request): Promise<Response>;

	/**
	 * Alternative method-style call.
	 */
	handle(request: Request): Promise<Response>;
}

// =============================================================================
// HTTP Handler Factory
// =============================================================================

/**
 * Create an HTTP handler from a Lens app.
 *
 * @example
 * ```typescript
 * import { createApp, createHTTPHandler } from '@sylphx/lens-server'
 *
 * const app = createApp({ router })
 * const handler = createHTTPHandler(app)
 *
 * // Bun
 * Bun.serve({ port: 3000, fetch: handler })
 *
 * // Vercel
 * export default handler
 *
 * // Cloudflare Workers
 * export default { fetch: handler }
 * ```
 */
export function createHTTPHandler(
	server: LensServer,
	options: HTTPHandlerOptions = {},
): HTTPHandler {
	const { pathPrefix = "", cors } = options;

	// Build CORS headers
	const corsHeaders: Record<string, string> = {
		"Access-Control-Allow-Origin": cors?.origin
			? Array.isArray(cors.origin)
				? cors.origin.join(", ")
				: cors.origin
			: "*",
		"Access-Control-Allow-Methods": cors?.methods?.join(", ") ?? "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": cors?.headers?.join(", ") ?? "Content-Type, Authorization",
	};

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		// Metadata endpoint: GET /__lens/metadata
		const metadataPath = `${pathPrefix}/__lens/metadata`;
		if (request.method === "GET" && pathname === metadataPath) {
			return new Response(JSON.stringify(server.getMetadata()), {
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		// Operation endpoint: POST /
		const operationPath = pathPrefix || "/";
		if (
			request.method === "POST" &&
			(pathname === operationPath || pathname === `${pathPrefix}/`)
		) {
			try {
				const body = (await request.json()) as {
					operation?: string;
					path?: string;
					input?: unknown;
				};

				// Support both 'operation' and 'path' for backwards compatibility
				const operationPath = body.operation ?? body.path;
				if (!operationPath) {
					return new Response(JSON.stringify({ error: "Missing operation path" }), {
						status: 400,
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					});
				}

				const resultOrObservable = server.execute({
					path: operationPath,
					input: body.input,
				});

				// Handle Observable (take first value for HTTP)
				const result = isObservable(resultOrObservable)
					? await firstValueFrom(resultOrObservable)
					: await resultOrObservable;

				if (result.error) {
					return new Response(JSON.stringify({ error: result.error.message }), {
						status: 500,
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					});
				}

				return new Response(JSON.stringify({ data: result.data }), {
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				});
			} catch (error) {
				return new Response(JSON.stringify({ error: String(error) }), {
					status: 500,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				});
			}
		}

		// Not found
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: {
				"Content-Type": "application/json",
				...corsHeaders,
			},
		});
	};

	// Make it callable as both function and object with handle method
	const result = handler as HTTPHandler;
	result.handle = handler;

	return result;
}
