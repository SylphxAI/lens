/**
 * @lens/client - Unified Client
 *
 * Combines V2 Operations API with V1 Optimization Layer:
 * - Flat namespace (client.whoami() instead of client.query.whoami())
 * - Query deduplication via canDerive
 * - Field-level subscriptions with refCount
 * - EntitySignal for fine-grained reactivity
 * - Request batching
 */

import type { QueryDef, MutationDef, Update } from "@lens/core";
import { applyUpdate } from "@lens/core";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import { signal, computed, type Signal } from "../signals/signal";
import {
	makeQueryKey,
	makeQueryKeyWithFields,
	RequestDeduplicator,
} from "../shared";

// =============================================================================
// Types
// =============================================================================

/** Query map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown, unknown>>;

/** Mutation map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown, unknown>>;

/** Transport interface */
export interface UnifiedTransport {
	/** Send subscribe message */
	subscribe(
		operation: string,
		input: unknown,
		fields: string[] | "*",
		callbacks: {
			onData: (data: unknown) => void;
			onUpdate: (updates: Record<string, Update>) => void;
			onError: (error: Error) => void;
			onComplete: () => void;
		},
		/** SelectionObject for nested field selection */
		select?: SelectionObject,
	): { unsubscribe: () => void; updateFields: (add?: string[], remove?: string[]) => void };

	/** Send one-time query */
	query(operation: string, input: unknown, fields?: string[] | "*", select?: SelectionObject): Promise<unknown>;

	/** Send mutation */
	mutate(operation: string, input: unknown): Promise<unknown>;

	/** Connect */
	connect(): Promise<void>;

	/** Disconnect */
	disconnect(): void;
}

/** Unified link function */
export type UnifiedLinkFn = (
	ctx: UnifiedOperationContext,
	next: (ctx: UnifiedOperationContext) => Promise<unknown>,
) => Promise<unknown>;

/** Unified link factory */
export type UnifiedLink = () => UnifiedLinkFn;

/** Unified operation context */
export interface UnifiedOperationContext {
	/** Unique operation ID */
	id: string;
	/** Operation type */
	type: "query" | "mutation" | "subscription";
	/** Operation name */
	operation: string;
	/** Operation input */
	input: unknown;
	/** Field selection */
	select?: SelectionObject;
	/** Custom metadata (can be extended by links) */
	meta: Record<string, unknown>;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/** Client configuration */
export interface UnifiedClientConfig<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query definitions */
	queries?: Q;
	/** Mutation definitions */
	mutations?: M;
	/** Transport (direct transport, use this OR links) */
	transport?: UnifiedTransport;
	/** Links chain (last one should be terminal, use this OR transport) */
	links?: (UnifiedLink | UnifiedTransport)[];
	/** Enable optimistic updates */
	optimistic?: boolean;
}

/** Query result with subscription support */
export interface QueryResult<T> {
	/** Get current value (triggers fetch if not subscribed) */
	readonly value: T | null;
	/** Signal for reactive access */
	readonly signal: Signal<T | null>;
	/** Loading state */
	readonly loading: Signal<boolean>;
	/** Error state */
	readonly error: Signal<Error | null>;
	/** Subscribe to updates */
	subscribe(callback?: (data: T) => void): () => void;
	/** Select specific fields */
	select<S extends SelectionObject>(selection: S): QueryResult<T>;
	/** Promise interface */
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2>;
}

/** Selection object */
export type SelectionObject = Record<string, boolean | SelectionObject | { select: SelectionObject }>;

/** Mutation result */
export interface MutationResult<T> {
	data: T;
	/** Rollback optimistic update (if applied) */
	rollback?: () => void;
}

/** Optimistic update configuration */
export interface OptimisticConfig<T = unknown> {
	/** Operation to apply optimistic update to */
	operation: string;
	/** Input to identify the subscription */
	input?: unknown;
	/** Optimistic data to apply immediately */
	data: Partial<T>;
}

/** Pending optimistic entry */
interface OptimisticEntry {
	id: string;
	operation: string;
	input: unknown;
	previousData: unknown;
}

