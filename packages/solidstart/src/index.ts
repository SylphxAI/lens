/**
 * @sylphx/lens-solidstart
 *
 * SolidStart integration for Lens API framework.
 * Unified setup for server and client.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensSolidStart } from '@sylphx/lens-solidstart';
 * import { server } from './server';
 *
 * export const lens = createLensSolidStart({ server });
 * ```
 *
 * ```ts
 * // routes/api/lens/[...path].ts
 * import { lens } from '~/lib/lens';
 * export const GET = lens.handler;
 * export const POST = lens.handler;
 * ```
 *
 * ```tsx
 * // routes/users.tsx
 * import { lens } from '~/lib/lens';
 *
 * export default function UsersPage() {
 *   const users = lens.createQuery(c => c.user.list());
 *
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <For each={users()}>{user => <div>{user.name}</div>}</For>
 *     </Suspense>
 *   );
 * }
 * ```
 */

import { http, type LensClientConfig, createClient } from "@sylphx/lens-client";
import type { LensServer } from "@sylphx/lens-server";
import { type Accessor, createResource, createSignal } from "solid-js";

// =============================================================================
// Types
// =============================================================================

export interface CreateLensSolidStartOptions<TServer extends LensServer> {
	/** Lens server instance */
	server: TServer;
	/** Configuration options */
	config?: LensSolidStartConfig;
}

export interface LensSolidStartConfig {
	/** Base path for API routes (default: '/api/lens') */
	basePath?: string;
	/** Client configuration overrides */
	clientConfig?: Partial<LensClientConfig>;
}

export interface LensSolidStartInstance<TClient> {
	/** API route handler */
	handler: (event: { request: Request }) => Promise<Response>;

	/** Typed client */
	client: TClient;

	/** Server client for server-side usage */
	serverClient: TClient;

	/** Create a reactive query */
	createQuery: <T>(
		queryFn: (client: TClient) => import("@sylphx/lens-client").QueryResult<T>,
		options?: { skip?: boolean },
	) => Accessor<T | undefined>;

