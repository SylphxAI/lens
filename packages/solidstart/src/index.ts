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

import { createClient, http, type LensClientConfig } from "@sylphx/lens-client";
import {
	createFrameworkHandler,
	createServerClientProxy,
	type LensServer,
} from "@sylphx/lens-server";
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

	// API Handler (using shared utilities from @sylphx/lens-server)
	// SolidStart wraps requests in { request: Request } so we extract it
	const baseHandler = createFrameworkHandler(server, { basePath });
	const handler = async (event: { request: Request }): Promise<Response> => {
		return baseHandler(event.request);
	};

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

// NOTE: Server client proxy and handler utilities are now imported from @sylphx/lens-server
// See: createServerClientProxy, createFrameworkHandler

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