/** Infer input type from query/mutation */
export type InferInput<T> = T extends QueryDef<infer I, unknown, unknown>
	? I extends void
		? void
		: I
	: T extends MutationDef<infer I, unknown, unknown>
		? I
		: never;

/** Infer output type from query/mutation */
export type InferOutput<T> = T extends QueryDef<unknown, infer O, unknown>
	? O
	: T extends MutationDef<unknown, infer O, unknown>
		? O
		: never;

// =============================================================================
// Subscription State
// =============================================================================

interface SubscriptionState {
	/** Operation name */
	operation: string;
	/** Input */
	input: unknown;
	/** Fields being subscribed */
	fields: Set<string>;
	/** Full entity subscription count */
	fullRefs: number;
	/** Per-field ref counts */
	fieldRefs: Map<string, number>;
	/** Current data */
	data: Signal<unknown>;
	/** Loading state */
	loading: Signal<boolean>;
	/** Error state */
	error: Signal<Error | null>;
	/** Transport subscription */
	transportSub?: {
		unsubscribe: () => void;
		updateFields: (add?: string[], remove?: string[]) => void;
	};
	/** Callbacks waiting for data */
	callbacks: Set<(data: unknown) => void>;
}

// Note: makeQueryKey and makeQueryKeyWithFields imported from shared/keys

// =============================================================================
// Unified Client Implementation
// =============================================================================

class UnifiedClientImpl<Q extends QueriesMap, M extends MutationsMap> {
	private queries: Q;
	private mutations: M;
	private transport: UnifiedTransport;
	private linkChain: UnifiedLinkFn[] = [];
	private optimistic: boolean;
	private store: ReactiveStore;

	/** Subscription states by query key */
	private subscriptions = new Map<string, SubscriptionState>();

	/** Pending requests for batching */
	private pendingQueries: Array<{
		key: string;
		operation: string;
		input: unknown;
		fields?: string[];
		resolve: (data: unknown) => void;
		reject: (error: Error) => void;
	}> = [];
	private batchTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly batchDelay = 10;

	/** In-flight queries for deduplication (uses shared utility) */
	private requestDedup = new RequestDeduplicator<unknown>();

	/** Pending optimistic updates */
	private optimisticUpdates = new Map<string, OptimisticEntry>();
	private optimisticCounter = 0;

	constructor(config: UnifiedClientConfig<Q, M>) {
		this.queries = config.queries ?? ({} as Q);
		this.mutations = config.mutations ?? ({} as M);
		this.optimistic = config.optimistic ?? true;
		this.store = new ReactiveStore();

		// Handle links or transport config
		if (config.links && config.links.length > 0) {
			// Extract terminal link (last one that is a transport)
			const lastItem = config.links[config.links.length - 1];
			if (this.isTransport(lastItem)) {
				this.transport = lastItem;
				// Build middleware chain from remaining links
				for (let i = 0; i < config.links.length - 1; i++) {
					const link = config.links[i];
					if (!this.isTransport(link)) {
						this.linkChain.push(link());
					}
				}
			} else {
				throw new Error("Last link must be a terminal transport (e.g., websocketLink)");
			}
		} else if (config.transport) {
			this.transport = config.transport;
		} else {
			throw new Error("Must provide either 'transport' or 'links' config");
		}
	}

	/** Check if item is a transport */
	private isTransport(item: UnifiedLink | UnifiedTransport): item is UnifiedTransport {
		return (
			typeof item === "object" &&
			"connect" in item &&
			"disconnect" in item &&
			"query" in item &&
			"mutate" in item
		);
	}

	/** Execute through link chain */
	private async executeWithLinks(ctx: UnifiedOperationContext): Promise<unknown> {
		// Build execution chain
		const execute = async (ctx: UnifiedOperationContext): Promise<unknown> => {
			if (ctx.type === "query") {
				return this.transport.query(ctx.operation, ctx.input, "*", ctx.select);
			} else if (ctx.type === "mutation") {
				return this.transport.mutate(ctx.operation, ctx.input);
			}
			throw new Error(`Unsupported operation type: ${ctx.type}`);
		};

		// If no middleware, execute directly
		if (this.linkChain.length === 0) {
			return execute(ctx);
		}

		// Build chain from right to left
		let chain = execute;
		for (let i = this.linkChain.length - 1; i >= 0; i--) {
			const link = this.linkChain[i];
			const next = chain;
			chain = (ctx) => link(ctx, next);
		}

		return chain(ctx);
	}

