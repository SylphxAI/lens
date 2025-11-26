/**
 * @sylphx/lens-fresh
 *
 * Fresh (Deno/Preact) integration for Lens API framework.
 * Provides server-side data fetching and island hydration utilities.
 *
 * @example
 * ```tsx
 * // routes/users/[id].tsx
 * import { Handlers, PageProps } from '$fresh/server.ts';
 * import { fetchQuery } from '@sylphx/lens-fresh';
 * import { serverClient } from '~/lib/lens.ts';
 * import UserProfile from '~/islands/UserProfile.tsx';
 *
 * export const handler: Handlers = {
 *   async GET(_, ctx) {
 *     const user = await fetchQuery(serverClient.user.get({ id: ctx.params.id }));
 *     return ctx.render({ user });
 *   },
 * };
 *
 * export default function UserPage({ data }: PageProps<{ user: User }>) {
 *   return <UserProfile user={data.user} />;
 * }
 * ```
 */

// Re-export Preact hooks and context
export {
	LensProvider,
	useLensClient,
	useQuery,
	useLazyQuery,
	useMutation,
	type LensProviderProps,
	type QueryInput,
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "@sylphx/lens-preact";

// Re-export client utilities
export { createClient, http, ws, route } from "@sylphx/lens-client";
export type {
	LensClientConfig,
	QueryResult,
	MutationResult,
	Transport,
} from "@sylphx/lens-client";

// =============================================================================
// Fresh Server Utilities
// =============================================================================

import type { QueryResult, MutationResult } from "@sylphx/lens-client";

/**
 * Server-side query execution for Fresh handlers.
 *
 * Use this in route handlers to fetch data on the server.
 *
 * @example
 * ```tsx
 * // routes/users/index.tsx
 * import { Handlers } from '$fresh/server.ts';
 * import { fetchQuery } from '@sylphx/lens-fresh';
 * import { serverClient } from '~/lib/lens.ts';
 *
 * export const handler: Handlers = {
 *   async GET(_, ctx) {
 *     const users = await fetchQuery(serverClient.user.list());
 *     return ctx.render({ users });
 *   },
 * };
 * ```
 */
export async function fetchQuery<T>(query: QueryResult<T>): Promise<T> {
	return await query;
}

/**
 * Server-side mutation execution for Fresh handlers.
 *
 * @example
 * ```tsx
 * // routes/api/users.tsx
 * import { Handlers } from '$fresh/server.ts';
 * import { executeMutation } from '@sylphx/lens-fresh';
 * import { serverClient } from '~/lib/lens.ts';
 *
 * export const handler: Handlers = {
 *   async POST(req) {
 *     const body = await req.json();
 *     const result = await executeMutation(serverClient.user.create(body));
 *     return Response.json(result);
 *   },
 * };
 * ```
 */
export async function executeMutation<T>(
	mutation: Promise<MutationResult<T>>,
): Promise<T> {
	const result = await mutation;
	return result.data;
}

// =============================================================================
// Fresh Handler Factory
// =============================================================================

import type { LensServer } from "@sylphx/lens-server";

/**
 * Create a Fresh handler for Lens API endpoints.
 *
 * @example
 * ```tsx
 * // routes/api/lens/[...path].tsx
 * import { createFreshHandler } from '@sylphx/lens-fresh';
 * import { server } from '~/lib/server.ts';
 *
 * export const handler = createFreshHandler(server);
 * ```
 */
export function createFreshHandler(
	server: LensServer,
): {
	GET: (req: Request) => Promise<Response>;
	POST: (req: Request) => Promise<Response>;
} {
	const handleRequest = async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		// Extract path after /api/lens/
		const pathMatch = url.pathname.match(/\/api\/lens\/(.+)/);
		const path = pathMatch ? pathMatch[1] : "";

		// Handle SSE subscription
		if (req.headers.get("accept") === "text/event-stream") {
			return handleSSE(server, path, req);
		}

		// Handle query
		if (req.method === "GET") {
			return handleQuery(server, path, url);
		}

		// Handle mutation
		if (req.method === "POST") {
			return handleMutation(server, path, req);
		}

		return new Response("Method not allowed", { status: 405 });
	};

	return {
		GET: handleRequest,
		POST: handleRequest,
	};
}

async function handleQuery(
	server: LensServer,
	path: string,
	url: URL,
): Promise<Response> {
	try {
		const inputParam = url.searchParams.get("input");
		const input = inputParam ? JSON.parse(inputParam) : undefined;

		const result = await server.execute({
			path,
			input,
		});

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

async function handleMutation(
	server: LensServer,
	path: string,
	req: Request,
): Promise<Response> {
	try {
		const body = await req.json();
		const input = body.input;

		const result = await server.execute({
			path,
			input,
		});

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

function handleSSE(
	server: LensServer,
	path: string,
	req: Request,
): Response {
	const url = new URL(req.url);
	const inputParam = url.searchParams.get("input");
	const input = inputParam ? JSON.parse(inputParam) : undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const result = server.execute({
				path,
				input,
			});

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

				req.signal.addEventListener("abort", () => {
					subscription.unsubscribe();
					controller.close();
				});
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
// Island Data Transfer
// =============================================================================

/**
 * Serialize data for passing from server to island.
 *
 * Fresh islands receive data as props, which must be serializable.
 * Use this to prepare server data for island hydration.
 *
 * @example
 * ```tsx
 * // routes/users/[id].tsx
 * import { serializeForIsland } from '@sylphx/lens-fresh';
 *
 * export const handler: Handlers = {
 *   async GET(_, ctx) {
 *     const user = await fetchQuery(serverClient.user.get({ id: ctx.params.id }));
 *     return ctx.render({ user: serializeForIsland(user) });
 *   },
 * };
 *
 * // islands/UserProfile.tsx
 * import { useIslandData } from '@sylphx/lens-fresh/islands';
 *
 * export default function UserProfile(props: { user: SerializedData<User> }) {
 *   const user = useIslandData(props.user);
 *   // user is now a reactive value
 * }
 * ```
 */
export interface SerializedData<T> {
	__lens_data__: true;
	data: T;
	timestamp: number;
}

export function serializeForIsland<T>(data: T): SerializedData<T> {
	return {
		__lens_data__: true,
		data,
		timestamp: Date.now(),
	};
}

export function isSerializedData<T>(value: unknown): value is SerializedData<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		"__lens_data__" in value &&
		(value as SerializedData<T>).__lens_data__ === true
	);
}
