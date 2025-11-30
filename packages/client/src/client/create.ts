/**
 * @sylphx/lens-client - Lens Client
 *
 * Primary client for Lens API framework.
 * Uses Transport + Plugin architecture for clean, extensible design.
 *
 * Lazy connection - transport.connect() is called on first operation.
 */

import type {
	MutationDef,
	OptimisticDSL,
	QueryDef,
	RouterDef,
	RouterRoutes,
} from "@sylphx/lens-core";
import { isPipeline } from "@sylphx/lens-core";
import { createStore, type ReactiveStore } from "../store/reactive-store";
import type { TypedTransport } from "../transport/in-process";
import type { Plugin } from "../transport/plugin";
import type { Metadata, Observable, Operation, Result, Transport } from "../transport/types";

// =============================================================================
// Types
// =============================================================================

/** Query map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutation map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Selection object for field selection */
export interface SelectionObject {
	[key: string]: boolean | SelectionObject | { select: SelectionObject };
}

/** Client configuration */
export interface LensClientConfig<TApi = unknown> {
	/** Transport for server communication (can be typed for inference) */
	transport: Transport | TypedTransport<TApi>;
	/** Plugins for request/response processing */
	plugins?: Plugin[];
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/** Query result with reactive subscription support */
export interface QueryResult<T> {
	/** Current value (for peeking without subscribing) */
	readonly value: T | null;
	/** Subscribe to updates */
	subscribe(callback?: (data: T) => void): () => void;
	/** Select specific fields */
	select<S extends SelectionObject>(selection: S): QueryResult<SelectedType<T, S>>;
	/** Promise interface */
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2>;
}

/** Mutation result */
export interface MutationResult<T> {
	data: T;
	rollback?: () => void;
}

/** Infer selected type from selection object */
export type SelectedType<T, S extends SelectionObject> = {
	[K in keyof S & keyof T]: S[K] extends true
		? T[K]
		: S[K] extends { select: infer Nested extends SelectionObject }
			? T[K] extends Array<infer Item>
				? Array<SelectedType<Item, Nested>>
				: T[K] extends object
					? SelectedType<T[K], Nested>
					: T[K]
			: S[K] extends SelectionObject
				? T[K] extends Array<infer Item>
					? Array<SelectedType<Item, S[K]>>
					: T[K] extends object
						? SelectedType<T[K], S[K]>
						: T[K]
				: never;
};

/** Infer input type */
export type InferInput<T> =
	T extends QueryDef<infer I, unknown>
		? I extends void
			? void
			: I
		: T extends MutationDef<infer I, unknown>
			? I
			: never;

/** Infer output type */
export type InferOutput<T> =
	T extends QueryDef<unknown, infer O> ? O : T extends MutationDef<unknown, infer O> ? O : never;

// =============================================================================
// Router Types
// =============================================================================

/** Router-based API shape (matches server's _types) */
export interface RouterApiShape<TRouter extends RouterDef = RouterDef> {
	router: TRouter;
}

/** Extract router from server's _types */
type ExtractRouter<T> = T extends { router: infer R extends RouterDef } ? R : never;

/** Infer client type from router routes */
export type InferRouterClientType<TRoutes extends RouterRoutes> = {
	[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
		? InferRouterClientType<TNestedRoutes>
		: TRoutes[K] extends QueryDef<infer TInput, infer TOutput>
			? TInput extends void
				? () => QueryResult<TOutput>
				: (input: TInput) => QueryResult<TOutput>
			: TRoutes[K] extends MutationDef<infer TInput, infer TOutput>
				? (input: TInput) => Promise<MutationResult<TOutput>>
				: never;
};

/** Router-based client type */
export type RouterLensClient<TRouter extends RouterDef> =
	TRouter extends RouterDef<infer TRoutes> ? InferRouterClientType<TRoutes> : never;

/** Generic client type (for framework adapters) */
export type LensClient<_Q = unknown, _M = unknown> = {
	[key: string]: unknown;
};

// =============================================================================
// Client Implementation
// =============================================================================

class ClientImpl {
	private transport: Transport;
	private plugins: Plugin[];
	private optimistic: boolean;

	/** Reactive store for entity caching and optimistic updates */
	private store: ReactiveStore;

	/** Metadata from transport handshake (lazy loaded) */
	private metadata: Metadata | null = null;
	private connectPromise: Promise<Metadata> | null = null;

	/** Subscription states */
	private subscriptions = new Map<
		string,
		{
			data: unknown;
			callbacks: Set<(data: unknown) => void>;
			unsubscribe?: () => void;
		}
	>();

	/** Tracks mutation path and input for each optimistic transaction (for rollback notification) */
	private optimisticMutationInfo = new Map<
		string,
		{ path: string; input: Record<string, unknown> }
	>();

	constructor(config: LensClientConfig) {
		this.transport = config.transport;
		this.plugins = config.plugins ?? [];
		this.optimistic = config.optimistic ?? true;
		this.store = createStore({ optimistic: this.optimistic });

		// Start handshake immediately (eager, but don't block)
		// Errors are caught - will retry on first operation if needed
		this.connectPromise = this.transport.connect();
		this.connectPromise
			.then((metadata) => {
				this.metadata = metadata;
			})
			.catch(() => {
				// Connection failed - will retry on first operation
				this.connectPromise = null;
			});
	}

	/**
	 * Ensure transport is connected (lazy connection).
	 * Called automatically on first operation.
	 */
	private async ensureConnected(): Promise<void> {
		if (this.metadata) return;

		if (!this.connectPromise) {
			this.connectPromise = this.transport.connect();
		}

		this.metadata = await this.connectPromise;
	}

	/**
	 * Execute operation through plugins and transport
	 */
	private async execute(op: Operation): Promise<Result> {
		// Ensure connected before executing
		await this.ensureConnected();

		// Run beforeRequest plugins
		let processedOp = op;
		for (const plugin of this.plugins) {
			if (plugin.beforeRequest) {
				processedOp = await plugin.beforeRequest(processedOp);
			}
		}

		// Execute through transport
		const resultOrObservable = this.transport.execute(processedOp);

		// Handle Observable (subscription)
		if (this.isObservable(resultOrObservable)) {
			return { data: resultOrObservable };
		}

		// Handle Promise (query/mutation)
		let result = await resultOrObservable;

		// Run afterResponse plugins
		for (const plugin of this.plugins) {
			if (plugin.afterResponse) {
				result = await plugin.afterResponse(result, processedOp);
			}
		}

		// Handle errors through plugins
		if (result.error) {
			const error = result.error;
			for (const plugin of this.plugins) {
				if (plugin.onError) {
					try {
						result = await plugin.onError(error, processedOp, () => this.execute(processedOp));
						if (!result.error) break; // Error handled
					} catch (e) {
						result = { error: e as Error };
					}
				}
			}
		}

		return result;
	}

	private isObservable(value: unknown): value is Observable<Result> {
		return (
			value !== null &&
			typeof value === "object" &&
			"subscribe" in value &&
			typeof (value as Observable<Result>).subscribe === "function"
		);
	}

	/**
	 * Get operation metadata (may be null before first operation)
	 * Handles nested operations structure (e.g., "user.get" → metadata.operations.user.get)
	 */
	private getOperationMeta(path: string): Metadata["operations"][string] | undefined {
		if (!this.metadata) return undefined;

		// Navigate nested operations structure
		const parts = path.split(".");
		let current: Metadata["operations"] | Metadata["operations"][string] = this.metadata.operations;

		for (const part of parts) {
			if (!current || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[part] as Metadata["operations"][string];
		}

		// Check if we found an operation meta (has "type" property)
		if (current && typeof current === "object" && "type" in current) {
			return current as Metadata["operations"][string];
		}

		return undefined;
	}

	/**
	 * Generate unique operation ID
	 */
	private generateId(type: string, path: string): string {
		return `${type}-${path}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	/**
	 * Create query key for caching/dedup
	 */
	private makeQueryKey(path: string, input: unknown): string {
		return `${path}:${JSON.stringify(input ?? null)}`;
	}

	// ===========================================================================
	// Query Execution
	// ===========================================================================

	executeQuery<T>(path: string, input: unknown, select?: SelectionObject): QueryResult<T> {
		const key = this.makeQueryKey(path, input);

		// Get or create subscription state
		if (!this.subscriptions.has(key)) {
			this.subscriptions.set(key, {
				data: null,
				callbacks: new Set(),
			});
		}
		const sub = this.subscriptions.get(key)!;

		const result: QueryResult<T> = {
			get value() {
				return sub.data as T | null;
			},

			subscribe: (callback?: (data: T) => void) => {
				// Add callback
				if (callback) {
					const wrapped = (data: unknown) => callback(data as T);
					sub.callbacks.add(wrapped);

					// If data available, call immediately
					if (sub.data !== null) {
						callback(sub.data as T);
					}
				}

				// Start subscription if not started
				if (!sub.unsubscribe) {
					this.startSubscription(path, input, key);
				}

				return () => {
					if (callback) {
						const wrapped = (data: unknown) => callback(data as T);
						sub.callbacks.delete(wrapped);
					}
					// Cleanup if no more callbacks
					if (sub.callbacks.size === 0 && sub.unsubscribe) {
						sub.unsubscribe();
						sub.unsubscribe = undefined;
					}
				};
			},

			select: <S extends SelectionObject>(selection: S) => {
				return this.executeQuery<T>(path, input, selection) as unknown as QueryResult<
					SelectedType<T, S>
				>;
			},

			then: async <TResult1 = T, TResult2 = never>(
				onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
			): Promise<TResult1 | TResult2> => {
				try {
					// Execute query (will auto-connect if needed)
					const op: Operation = {
						id: this.generateId("query", path),
						path,
						type: "query",
						input,
						meta: select ? { select } : {},
					};

					const response = await this.execute(op);

					if (response.error) {
						throw response.error;
					}

					// Update subscription state
					sub.data = response.data;

					// Store in entity store for optimistic update support
					this.storeEntityFromData(path, response.data);

					// Notify callbacks
					for (const cb of sub.callbacks) {
						cb(response.data);
					}

					return onfulfilled
						? onfulfilled(response.data as T)
						: (response.data as unknown as TResult1);
				} catch (error) {
					if (onrejected) {
						return onrejected(error);
					}
					throw error;
				}
			},
		};

		return result;
	}

	private async startSubscription(path: string, input: unknown, key: string): Promise<void> {
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		// Ensure connected before checking metadata
		await this.ensureConnected();

		const meta = this.getOperationMeta(path);
		const isSubscription = meta?.type === "subscription";

		if (isSubscription) {
			// Real subscription - use Observable
			const op: Operation = {
				id: this.generateId("subscription", path),
				path,
				type: "subscription",
				input,
			};

			const resultOrObservable = this.transport.execute(op);

			if (this.isObservable(resultOrObservable)) {
				const subscription = resultOrObservable.subscribe({
					next: (result) => {
						if (result.data !== undefined) {
							sub.data = result.data;

							// Also store in entity store for optimistic update support
							this.storeEntityFromData(path, result.data);

							for (const cb of sub.callbacks) {
								cb(result.data);
							}
						}
					},
					error: (_error) => {
						// Error handled by promise rejection
					},
					complete: () => {
						// Completed
					},
				});

				sub.unsubscribe = () => subscription.unsubscribe();
			}
		} else {
			// Query - just fetch once
			this.executeQuery(path, input).then(() => {});
		}
	}

	// ===========================================================================
	// Mutation Execution
	// ===========================================================================

	async executeMutation<TInput extends Record<string, unknown>, TOutput>(
		path: string,
		input: TInput,
	): Promise<MutationResult<TOutput>> {
		// Ensure connected before executing
		await this.ensureConnected();

		const meta = this.getOperationMeta(path);
		let optId: string | undefined;

		// Apply optimistic update
		if (this.optimistic && meta?.optimistic) {
			optId = await this.applyOptimistic(path, input, meta.optimistic as OptimisticDSL);
		}

		try {
			const op: Operation = {
				id: this.generateId("mutation", path),
				path,
				type: "mutation",
				input,
			};

			const response = await this.execute(op);

			if (response.error) {
				throw response.error;
			}

			// Confirm optimistic with server data
			if (optId) {
				this.confirmOptimistic(optId, response.data);
			}

			return {
				data: response.data as TOutput,
				rollback: optId ? () => this.rollbackOptimistic(optId!) : undefined,
			};
		} catch (error) {
			// Rollback on error
			if (optId) {
				this.rollbackOptimistic(optId);
			}
			throw error;
		}
	}

	// ===========================================================================
	// Optimistic Updates
	// ===========================================================================

	private async applyOptimistic<TInput extends Record<string, unknown>>(
		path: string,
		input: TInput,
		dsl: OptimisticDSL,
	): Promise<string> {
		// OptimisticDSL is now always a Reify Pipeline
		if (isPipeline(dsl)) {
			const txId = await this.store.applyPipelineOptimistic(dsl, input);

			// Store mutation info for rollback notification
			this.optimisticMutationInfo.set(txId, { path, input });

			// Notify affected subscriptions
			this.notifyAffectedSubscriptions(path, input);

			return txId;
		}

		// Should not reach here - OptimisticDSL is Pipeline
		return "";
	}

	/**
	 * Notify subscriptions that might be affected by an optimistic update.
	 * Uses heuristics based on mutation path and input to find related query subscriptions.
	 */
	private notifyAffectedSubscriptions<TInput extends Record<string, unknown>>(
		mutationPath: string,
		input: TInput,
	): void {
		// Extract namespace (e.g., "user" from "user.update")
		const parts = mutationPath.split(".");
		if (parts.length < 2) return;

		const namespace = parts.slice(0, -1).join(".");
		const entityId = input.id as string | undefined;

		if (!entityId) return;

		// Find related query subscriptions (e.g., "user.get" for "user.update")
		for (const [key, sub] of this.subscriptions.entries()) {
			// Check if subscription matches the namespace
			if (key.startsWith(`${namespace}.get:`) || key.startsWith(`${namespace}.`)) {
				// Try to parse the input from the key
				const keyInput = this.parseQueryKeyInput(key);
				if (keyInput?.id === entityId && sub.callbacks.size > 0) {
					// Get updated data from store
					const entitySignal = this.store.getEntity(
						this.getEntityTypeFromPath(namespace),
						entityId,
					);
					const updatedData = entitySignal.value.data;

					if (updatedData) {
						sub.data = updatedData;
						for (const cb of sub.callbacks) {
							cb(updatedData);
						}
					}
				}
			}
		}
	}

	/**
	 * Parse input from query key (e.g., "user.get:{\"id\":\"1\"}" -> { id: "1" })
	 */
	private parseQueryKeyInput(key: string): Record<string, unknown> | null {
		const colonIndex = key.indexOf(":");
		if (colonIndex === -1) return null;

		try {
			return JSON.parse(key.slice(colonIndex + 1));
		} catch {
			return null;
		}
	}

	/**
	 * Get entity type name from namespace path.
	 * Capitalizes first letter (e.g., "user" -> "User")
	 */
	private getEntityTypeFromPath(namespace: string): string {
		const lastPart = namespace.split(".").pop() || namespace;
		return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
	}

	/**
	 * Store entity data from subscription/query result.
	 * Extracts entity type from path and stores data in entity store for optimistic update support.
	 */
	private storeEntityFromData(path: string, data: unknown): void {
		if (!data || typeof data !== "object") return;

		const entityData = data as Record<string, unknown>;
		const entityId = entityData.id as string | undefined;
		if (!entityId) return;

		// Extract namespace from path (e.g., "user.get" -> "user")
		const parts = path.split(".");
		if (parts.length < 2) return;

		const namespace = parts.slice(0, -1).join(".");
		const entityType = this.getEntityTypeFromPath(namespace);

		// Store in entity store
		this.store.setEntity(entityType, entityId, data);
	}

	private confirmOptimistic(optId: string, _serverData: unknown): void {
		// All optimistic updates use pipeline transactions (tx_ prefix)
		if (optId.startsWith("tx_")) {
			this.store.confirmPipelineOptimistic(optId);
		}
	}

	private rollbackOptimistic(optId: string): void {
		// All optimistic updates use pipeline transactions (tx_ prefix)
		if (optId.startsWith("tx_")) {
			// Get mutation info before rollback
			const mutationInfo = this.optimisticMutationInfo.get(optId);

			// Perform rollback
			this.store.rollbackPipelineOptimistic(optId);

			// Notify affected subscriptions with rolled-back data
			if (mutationInfo) {
				this.notifyAffectedSubscriptions(mutationInfo.path, mutationInfo.input);
				this.optimisticMutationInfo.delete(optId);
			}
		}
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	createAccessor(path: string): (input?: unknown) => unknown {
		const accessor = (input?: unknown) => {
			// Return a deferred result that waits for metadata before deciding query vs mutation.
			// This allows sync return while deferring the actual execution.
			const key = this.makeQueryKey(path, input);

			// Get or create subscription state for queries
			if (!this.subscriptions.has(key)) {
				this.subscriptions.set(key, {
					data: null,
					callbacks: new Set(),
				});
			}
			const sub = this.subscriptions.get(key)!;

			const result = {
				// Current cached value (null until loaded)
				get value() {
					return sub.data;
				},

				// Subscribe to updates - defers until metadata is ready
				subscribe: (callback?: (data: unknown) => void) => {
					if (callback) {
						const wrapped = (data: unknown) => callback(data);
						sub.callbacks.add(wrapped);

						// If data available, call immediately
						if (sub.data !== null) {
							callback(sub.data);
						}
					}

					// Ensure connected and start subscription
					this.ensureConnected().then(() => {
						const meta = this.getOperationMeta(path);
						if (meta?.type === "mutation") {
							// Silently ignore - subscribe on mutation is a no-op
							return;
						}
						// Start query subscription
						if (!sub.unsubscribe) {
							this.startSubscription(path, input, key);
						}
					});

					return () => {
						if (callback) {
							sub.callbacks.delete(callback as (data: unknown) => void);
						}
						if (sub.callbacks.size === 0 && sub.unsubscribe) {
							sub.unsubscribe();
							sub.unsubscribe = undefined;
						}
					};
				},

				// Thenable - allows await, defers decision until metadata ready
				then: async <TResult1 = unknown, TResult2 = never>(
					onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
					onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
				): Promise<TResult1 | TResult2> => {
					try {
						// Wait for metadata
						await this.ensureConnected();
						const meta = this.getOperationMeta(path);

						if (meta?.type === "mutation") {
							// Execute as mutation (input is validated by typed proxy)
							const inputObj = (input ?? {}) as Record<string, unknown>;
							const mutationResult = await this.executeMutation(path, inputObj);
							return onfulfilled
								? onfulfilled(mutationResult)
								: (mutationResult as unknown as TResult1);
						}

						// Execute as query
						const queryResult = this.executeQuery(path, input);
						const data = await queryResult;
						return onfulfilled ? onfulfilled(data) : (data as unknown as TResult1);
					} catch (error) {
						if (onrejected) {
							return onrejected(error);
						}
						throw error;
					}
				},
			};

			return result;
		};

		return accessor;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Config with typed transport for automatic type inference.
 */
export interface TypedClientConfig<TApi> {
	/** Typed transport with server type marker */
	transport: TypedTransport<TApi>;
	/** Plugins for request/response processing */
	plugins?: Plugin[];
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/**
 * Create Lens client (sync return, eager handshake)
 *
 * Connection starts immediately in background. First operation waits
 * for handshake to complete, then uses metadata to determine operation type.
 *
 * Type inference from transport (recommended):
 * ```typescript
 * const server = createServer({ router: appRouter });
 * const client = createClient({
 *   transport: inProcess({ server }),
 * });
 * // client is fully typed automatically!
 * ```
 *
 * Explicit type parameter (for HTTP transport):
 * ```typescript
 * import type { AppRouter } from './server';
 *
 * const client = createClient<RouterApiShape<AppRouter>>({
 *   transport: http({ url: '/api' }),
 * });
 * ```
 */
// Overload 1: Infer from typed transport (inProcess)
export function createClient<TApi extends { router: RouterDef }>(
	config: TypedClientConfig<TApi>,
): RouterLensClient<ExtractRouter<TApi>>;

// Overload 2: Explicit generic (for http transport)
export function createClient<TApi extends RouterApiShape>(
	config: LensClientConfig,
): RouterLensClient<TApi extends RouterApiShape<infer R> ? R : never>;

// Implementation
export function createClient(config: LensClientConfig | TypedClientConfig<unknown>): unknown {
	const impl = new ClientImpl(config as LensClientConfig);

	// Create nested proxy for router-based access
	function createNestedProxy(prefix: string): unknown {
		const handler: ProxyHandler<() => void> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				if (key === "then") return undefined; // Prevent treating as thenable
				if (key.startsWith("_")) return undefined;

				const path = prefix ? `${prefix}.${key}` : key;
				return createNestedProxy(path);
			},
			apply(_target, _thisArg, args: unknown[]) {
				const accessor = impl.createAccessor(prefix);
				return accessor(args[0]);
			},
		};
		return new Proxy(() => {}, handler);
	}

	return createNestedProxy("");
}

export type { Plugin } from "../transport/plugin";
// Re-export types
export type { Metadata, Operation, Result, Transport } from "../transport/types";