	// ===========================================================================
	// Query Resolution
	// ===========================================================================

	/**
	 * Check if a query can be derived from existing subscription
	 */
	private canDerive(operation: string, input: unknown, fields?: string[]): boolean {
		const baseKey = makeQueryKey(operation, input);
		const baseSub = this.subscriptions.get(baseKey);

		if (!baseSub) return false;

		// If base subscription has all fields, we can derive any subset
		if (baseSub.fullRefs > 0) return true;

		// If requesting specific fields, check if they're all subscribed
		if (fields) {
			return fields.every((f) => baseSub.fields.has(f));
		}

		return false;
	}

	/**
	 * Get or create subscription for a query
	 */
	private getOrCreateSubscription(
		operation: string,
		input: unknown,
		fields?: string[],
	): SubscriptionState {
		const key = makeQueryKey(operation, input);

		if (!this.subscriptions.has(key)) {
			const sub: SubscriptionState = {
				operation,
				input,
				fields: new Set(),
				fullRefs: 0,
				fieldRefs: new Map(),
				data: signal<unknown>(null),
				loading: signal(true),
				error: signal<Error | null>(null),
				callbacks: new Set(),
			};
			this.subscriptions.set(key, sub);
		}

		return this.subscriptions.get(key)!;
	}

	/**
	 * Subscribe to specific fields
	 */
	private subscribeFields(sub: SubscriptionState, fields: string[]): void {
		const newFields: string[] = [];

		for (const field of fields) {
			const currentRef = sub.fieldRefs.get(field) ?? 0;
			sub.fieldRefs.set(field, currentRef + 1);

			if (currentRef === 0) {
				sub.fields.add(field);
				newFields.push(field);
			}
		}

		// Notify transport of new fields
		if (newFields.length > 0 && sub.transportSub) {
			sub.transportSub.updateFields(newFields, undefined);
		}
	}

	/**
	 * Unsubscribe from specific fields
	 */
	private unsubscribeFields(sub: SubscriptionState, fields: string[]): void {
		const removedFields: string[] = [];

		for (const field of fields) {
			const currentRef = sub.fieldRefs.get(field) ?? 0;
			if (currentRef <= 1) {
				sub.fieldRefs.delete(field);
				sub.fields.delete(field);
				removedFields.push(field);
			} else {
				sub.fieldRefs.set(field, currentRef - 1);
			}
		}

		// Notify transport of removed fields
		if (removedFields.length > 0 && sub.transportSub) {
			sub.transportSub.updateFields(undefined, removedFields);
		}

		// Check if subscription can be cleaned up
		this.maybeCleanupSubscription(sub);
	}

	/**
	 * Subscribe to full entity
	 */
	private subscribeFullEntity(sub: SubscriptionState): void {
		sub.fullRefs++;

		// If first full subscription, ensure transport is subscribed to all
		if (sub.fullRefs === 1 && sub.transportSub) {
			sub.transportSub.updateFields(["*"], undefined);
		}
	}

	/**
	 * Unsubscribe from full entity
	 */
	private unsubscribeFullEntity(sub: SubscriptionState): void {
		if (sub.fullRefs > 0) {
			sub.fullRefs--;
		}

		// 最大原則 (Maximum Principle):
		// When full subscription disposes but field subscriptions remain,
		// reconfigure transport from "*" to specific fields only
		if (sub.fullRefs === 0 && sub.fieldRefs.size > 0 && sub.transportSub) {
			// Get the remaining subscribed fields
			const remainingFields = Array.from(sub.fields);

			// Tell transport to switch from "*" to specific fields
			// This is a "downgrade" - we no longer need all fields
			sub.transportSub.updateFields(remainingFields, ["*"]);
		}

		this.maybeCleanupSubscription(sub);
	}

