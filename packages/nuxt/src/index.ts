/**
 * @sylphx/lens-nuxt
 *
 * Nuxt 3 integration for Lens API framework.
 * Unified setup for server and client.
 *
 * @example
 * ```ts
 * // server/lens.ts
 * import { createLensNuxt } from '@sylphx/lens-nuxt';
 * import { server } from './server';
 *
 * export const lens = createLensNuxt({ server });
 * ```
 *
 * ```ts
 * // server/api/lens/[...path].ts
 * import { lens } from '../lens';
 * export default defineEventHandler(lens.handler);
 * ```
 *
 * ```ts
 * // plugins/lens.ts
 * import { lens } from '~/server/lens';
 * export default defineNuxtPlugin(() => lens.plugin());
 * ```
 *
 * ```vue
 * <!-- pages/users.vue -->
 * <script setup>
 * const { data, pending } = await lens.useQuery('users', c => c.user.list());
 * </script>
 * ```
 */

import { createClient, http, type LensClientConfig } from "@sylphx/lens-client";
import { firstValueFrom, isError, isSnapshot } from "@sylphx/lens-core";
import { createServerClientProxy, type LensServer } from "@sylphx/lens-server";
import { type ComputedRef, computed, ref } from "vue";

// =============================================================================
// Types
// =============================================================================

/** Minimal H3 event type for Nuxt server routes */
interface H3Event {
	node: {
		req: {
			url: string;
			on(event: "data", listener: (chunk: string) => void): void;
			on(event: "end", listener: () => void): void;
		};
		res: unknown;
	};
	method: string;
	path: string;
}

/** Handler response type */
type HandlerResponse = { data: unknown } | { error: string };

export interface CreateLensNuxtOptions<TServer extends LensServer> {
	/** Lens server instance */
	server: TServer;
	/** Configuration options */
	config?: LensNuxtConfig;
}

export interface LensNuxtConfig {
	/** Base path for API routes (default: '/api/lens') */
	basePath?: string;
	/** Client configuration overrides */
	clientConfig?: Partial<LensClientConfig>;
}

export interface LensNuxtInstance<TClient> {
	/** Event handler for Nuxt server routes */
	handler: (event: H3Event) => Promise<HandlerResponse>;

	/** Typed client for client-side usage */
	client: TClient;

	/** Server client for server-side usage (direct execution) */
	serverClient: TClient;

	/** Create Nuxt plugin */
	plugin: () => { provide: { lens: TClient } };

	/** SSR-safe query composable */
	useQuery: <T>(
		key: string,
		queryFn: (client: TClient) => import("@sylphx/lens-client").QueryResult<T>,
		options?: { lazy?: boolean },
	) => Promise<{
		data: ComputedRef<T | null>;
		pending: ComputedRef<boolean>;
		error: ComputedRef<Error | null>;
		refresh: () => Promise<T>;
	}>;

