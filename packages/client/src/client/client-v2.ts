/**
 * @lens/client - Client V2 (Operations-based with Streaming)
 *
 * Operations-based client for Lens API.
 * Supports:
 * - queries (single result via await)
 * - subscriptions (streaming via subscribe)
 * - mutations with optimistic updates
 *
 * @example
 * ```typescript
 * import { createClientV2 } from '@lens/client';
 * import { queries, mutations } from './operations';
 *
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLinkV2({ url: 'ws://localhost:3000' })],
 * });
 *
 * // Single result (await)
 * const user = await client.query.getUser({ id: "1" });
 *
 * // Streaming (subscribe)
 * const unsubscribe = client.query.watchUser({ id: "1" }).subscribe((user) => {
 *   console.log("User updated:", user);
 * });
 *
 * // Mutation with optimistic update
 * const result = await client.mutation.updateUser({ id: "1", name: "New Name" });
 * ```
 */

import type { QueryDef, MutationDef, Update, OptimisticDSL } from "@lens/core";
import { isOptimisticDSL, normalizeOptimisticDSL } from "@lens/core";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import {
	type Link,
	type LinkFn,
	type OperationResult,
	composeLinks,
	createOperationContext,
} from "../links";
import {
	type WebSocketTransportV2,
	type Subscription,
	type SubscriptionCallback,
} from "../links/websocket-v2";

// =============================================================================
// Types
// =============================================================================

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Infer input type from query/mutation definition */
export type InferInput<T> = T extends QueryDef<infer I, unknown>
	? I extends void
		? void
		: I
	: T extends MutationDef<infer I, unknown>
		? I
		: never;

/** Infer output type from query/mutation definition */
export type InferOutput<T> = T extends QueryDef<unknown, infer O>
	? O
	: T extends MutationDef<unknown, infer O>
		? O
		: never;

/** Client V2 configuration */
export interface ClientV2Config<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query definitions */
	queries?: Q;
	/** Mutation definitions */
	mutations?: M;
	/** Links (middleware chain) - last one should be terminal */
	links: Link[];
	/** WebSocket transport (for subscriptions) */
	transport?: WebSocketTransportV2;
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/** Query result - can be awaited or subscribed */
export interface QueryResultV2<T> extends PromiseLike<T> {
	/** Subscribe to streaming updates */
	subscribe(
		callback: (data: T, updates?: Record<string, Update>) => void,
		options?: SubscribeOptions,
	): Unsubscribe;

	/**
	 * Select specific fields to fetch (frontend-driven field selection).
	 * Returns a new QueryResult with the selection applied.
	 *
	 * @example
	 * ```typescript
	 * // Only fetch id and name
	 * const user = await client.query.getUser({ id: "1" })
	 *   .select({ id: true, name: true });
	 *
	 * // Fetch with nested relations
	 * const user = await client.query.getUser({ id: "1" })
	 *   .select({
	 *     id: true,
	 *     name: true,
	 *     posts: { select: { title: true } },
	 *   });
	 * ```
	 */
	select<S extends SelectionObject>(selection: S): QueryResultV2<T>;
}

/** Subscribe options */
export interface SubscribeOptions {
	/** Called when subscription completes */
	onComplete?: () => void;
	/** Called on error */
	onError?: (error: Error) => void;
}

/** Selection object type (simplified - see @lens/core for full type) */
export type SelectionObject = Record<string, boolean | SelectionObject | { select: SelectionObject }>;

/** Query options */
export interface QueryOptions {
	/** Field selection */
	select?: SelectionObject;
}

/** Unsubscribe function */
export type Unsubscribe = () => void;

/** Query accessor - returns QueryResult (can await or subscribe) */
export type QueryAccessor<I, O> = I extends void
	? () => QueryResultV2<O>
	: (input: I) => QueryResultV2<O>;

/** Mutation accessor - callable function with optimistic support */
export type MutationAccessor<I, O> = (
	input: I,
	options?: MutationV2Options,
) => Promise<MutationV2Result<O>>;

/** Mutation options */
export interface MutationV2Options {
	/** Enable optimistic update (default: true) */
	optimistic?: boolean;
}

/** Mutation result */
export interface MutationV2Result<T> {
	/** Result data */
	data: T;
	/** Rollback function (only if optimistic) */
	rollback?: () => void;
}

/** Build query accessor type from queries map */
export type QueryAccessors<Q extends QueriesMap> = {
	[K in keyof Q]: QueryAccessor<InferInput<Q[K]>, InferOutput<Q[K]>>;
};

