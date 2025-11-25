/**
 * @sylphx/lens-client - Lens Client
 *
 * Primary client for Lens API framework.
 * Uses Transport + Plugin architecture for clean, extensible design.
 */

import type {
	OptimisticDSL as CoreOptimisticDSL,
	MutationDef,
	QueryDef,
	RouterDef,
	RouterRoutes,
} from "@sylphx/lens-core";
import { normalizeOptimisticDSL } from "@sylphx/lens-core";
import { type Signal, type WritableSignal, signal } from "../signals/signal";
import { ReactiveStore } from "../store/reactive-store";
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
export interface LensClientConfig {
	/** Transport for server communication */
	transport: Transport;
	/** Plugins for request/response processing */
	plugins?: Plugin[];
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/** Query result with reactive subscription support */
export interface QueryResult<T> {
	/** Current value */
	readonly value: T | null;
	/** Reactive signal */
	readonly signal: Signal<T | null>;
	/** Loading state */
	readonly loading: Signal<boolean>;
	/** Error state */
	readonly error: Signal<Error | null>;
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
export type InferInput<T> = T extends QueryDef<infer I, unknown>
	? I extends void
		? void
		: I
	: T extends MutationDef<infer I, unknown>
		? I
		: never;

/** Infer output type */
export type InferOutput<T> = T extends QueryDef<unknown, infer O>
	? O
	: T extends MutationDef<unknown, infer O>
		? O
		: never;

// =============================================================================
// Router Types
// =============================================================================

/** Router-based API shape */
export interface RouterApiShape<TRouter extends RouterDef = RouterDef> {
	router: TRouter;
}

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
export type RouterLensClient<TRouter extends RouterDef> = TRouter extends RouterDef<infer TRoutes>
	? InferRouterClientType<TRoutes> & {
			$store: ReactiveStore;
		}
	: never;

/** Generic client type (for framework adapters) */
export type LensClient<_Q = unknown, _M = unknown> = {
	$store: ReactiveStore;
	[key: string]: unknown;
};

// =============================================================================
// Client Implementation
// =============================================================================

class ClientImpl {
	private transport: Transport;
	private plugins: Plugin[];
	private optimistic: boolean;
	private store: ReactiveStore;
	private metadata: Metadata | null = null;

	/** Subscription states */
	private subscriptions = new Map<
		string,
		{
			data: WritableSignal<unknown>;
			loading: WritableSignal<boolean>;
			error: WritableSignal<Error | null>;
			callbacks: Set<(data: unknown) => void>;
			unsubscribe?: () => void;
		}
	>();

	/** Optimistic update tracking */
	private optimisticCounter = 0;
	private optimisticUpdates = new Map<
		string,
		{ previousData: Map<string, unknown>; operation: string }
	>();

	constructor(config: LensClientConfig) {
		this.transport = config.transport;
		this.plugins = config.plugins ?? [];
		this.optimistic = config.optimistic ?? true;
		this.store = new ReactiveStore();
	}

	/**
	 * Initialize client - connect transport and get metadata
	 */
	async init(): Promise<void> {
		this.metadata = await this.transport.connect();
	}

	/**
	 * Execute operation through plugins and transport
	 */
	private async execute(op: Operation): Promise<Result> {
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
	 * Get operation metadata
	 */
	private getOperationMeta(path: string): Metadata["operations"][string] | undefined {
		if (!this.metadata) return undefined;
		return this.metadata.operations[path];
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
				data: signal<unknown>(null),
				loading: signal(true),
				error: signal<Error | null>(null),
				callbacks: new Set(),
			});
		}
		const sub = this.subscriptions.get(key)!;

		const result: QueryResult<T> = {
			get value() {
				return sub.data.value as T | null;
			},
			signal: sub.data as Signal<T | null>,
			loading: sub.loading,
			error: sub.error,

			subscribe: (callback?: (data: T) => void) => {
				// Add callback
				if (callback) {
					const wrapped = (data: unknown) => callback(data as T);
					sub.callbacks.add(wrapped);

					// If data available, call immediately
					if (sub.data.value !== null) {
						callback(sub.data.value as T);
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
					// Execute query
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
					sub.data.value = response.data;
					sub.loading.value = false;

					// Notify callbacks
					for (const cb of sub.callbacks) {
						cb(response.data);
					}

					return onfulfilled
						? onfulfilled(response.data as T)
						: (response.data as unknown as TResult1);
				} catch (error) {
					sub.error.value = error as Error;
					sub.loading.value = false;
					if (onrejected) {
						return onrejected(error);
					}
					throw error;
				}
			},
		};

		return result;
	}