	/**
	 * Cleanup subscription if no more refs
	 */
	private maybeCleanupSubscription(sub: SubscriptionState): void {
		if (sub.fullRefs === 0 && sub.fieldRefs.size === 0 && sub.callbacks.size === 0) {
			// Unsubscribe from transport
			if (sub.transportSub) {
				sub.transportSub.unsubscribe();
			}

			// Remove from map
			const key = makeQueryKey(sub.operation, sub.input);
			this.subscriptions.delete(key);
		}
	}

	/**
	 * Ensure transport subscription exists
	 */
	private ensureTransportSubscription(sub: SubscriptionState, select?: SelectionObject): void {
		if (sub.transportSub) return;

		const fields = sub.fullRefs > 0 ? "*" : Array.from(sub.fields);

		sub.transportSub = this.transport.subscribe(
			sub.operation,
			sub.input,
			fields,
			{
				onData: (data) => {
					sub.data.value = data;
					sub.loading.value = false;
					sub.error.value = null;

					// Notify callbacks
					for (const callback of sub.callbacks) {
						callback(data);
					}
				},
				onUpdate: (updates) => {
					// Apply updates to current data
					const current = sub.data.value;
					if (current && typeof current === "object") {
						const updated = { ...(current as Record<string, unknown>) };
						for (const [field, update] of Object.entries(updates)) {
							updated[field] = applyUpdate(updated[field], update);
						}
						sub.data.value = updated;

						// Notify callbacks
						for (const callback of sub.callbacks) {
							callback(updated);
						}
					}
				},
				onError: (error) => {
					sub.error.value = error;
					sub.loading.value = false;
				},
				onComplete: () => {
					sub.loading.value = false;
				},
			},
			select,  // Pass SelectionObject for nested resolution
		);
	}

	// ===========================================================================
	// Query Execution
	// ===========================================================================

