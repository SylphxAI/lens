/**
 * @sylphx/lens-client - Lens Client
 *
 * Primary client for Lens API framework.
 * Uses Transport + Plugin architecture for clean, extensible design.
 *
 * Features:
 * - Lazy connection - transport.connect() is called on first operation
 * - Query batching - queries in same microtask are batched together
 * - Selection merging - multiple observers share one subscription with merged fields
 * - Data filtering - each observer receives only their requested fields
 */

import { applyOps, isError, isOps, isSnapshot, type RouterDef } from "@sylphx/lens-core";
import {
	type EndpointKey,
	filterToSelection,
	mergeSelections,
	type SubscriberId,
} from "../selection/field-merger.js";
import type { Plugin } from "../transport/plugin.js";
import {
	hasAnySubscription,
	isMutationCapable,
	isQueryCapable,
	isSubscriptionCapable,
	type Metadata,
	type Observable,
	type Operation,
	type OperationMeta,
	type Result,
	type TransportBase,
} from "../transport/types.js";
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
	id: SubscriberId;
	selection: SelectionObject | undefined;
	next?: ((data: unknown) => void) | undefined;
	error?: ((err: Error) => void) | undefined;
	complete?: (() => void) | undefined;
}

/** Subscription state for an endpoint */
interface EndpointState {
	/** Current data (full merged data from server) */
	data: unknown;
	/** Current error */
	error: Error | null;
	/** Is subscription completed */
	completed: boolean;
	/** All observers with their selections */
	observers: Map<SubscriberId, ObserverEntry>;
	/** Current merged selection */
	mergedSelection: SelectionObject | undefined;
	/** Unsubscribe function from transport */
	unsubscribe?: (() => void) | undefined;
	/** Is currently subscribed to server */
	isSubscribed: boolean;
}

/** Pending query batch for microtask batching */
interface PendingQueryBatch {
	path: string;
	input: unknown;
	observers: Array<{
		id: SubscriberId;
		selection: SelectionObject | undefined;
		resolve: (data: unknown) => void;
		reject: (error: Error) => void;
	}>;
	mergedSelection: SelectionObject | undefined;
}

// =============================================================================
// Client Implementation
// =============================================================================

let subscriberIdCounter = 0;
function generateSubscriberId(): SubscriberId {
	return `sub_${Date.now()}_${++subscriberIdCounter}`;
}

class ClientImpl {
	private transport: TransportBase;
	private plugins: Plugin[];

	/** Metadata from transport handshake (lazy loaded) */
	private metadata: Metadata | null = null;
	private connectPromise: Promise<Metadata> | null = null;

	/** Endpoint states - tracks all active subscriptions/queries */
	private endpoints = new Map<EndpointKey, EndpointState>();

	/** Pending query batches - collects queries in same microtask */
	private pendingBatches = new Map<EndpointKey, PendingQueryBatch>();
	private batchScheduled = false;

	/** Cached QueryResult objects by key+selection (stable references for React) */
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

		// Execute through transport using capability methods
		let resultOrObservable: Promise<Result> | Observable<Result>;
		if (processedOp.type === "mutation" && isMutationCapable(this.transport)) {
			resultOrObservable = this.transport.mutation(processedOp);
		} else if (processedOp.type === "subscription" && isSubscriptionCapable(this.transport)) {
			resultOrObservable = this.transport.subscription(processedOp);
		} else if (isQueryCapable(this.transport)) {
			resultOrObservable = this.transport.query(processedOp);
		} else {
			throw new Error(`Transport does not support ${processedOp.type} operations`);
		}