	private startSubscription(path: string, input: unknown, key: string): void {
		const sub = this.subscriptions.get(key);
		if (!sub) return;

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
							sub.data.value = result.data;
							sub.loading.value = false;
							for (const cb of sub.callbacks) {
								cb(result.data);
							}
						}
					},
					error: (error) => {
						sub.error.value = error;
						sub.loading.value = false;
					},
					complete: () => {
						sub.loading.value = false;
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

	async executeMutation<TInput, TOutput>(
		path: string,
		input: TInput,
	): Promise<MutationResult<TOutput>> {
		const meta = this.getOperationMeta(path);
		let optId: string | undefined;

		// Apply optimistic update
		if (this.optimistic && meta?.optimistic) {
			optId = this.applyOptimistic(path, input, meta.optimistic as CoreOptimisticDSL);
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

	private applyOptimistic(path: string, input: unknown, dsl: CoreOptimisticDSL): string {
		const optId = `opt_${++this.optimisticCounter}`;
		const affectedSubs = new Map<string, unknown>();

		// Interpret DSL to get optimistic data
		const optimisticData = this.interpretDSL(dsl, input);
		if (!optimisticData) return optId;

		// Find and update affected subscriptions
		const entityId = this.extractId(optimisticData);
		if (entityId) {
			for (const [key, sub] of this.subscriptions) {
				const currentId = this.extractId(sub.data.value);
				if (currentId === entityId) {
					affectedSubs.set(key, sub.data.value);
					sub.data.value =
						typeof sub.data.value === "object"
							? { ...sub.data.value, ...(optimisticData as object) }
							: optimisticData;

					for (const cb of sub.callbacks) {
						cb(sub.data.value);
					}
				}
			}
		}

		this.optimisticUpdates.set(optId, { previousData: affectedSubs, operation: path });
		return optId;
	}

	private interpretDSL(dsl: CoreOptimisticDSL, input: unknown): unknown {
		const inputObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
		const normalized = normalizeOptimisticDSL(dsl);

		switch (normalized.type) {
			case "merge":
				return inputObj.id ? inputObj : null;
			case "create":
				return { id: `temp_${++this.optimisticCounter}`, ...inputObj };
			case "delete":
				return inputObj.id ? { id: inputObj.id, _deleted: true } : null;
			default:
				return null;
		}
	}

	private confirmOptimistic(optId: string, serverData: unknown): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Update with server data
		const entityId = this.extractId(serverData);
		if (entityId) {
			for (const [key, sub] of this.subscriptions) {
				const currentId = this.extractId(sub.data.value);
				if (currentId === entityId) {
					sub.data.value = serverData;
					for (const cb of sub.callbacks) {
						cb(serverData);
					}
				}
			}
		}

		this.optimisticUpdates.delete(optId);
	}

	private rollbackOptimistic(optId: string): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Restore previous data
		for (const [key, previousData] of entry.previousData) {
			const sub = this.subscriptions.get(key);
			if (sub) {
				sub.data.value = previousData;
				for (const cb of sub.callbacks) {
					cb(previousData);
				}
			}
		}

		this.optimisticUpdates.delete(optId);
	}

	private extractId(data: unknown): string | undefined {
		if (!data || typeof data !== "object") return undefined;
		const obj = data as Record<string, unknown>;
		return typeof obj.id === "string" ? obj.id : undefined;
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	createAccessor(path: string): (input?: unknown) => unknown {
		const accessor = (input?: unknown) => {
			const meta = this.getOperationMeta(path);

			if (meta?.type === "mutation") {
				return this.executeMutation(path, input);
			}

			return this.executeQuery(path, input);
		};

		// Add subscribe method
		(accessor as unknown as Record<string, unknown>).subscribe = (
			callback?: (data: unknown) => void,
		) => {
			return this.executeQuery(path, undefined).subscribe(callback);
		};

		return accessor;
	}

	get $store(): ReactiveStore {
		return this.store;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Lens client
 *
 * @example
 * ```typescript
 * import type { AppRouter } from './server';
 *
 * const client = await createClient<RouterApiShape<AppRouter>>({
 *   transport: http({ url: '/api' }),
 *   plugins: [logger(), auth({ getToken: () => token })],
 * });
 *
 * // Use
 * const user = await client.user.get({ id: '123' });
 * await client.user.update({ id: '123', name: 'New Name' });
 * ```
 */
export async function createClient<TApi extends RouterApiShape>(
	config: LensClientConfig,
): Promise<RouterLensClient<TApi extends RouterApiShape<infer R> ? R : never>> {
	const impl = new ClientImpl(config);
	await impl.init();

	// Create nested proxy for router-based access
	function createNestedProxy(prefix: string): unknown {
		const handler: ProxyHandler<() => void> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				if (key === "$store") return impl.$store;
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

	return createNestedProxy("") as RouterLensClient<
		TApi extends RouterApiShape<infer R> ? R : never
	>;
}

// Re-export types
export type { Transport, Operation, Result, Metadata } from "../transport/types";
export type { Plugin } from "../transport/plugin";