	/** SSR-safe mutation composable */
	useMutation: <TInput, TOutput>(
		mutationFn: (
			client: TClient,
		) => (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>,
	) => {
		data: ComputedRef<TOutput | null>;
		pending: ComputedRef<boolean>;
		error: ComputedRef<Error | null>;
		mutate: (input: TInput) => Promise<import("@sylphx/lens-client").MutationResult<TOutput>>;
		reset: () => void;
	};
}

// =============================================================================
// Main Factory
// =============================================================================

/**
 * Create a unified Lens integration for Nuxt.
 *
 * @example
 * ```ts
 * // server/lens.ts
 * import { createLensNuxt } from '@sylphx/lens-nuxt';
 * import { server } from './server';
 *
 * export const lens = createLensNuxt({ server });
 * ```
 */
export function createLensNuxt<TServer extends LensServer>(
	options: CreateLensNuxtOptions<TServer>,
): LensNuxtInstance<InferClient<TServer>> {
	const { server, config = {} } = options;
	const basePath = config.basePath ?? "/api/lens";

	// Create server-side client (direct execution)
	const serverClient = createServerClientProxy(server) as InferClient<TServer>;

	// Create browser client (HTTP transport)
	const browserClient = createClient({
		transport: http({ url: basePath }),
		...config.clientConfig,
	}) as unknown as InferClient<TServer>;

	// Determine which client to use based on environment
	const getClient = () => {
		if (typeof window === "undefined") {
			return serverClient;
		}
		return browserClient;
	};

	// Handler for Nuxt server routes
	const handler = createHandler(server, basePath);

	// Plugin factory
	const plugin = () => ({
		provide: {
			lens: browserClient,
		},
	});

	// Composables
	const useQuery = createUseQuery(getClient);
	const useMutation = createUseMutation(getClient);

	return {
		handler,
		client: browserClient,
		serverClient,
		plugin,
		useQuery,
		useMutation,
	};
}

// NOTE: createServerClientProxy is now imported from @sylphx/lens-server
// H3 handler functions remain here because they use H3-specific APIs (not standard Web Request)

// =============================================================================
// Nuxt Handler (H3-specific)
// =============================================================================

function createHandler(server: LensServer, basePath: string) {
	return async (event: H3Event): Promise<HandlerResponse> => {
		const path = event.path.replace(basePath, "").replace(/^\//, "");

		// Handle query (GET)
		if (event.method === "GET") {
			return handleQuery(server, path, event);
		}

		// Handle mutation (POST)
		if (event.method === "POST") {
			return handleMutation(server, path, event);
		}

		return { error: "Method not allowed" };
	};
}

async function handleQuery(
	server: LensServer,
	path: string,
	event: H3Event,
): Promise<HandlerResponse> {
	try {
		const url = new URL(event.node.req.url, "http://localhost");
		const inputParam = url.searchParams.get("input");
		const input = inputParam ? JSON.parse(inputParam) : undefined;

		const result = await firstValueFrom(server.execute({ path, input }));

		if (isError(result)) {
			return { error: result.error };
		}

		if (isSnapshot(result)) {
			return { data: result.data };
		}

		return { error: "Unexpected response format" };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "Unknown error" };
	}
}

async function handleMutation(
	server: LensServer,
	path: string,
	event: H3Event,
): Promise<HandlerResponse> {
	try {
		// Read body - in Nuxt this would use readBody()
		const body = await new Promise<{ input?: unknown }>((resolve) => {
			let data = "";
			event.node.req.on("data", (chunk: string) => {
				data += chunk;
			});
			event.node.req.on("end", () => {
				resolve(JSON.parse(data || "{}"));
			});
		});

		const input = body.input;
		const result = await firstValueFrom(server.execute({ path, input }));

		if (isError(result)) {
			return { error: result.error };
		}

		if (isSnapshot(result)) {
			return { data: result.data };
		}

		return { error: "Unexpected response format" };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "Unknown error" };
	}
}

// =============================================================================
// Vue Composables
// =============================================================================

import type { MutationResult, QueryResult } from "@sylphx/lens-client";

function createUseQuery<TClient>(getClient: () => TClient) {
	return async function useQuery<T>(
		_key: string,
		queryFn: (client: TClient) => QueryResult<T>,
		options?: { lazy?: boolean },
	) {
		const client = getClient();
		const data = ref<T | null>(null);
		const pending = ref(!options?.lazy);
		const error = ref<Error | null>(null);

		const execute = async (): Promise<T> => {
			pending.value = true;
			error.value = null;

			try {
				const query = queryFn(client);
				const result = await query;
				data.value = result;
				return result;
			} catch (err) {
				error.value = err instanceof Error ? err : new Error(String(err));
				throw error.value;
			} finally {
				pending.value = false;
			}
		};

		// Initial fetch unless lazy
		if (!options?.lazy) {
			await execute();
		}

		// Setup subscription on client
		if (typeof window !== "undefined") {
			const query = queryFn(client);
			query.subscribe((value) => {
				data.value = value;
			});
		}

		return {
			data: computed(() => data.value),
			pending: computed(() => pending.value),
			error: computed(() => error.value),
			refresh: execute,
		};
	};
}

function createUseMutation<TClient>(getClient: () => TClient) {
	return function useMutation<TInput, TOutput>(
		mutationFn: (client: TClient) => (input: TInput) => Promise<MutationResult<TOutput>>,
	) {
		const client = getClient();
		const mutation = mutationFn(client);

		const data = ref<TOutput | null>(null);
		const pending = ref(false);
		const error = ref<Error | null>(null);

		const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
			pending.value = true;
			error.value = null;

			try {
				const result = await mutation(input);
				data.value = result.data;
				return result;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				error.value = mutationError;
				throw mutationError;
			} finally {
				pending.value = false;
			}
		};

		const reset = () => {
			data.value = null;
			pending.value = false;
			error.value = null;
		};

		return {
			data: computed(() => data.value),
			pending: computed(() => pending.value),
			error: computed(() => error.value),
			mutate,
			reset,
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

export type { LensClientConfig, MutationResult, QueryResult, Transport } from "@sylphx/lens-client";

export { createClient, http, route, ws } from "@sylphx/lens-client";
export {
	LensClientKey,
	type MutationFn,
	provideLensClient,
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	useLensClient,
	useMutation,
	useQuery,
} from "@sylphx/lens-vue";