		// Handle Observable (from direct transport returning Observable for subscriptions)
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
		if (isError(result)) {
			const error = new Error(result.error);
			for (const plugin of this.plugins) {
				if (plugin.onError) {
					try {
						result = await plugin.onError(error, processedOp, () => this.execute(processedOp));
						if (!isError(result)) break;
					} catch (e) {
						result = { $: "error", error: e instanceof Error ? e.message : String(e) };
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

	private getOperationMeta(path: string): OperationMeta | undefined {
		if (!this.metadata) return undefined;

		const parts = path.split(".");
		let current: Metadata["operations"] | Metadata["operations"][string] = this.metadata.operations;

		for (const part of parts) {
			if (!current || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[part] as Metadata["operations"][string];
		}

		if (current && typeof current === "object" && "type" in current) {
			return current as OperationMeta;
		}

		return undefined;
	}

	/**
	 * Check if an operation requires subscription transport.
	 * Returns true if:
	 * 1. Operation is declared as subscription (async generator)
	 * 2. Any selected field in the return type is a subscription field
	 */
	private requiresSubscription(path: string, select?: SelectionObject): boolean {
		const meta = this.getOperationMeta(path);
		if (!meta) return false;

		// Already a subscription - yes
		if (meta.type === "subscription") return true;

		// Live query (Publisher pattern) - needs streaming transport
		if ((meta as { live?: boolean }).live) return true;

		// For queries, check if any selected field is a subscription
		if (meta.type === "query" && meta.returnType && this.metadata?.entities) {
			return hasAnySubscription(this.metadata.entities, meta.returnType, select);
		}

		return false;
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	private generateId(type: string, path: string): string {
		return `${type}-${path}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	/** Cache for object input hashes to avoid repeated JSON.stringify */
	private inputHashCache = new WeakMap<object, string>();

	private makeEndpointKey(path: string, input: unknown): EndpointKey {
		// Fast path for common cases
		if (input === undefined || input === null) {
			return `${path}:null`;
		}
		if (typeof input !== "object") {
			// Primitives are cheap to convert
			return `${path}:${String(input)}`;
		}

		// For objects, use cached hash to avoid repeated JSON.stringify
		const obj = input as object;
		let hash = this.inputHashCache.get(obj);
		if (!hash) {
			hash = JSON.stringify(input);
			this.inputHashCache.set(obj, hash);
		}
		return `${path}:${hash}`;
	}

	/** Make cache key for QueryResult (includes selection for different select() calls) */
	private makeQueryResultKey(endpointKey: EndpointKey, select?: SelectionObject): string {
		if (!select) return endpointKey;
		return `${endpointKey}:${JSON.stringify(select)}`;
	}

	// =========================================================================
	// Selection Merging
	// =========================================================================

	/**
	 * Get or create endpoint state.
	 */
	private getOrCreateEndpoint(key: EndpointKey): EndpointState {
		let endpoint = this.endpoints.get(key);
		if (!endpoint) {
			endpoint = {
				data: null,
				error: null,
				completed: false,
				observers: new Map(),
				mergedSelection: undefined,
				isSubscribed: false,
			};
			this.endpoints.set(key, endpoint);
		}
		return endpoint;
	}

	/**
	 * Add observer to endpoint and recompute merged selection.
	 * Returns analysis of selection change.
	 */
	private addObserver(
		key: EndpointKey,
		observer: ObserverEntry,
	): { endpoint: EndpointState; selectionChanged: boolean; isExpanded: boolean } {
		const endpoint = this.getOrCreateEndpoint(key);
		const previousSelection = endpoint.mergedSelection;

		// Add observer
		endpoint.observers.set(observer.id, observer);

		// Recompute merged selection
		const selections = Array.from(endpoint.observers.values())
			.map((o) => o.selection)
			.filter((s): s is SelectionObject => s !== undefined);

		endpoint.mergedSelection = selections.length > 0 ? mergeSelections(selections) : undefined;

		// Analyze change
		const selectionChanged =
			JSON.stringify(previousSelection) !== JSON.stringify(endpoint.mergedSelection);
		const isExpanded =
			selectionChanged && this.isSelectionExpanded(previousSelection, endpoint.mergedSelection);

		return { endpoint, selectionChanged, isExpanded };
	}

	/**
	 * Remove observer from endpoint and recompute merged selection.
	 */
	private removeObserver(
		key: EndpointKey,
		observerId: SubscriberId,
	): { endpoint: EndpointState | undefined; shouldUnsubscribe: boolean } {
		const endpoint = this.endpoints.get(key);
		if (!endpoint) return { endpoint: undefined, shouldUnsubscribe: false };

		endpoint.observers.delete(observerId);

		if (endpoint.observers.size === 0) {
			// No more observers - cleanup
			return { endpoint, shouldUnsubscribe: true };
		}

		// Recompute merged selection (could shrink, but we don't re-subscribe for shrink)
		const selections = Array.from(endpoint.observers.values())
			.map((o) => o.selection)
			.filter((s): s is SelectionObject => s !== undefined);

		endpoint.mergedSelection = selections.length > 0 ? mergeSelections(selections) : undefined;

		return { endpoint, shouldUnsubscribe: false };
	}

	/**
	 * Check if new selection is expanded (has new fields).
	 */
	private isSelectionExpanded(
		previous: SelectionObject | undefined,
		current: SelectionObject | undefined,
	): boolean {
		if (!previous) return current !== undefined;
		if (!current) return false;

		const previousKeys = this.flattenSelectionKeys(previous);
		const currentKeys = this.flattenSelectionKeys(current);

		for (const key of currentKeys) {
			if (!previousKeys.has(key)) return true;
		}
		return false;
	}

	/**
	 * Flatten selection to set of field paths.
	 */
	private flattenSelectionKeys(selection: SelectionObject, prefix = ""): Set<string> {
		const keys = new Set<string>();

		for (const [key, value] of Object.entries(selection)) {
			const path = prefix ? `${prefix}.${key}` : key;
			keys.add(path);

			// Skip boolean values (true means select field, no nesting)
			if (typeof value === "boolean") {
				continue;
			}

			if (typeof value === "object" && value !== null) {
				const nested =
					"select" in value ? (value.select as SelectionObject) : (value as SelectionObject);
				if (nested && typeof nested === "object") {
					for (const nestedKey of this.flattenSelectionKeys(nested, path)) {
						keys.add(nestedKey);
					}
				}
			}
		}

		return keys;
	}

	/**
	 * Distribute data to all observers with filtering.
	 */
	private distributeData(endpoint: EndpointState, data: unknown): void {
		endpoint.data = data;
		endpoint.error = null;

		for (const observer of endpoint.observers.values()) {
			if (observer.next) {
				const filteredData = observer.selection
					? filterToSelection(data, observer.selection)
					: data;
				observer.next(filteredData);
			}
		}
	}

	/**
	 * Distribute error to all observers.
	 */
	private distributeError(endpoint: EndpointState, error: Error): void {
		endpoint.error = error;

		for (const observer of endpoint.observers.values()) {
			observer.error?.(error);
		}
	}

	// =========================================================================
	// Query Batching
	// =========================================================================

	/**
	 * Schedule a query to be batched in the current microtask.
	 * Queries to the same endpoint are merged and executed together.
	 */
	private scheduleBatchedQuery(
		key: EndpointKey,
		path: string,
		input: unknown,
		selection: SelectionObject | undefined,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const observerId = generateSubscriberId();

			let batch = this.pendingBatches.get(key);
			if (!batch) {
				batch = {
					path,
					input,
					observers: [],
					mergedSelection: undefined,
				};
				this.pendingBatches.set(key, batch);
			}

			// Add to batch
			batch.observers.push({ id: observerId, selection, resolve, reject });

			// Merge selection
			const selections = batch.observers
				.map((o) => o.selection)
				.filter((s): s is SelectionObject => s !== undefined);
			batch.mergedSelection = selections.length > 0 ? mergeSelections(selections) : undefined;

			// Schedule flush if not already scheduled
			if (!this.batchScheduled) {
				this.batchScheduled = true;
				queueMicrotask(() => this.flushBatches());
			}
		});
	}

	/**
	 * Execute all pending batched queries.
	 */
	private async flushBatches(): Promise<void> {
		this.batchScheduled = false;

		const batches = Array.from(this.pendingBatches.entries());
		this.pendingBatches.clear();

		// Execute all batches in parallel
		await Promise.all(
			batches.map(async ([key, batch]) => {
				try {
					const op: Operation = {
						id: this.generateId("query", batch.path),
						path: batch.path,
						type: "query",
						input: batch.input,
						meta: batch.mergedSelection ? { select: batch.mergedSelection } : {},
					};

					const response = await this.execute(op);

					if (isError(response)) {
						const error = new Error(response.error);
						for (const observer of batch.observers) {
							observer.reject(error);
						}
						return;
					}

					if (isSnapshot(response)) {
						// Update endpoint state
						const endpoint = this.getOrCreateEndpoint(key);
						endpoint.data = response.data;

						// Distribute filtered data to each observer
						for (const observer of batch.observers) {
							const filteredData = observer.selection
								? filterToSelection(response.data, observer.selection)
								: response.data;
							observer.resolve(filteredData);
						}
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					for (const observer of batch.observers) {
						observer.reject(err);
					}
				}
			}),
		);
	}

	// =========================================================================
	// Query Execution
	// =========================================================================

	executeQuery<T>(path: string, input: unknown, select?: SelectionObject): QueryResult<T> {
		const key = this.makeEndpointKey(path, input);
		const cacheKey = this.makeQueryResultKey(key, select);

		// Return cached QueryResult for stable reference (important for React hooks)
		const cached = this.queryResultCache.get(cacheKey);
		if (cached) {
			return cached as QueryResult<T>;
		}

		const endpoint = this.getOrCreateEndpoint(key);

		const result: QueryResult<T> = {
			get value() {
				// Return filtered data for this selection
				if (endpoint.data === null) return null;
				return (select ? filterToSelection(endpoint.data, select) : endpoint.data) as T | null;
			},

			subscribe: (
				observerOrCallback?: import("@sylphx/lens-core").Observer<T> | ((data: T) => void),
			) => {
				const observerId = generateSubscriberId();

				// Normalize to ObserverEntry
				let entry: ObserverEntry;

				if (typeof observerOrCallback === "function") {
					const callback = observerOrCallback;
					entry = {
						id: observerId,
						selection: select,
						next: (data: unknown) => callback(data as T),
					};
				} else if (observerOrCallback && typeof observerOrCallback === "object") {
					const observer = observerOrCallback;
					entry = {
						id: observerId,
						selection: select,
						next: observer.next ? (data: unknown) => observer.next!(data as T) : undefined,
						error: observer.error,
						complete: observer.complete,
					};
				} else {
					entry = { id: observerId, selection: select };
				}

				// Store mapping for cleanup
				if (observerOrCallback) {
					this.observerEntries.set(observerOrCallback, entry);
				}

				// Add observer and check if selection expanded
				const { endpoint: ep, isExpanded } = this.addObserver(key, entry);

				// Start or update subscription
				if (!ep.isSubscribed) {
					this.startSubscription(path, input, key);
				} else if (isExpanded) {
					// Selection expanded - need to re-subscribe with new merged selection
					// Don't replay stale data - wait for fresh data from re-subscription
					if (ep.unsubscribe) {
						ep.unsubscribe();
					}
					ep.isSubscribed = false;
					this.startSubscription(path, input, key);
				} else {
					// Not expanding - safe to replay current state to new observer (filtered)
					if (ep.error && entry.error) {
						entry.error(ep.error);
					} else if (ep.data !== null && entry.next) {
						const filteredData = select ? filterToSelection(ep.data, select) : ep.data;
						entry.next(filteredData);
					}
					if (ep.completed && entry.complete) {
						entry.complete();
					}
				}

				// Return unsubscribe function
				return () => {
					if (observerOrCallback) {
						const storedEntry = this.observerEntries.get(observerOrCallback);
						if (storedEntry) {
							const { shouldUnsubscribe } = this.removeObserver(key, storedEntry.id);

							if (shouldUnsubscribe) {
								ep.unsubscribe?.();
								ep.isSubscribed = false;
								this.endpoints.delete(key);
								// Clean up all QueryResult caches for this endpoint
								for (const [k] of this.queryResultCache) {
									if (k.startsWith(key)) {
										this.queryResultCache.delete(k);
									}
								}
							}
						}
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
					// Use batched query execution
					const data = await this.scheduleBatchedQuery(key, path, input, select);

					// Also update endpoint state for subscribe() calls
					const ep = this.getOrCreateEndpoint(key);
					if (ep.data === null) {
						ep.data = data;
					}

					return onfulfilled ? onfulfilled(data as T) : (data as unknown as TResult1);
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));

					// Update endpoint error state
					const ep = this.endpoints.get(key);
					if (ep) {
						ep.error = err;
					}

					if (onrejected) {
						return onrejected(error);
					}
					throw error;
				}
			},
		};

		// Cache the QueryResult for stable reference
		this.queryResultCache.set(cacheKey, result as QueryResult<unknown>);

		return result;
	}

	// =========================================================================
	// Subscription Management
	// =========================================================================

	private async startSubscription(path: string, input: unknown, key: EndpointKey): Promise<void> {
		const endpoint = this.endpoints.get(key);
		if (!endpoint) return;

		// Set immediately to prevent race condition:
		// Multiple subscribe() calls could pass the !isSubscribed check before
		// ensureConnected() completes, creating duplicate server subscriptions.
		endpoint.isSubscribed = true;

		try {
			await this.ensureConnected();
		} catch (error) {
			// Reset on connection failure so retry can work
			endpoint.isSubscribed = false;
			// Distribute error to observers instead of throwing (caller doesn't catch)
			const err = error instanceof Error ? error : new Error(String(error));
			this.distributeError(endpoint, err);
			return;
		}

		// Mutations don't support subscription - no-op
		const meta = this.getOperationMeta(path);
		if (meta?.type === "mutation") {
			return;
		}

		// Check if this operation requires subscription transport
		const isSubscription = this.requiresSubscription(path, endpoint.mergedSelection);

		if (isSubscription) {
			const op: Operation = {
				id: this.generateId("subscription", path),
				path,
				type: "subscription",
				input,
				meta: endpoint.mergedSelection ? { select: endpoint.mergedSelection } : {},
			};

			// Use subscription capability if available, fallback to query
			const resultOrObservable = isSubscriptionCapable(this.transport)
				? this.transport.subscription(op)
				: isQueryCapable(this.transport)
					? this.transport.query(op)
					: Promise.reject(new Error("Transport does not support subscriptions"));

			if (this.isObservable(resultOrObservable)) {
				const subscription = resultOrObservable.subscribe({
					next: (message) => {
						if (isSnapshot(message)) {
							this.distributeData(endpoint, message.data);
						} else if (isOps(message)) {
							// Must have baseline data before applying ops
							if (endpoint.data === undefined) {
								// Ops received before snapshot - protocol error or race condition
								// Log warning and skip (server should send snapshot first)
								console.warn(
									`[Lens] Received ops message before snapshot for ${path}. Skipping update.`,
								);
								return;
							}
							try {
								const newData = applyOps(endpoint.data, message.ops);
								this.distributeData(endpoint, newData);
							} catch (updateErr) {
								const err = updateErr instanceof Error ? updateErr : new Error(String(updateErr));
								this.distributeError(endpoint, err);
							}
						} else if (isError(message)) {
							this.distributeError(endpoint, new Error(message.error));
						}
					},
					error: (err) => {
						this.distributeError(endpoint, err);
					},
					complete: () => {
						endpoint.completed = true;
						for (const observer of endpoint.observers.values()) {
							observer.complete?.();
						}
					},
				});

				endpoint.unsubscribe = () => subscription.unsubscribe();
			}
		} else {
			// Query: execute once via batched Promise, notify observers, complete
			try {
				const data = await this.scheduleBatchedQuery(key, path, input, endpoint.mergedSelection);
				this.distributeData(endpoint, data);
				endpoint.completed = true;
				for (const observer of endpoint.observers.values()) {
					observer.complete?.();
				}
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				this.distributeError(endpoint, err);
			}
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

		if (isError(response)) {
			throw new Error(response.error);
		}

		if (isSnapshot(response)) {
			return { data: response.data as TOutput };
		}

		// ops message - shouldn't happen for mutations, they're one-shot
		// This indicates a protocol error
		throw new Error(
			`Mutation received unexpected message type: ${response.$}. Mutations should return snapshot.`,
		);
	}

	// =========================================================================
	// Public Accessor API
	// =========================================================================

	/**
	 * Create accessor with unified { input, select } pattern.
	 */
	createAccessor(
		path: string,
	): (descriptor?: { input?: unknown; select?: SelectionObject }) => unknown {
		return (descriptor?: { input?: unknown; select?: SelectionObject }) => {
			// Handle both forms:
			// - Standard: client.user.get({ id }) - input object directly
			// - With selection: client.user.get({ input: { id }, select: { name: true } })
			let input: unknown;
			let select: SelectionObject | undefined;

			if (
				descriptor &&
				typeof descriptor === "object" &&
				("input" in descriptor || "select" in descriptor)
			) {
				// Extended form with explicit input/select
				input = descriptor.input;
				select = descriptor.select;
			} else {
				// Standard form: direct input
				input = descriptor;
				select = undefined;
			}

			// Delegate to executeQuery for all query functionality
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

	// =========================================================================
	// Debug API
	// =========================================================================

	/**
	 * Get statistics about active subscriptions (for debugging).
	 */
	getStats(): {
		endpointCount: number;
		totalObservers: number;
		pendingBatches: number;
	} {
		let totalObservers = 0;
		for (const endpoint of this.endpoints.values()) {
			totalObservers += endpoint.observers.size;
		}

		return {
			endpointCount: this.endpoints.size,
			totalObservers,
			pendingBatches: this.pendingBatches.size,
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
 * Features:
 * - Query batching: queries in same microtask are merged and executed together
 * - Selection merging: multiple components can share one subscription
 * - Data filtering: each component receives only its requested fields
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
				return accessor(args[0] as { input?: unknown; select?: SelectionObject } | undefined);
			},
		};
		return new Proxy(() => {}, handler);
	}

	return createNestedProxy("");
}

export type { Plugin } from "../transport/plugin.js";
export type { Metadata, Operation, Result, TransportBase } from "../transport/types.js";
