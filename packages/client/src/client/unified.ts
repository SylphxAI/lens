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

/** Client configuration */
export interface UnifiedClientConfig<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query definitions */
	queries?: Q;
	/** Mutation definitions */
	mutations?: M;
	/** Transport */
	transport: UnifiedTransport;
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
	rollback?: () => void;
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

// =============================================================================
// Query Key
// =============================================================================

function makeQueryKey(operation: string, input: unknown): string {
	const inputStr = input ? JSON.stringify(input) : "";
	return `${operation}:${inputStr}`;
}

function makeQueryKeyWithFields(operation: string, input: unknown, fields?: string[]): string {
	const base = makeQueryKey(operation, input);
	if (!fields) return base;
	return `${base}:${fields.sort().join(",")}`;
}

// =============================================================================
// Unified Client Implementation
// =============================================================================

class UnifiedClientImpl<Q extends QueriesMap, M extends MutationsMap> {
	private queries: Q;
	private mutations: M;
	private transport: UnifiedTransport;
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

	/** In-flight queries for deduplication */
	private inFlight = new Map<string, Promise<unknown>>();

	constructor(config: UnifiedClientConfig<Q, M>) {
		this.queries = config.queries ?? ({} as Q);
		this.mutations = config.mutations ?? ({} as M);
		this.transport = config.transport;
		this.optimistic = config.optimistic ?? true;
		this.store = new ReactiveStore();
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
	 * Fetch query from server (with deduplication)
	 */
	private async fetchQuery(
		operation: string,
		input: unknown,
		fields?: string[],
		select?: SelectionObject,
	): Promise<unknown> {
		const key = makeQueryKeyWithFields(operation, input, fields);

		// Check in-flight
		const inFlight = this.inFlight.get(key);
		if (inFlight) {
			return inFlight;
		}

		// Create promise - pass SelectionObject for nested resolution
		const promise = this.transport.query(operation, input, fields ?? "*", select);
		this.inFlight.set(key, promise);

		try {
			const result = await promise;
			return result;
		} finally {
			this.inFlight.delete(key);
		}
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
		const result = await this.transport.mutate(operation, input);

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
