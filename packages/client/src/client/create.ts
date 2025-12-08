/**
 * @sylphx/lens-client - Lens Client
 *
 * Primary client for Lens API framework.
 * Uses Transport + Plugin architecture for clean, extensible design.
 *
 * Lazy connection - transport.connect() is called on first operation.
 */

import type { RouterDef } from "@sylphx/lens-core";
import type { Plugin } from "../transport/plugin.js";
import type { Metadata, Observable, Operation, Result, Transport } from "../transport/types.js";
import type {
	ExtractRouter,
	LensClientConfig,
	MutationResult,
	QueryResult,
	RouterApiShape,
	RouterLensClient,
	SelectedType,
	SelectionObject,
	TypedClientConfig,
} from "./types.js";

// Re-export types
export type {
	ExtractRouter,
	InferInput,
	InferOutput,
	InferRouterClientType,
	LensClient,
	LensClientConfig,
	MutationResult,
	MutationsMap,
	QueriesMap,
	QueryResult,
	RouterApiShape,
	RouterLensClient,
	SelectedType,
	SelectionObject,
	TypedClientConfig,
} from "./types.js";

// =============================================================================
// Internal Types
// =============================================================================

/** Observer entry for subscription tracking */
interface ObserverEntry {
	next?: ((data: unknown) => void) | undefined;
	error?: ((err: Error) => void) | undefined;
	complete?: (() => void) | undefined;
}

/** Subscription state */
interface SubscriptionState {
	data: unknown;
	error: Error | null;
	completed: boolean;
	observers: Set<ObserverEntry>;
	unsubscribe?: (() => void) | undefined;
}

// =============================================================================
// Client Implementation
// =============================================================================

class ClientImpl {
	private transport: Transport;
	private plugins: Plugin[];

	/** Metadata from transport handshake (lazy loaded) */
	private metadata: Metadata | null = null;
	private connectPromise: Promise<Metadata> | null = null;

	/** Subscription states */
	private subscriptions = new Map<string, SubscriptionState>();

	/** Cached QueryResult objects by key (stable references for React) */
	private queryResultCache = new Map<string, QueryResult<unknown>>();

	/** Maps original observer/callback to entry for proper cleanup */
	private observerEntries = new WeakMap<object | ((...args: never[]) => unknown), ObserverEntry>();

	constructor(config: LensClientConfig) {
		this.transport = config.transport;
		this.plugins = config.plugins ?? [];

		// Start handshake immediately (eager, but don't block)
		this.connectPromise = this.transport.connect();
		this.connectPromise
			.then((metadata) => {
				this.metadata = metadata;
			})
			.catch(() => {
				this.connectPromise = null;
			});
	}

	// =========================================================================
	// Connection Management
	// =========================================================================

	private async ensureConnected(): Promise<void> {
		if (this.metadata) return;

		if (!this.connectPromise) {
			this.connectPromise = this.transport.connect();
		}

		this.metadata = await this.connectPromise;
	}

	// =========================================================================
	// Operation Execution
	// =========================================================================

