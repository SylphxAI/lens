/**
 * @sylphx/lens-next
 *
 * Next.js integration for Lens API framework.
 * Unified setup for server and client, similar to tRPC.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensNext } from '@sylphx/lens-next';
 * import { server } from './server';
 *
 * export const lens = createLensNext({
 *   server,
 *   config: {
 *     basePath: '/api/lens',
 *   },
 * });
 *
 * // Export for use throughout the app
 * export const { handler, client, serverClient } = lens;
 * ```
 *
 * ```ts
 * // app/api/lens/[...path]/route.ts
 * import { handler } from '@/lib/lens';
 * export const GET = handler;
 * export const POST = handler;
 * ```
 *
 * ```tsx
 * // app/providers.tsx
 * 'use client';
 * import { lens } from '@/lib/lens';
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <lens.Provider>{children}</lens.Provider>;
 * }
 * ```
 *
 * ```tsx
 * // app/users/page.tsx (Server Component)
 * import { serverClient } from '@/lib/lens';
 *
 * export default async function UsersPage() {
 *   const users = await serverClient.user.list();
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
 * }
 * ```
 *
 * ```tsx
 * // components/UserProfile.tsx (Client Component)
 * 'use client';
 * import { lens } from '@/lib/lens';
 *
 * export function UserProfile({ userId }: { userId: string }) {
 *   const { data, loading } = lens.useQuery(c => c.user.get({ id: userId }));
 *   if (loading) return <Spinner />;
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */

import { createClient, http, type LensClientConfig } from "@sylphx/lens-client";
import type { LensServer } from "@sylphx/lens-server";
import type { ReactNode } from "react";

// =============================================================================
// Types
// =============================================================================

export interface CreateLensNextOptions<TServer extends LensServer> {
	/** Lens server instance */
	server: TServer;
	/** Configuration options */
	config?: LensNextConfig;
}

export interface LensNextConfig {
	/** Base path for API routes (default: '/api/lens') */
	basePath?: string;
	/** Client configuration overrides */
	clientConfig?: Partial<LensClientConfig>;
}

export interface LensNextInstance<TClient> {
	/** API route handler for Next.js App Router */
	handler: (request: Request) => Promise<Response>;

	/** Typed client for client components (requires Provider) */
	client: TClient;

	/** Server client for Server Components (direct execution) */
	serverClient: TClient;

	/** React Provider component */
	Provider: (props: { children: ReactNode }) => ReactNode;

	/** Hook: Query with reactive updates */
	useQuery: <T>(
		queryFn: (client: TClient) => import("@sylphx/lens-client").QueryResult<T>,
		options?: { skip?: boolean },
	) => {
		data: T | null;
		loading: boolean;
		error: Error | null;
		refetch: () => void;
	};

	/** Hook: Lazy query (execute on demand) */
	useLazyQuery: <T>(queryFn: (client: TClient) => import("@sylphx/lens-client").QueryResult<T>) => {
		data: T | null;
		loading: boolean;
		error: Error | null;
		execute: () => Promise<T>;
		reset: () => void;
	};

