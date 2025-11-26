/**
 * @sylphx/lens-fresh
 *
 * Fresh (Deno/Preact) integration for Lens API framework.
 * Unified setup for server and client with islands support.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensFresh } from '@sylphx/lens-fresh';
 * import { server } from './server.ts';
 *
 * export const lens = createLensFresh({ server });
 * ```
 *
 * ```ts
 * // routes/api/lens/[...path].ts
 * import { lens } from '~/lib/lens.ts';
 * export const handler = lens.handler;
 * ```
 *
 * ```tsx
 * // routes/users/[id].tsx
 * import { lens } from '~/lib/lens.ts';
 * import UserProfile from '~/islands/UserProfile.tsx';
 *
 * export const handler: Handlers = {
 *   async GET(_, ctx) {
 *     const user = await lens.serverClient.user.get({ id: ctx.params.id });
 *     return ctx.render({ user: lens.serialize(user) });
 *   },
 * };
 *
 * export default function UserPage({ data }: PageProps) {
 *   return <UserProfile initialData={data.user} userId={data.user.data.id} />;
 * }
 * ```
 *
 * ```tsx
 * // islands/UserProfile.tsx
 * import { lens } from '~/lib/lens.ts';
 *
 * export default function UserProfile({ initialData, userId }: Props) {
 *   const { data } = lens.useIslandQuery(
 *     c => c.user.get({ id: userId }),
 *     { initialData }
 *   );
 *
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */

import { http, type LensClientConfig, createClient } from "@sylphx/lens-client";
import type { LensServer } from "@sylphx/lens-server";

// =============================================================================
// Types
// =============================================================================

export interface CreateLensFreshOptions<TServer extends LensServer> {
	/** Lens server instance */
	server: TServer;
	/** Configuration options */
	config?: LensFreshConfig;
}

export interface LensFreshConfig {
	/** Base path for API routes (default: '/api/lens') */
	basePath?: string;
	/** Client configuration overrides */
	clientConfig?: Partial<LensClientConfig>;
}

export interface SerializedData<T> {
	__lens_data__: true;
	data: T;
	timestamp: number;
}

export interface LensFreshInstance<TClient> {
	/** Fresh handler for API routes */
	handler: {
		GET: (req: Request) => Promise<Response>;
		POST: (req: Request) => Promise<Response>;
	};

	/** Typed client for client-side */
	client: TClient;

	/** Server client for server-side (direct execution) */
	serverClient: TClient;

	/** Serialize data for passing to islands */
	serialize: <T>(data: T) => SerializedData<T>;

	/** Check if value is serialized data */
	isSerializedData: <T>(value: unknown) => value is SerializedData<T>;

	/** Hook for islands with initial data support */
	useIslandQuery: <T>(
		queryFn: (client: TClient) => import("@sylphx/lens-client").QueryResult<T>,
		options?: { initialData?: SerializedData<T> | T; skip?: boolean },
	) => {
		data: T | null;
		loading: boolean;
		error: Error | null;
		refetch: () => void;
	};

