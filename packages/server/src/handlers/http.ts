/**
 * @sylphx/lens-server - HTTP Handler
 *
 * Creates a fetch handler from a Lens app.
 * Works with Bun, Node (with adapter), Vercel, Cloudflare Workers.
 */

import { firstValueFrom } from "@sylphx/lens-core";
import type { LensServer } from "../server/create.js";

// =============================================================================
// Types
// =============================================================================

/** Error sanitization options */
export interface ErrorSanitizationOptions {
	/**
	 * Enable development mode - shows full error messages.
	 * Default: false (production mode - sanitized errors only)
	 */
	development?: boolean;

	/**
	 * Custom error sanitizer function.
	 * Return a safe error message to send to the client.
	 */
	sanitize?: (error: Error) => string;
}

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
	 * Default: Allow all origins in development, strict in production
	 */
	cors?: {
		origin?: string | string[];
		methods?: string[];
		headers?: string[];
	};

	/**
	 * Error sanitization options.
	 * Controls what error information is exposed to clients.
	 */
	errors?: ErrorSanitizationOptions;
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
/**
 * Default error sanitizer - removes sensitive information from errors.
 * Safe error messages are preserved, internal details are hidden.
 */
function sanitizeError(error: Error, isDevelopment: boolean): string {
	if (isDevelopment) {
		return error.message;
	}

	const message = error.message;

	// Known safe error patterns (validation errors, business logic errors)
	const safePatterns = [
		/^Invalid input:/,
		/^Missing operation/,
		/^Not found/,
		/^Unauthorized/,
		/^Forbidden/,
		/^Bad request/,
		/^Validation failed/,
	];

	if (safePatterns.some((pattern) => pattern.test(message))) {
		return message;
	}

	// Check for sensitive patterns
	const sensitivePatterns = [
		/\/[^\s]+\.(ts|js|json)/, // file paths
		/at\s+[^\s]+\s+\(/, // stack traces
		/ENOENT|EACCES|ECONNREFUSED/, // system errors
		/SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i, // SQL
		/password|secret|token|key|auth/i, // credentials
	];

	if (sensitivePatterns.some((pattern) => pattern.test(message))) {
		return "An internal error occurred";
	}

	// Allow short, simple messages through
	if (message.length < 100 && !message.includes("\n")) {
		return message;
	}

	return "An internal error occurred";
}

export function createHTTPHandler(
	server: LensServer,
	options: HTTPHandlerOptions = {},
): HTTPHandler {
	const { pathPrefix = "", cors, errors } = options;
	const isDevelopment = errors?.development ?? false;

	// Error sanitization function
	const sanitize = (error: Error): string => {
		if (errors?.sanitize) {
			return errors.sanitize(error);
		}
		return sanitizeError(error, isDevelopment);
	};

	// Build CORS headers
	// In production, require explicit origin configuration for security
	// In development, allow all origins for convenience
	const allowedOrigin = cors?.origin
		? Array.isArray(cors.origin)
			? cors.origin.join(", ")
			: cors.origin
		: isDevelopment
			? "*"
			: ""; // No cross-origin allowed by default in production

	// Base headers including security headers
	const baseHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		// Security headers
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
		// CORS headers
		"Access-Control-Allow-Methods": cors?.methods?.join(", ") ?? "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": cors?.headers?.join(", ") ?? "Content-Type, Authorization",
	};

	// Only add Access-Control-Allow-Origin if there's an allowed origin
	if (allowedOrigin) {
		baseHeaders["Access-Control-Allow-Origin"] = allowedOrigin;
	}

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: baseHeaders,
			});
		}

		// Metadata endpoint: GET /__lens/metadata
		const metadataPath = `${pathPrefix}/__lens/metadata`;
		if (request.method === "GET" && pathname === metadataPath) {
			return new Response(JSON.stringify(server.getMetadata()), {
				headers: {
					"Content-Type": "application/json",
					...baseHeaders,
				},
			});
		}

		// Operation endpoint: POST /
		const operationPath = pathPrefix || "/";
		if (
			request.method === "POST" &&
			(pathname === operationPath || pathname === `${pathPrefix}/`)
		) {
			// Parse JSON body with proper error handling
			let body: { operation?: string; path?: string; input?: unknown };
			try {
				body = (await request.json()) as typeof body;
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						...baseHeaders,
					},
				});
			}

			try {
				// Support both 'operation' and 'path' for backwards compatibility
				const operationPath = body.operation ?? body.path;
				if (!operationPath) {
					return new Response(JSON.stringify({ error: "Missing operation path" }), {
						status: 400,
						headers: {
							"Content-Type": "application/json",
							...baseHeaders,
						},
					});
				}

				const result = await firstValueFrom(
					server.execute({
						path: operationPath,
						input: body.input,
					}),
				);

				if (result.error) {
					return new Response(JSON.stringify({ error: sanitize(result.error) }), {
						status: 500,
						headers: {
							"Content-Type": "application/json",
							...baseHeaders,
						},
					});
				}

				return new Response(JSON.stringify({ data: result.data }), {
					headers: {
						"Content-Type": "application/json",
						...baseHeaders,
					},
				});
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				return new Response(JSON.stringify({ error: sanitize(err) }), {
					status: 500,
					headers: {
						"Content-Type": "application/json",
						...baseHeaders,
					},
				});
			}
		}

		// Not found
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: {
				"Content-Type": "application/json",
				...baseHeaders,
			},
		});
	};

	// Make it callable as both function and object with handle method
	const result = handler as HTTPHandler;
	result.handle = handler;

	return result;
}