	/** Create a mutation */
	createMutation: <TInput, TOutput>(
		mutationFn: (
			client: TClient,
		) => (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>,
	) => {
		mutate: (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>;
		data: Accessor<TOutput | null>;
		pending: Accessor<boolean>;
		error: Accessor<Error | null>;
		reset: () => void;
	};

	/** Create a server-side query (for route data) */
	serverQuery: <TArgs extends unknown[], TResult>(
		queryFn: (
			client: TClient,
			...args: TArgs
		) => import("@sylphx/lens-client").QueryResult<TResult>,
	) => (...args: TArgs) => Promise<TResult>;
}

// =============================================================================
// Main Factory
// =============================================================================

/**
 * Create a unified Lens integration for SolidStart.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensSolidStart } from '@sylphx/lens-solidstart';
 * import { server } from './server';
 *
 * export const lens = createLensSolidStart({ server });
 * ```
 */
export function createLensSolidStart<TServer extends LensServer>(
	options: CreateLensSolidStartOptions<TServer>,
): LensSolidStartInstance<InferClient<TServer>> {
	const { server, config = {} } = options;
	const basePath = config.basePath ?? "/api/lens";

	// Create server-side client (direct execution)
	const serverClient = createServerClientProxy(server) as InferClient<TServer>;

	// Create browser client (HTTP transport)
	const browserClient = createClient({
		transport: http({ url: basePath }),
		...config.clientConfig,
	}) as unknown as InferClient<TServer>;

	// Determine which client to use
	const getClient = () => {
		if (typeof window === "undefined") {
			return serverClient;
		}
		return browserClient;
	};

	// API Handler
	const handler = createHandler(server, basePath);

	// Primitives
	const createQueryFn = createCreateQuery(getClient);
	const createMutationFn = createCreateMutation(getClient);
	const serverQueryFn = createServerQuery(serverClient);

	return {
		handler,
		client: browserClient,
		serverClient,
		createQuery: createQueryFn,
		createMutation: createMutationFn,
		serverQuery: serverQueryFn,
	};
}

// =============================================================================
// Server Client (Direct Execution)
// =============================================================================

function createServerClientProxy(server: LensServer): unknown {
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
				const result = await server.execute({ path, input });

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
// API Handler
// =============================================================================

function createHandler(server: LensServer, basePath: string) {
	return async (event: { request: Request }): Promise<Response> => {
		const request = event.request;
		const url = new URL(request.url);
		const path = url.pathname.replace(basePath, "").replace(/^\//, "");

		// Handle SSE subscription
		if (request.headers.get("accept") === "text/event-stream") {
			return handleSSE(server, path, url);
		}

		// Handle query (GET)
		if (request.method === "GET") {
			return handleQuery(server, path, url);
		}

		// Handle mutation (POST)
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

		const result = await server.execute({ path, input });

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
	request: Request,
): Promise<Response> {
	try {
		const body = await request.json();
		const input = body.input;

		const result = await server.execute({ path, input });

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

function handleSSE(server: LensServer, path: string, url: URL): Response {
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

				observable.subscribe({
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
// Solid Primitives
// =============================================================================

import type { MutationResult, QueryResult } from "@sylphx/lens-client";

function createCreateQuery<TClient>(getClient: () => TClient) {
	return function createQuery<T>(
		queryFn: (client: TClient) => QueryResult<T>,
		options?: { skip?: boolean },
	): Accessor<T | undefined> {
		const client = getClient();

		const [resource] = createResource(
			() => !options?.skip,
			async (shouldFetch) => {
				if (!shouldFetch) return undefined;
				const query = queryFn(client);
				return await query;
			},
		);

		return resource;
	};
}

function createCreateMutation<TClient>(getClient: () => TClient) {
	return function createMutation<TInput, TOutput>(
		mutationFn: (client: TClient) => (input: TInput) => Promise<MutationResult<TOutput>>,
	) {
		const client = getClient();
		const mutation = mutationFn(client);

		const [pending, setPending] = createSignal(false);
		const [error, setError] = createSignal<Error | null>(null);
		const [data, setData] = createSignal<TOutput | null>(null);

		const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
			setPending(true);
			setError(null);

			try {
				const result = await mutation(input);
				setData(() => result.data);
				return result;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				setError(() => mutationError);
				throw mutationError;
			} finally {
				setPending(false);
			}
		};

		const reset = () => {
			setPending(false);
			setError(null);
			setData(null);
		};

		return { mutate, pending, error, data, reset };
	};
}

function createServerQuery<TClient>(serverClient: TClient) {
	return function serverQuery<TArgs extends unknown[], TResult>(
		queryFn: (client: TClient, ...args: TArgs) => QueryResult<TResult>,
	): (...args: TArgs) => Promise<TResult> {
		return async (...args: TArgs): Promise<TResult> => {
			const query = queryFn(serverClient, ...args);
			return await query;
		};
	};
}

// =============================================================================
// Type Inference
// =============================================================================

export type InferClient<TServer> = TServer extends LensServer
	? {
			[key: string]: unknown;
		}
	: never;

// =============================================================================
// Legacy Exports (for backwards compatibility)
// =============================================================================

export {
	LensProvider,
	useLensClient,
	createQuery,
	createLazyQuery,
	createMutation,
	type LensProviderProps,
	type QueryInput,
	type CreateQueryResult,
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type MutationFn,
} from "@sylphx/lens-solid";

export { createClient, http, ws, route } from "@sylphx/lens-client";
export type { LensClientConfig, QueryResult, MutationResult, Transport } from "@sylphx/lens-client";

// Legacy helpers
export function createLensQuery<T>(
	queryFn: () => QueryResult<T>,
	options?: { skip?: boolean },
): Accessor<T | undefined> {
	const [resource] = createResource(
		() => !options?.skip,
		async (shouldFetch) => {
			if (!shouldFetch) return undefined;
			const query = queryFn();
			return await query;
		},
	);

	return resource;
}

export function createLensMutation<TInput, TOutput>(
	mutationFn: (input: TInput) => Promise<MutationResult<TOutput>>,
) {
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<Error | null>(null);
	const [data, setData] = createSignal<TOutput | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		setPending(true);
		setError(null);

		try {
			const result = await mutationFn(input);
			setData(() => result.data);
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			setError(() => mutationError);
			throw mutationError;
		} finally {
			setPending(false);
		}
	};

	const reset = () => {
		setPending(false);
		setError(null);
		setData(null);
	};

	return { mutate, pending, error, data, reset };
}

export function createServerQuery_legacy<TArgs extends unknown[], TResult>(
	queryFn: (...args: TArgs) => QueryResult<TResult>,
): (...args: TArgs) => Promise<TResult> {
	return async (...args: TArgs): Promise<TResult> => {
		const query = queryFn(...args);
		return await query;
	};
}

export function createServerAction<TInput, TOutput>(
	actionFn: (input: TInput) => Promise<MutationResult<TOutput>>,
): (input: TInput) => Promise<TOutput> {
	return async (input: TInput): Promise<TOutput> => {
		const result = await actionFn(input);
		return result.data;
	};
}
