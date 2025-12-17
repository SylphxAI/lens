/**
 * @sylphx/lens-solid - Create Client
 *
 * Creates a typed Lens client with SolidJS primitives.
 * Base client methods work in vanilla JS, primitives are extensions.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-solid';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Vanilla JS (anywhere - SSR, utilities, event handlers)
 * const user = await client.user.get({ args: { id } });
 * client.user.get({ args: { id } }).subscribe(data => console.log(data));
 *
 * // SolidJS primitives (in components)
 * const { data, loading } = client.user.get.createQuery({ args: { id } });
 * const { mutate, loading } = client.user.create.createMutation();
 * ```
 */

import {
	createClient as createBaseClient,
	type LensClientConfig,
	type QueryResult,
	type SelectionObject,
	type TypedClientConfig,
} from "@sylphx/lens-client";
import type { MutationDef, QueryDef, RouterDef, RouterRoutes } from "@sylphx/lens-core";
import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";

// =============================================================================
// Types
// =============================================================================

/**
 * Debug callbacks for query primitives.
 * @internal For debugging purposes only - not recommended for production use.
 */
export interface QueryDebugOptions<T> {
	/** Called when data is received */
	onData?: (data: T) => void;
	/** Called when an error occurs */
	onError?: (error: Error) => void;
	/** Called when subscription starts */
	onSubscribe?: () => void;
	/** Called when subscription ends */
	onUnsubscribe?: () => void;
}

/** Query primitive options */
export interface QueryPrimitiveOptions<TInput, TOutput = unknown> {
	/** Query args parameters */
	args?: TInput;
	/** Field selection */
	select?: SelectionObject;
	/** Skip query execution */
	skip?: boolean;
	/**
	 * Debug callbacks for development.
	 * @internal For debugging purposes only - not recommended for production use.
	 */
	debug?: QueryDebugOptions<TOutput>;
}

/** Query primitive result */
export interface QueryPrimitiveResult<T> {
	/** Reactive data accessor */
	data: Accessor<T | null>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Refetch the query */
	refetch: () => void;
}

/** Mutation primitive options */
export interface MutationPrimitiveOptions<TOutput> {
	/** Called on successful mutation */
	onSuccess?: (data: TOutput) => void;
	/** Called on mutation error */
	onError?: (error: Error) => void;
	/** Called when mutation settles (success or error) */
	onSettled?: () => void;
}

/** Mutation primitive result */
export interface MutationPrimitiveResult<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (options: { args: TInput; select?: SelectionObject }) => Promise<TOutput>;
	/** Reactive loading state */
	loading: Accessor<boolean>;
	/** Reactive error state */
	error: Accessor<Error | null>;
	/** Reactive last mutation result */
	data: Accessor<TOutput | null>;
	/** Reset mutation state */
	reset: () => void;
}