	/**
	 * Execute a query with optional field selection
	 */
	private executeQuery<T>(
		operation: string,
		input: unknown,
		select?: SelectionObject,
	): QueryResult<T> {
		const fields = select ? this.extractFieldsFromSelection(select) : undefined;
		const sub = this.getOrCreateSubscription(operation, input, fields);

		// Store selection for this query
		const currentSelect = select;

		// Create result object
		const result: QueryResult<T> = {
			get value() {
				return sub.data.value as T | null;
			},
			signal: sub.data as Signal<T | null>,
			loading: sub.loading,
			error: sub.error,

			subscribe: (callback?: (data: T) => void) => {
				// Subscribe to fields or full entity
				if (fields) {
					this.subscribeFields(sub, fields);
				} else {
					this.subscribeFullEntity(sub);
				}

				// Ensure transport subscription with SelectionObject
				this.ensureTransportSubscription(sub, currentSelect);

				// Add callback if provided
				if (callback) {
					const wrappedCallback = (data: unknown) => callback(data as T);
					sub.callbacks.add(wrappedCallback);

					// If data already available, call immediately
					if (sub.data.value !== null) {
						callback(sub.data.value as T);
					}

					// Return unsubscribe function
					return () => {
						sub.callbacks.delete(wrappedCallback);
						if (fields) {
							this.unsubscribeFields(sub, fields);
						} else {
							this.unsubscribeFullEntity(sub);
						}
					};
				}

				// Return unsubscribe without callback
				return () => {
					if (fields) {
						this.unsubscribeFields(sub, fields);
					} else {
						this.unsubscribeFullEntity(sub);
					}
				};
			},

			select: <S extends SelectionObject>(selection: S) => {
				// Pass full SelectionObject, not just field names
				return this.executeQuery<T>(operation, input, selection);
			},

			then: async <TResult1 = T, TResult2 = never>(
				onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
			): Promise<TResult1 | TResult2> => {
				try {
					// Check if we can derive from existing
					if (this.canDerive(operation, input, fields)) {
						const existingSub = this.subscriptions.get(makeQueryKey(operation, input))!;
						if (existingSub.data.value !== null) {
							const data = fields
								? this.applyFieldSelection(existingSub.data.value, fields)
								: existingSub.data.value;
							return onfulfilled ? onfulfilled(data as T) : (data as unknown as TResult1);
						}
					}

					// Fetch from server with full SelectionObject
					const data = await this.fetchQuery(operation, input, fields, currentSelect);

					// Update subscription data
					if (!fields) {
						sub.data.value = data;
					}

					return onfulfilled ? onfulfilled(data as T) : (data as unknown as TResult1);
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

	/**
	 * Fetch query from server (with deduplication via shared utility)
	 */
	private async fetchQuery(
		operation: string,
		input: unknown,
		fields?: string[],
		select?: SelectionObject,
	): Promise<unknown> {
		const key = makeQueryKeyWithFields(operation, input, fields);

		// Use shared RequestDeduplicator
		return this.requestDedup.dedupe(key, async () => {
			// Create operation context for link chain
			const ctx: UnifiedOperationContext = {
				id: `query-${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				type: "query",
				operation,
				input,
				select,
				meta: {},
			};

			// Execute through link chain
			return this.executeWithLinks(ctx);
		});
	}

	/**
	 * Extract field names from selection object
	 */
	private extractFieldsFromSelection(selection: SelectionObject): string[] {
		const fields: string[] = [];

		for (const [key, value] of Object.entries(selection)) {
			if (value === true) {
				fields.push(key);
			} else if (typeof value === "object" && value !== null) {
				// Nested selection - just include the field name
				fields.push(key);
			}
		}

		return fields;
	}

	/**
	 * Apply field selection to data
	 */
	private applyFieldSelection(data: unknown, fields: string[]): unknown {
		if (!data || typeof data !== "object") return data;

		const result: Record<string, unknown> = {};
		const obj = data as Record<string, unknown>;

		// Always include id
		if ("id" in obj) {
			result.id = obj.id;
		}

		for (const field of fields) {
			if (field in obj) {
				result[field] = obj[field];
			}
		}

		return result;
	}

	// ===========================================================================
	// Mutation Execution
	// ===========================================================================

	/**
	 * Execute a mutation
	 */
	private async executeMutation<TInput, TOutput>(
		operation: string,
		input: TInput,
	): Promise<MutationResult<TOutput>> {
		// Create operation context for link chain
		const ctx: UnifiedOperationContext = {
			id: `mutation-${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			type: "mutation",
			operation,
			input,
			meta: {},
		};

		// Execute through link chain
		const result = await this.executeWithLinks(ctx);

		// Update any affected subscriptions
		this.updateSubscriptionsFromMutation(result);

		return {
			data: result as TOutput,
		};
	}

	/**
	 * Update subscriptions when mutation returns data
	 */
	private updateSubscriptionsFromMutation(data: unknown): void {
		// This is a simplified version - in production, you'd want
		// the server to tell you which entities were affected
		if (!data || typeof data !== "object") return;

		// For now, we rely on the server pushing updates via subscriptions
	}

	// ===========================================================================
	// Optimistic Updates
	// ===========================================================================

	/**
	 * Apply optimistic update to a subscription
	 */
	applyOptimistic(config: OptimisticConfig): string {
		const key = makeQueryKey(config.operation, config.input);
		const sub = this.subscriptions.get(key);

		// Generate optimistic ID
		const optId = `opt_${++this.optimisticCounter}`;

		// Store previous data for rollback
		const previousData = sub?.data.value ?? null;
		this.optimisticUpdates.set(optId, {
			id: optId,
			operation: config.operation,
			input: config.input,
			previousData,
		});

		// Apply optimistic data
		if (sub) {
			const merged = previousData && typeof previousData === "object"
				? { ...previousData, ...config.data }
				: config.data;
			sub.data.value = merged;

			// Notify callbacks
			for (const callback of sub.callbacks) {
				callback(merged);
			}
		}

		return optId;
	}

	/**
	 * Confirm optimistic update with server data
	 */
	confirmOptimistic(optId: string, serverData?: unknown): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Update with authoritative server data if provided
		if (serverData !== undefined) {
			const key = makeQueryKey(entry.operation, entry.input);
			const sub = this.subscriptions.get(key);
			if (sub) {
				sub.data.value = serverData;

				// Notify callbacks
				for (const callback of sub.callbacks) {
					callback(serverData);
				}
			}
		}

		this.optimisticUpdates.delete(optId);
	}

	/**
	 * Rollback optimistic update
	 */
	rollbackOptimistic(optId: string): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Restore previous data
		const key = makeQueryKey(entry.operation, entry.input);
		const sub = this.subscriptions.get(key);
		if (sub && entry.previousData !== null) {
			sub.data.value = entry.previousData;

			// Notify callbacks
			for (const callback of sub.callbacks) {
				callback(entry.previousData);
			}
		}

		this.optimisticUpdates.delete(optId);
	}

	/**
	 * Execute mutation with optimistic update
	 */
	async executeMutationOptimistic<TInput, TOutput>(
		operation: string,
		input: TInput,
		optimistic?: OptimisticConfig,
	): Promise<MutationResult<TOutput>> {
		// Apply optimistic update if provided
		let optId: string | undefined;
		if (optimistic) {
			optId = this.applyOptimistic(optimistic);
		}

		try {
			// Execute mutation
			const result = await this.executeMutation<TInput, TOutput>(operation, input);

			// Confirm optimistic update with server data
			if (optId) {
				this.confirmOptimistic(optId, result.data);
			}

			return {
				data: result.data,
				rollback: optId ? () => this.rollbackOptimistic(optId!) : undefined,
			};
		} catch (error) {
			// Rollback on failure
			if (optId) {
				this.rollbackOptimistic(optId);
			}
			throw error;
		}
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Create query accessor
	 */
	createQueryAccessor<K extends keyof Q>(name: K): QueryAccessorFn<Q[K]> {
		return ((input?: InferInput<Q[K]>) => {
			return this.executeQuery<InferOutput<Q[K]>>(name as string, input);
		}) as QueryAccessorFn<Q[K]>;
	}

	/**
	 * Create mutation accessor
	 */
	createMutationAccessor<K extends keyof M>(name: K): MutationAccessorFn<M[K]> {
		return (async (input: InferInput<M[K]>) => {
			return this.executeMutation<InferInput<M[K]>, InferOutput<M[K]>>(name as string, input);
		}) as MutationAccessorFn<M[K]>;
	}

	/**
	 * Get underlying store
	 */
	get $store(): ReactiveStore {
		return this.store;
	}

	/**
	 * Get query names
	 */
	$queryNames(): string[] {
		return Object.keys(this.queries);
	}

	/**
	 * Get mutation names
	 */
	$mutationNames(): string[] {
		return Object.keys(this.mutations);
	}
}

// =============================================================================
// Accessor Types
// =============================================================================

type QueryAccessorFn<T> = T extends QueryDef<infer I, infer O, unknown>
	? I extends void
		? () => QueryResult<O>
		: (input: I) => QueryResult<O>
	: never;

type MutationAccessorFn<T> = T extends MutationDef<infer I, infer O, unknown>
	? (input: I) => Promise<MutationResult<O>>
	: never;

// =============================================================================
// Client Type
// =============================================================================

/** Unified client type with flat namespace */
export type UnifiedClient<Q extends QueriesMap, M extends MutationsMap> = {
	[K in keyof Q]: QueryAccessorFn<Q[K]>;
} & {
	[K in keyof M]: MutationAccessorFn<M[K]>;
} & {
	$store: ReactiveStore;
	$queryNames(): string[];
	$mutationNames(): string[];
};

// =============================================================================
// Factory
// =============================================================================

/**
 * Create unified client with flat namespace
 */
export function createUnifiedClient<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(config: UnifiedClientConfig<Q, M>): UnifiedClient<Q, M> {
	const impl = new UnifiedClientImpl(config);

	// Create proxy with flat namespace
	const client = new Proxy({} as UnifiedClient<Q, M>, {
		get(target, prop) {
			const key = prop as string;

			// Built-in properties
			if (key === "$store") return impl.$store;
			if (key === "$queryNames") return () => impl.$queryNames();
			if (key === "$mutationNames") return () => impl.$mutationNames();

			// Check if it's a query
			if (config.queries && key in config.queries) {
				return impl.createQueryAccessor(key as keyof Q);
			}

			// Check if it's a mutation
			if (config.mutations && key in config.mutations) {
				return impl.createMutationAccessor(key as keyof M);
			}

			return undefined;
		},
	});

	return client;
}