/** Build mutation accessor type from mutations map */
export type MutationAccessors<M extends MutationsMap> = {
	[K in keyof M]: MutationAccessor<InferInput<M[K]>, InferOutput<M[K]>>;
};

/** Client V2 type */
export interface ClientV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query accessors */
	query: QueryAccessors<Q>;
	/** Mutation accessors */
	mutation: MutationAccessors<M>;
	/** Underlying store */
	$store: ReactiveStore;
	/** WebSocket transport */
	$transport?: WebSocketTransportV2;
	/** Execute raw operation */
	$execute: (
		type: "query" | "mutation",
		name: string,
		input: unknown,
	) => Promise<OperationResult>;
	/** Get query names */
	$queryNames: () => string[];
	/** Get mutation names */
	$mutationNames: () => string[];
}

// =============================================================================
// Optimistic DSL Interpreter
// =============================================================================

let optimisticCounter = 0;

/**
 * Interpret OptimisticDSL to compute optimistic data
 */
function interpretOptimisticDSL(dsl: OptimisticDSL, input: unknown): unknown {
	const inputObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const normalized = normalizeOptimisticDSL(dsl);

	switch (normalized.type) {
		case "merge": {
			const id = inputObj.id;
			if (typeof id !== "string") return null;
			const result: Record<string, unknown> = { ...inputObj };
			if (normalized.set) {
				for (const [key, value] of Object.entries(normalized.set)) {
					result[key] = resolveReference(value, inputObj);
				}
			}
			return result;
		}

		case "create": {
			const result: Record<string, unknown> = {
				id: `temp_${++optimisticCounter}`,
				...inputObj,
			};
			if (normalized.set) {
				for (const [key, value] of Object.entries(normalized.set)) {
					result[key] = resolveReference(value, inputObj);
				}
			}
			return result;
		}

		case "delete": {
			const id = inputObj.id;
			if (typeof id !== "string") return null;
			return { id, _deleted: true };
		}

		case "updateMany": {
			if (!normalized.config) return null;
			const ids = resolveReference(normalized.config.ids, inputObj);
			if (!Array.isArray(ids)) return null;
			const setData: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(normalized.config.set)) {
				setData[key] = resolveReference(value, inputObj);
			}
			return ids.map((id: unknown) => ({ id, ...setData }));
		}

		case "custom": {
			if (normalized.fn && typeof normalized.fn === "function") {
				return normalized.fn({ input });
			}
			return null;
		}

		default:
			return null;
	}
}

/**
 * Resolve $ references in DSL values
 */
function resolveReference(value: unknown, input: Record<string, unknown>): unknown {
	if (typeof value === "string" && value.startsWith("$")) {
		return input[value.slice(1)];
	}
	return value;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create QueryResult that can be awaited or subscribed
 */
function createQueryResult<T>(
	name: string,
	input: unknown,
	execute: (name: string, input: unknown, options?: { select?: SelectionObject }) => Promise<OperationResult>,
	transport?: WebSocketTransportV2,
	selection?: SelectionObject,
): QueryResultV2<T> {
	// Build execution input with selection
	const buildInput = () => {
		if (!selection) return input;
		// Merge selection into input object for server processing
		return { ...(input as object || {}), $select: selection };
	};

	// Create the result object
	const result: QueryResultV2<T> = {
		// PromiseLike: await returns single result
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
		): PromiseLike<TResult1 | TResult2> {
			const promise = execute(name, buildInput()).then((result) => {
				if (result.error) throw result.error;
				return result.data as T;
			});
			return promise.then(onfulfilled, onrejected);
		},

		// Subscribe: streaming updates
		subscribe(
			callback: (data: T, updates?: Record<string, Update>) => void,
			options?: SubscribeOptions,
		): Unsubscribe {
			if (!transport) {
				// Fallback: execute once and call callback
				execute(name, buildInput())
					.then((result) => {
						if (result.error) {
							options?.onError?.(result.error);
						} else {
							callback(result.data as T);
							options?.onComplete?.();
						}
					})
					.catch((error) => {
						options?.onError?.(error);
					});

				return () => {}; // No-op unsubscribe for non-streaming
			}

			// Use transport for streaming (pass selection via input)
			const subscription = transport.subscribe<T>(
				name,
				buildInput(),
				callback,
				{
					onComplete: options?.onComplete,
					onError: options?.onError,
				},
			);

			return subscription.unsubscribe;
		},

		// Select: create new result with field selection
		select<S extends SelectionObject>(newSelection: S): QueryResultV2<T> {
			// Merge with existing selection if any
			const mergedSelection = selection
				? { ...selection, ...newSelection }
				: newSelection;
			return createQueryResult<T>(name, input, execute, transport, mergedSelection);
		},
	};

	return result;
}