/** Query endpoint with SolidJS primitives */
export interface QueryEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns QueryResult (Promise + Observable) */
	(options?: { args?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

	/** SolidJS primitive for reactive queries */
	createQuery: (
		options?: TInput extends void
			? QueryPrimitiveOptions<void, TOutput> | void
			: QueryPrimitiveOptions<TInput, TOutput>,
	) => QueryPrimitiveResult<TOutput>;
}

/** Mutation endpoint with SolidJS primitives */
export interface MutationEndpoint<TInput, TOutput> {
	/** Vanilla JS call - returns Promise */
	(options: { args: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

	/** SolidJS primitive for mutations */
	createMutation: (
		options?: MutationPrimitiveOptions<TOutput>,
	) => MutationPrimitiveResult<TInput, TOutput>;
}

/** Infer client type from router routes */
type InferTypedClient<TRoutes extends RouterRoutes> = {
	[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
		? InferTypedClient<TNestedRoutes>
		: TRoutes[K] extends QueryDef<infer TInput, infer TOutput>
			? QueryEndpoint<TInput, TOutput>
			: TRoutes[K] extends MutationDef<infer TInput, infer TOutput>
				? MutationEndpoint<TInput, TOutput>
				: never;
};

/** Typed client from router */
export type TypedClient<TRouter extends RouterDef> =
	TRouter extends RouterDef<infer TRoutes> ? InferTypedClient<TRoutes> : never;

// =============================================================================
// Primitive Factories
// =============================================================================

/**
 * Create createQuery primitive for a specific endpoint
 */
function createQueryPrimitiveFactory<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => QueryResult<TOutput>,
) {
	return function createQuery(
		options?: QueryPrimitiveOptions<TInput, TOutput>,
	): QueryPrimitiveResult<TOutput> {
		const [data, setData] = createSignal<TOutput | null>(null);
		const [loading, setLoading] = createSignal(!options?.skip);
		const [error, setError] = createSignal<Error | null>(null);

		let unsubscribe: (() => void) | null = null;

		const executeQuery = () => {
			if (unsubscribe) {
				unsubscribe();
				options?.debug?.onUnsubscribe?.();
				unsubscribe = null;
			}

			if (options?.skip) {
				setData(null);
				setLoading(false);
				setError(null);
				return;
			}

			const endpoint = getEndpoint();
			const query = endpoint({ args: options?.args, select: options?.select });

			setLoading(true);
			setError(null);
			options?.debug?.onSubscribe?.();

			unsubscribe = query.subscribe((value) => {
				setData(() => value);
				setLoading(false);
				setError(null);
				options?.debug?.onData?.(value);
			});

			query.then(
				(value) => {
					setData(() => value);
					setLoading(false);
					setError(null);
					options?.debug?.onData?.(value);
				},
				(err) => {
					const queryError = err instanceof Error ? err : new Error(String(err));
					setError(queryError);
					setLoading(false);
					options?.debug?.onError?.(queryError);
				},
			);
		};

		// Execute initial query
		executeQuery();

		// Watch for args/select changes using JSON.stringify for stable comparison
		// This prevents re-fetching when object reference changes but content is the same
		// Using on() with defer: true to skip initial run (already executed above)
		createEffect(
			on(
				() => ({
					argsKey: JSON.stringify(options?.args),
					selectKey: JSON.stringify(options?.select),
					skip: options?.skip,
				}),
				() => {
					executeQuery();
				},
				{ defer: true },
			),
		);

		onCleanup(() => {
			if (unsubscribe) {
				unsubscribe();
				options?.debug?.onUnsubscribe?.();
				unsubscribe = null;
			}
		});

		const refetch = () => {
			executeQuery();
		};

		return { data, loading, error, refetch };
	};
}

/**
 * Create createMutation primitive for a specific endpoint
 */
function createMutationPrimitiveFactory<TInput, TOutput>(
	getEndpoint: () => (options: unknown) => Promise<{ data: TOutput }>,
) {
	return function createMutation(
		primitiveOptions?: MutationPrimitiveOptions<TOutput>,
	): MutationPrimitiveResult<TInput, TOutput> {
		const [data, setData] = createSignal<TOutput | null>(null);
		const [loading, setLoading] = createSignal(false);
		const [error, setError] = createSignal<Error | null>(null);

		const mutate = async (options: {
			args: TInput;
			select?: SelectionObject;
		}): Promise<TOutput> => {
			setLoading(true);
			setError(null);

			try {
				const endpoint = getEndpoint();
				const result = await endpoint({ args: options.args, select: options.select });

				setData(() => result.data);
				setLoading(false);

				primitiveOptions?.onSuccess?.(result.data);
				primitiveOptions?.onSettled?.();

				return result.data;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				setError(mutationError);
				setLoading(false);

				primitiveOptions?.onError?.(mutationError);
				primitiveOptions?.onSettled?.();

				throw mutationError;
			}
		};

		const reset = () => {
			setData(null);
			setLoading(false);
			setError(null);
		};

		return { mutate, loading, error, data, reset };
	};
}

// =============================================================================
// Create Client
// =============================================================================

// Cache for primitive functions to ensure stable references
const primitiveCache = new Map<string, unknown>();

/**
 * Create a Lens client with SolidJS primitives.
 *
 * Base client methods work in vanilla JS (SSR, utilities, event handlers).
 * SolidJS primitives are available as `.createQuery()` and `.createMutation()`.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-solid';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Vanilla JS (anywhere)
 * const user = await client.user.get({ args: { id } });
 *
 * // Component usage
 * function UserProfile(props: { id: string }) {
 *   const { data, loading, error } = client.user.get.createQuery({
 *     args: { id: props.id },
 *   });
 *
 *   const { mutate, loading: saving } = client.user.update.createMutation({
 *     onSuccess: () => console.log('Updated!'),
 *   });
 *
 *   return (
 *     <Show when={!loading()} fallback={<Spinner />}>
 *       <h1>{data()?.name}</h1>
 *       <button
 *         onClick={() => mutate({ args: { id: props.id, name: 'New' } })}
 *         disabled={saving()}
 *       >
 *         Update
 *       </button>
 *     </Show>
 *   );
 * }
 * ```
 */
export function createClient<TRouter extends RouterDef>(
	config: LensClientConfig | TypedClientConfig<{ router: TRouter }>,
): TypedClient<TRouter> {
	// Create base client for transport
	const baseClient = createBaseClient(config as LensClientConfig);

	function createProxy(path: string): unknown {
		const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				// Handle .createQuery() - SolidJS primitive for queries
				if (key === "createQuery") {
					const cacheKey = `${path}:createQuery`;
					if (!primitiveCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => QueryResult<unknown>;
						};
						primitiveCache.set(cacheKey, createQueryPrimitiveFactory(getEndpoint));
					}
					return primitiveCache.get(cacheKey);
				}

				// Handle .createMutation() - SolidJS primitive for mutations
				if (key === "createMutation") {
					const cacheKey = `${path}:createMutation`;
					if (!primitiveCache.has(cacheKey)) {
						const getEndpoint = () => {
							const parts = path.split(".");
							let current: unknown = baseClient;
							for (const part of parts) {
								current = (current as Record<string, unknown>)[part];
							}
							return current as (options: unknown) => Promise<{ data: unknown }>;
						};
						primitiveCache.set(cacheKey, createMutationPrimitiveFactory(getEndpoint));
					}
					return primitiveCache.get(cacheKey);
				}

				if (key === "then") return undefined;
				if (key.startsWith("_")) return undefined;

				const newPath = path ? `${path}.${key}` : key;
				return createProxy(newPath);
			},

			apply(_target, _thisArg, args) {
				// Direct call - delegate to base client (returns QueryResult or Promise)
				const parts = path.split(".");
				let current: unknown = baseClient;
				for (const part of parts) {
					current = (current as Record<string, unknown>)[part];
				}
				const endpoint = current as (options: unknown) => unknown;
				return endpoint(args[0]);
			},
		};

		const proxy = new Proxy((() => {}) as (...args: unknown[]) => unknown, handler);
		return proxy;
	}

	return createProxy("") as TypedClient<TRouter>;
}
