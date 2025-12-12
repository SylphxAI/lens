/**
 * @sylphx/lens-next/server
 *
 * Server-side utilities for Next.js.
 * Use these in Server Components, API routes, and middleware.
 *
 * @example
 * ```ts
 * // app/api/lens/[...path]/route.ts
 * import { createLensHandler } from '@sylphx/lens-next/server';
 * import { server } from '@/lib/lens-server';
 *
 * const handler = createLensHandler(server);
 *
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */

import { firstValueFrom, isError, isSnapshot } from "@sylphx/lens-core";
import type { LensServer } from "@sylphx/lens-server";

// =============================================================================
// Types
// =============================================================================

export interface LensHandlerOptions {
	/** Base path for the handler (default: '/api/lens') */
	basePath?: string;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Create a Next.js App Router API handler for Lens server.
 *
 * @example
 * ```ts
 * // app/api/lens/[...path]/route.ts
 * import { createLensHandler } from '@sylphx/lens-next/server';
 * import { server } from '@/lib/lens-server';
 *
 * const handler = createLensHandler(server);
 *
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function createLensHandler(server: LensServer, options?: LensHandlerOptions) {
	const basePath = options?.basePath ?? "/api/lens";

	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const path = url.pathname.replace(basePath, "").replace(/^\//, "");

		// Handle SSE subscription
		if (request.headers.get("accept") === "text/event-stream") {
			return handleSSE(server, path, request);
		}

		// Handle query/mutation
		if (request.method === "GET") {
			return handleQuery(server, path, url);
		}

		if (request.method === "POST") {
			return handleMutation(server, path, request);
		}

		return new Response("Method not allowed", { status: 405 });
	};
}

async function handleQuery(server: LensServer, path: string, url: URL): Promise<Response> {
	try {
		const inputParam = url.searchParams.get("input");
		const input = inputParam ? JSON.parse(inputParam) : undefined;

		const result = await firstValueFrom(server.execute({ path, input }));

		if (isError(result)) {
			return Response.json({ error: result.error }, { status: 400 });
		}

		if (isSnapshot(result)) {
			return Response.json({ data: result.data });
		}

		// ops message - shouldn't happen for one-shot queries
		return Response.json({ data: null });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}

async function handleMutation(
	server: LensServer,
	path: string,
	request: Request,
): Promise<Response> {
	try {
		const body = await request.json();
		const input = body.input;

		const result = await firstValueFrom(server.execute({ path, input }));

		if (isError(result)) {
			return Response.json({ error: result.error }, { status: 400 });
		}

		if (isSnapshot(result)) {
			return Response.json({ data: result.data });
		}

		// ops message - shouldn't happen for mutations
		return Response.json({ data: null });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}

function handleSSE(server: LensServer, path: string, request: Request): Response {
	const url = new URL(request.url);
	const inputParam = url.searchParams.get("input");
	const input = inputParam ? JSON.parse(inputParam) : undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Execute subscription
			const observable = server.execute({ path, input });

			const subscription = observable.subscribe({
				next: (message) => {
					// Send message as-is (Message protocol format)
					const data = `data: ${JSON.stringify(message)}\n\n`;
					controller.enqueue(encoder.encode(data));
				},
				error: (err) => {
					const errorMsg = { $: "error", error: err.message, code: "STREAM_ERROR" };
					const data = `data: ${JSON.stringify(errorMsg)}\n\n`;
					controller.enqueue(encoder.encode(data));
					controller.close();
				},
				complete: () => {
					controller.close();
				},
			});

			// Cleanup on abort
			request.signal.addEventListener("abort", () => {
				subscription.unsubscribe();
				controller.close();
			});
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
// Server Client Factory
// =============================================================================

/**
 * Create a server-side Lens client for use in Server Components.
 *
 * This client uses in-process transport for direct server communication.
 *
 * @example
 * ```ts
 * // lib/lens-server.ts
 * import { createServerClient } from '@sylphx/lens-next/server';
 * import { server } from './server';
 *
 * export const serverClient = createServerClient(server);
 *
 * // app/users/page.tsx (Server Component)
 * import { serverClient } from '@/lib/lens-server';
 *
 * export default async function UsersPage() {
 *   const users = await serverClient.user.list();
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
 * }
 * ```
 */
export function createServerClient<TServer extends LensServer>(
	server: TServer,
): ServerClient<TServer> {
	return createServerProxy(server, "") as ServerClient<TServer>;
}

function createServerProxy(server: LensServer, prefix: string): unknown {
	return new Proxy(() => {}, {
		get(_, prop) {
			if (typeof prop === "symbol") return undefined;
			if (prop === "then") return undefined;

			const path = prefix ? `${prefix}.${prop}` : String(prop);
			return createServerProxy(server, path);
		},
		async apply(_, __, args) {
			const input = args[0];
			const result = await firstValueFrom(server.execute({ path: prefix, input }));

			if (isError(result)) {
				throw new Error(result.error);
			}

			if (isSnapshot(result)) {
				return result.data;
			}

			// ops message - shouldn't happen for one-shot calls
			return null;
		},
	});
}

/**
 * Server client type - use with your router type for type safety
 *
 * @example
 * ```ts
 * import type { AppRouter } from './server';
 * const client = createServerClient(server) as ServerClient<AppRouter>;
 * ```
 */
export type ServerClient<TRouter = any> = {
	[K in keyof TRouter]: TRouter[K] extends (...args: infer A) => any
		? (...args: A) => Promise<Awaited<ReturnType<TRouter[K]>>>
		: TRouter[K] extends object
			? ServerClient<TRouter[K]>
			: never;
};