/**
 * Create operations-based client V2 with streaming support
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries: { getUser, watchUser, searchUsers },
 *   mutations: { createPost, updatePost },
 *   links: [websocketLinkV2({ url: 'ws://localhost:3000' })],
 * });
 *
 * // Single result (await)
 * const user = await client.query.getUser({ id: "1" });
 *
 * // Streaming (subscribe)
 * const unsubscribe = client.query.watchUser({ id: "1" }).subscribe((user) => {
 *   console.log("User updated:", user);
 * });
 *
 * // Later: stop streaming
 * unsubscribe();
 *
 * // Mutations with optimistic updates
 * const { data, rollback } = await client.mutation.createPost({
 *   title: 'Hello',
 *   content: 'World',
 * });
 * ```
 */
export function createClientV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(config: ClientV2Config<Q, M>): ClientV2<Q, M> {
	const {
		queries = {} as Q,
		mutations = {} as M,
		links,
		transport,
		optimistic = true,
	} = config;

	// Validate links
	if (!links || links.length === 0) {
		throw new Error("At least one link is required");
	}

	// Initialize links
	const initializedLinks: LinkFn[] = links.map((link) => link());

	// Create store
	const store = new ReactiveStore({ optimistic });

	// Compose link chain (last link is terminal, doesn't call next)
	const terminalLink = initializedLinks[initializedLinks.length - 1];
	const middlewareLinks = initializedLinks.slice(0, -1);

	const executeChain = composeLinks(middlewareLinks, async (op) => {
		const result = terminalLink(op, () => Promise.resolve({ error: new Error("No next link") }));
		return result instanceof Promise ? result : Promise.resolve(result);
	});

	// Execute function for operations
	const execute = async (
		type: "query" | "mutation",
		name: string,
		input: unknown,
	): Promise<OperationResult> => {
		// Use "operation" as entity name for V2 operations
		const context = createOperationContext(type, "operation", name, input);
		return executeChain(context);
	};

	// Create query accessors
	const queryAccessors: Record<string, (input?: unknown) => QueryResultV2<unknown>> = {};
	for (const [name] of Object.entries(queries)) {
		queryAccessors[name] = (input?: unknown) => {
			return createQueryResult(
				name,
				input,
				(n, i) => execute("query", n, i),
				transport,
			);
		};
	}

	// Create mutation accessors
	const mutationAccessors: Record<
		string,
		(input: unknown, options?: MutationV2Options) => Promise<MutationV2Result<unknown>>
	> = {};

	for (const [name, mutationDef] of Object.entries(mutations)) {
		mutationAccessors[name] = async (
			input: unknown,
			options?: MutationV2Options,
		): Promise<MutationV2Result<unknown>> => {
			const useOptimistic = options?.optimistic ?? optimistic;
			let optimisticId: string | undefined;

			// Apply optimistic update if mutation has optimistic spec
			if (useOptimistic && mutationDef._optimistic) {
				let optimisticData: unknown;

				if (isOptimisticDSL(mutationDef._optimistic)) {
					// DSL: Interpret declarative spec
					optimisticData = interpretOptimisticDSL(mutationDef._optimistic, input);
				} else if (typeof mutationDef._optimistic === "function") {
					// Function: Legacy callback
					optimisticData = mutationDef._optimistic({ input });
				}

				if (optimisticData) {
					// Store the optimistic data (we use the mutation name as a key prefix)
					optimisticId = store.applyOptimistic("operation", "mutate", {
						name,
						data: optimisticData,
					});
				}
			}

			try {
				const result = await execute("mutation", name, input);

				if (result.error) {
					if (optimisticId) store.rollbackOptimistic(optimisticId);
					throw result.error;
				}

				if (optimisticId) {
					store.confirmOptimistic(optimisticId, result.data);
				}

				return {
					data: result.data,
					rollback: optimisticId
						? () => store.rollbackOptimistic(optimisticId!)
						: undefined,
				};
			} catch (error) {
				if (optimisticId) store.rollbackOptimistic(optimisticId);
				throw error;
			}
		};
	}

	return {
		query: queryAccessors as QueryAccessors<Q>,
		mutation: mutationAccessors as MutationAccessors<M>,
		$store: store,
		$transport: transport,
		$execute: execute,
		$queryNames: () => Object.keys(queries),
		$mutationNames: () => Object.keys(mutations),
	};
}