	private async execute(op: Operation): Promise<Result> {
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

		// Handle Observable (from direct transport returning Observable)
		let result: Result;
		if (this.isObservable(resultOrObservable)) {
			// Get first value from Observable
			result = await this.firstValueFrom(resultOrObservable);
		} else {
			// Handle Promise
			result = await resultOrObservable;
		}

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
						if (!result.error) break;
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

	private firstValueFrom(observable: Observable<Result>): Promise<Result> {
		return new Promise((resolve, reject) => {
			let resolved = false;
			const subscription = observable.subscribe({
				next: (value) => {
					if (!resolved) {
						resolved = true;
						subscription.unsubscribe?.();
						resolve(value);
					}
				},
				error: (err) => {
					if (!resolved) {
						resolved = true;
						reject(err);
					}
				},
				complete: () => {
					if (!resolved) {
						resolved = true;
						reject(new Error("Observable completed without emitting a value"));
					}
				},
			});
		});
	}

	// =========================================================================
	// Metadata Access
	// =========================================================================

	private getOperationMeta(path: string): Metadata["operations"][string] | undefined {
		if (!this.metadata) return undefined;

		const parts = path.split(".");
		let current: Metadata["operations"] | Metadata["operations"][string] = this.metadata.operations;

		for (const part of parts) {
			if (!current || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[part] as Metadata["operations"][string];
		}

		if (current && typeof current === "object" && "type" in current) {
			return current as Metadata["operations"][string];
		}

		return undefined;
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	private generateId(type: string, path: string): string {
		return `${type}-${path}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	private makeQueryKey(path: string, input: unknown): string {
		return `${path}:${JSON.stringify(input ?? null)}`;
	}

	// =========================================================================
	// Query Execution
	// =========================================================================

	executeQuery<T>(path: string, input: unknown, select?: SelectionObject): QueryResult<T> {
		const key = this.makeQueryKey(path, input);

		// Return cached QueryResult for stable reference (important for React hooks)
		const cached = this.queryResultCache.get(key);
		if (cached && !select) {
			return cached as QueryResult<T>;
		}

		if (!this.subscriptions.has(key)) {
			this.subscriptions.set(key, {
				data: null,
				error: null,
				completed: false,
				observers: new Set(),
			});
		}
		const sub = this.subscriptions.get(key)!;

		const result: QueryResult<T> = {
			get value() {
				return sub.data as T | null;
			},

			subscribe: (
				observerOrCallback?: import("@sylphx/lens-core").Observer<T> | ((data: T) => void),
			) => {
				// Normalize to ObserverEntry
				let entry: ObserverEntry;

				if (typeof observerOrCallback === "function") {
					// Callback function pattern
					const callback = observerOrCallback;
					entry = { next: (data: unknown) => callback(data as T) };
				} else if (observerOrCallback && typeof observerOrCallback === "object") {
					// Observer object pattern
					const observer = observerOrCallback;
					entry = {
						next: observer.next ? (data: unknown) => observer.next!(data as T) : undefined,
						error: observer.error,
						complete: observer.complete,
					};
				} else {
					// No observer provided - just trigger subscription
					entry = {};
				}

				// Store mapping for cleanup
				if (observerOrCallback) {
					this.observerEntries.set(observerOrCallback, entry);
				}

				sub.observers.add(entry);

				// Replay current state to new observer
				if (sub.error && entry.error) {
					entry.error(sub.error);
				} else if (sub.data !== null && entry.next) {
					entry.next(sub.data);
				}
				if (sub.completed && entry.complete) {
					entry.complete();
				}

				// Start subscription if not already running
				if (!sub.unsubscribe) {
					this.startSubscription(path, input, key);
				}

				// Return unsubscribe function
				return () => {
					if (observerOrCallback) {
						const storedEntry = this.observerEntries.get(observerOrCallback);
						if (storedEntry) {
							sub.observers.delete(storedEntry);
						}
					}
					// Cleanup subscription when no observers remain
					if (sub.observers.size === 0 && sub.unsubscribe) {
						sub.unsubscribe();
						sub.unsubscribe = undefined;
						// Clean up subscription state to prevent memory leak
						this.subscriptions.delete(key);
						this.queryResultCache.delete(key);
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

					sub.data = response.data;

					// Notify all observers
					for (const observer of sub.observers) {
						observer.next?.(response.data);
					}

					return onfulfilled
						? onfulfilled(response.data as T)
						: (response.data as unknown as TResult1);
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					sub.error = err;

					// Notify error observers
					for (const observer of sub.observers) {
						observer.error?.(err);
					}

					if (onrejected) {
						return onrejected(error);
					}
					throw error;
				}
			},
		};

		// Cache the QueryResult for stable reference (only for non-select queries)
		if (!select) {
			this.queryResultCache.set(key, result as QueryResult<unknown>);
		}

		return result;
	}

	private async startSubscription(path: string, input: unknown, key: string): Promise<void> {
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		await this.ensureConnected();

		const meta = this.getOperationMeta(path);
		const isSubscription = meta?.type === "subscription";

		if (isSubscription) {
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
							sub.error = null; // Clear previous error on new data
							for (const observer of sub.observers) {
								observer.next?.(result.data);
							}
						}
						if (result.error) {
							const err =
								result.error instanceof Error ? result.error : new Error(String(result.error));
							sub.error = err;
							for (const observer of sub.observers) {
								observer.error?.(err);
							}
						}
					},
					error: (err) => {
						sub.error = err;
						for (const observer of sub.observers) {
							observer.error?.(err);
						}
					},
					complete: () => {
						sub.completed = true;
						for (const observer of sub.observers) {
							observer.complete?.();
						}
					},
				});

				sub.unsubscribe = () => subscription.unsubscribe();
			}
		} else {
			this.executeQuery(path, input).then(() => {});
		}
	}

	// =========================================================================
	// Mutation Execution
	// =========================================================================

	async executeMutation<TInput extends Record<string, unknown>, TOutput>(
		path: string,
		input: TInput,
		select?: SelectionObject,
	): Promise<MutationResult<TOutput>> {
		await this.ensureConnected();

		const op: Operation = {
			id: this.generateId("mutation", path),
			path,
			type: "mutation",
			input,
			meta: select ? { select } : {},
		};

		const response = await this.execute(op);

		if (response.error) {
			throw response.error;
		}

		return { data: response.data as TOutput };
	}

	// =========================================================================
	// Public Accessor API
	// =========================================================================

	/**
	 * Create accessor with unified { input, select } pattern.
	 * Accepts QueryDescriptor: { input?: TInput, select?: SelectionObject }
	 *
	 * Backwards compatible: if descriptor has no 'input' or 'select' keys,
	 * treats the entire object as input (legacy API).
	 */
	createAccessor(
		path: string,
	): (descriptor?: { input?: unknown; select?: SelectionObject } | unknown) => unknown {
		return (descriptor?: { input?: unknown; select?: SelectionObject } | unknown) => {
			// Backwards compatibility: detect legacy API (raw input without wrapper)
			const isNewApi =
				descriptor === undefined ||
				descriptor === null ||
				(typeof descriptor === "object" &&
					descriptor !== null &&
					("input" in descriptor || "select" in descriptor));

			const input = isNewApi ? (descriptor as { input?: unknown })?.input : descriptor;
			const select = isNewApi ? (descriptor as { select?: SelectionObject })?.select : undefined;

			// Delegate to executeQuery for all query functionality (caching, subscriptions, etc.)
			const queryResult = this.executeQuery<unknown>(path, input, select);

			// Store original then for queries
			const originalThen = queryResult.then.bind(queryResult);

			// Override then() to support mutations through the proxy API
			(queryResult as { then: typeof queryResult.then }).then = async <
				TResult1 = unknown,
				TResult2 = never,
			>(
				onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
			): Promise<TResult1 | TResult2> => {
				try {
					await this.ensureConnected();
					const meta = this.getOperationMeta(path);

					if (meta?.type === "mutation") {
						const inputObj = (input ?? {}) as Record<string, unknown>;
						const mutationResult = await this.executeMutation(path, inputObj, select);
						return onfulfilled
							? onfulfilled(mutationResult)
							: (mutationResult as unknown as TResult1);
					}

					return originalThen(onfulfilled, onrejected);
				} catch (error) {
					if (onrejected) {
						return onrejected(error);
					}
					throw error;
				}
			};

			return queryResult;
		};
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Lens client (sync return, eager handshake)
 *
 * Connection starts immediately in background. First operation waits
 * for handshake to complete, then uses metadata to determine operation type.
 *
 * @example
 * Type inference from transport (recommended):
 * ```typescript
 * const server = createApp({ router: appRouter });
 * const client = createClient({
 *   transport: inProcess({ app }),
 * });
 * // client is fully typed automatically!
 * ```
 *
 * @example
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

	function createNestedProxy(prefix: string): unknown {
		const handler: ProxyHandler<() => void> = {
			get(_target, prop) {
				if (typeof prop === "symbol") return undefined;
				const key = prop as string;

				if (key === "then") return undefined;
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

export type { Plugin } from "../transport/plugin.js";
export type { Metadata, Operation, Result, Transport } from "../transport/types.js";
