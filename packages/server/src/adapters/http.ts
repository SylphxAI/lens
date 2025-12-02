/**
 * @sylphx/lens-server - HTTP Adapter
 *
 * Creates a fetch handler from a Lens server.
 * Works with Bun, Node (with adapter), Vercel, Cloudflare Workers.
 */

import type { LensServer } from "../server/create.js";

// =============================================================================
// Types
// =============================================================================

export interface HTTPAdapterOptions {
	/**
	 * Path prefix for Lens endpoints.
	 * Default: "" (no prefix)
	 *
	 * @example
	 * ```typescript
	 * // All endpoints under /api
	 * createHTTPAdapter(server, { pathPrefix: '/api' })
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

export interface HTTPAdapter {
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
// HTTP Adapter Factory
// =============================================================================

/**
 * Create an HTTP adapter from a Lens server.
 *
 * @example
 * ```typescript
 * import { createServer, createHTTPAdapter } from '@sylphx/lens-server'
 *
 * const server = createServer({ router })
 * const handler = createHTTPAdapter(server)
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
export function createHTTPAdapter(
	server: LensServer,
	options: HTTPAdapterOptions = {},
): HTTPAdapter {
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

				const result = await server.execute({
					path: operationPath,
					input: body.input,
				});

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
	const adapter = handler as HTTPAdapter;
	adapter.handle = handler;

	return adapter;
}