	/** Mutation hook for islands */
	useMutation: <TInput, TOutput>(
		mutationFn: (
			client: TClient,
		) => (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>,
	) => {
		data: TOutput | null;
		loading: boolean;
		error: Error | null;
		mutate: (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>;
		reset: () => void;
	};
}

// =============================================================================
// Main Factory
// =============================================================================

/**
 * Create a unified Lens integration for Fresh.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensFresh } from '@sylphx/lens-fresh';
 * import { server } from './server.ts';
 *
 * export const lens = createLensFresh({ server });
 * ```
 */
export function createLensFresh<TServer extends LensServer>(
	options: CreateLensFreshOptions<TServer>,
): LensFreshInstance<InferClient<TServer>> {
	const { server, config = {} } = options;
	const basePath = config.basePath ?? "/api/lens";

	// Create server-side client (direct execution)
	const serverClient = createServerClientProxy(server) as InferClient<TServer>;

	// Create browser client (HTTP transport)
	const browserClient = createClient({
		transport: http({ url: basePath }),
		...config.clientConfig,
	}) as unknown as InferClient<TServer>;

	// Handler
	const handler = createHandler(server, basePath);

	// Serialization utilities
	const serialize = <T>(data: T): SerializedData<T> => ({
		__lens_data__: true,
		data,
		timestamp: Date.now(),
	});

	const isSerializedData = <T>(value: unknown): value is SerializedData<T> => {
		return (
			value !== null &&
			typeof value === "object" &&
			"__lens_data__" in value &&
			(value as SerializedData<T>).__lens_data__ === true
		);
	};

	// Hooks
	const useIslandQuery = createUseIslandQuery(browserClient, isSerializedData);
	const useMutation = createUseMutation(browserClient);

	return {
		handler,
		client: browserClient,
		serverClient,
		serialize,
		isSerializedData,
		useIslandQuery,
		useMutation,
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
// Fresh Handler
// =============================================================================

function createHandler(server: LensServer, basePath: string) {
	const handleRequest = async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		const pathMatch = url.pathname.match(new RegExp(`${basePath}/(.+)`));
		const path = pathMatch ? pathMatch[1] : "";

		// Handle SSE subscription
		if (req.headers.get("accept") === "text/event-stream") {
			return handleSSE(server, path, req);
		}

		// Handle query (GET)
		if (req.method === "GET") {
			return handleQuery(server, path, url);
		}

		// Handle mutation (POST)
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

async function handleMutation(server: LensServer, path: string, req: Request): Promise<Response> {
	try {
		const body = await req.json();
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

function handleSSE(server: LensServer, path: string, req: Request): Response {
	const url = new URL(req.url);
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
// Preact Hooks
// =============================================================================

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

function createUseIslandQuery<TClient>(
	client: TClient,
	isSerializedData: <T>(value: unknown) => value is SerializedData<T>,
) {
	return function useIslandQuery<T>(
		queryFn: (client: TClient) => QueryResult<T>,
		options?: { initialData?: SerializedData<T> | T; skip?: boolean },
	) {
		// Extract initial data
		const initialData = options?.initialData
			? isSerializedData<T>(options.initialData)
				? options.initialData.data
				: options.initialData
			: null;

		const [data, setData] = useState<T | null>(initialData);
		const [loading, setLoading] = useState(!initialData && !options?.skip);
		const [error, setError] = useState<Error | null>(null);

		const mountedRef = useRef(true);

		// biome-ignore lint/correctness/useExhaustiveDependencies: client and queryFn are stable references from closure
		useEffect(() => {
			mountedRef.current = true;

			if (options?.skip) {
				return;
			}

			const query = queryFn(client);

			// Subscribe to updates
			const unsubscribe = query.subscribe((value) => {
				if (mountedRef.current) {
					setData(value);
					setLoading(false);
				}
			});

			// Initial fetch if no initial data
			if (!initialData) {
				setLoading(true);
			}

			query.then(
				(value) => {
					if (mountedRef.current) {
						setData(value);
						setLoading(false);
					}
				},
				(err) => {
					if (mountedRef.current) {
						setError(err instanceof Error ? err : new Error(String(err)));
						setLoading(false);
					}
				},
			);

			return () => {
				mountedRef.current = false;
				unsubscribe();
			};
		}, [options?.skip, initialData]);

		// biome-ignore lint/correctness/useExhaustiveDependencies: client and queryFn are stable references from closure
		const refetch = useCallback(() => {
			if (options?.skip) return;

			setLoading(true);
			setError(null);

			const query = queryFn(client);
			query.then(
				(value) => {
					if (mountedRef.current) {
						setData(value);
						setLoading(false);
					}
				},
				(err) => {
					if (mountedRef.current) {
						setError(err instanceof Error ? err : new Error(String(err)));
						setLoading(false);
					}
				},
			);
		}, [options?.skip]);

		return { data, loading, error, refetch };
	};
}

function createUseMutation<TClient>(client: TClient) {
	return function useMutation<TInput, TOutput>(
		mutationFn: (client: TClient) => (input: TInput) => Promise<MutationResult<TOutput>>,
	) {
		const mutation = mutationFn(client);

		const [data, setData] = useState<TOutput | null>(null);
		const [loading, setLoading] = useState(false);
		const [error, setError] = useState<Error | null>(null);

		const mountedRef = useRef(true);

		useEffect(() => {
			mountedRef.current = true;
			return () => {
				mountedRef.current = false;
			};
		}, []);

		const mutate = useCallback(
			async (input: TInput): Promise<MutationResult<TOutput>> => {
				setLoading(true);
				setError(null);

				try {
					const result = await mutation(input);
					if (mountedRef.current) {
						setData(result.data);
					}
					return result;
				} catch (err) {
					const mutationError = err instanceof Error ? err : new Error(String(err));
					if (mountedRef.current) {
						setError(mutationError);
					}
					throw mutationError;
				} finally {
					if (mountedRef.current) {
						setLoading(false);
					}
				}
			},
			[mutation],
		);

		const reset = useCallback(() => {
			setData(null);
			setLoading(false);
			setError(null);
		}, []);

		return { data, loading, error, mutate, reset };
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

export { createClient, http, ws, route } from "@sylphx/lens-client";
export type { LensClientConfig, QueryResult, MutationResult, Transport } from "@sylphx/lens-client";

// Legacy utilities
export async function fetchQuery<T>(query: QueryResult<T>): Promise<T> {
	return await query;
}

export async function executeMutation<T>(mutation: Promise<MutationResult<T>>): Promise<T> {
	const result = await mutation;
	return result.data;
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