	/** Hook: Mutation */
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
 * Create a unified Lens integration for Next.js.
 *
 * Returns everything you need: handler, client, serverClient, Provider, and hooks.
 *
 * @example
 * ```ts
 * // lib/lens.ts
 * import { createLensNext } from '@sylphx/lens-next';
 * import { server } from './server';
 *
 * export const lens = createLensNext({ server });
 *
 * export const { handler, client, serverClient } = lens;
 * ```
 */
export function createLensNext<TServer extends LensServer>(
	options: CreateLensNextOptions<TServer>,
): LensNextInstance<InferClient<TServer>> {
	const { server, config = {} } = options;
	const basePath = config.basePath ?? "/api/lens";

	// Create server-side client (direct execution)
	const serverClient = createServerClientProxy(server) as InferClient<TServer>;

	// Create browser client (HTTP transport)
	const browserClient = createClient({
		transport: http({ url: basePath }),
		...config.clientConfig,
	}) as unknown as InferClient<TServer>;

	// API Handler
	const handler = createHandler(server, basePath);

	// Hooks implementation (will use React context internally)
	const useQuery = createUseQuery(browserClient);
	const useLazyQuery = createUseLazyQuery(browserClient);
	const useMutation = createUseMutation(browserClient);

	// Provider component
	const Provider = createProvider(browserClient);

	return {
		handler,
		client: browserClient,
		serverClient,
		Provider,
		useQuery,
		useLazyQuery,
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
// API Handler
// =============================================================================

function createHandler(server: LensServer, basePath: string) {
	return async (request: Request): Promise<Response> => {
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

				const _subscription = observable.subscribe({
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

				// Note: cleanup on abort requires AbortSignal support
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
// React Hooks (Inline Implementation)
// =============================================================================

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Context for client
const LensClientContext = createContext<unknown>(null);

function createProvider<TClient>(client: TClient) {
	return function LensProvider({ children }: { children: ReactNode }): ReactNode {
		// Using createElement to avoid JSX
		const { createElement } = require("react");
		return createElement(LensClientContext.Provider, { value: client }, children);
	};
}

function createUseQuery<TClient>(defaultClient: TClient) {
	return function useQuery<T>(
		queryFn: (client: TClient) => QueryResult<T>,
		options?: { skip?: boolean },
	) {
		const contextClient = useContext(LensClientContext) as TClient | null;
		const client = contextClient ?? defaultClient;
		const query = queryFn(client);

		const [data, setData] = useState<T | null>(null);
		const [loading, setLoading] = useState(!options?.skip);
		const [error, setError] = useState<Error | null>(null);

		const mountedRef = useRef(true);

		useEffect(() => {
			mountedRef.current = true;

			if (options?.skip) {
				setData(null);
				setLoading(false);
				setError(null);
				return;
			}

			setLoading(true);
			setError(null);

			const unsubscribe = query.subscribe((value) => {
				if (mountedRef.current) {
					setData(value);
					setLoading(false);
				}
			});

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
		}, [query, options?.skip]);

		const refetch = useCallback(() => {
			if (options?.skip) return;

			setLoading(true);
			setError(null);

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
		}, [query, options?.skip]);

		return { data, loading, error, refetch };
	};
}

function createUseLazyQuery<TClient>(defaultClient: TClient) {
	return function useLazyQuery<T>(queryFn: (client: TClient) => QueryResult<T>) {
		const contextClient = useContext(LensClientContext) as TClient | null;
		const client = contextClient ?? defaultClient;

		const [data, setData] = useState<T | null>(null);
		const [loading, setLoading] = useState(false);
		const [error, setError] = useState<Error | null>(null);

		const mountedRef = useRef(true);

		useEffect(() => {
			mountedRef.current = true;
			return () => {
				mountedRef.current = false;
			};
		}, []);

		const execute = useCallback(async (): Promise<T> => {
			const query = queryFn(client);

			setLoading(true);
			setError(null);

			try {
				const result = await query;
				if (mountedRef.current) {
					setData(result);
				}
				return result;
			} catch (err) {
				const queryError = err instanceof Error ? err : new Error(String(err));
				if (mountedRef.current) {
					setError(queryError);
				}
				throw queryError;
			} finally {
				if (mountedRef.current) {
					setLoading(false);
				}
			}
		}, [client, queryFn]);

		const reset = useCallback(() => {
			setData(null);
			setLoading(false);
			setError(null);
		}, []);

		return { data, loading, error, execute, reset };
	};
}

function createUseMutation<TClient>(defaultClient: TClient) {
	return function useMutation<TInput, TOutput>(
		mutationFn: (client: TClient) => (input: TInput) => Promise<MutationResult<TOutput>>,
	) {
		const contextClient = useContext(LensClientContext) as TClient | null;
		const client = contextClient ?? defaultClient;
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

/** Infer client type from server */
export type InferClient<TServer> = TServer extends LensServer
	? {
			[key: string]: unknown;
		}
	: never;

// =============================================================================
// Legacy Exports (for backwards compatibility)
// =============================================================================

export type { LensClientConfig, MutationResult, QueryResult, Transport } from "@sylphx/lens-client";

// Re-export client utilities
export { createClient, http, route, ws } from "@sylphx/lens-client";
// Re-export React hooks and context
export {
	LensProvider,
	type LensProviderProps,
	type MutationFn,
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	useLensClient,
	useMutation,
	useQuery,
} from "@sylphx/lens-react";

// Legacy utilities
export async function fetchQuery<T>(query: QueryResult<T>): Promise<T> {
	return await query;
}

export interface DehydratedState {
	queries: Record<string, unknown>;
	timestamp: number;
}

export function dehydrate(data: Record<string, unknown>): DehydratedState {
	return {
		queries: data,
		timestamp: Date.now(),
	};
}

export { HydrationBoundary, useHydration } from "./hydration.js";
