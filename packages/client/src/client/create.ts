/**
 * @lens/client - Lens Client
 *
 * Primary client for Lens API framework:
 * - Flat namespace (client.whoami() instead of client.query.whoami())
 * - Query deduplication via canDerive
 * - Field-level subscriptions with refCount
 * - EntitySignal for fine-grained reactivity
 * - Request batching
 */

import type { QueryDef, MutationDef, Update, OptimisticDSL } from "@lens/core";
import { applyUpdate, isOptimisticDSL, normalizeOptimisticDSL } from "@lens/core";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import { signal, computed, type Signal } from "../signals/signal";
import {
	makeQueryKey,
	makeQueryKeyWithFields,
	RequestDeduplicator,
} from "../shared";
import type {
	Link,
	LinkFn,
	OperationContext as LinkOperationContext,
	OperationResult,
	NextLink,
} from "../links/types";

// =============================================================================
// Types
// =============================================================================

/** Query map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown, unknown>>;

/** Mutation map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown, unknown>>;

/** Transport interface */
export interface Transport {
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

/** Operation context */
export interface OperationContext {
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
export interface LensClientConfig<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/**
	 * Query definitions (optional if using type inference)
	 * @deprecated Use type parameter instead: createClient<Api>({ links: [...] })
	 */
	queries?: Q;
	/**
	 * Mutation definitions (optional if using type inference)
	 * @deprecated Use type parameter instead: createClient<Api>({ links: [...] })
	 */
	mutations?: M;
	/**
	 * Transport (direct transport)
	 * @deprecated Use links instead: links: [loggerLink(), websocketLink({ url })]
	 */
	transport?: Transport;
	/**
	 * Links chain (last one should be terminal link like websocketLink or httpLink)
	 *
	 * @example
	 * ```typescript
	 * const client = createClient<Api>({
	 *   links: [
	 *     loggerLink(),
	 *     retryLink({ maxRetries: 3 }),
	 *     websocketLink({ url: 'ws://localhost:3000' }),  // Terminal link
	 *   ],
	 * });
	 * ```
	 */
	links?: Link[];
	/** Enable optimistic updates */
	optimistic?: boolean;
}

/**
 * API type for client inference (from server)
 *
 * @example
 * ```typescript
 * import type { Api } from './server';  // TYPE-only import
 * const client = createClient<Api>({ links: [...] });
 * ```
 */
export interface ApiShape<Q extends QueriesMap = QueriesMap, M extends MutationsMap = MutationsMap> {
	queries: Q;
	mutations: M;
}

/**
 * Infer API type from server
 * Use: type Api = typeof server._types
 */
export type InferApiFromServer<T> = T extends { _types: infer Shape } ? Shape : never;

/** Selection object */
export type SelectionObject = Record<string, boolean | SelectionObject | { select: SelectionObject }>;

/**
 * Infer selected type from selection object
 *
 * @example
 * ```typescript
 * type User = { id: string, name: string, email: string };
 * type Selected = SelectedType<User, { id: true, name: true }>;
 * // Selected = { id: string, name: string }
 * ```
 */
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
	/**
	 * Select specific fields (with type inference)
	 *
	 * @example
	 * ```typescript
	 * const user = await api.getUser({ id }).select({ name: true });
	 * // user is { name: string }
	 * ```
	 */
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
	/** Rollback optimistic update (if applied) */
	rollback?: () => void;
}

/** Pending optimistic entry (internal) */
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
// Client Implementation
// =============================================================================

class ClientImpl<Q extends QueriesMap, M extends MutationsMap> {
	private queries: Q;
	private mutations: M;
	/** @deprecated Use linkExecutor instead */
	private transport: Transport | null = null;
	/** Compiled link chain for executing operations */
	private linkExecutor: NextLink | null = null;
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

	constructor(config: LensClientConfig<Q, M>) {
		this.queries = config.queries ?? ({} as Q);
		this.mutations = config.mutations ?? ({} as M);
		this.optimistic = config.optimistic ?? true;
		this.store = new ReactiveStore();

		// Handle links or transport config
		if (config.links && config.links.length > 0) {
			// New Link-based system: all items are Links, last one is terminal
			// Build link chain from Link factories
			const linkFns = config.links.map((link) => link());

			// Compose links: first links call next, last link is terminal
			// Terminal link should NOT call next (it handles the operation)
			this.linkExecutor = this.composeLinks(linkFns);
		} else if (config.transport) {
			// Legacy Transport-based system (backwards compatible)
			this.transport = config.transport;
		} else {
			throw new Error("Must provide either 'transport' or 'links' config");
		}
	}

	/**
	 * Compose link functions into a single executor.
	 * Last link is assumed to be terminal (doesn't call next).
	 */
	private composeLinks(links: LinkFn[]): NextLink {
		if (links.length === 0) {
			throw new Error("At least one link (terminal) is required");
		}

		// Build chain from right to left
		// The last link is terminal - we wrap it to not need a next
		const terminalIndex = links.length - 1;
		const terminalLink = links[terminalIndex];

		// Terminal link gets a dummy next that throws if called
		let chain: NextLink = (op) =>
			terminalLink(op, () => {
				throw new Error("Terminal link should not call next()");
			});

		// Add remaining links from right to left (excluding terminal)
		for (let i = terminalIndex - 1; i >= 0; i--) {
			const link = links[i];
			const next = chain;
			chain = (op) => link(op, next);
		}

		return chain;
	}

	/**
	 * Execute operation through link chain or transport
	 */
	private async executeOperation(ctx: OperationContext): Promise<unknown> {
		// New link-based execution
		if (this.linkExecutor) {
			// Convert internal OperationContext to Link's OperationContext
			const linkOp: LinkOperationContext = {
				id: ctx.id,
				type: ctx.type,
				entity: "_Query", // Operations are treated as custom queries/mutations
				op: ctx.operation,
				input: ctx.input,
				meta: ctx.meta,
				signal: ctx.signal,
			};

			const result = await this.linkExecutor(linkOp);

			if (result.error) {
				throw result.error;
			}

			return result.data;
		}

		// Legacy transport-based execution
		if (this.transport) {
			if (ctx.type === "query") {
				return this.transport.query(ctx.operation, ctx.input, "*", ctx.select);
			} else if (ctx.type === "mutation") {
				return this.transport.mutate(ctx.operation, ctx.input);
			}
			throw new Error(`Unsupported operation type: ${ctx.type}`);
		}

		throw new Error("No executor configured");
	}

	/** @deprecated Use executeOperation instead */
	private async executeWithLinks(ctx: OperationContext): Promise<unknown> {
		return this.executeOperation(ctx);
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
	 * Ensure subscription exists (transport-based or link-based)
	 */
	private ensureTransportSubscription(sub: SubscriptionState, select?: SelectionObject): void {
		if (sub.transportSub) return;

		const fields = sub.fullRefs > 0 ? "*" : Array.from(sub.fields);

		// Use link-based subscriptions if available
		if (this.linkExecutor) {
			this.setupLinkSubscription(sub, select);
			return;
		}

		// Legacy transport-based subscription
		if (!this.transport) {
			throw new Error("No transport or link executor configured");
		}

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

	/**
	 * Setup link-based subscription using Observable
	 * Terminal links return Observable in meta for subscriptions
	 */
	private setupLinkSubscription(sub: SubscriptionState, select?: SelectionObject): void {
		if (!this.linkExecutor) return;

		const linkOp: LinkOperationContext = {
			id: `sub-${sub.operation}-${Date.now()}`,
			type: "subscription",
			entity: "_Query",
			op: sub.operation,
			input: sub.input,
			meta: { select },
		};

		// Execute subscription operation
		Promise.resolve(this.linkExecutor(linkOp)).then((result: OperationResult) => {
			if (result.error) {
				sub.error.value = result.error;
				sub.loading.value = false;
				return;
			}

			// Check for Observable in meta (set by terminal links like httpLink with polling)
			const observable = result.meta?.observable as
				| { subscribe: (obs: { next: (v: unknown) => void; error: (e: Error) => void; complete: () => void }) => { unsubscribe: () => void } }
				| undefined;

			if (observable) {
				// Subscribe to Observable
				const subscription = observable.subscribe({
					next: (data) => {
						sub.data.value = data;
						sub.loading.value = false;
						sub.error.value = null;
						for (const callback of sub.callbacks) {
							callback(data);
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

				sub.transportSub = {
					unsubscribe: () => subscription.unsubscribe(),
					updateFields: () => {
						// Link-based subscriptions don't support dynamic field updates
						// Re-subscribe with new fields would be needed
					},
				};
			} else {
				// No observable - just use the initial data (one-shot subscription)
				sub.data.value = result.data;
				sub.loading.value = false;

				sub.transportSub = {
					unsubscribe: () => {},
					updateFields: () => {},
				};
			}
		});
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
			const ctx: OperationContext = {
				id: `query-${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				type: "query",
				operation,
				input,
				select,
				meta: {},
			};

			// Execute through link chain
			return this.executeOperation(ctx);
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
	 * Automatically applies optimistic update:
	 * - DSL: Declarative spec interpreted at runtime (recommended for type-only imports)
	 * - Function: Legacy callback (requires runtime import)
	 * - Auto: If no optimistic specified, derive from input
	 */
	private async executeMutation<TInput, TOutput>(
		operation: string,
		input: TInput,
	): Promise<MutationResult<TOutput>> {
		// Get mutation definition for optimistic support
		const mutationDef = this.mutations[operation as keyof M] as MutationDef<TInput, TOutput> | undefined;

		// Apply optimistic update (automatic by default)
		let optId: string | undefined;
		if (this.optimistic) {
			let optimisticData: unknown;

			const optimisticSpec = mutationDef?._optimistic;

			if (optimisticSpec) {
				if (isOptimisticDSL(optimisticSpec)) {
					// DSL: Interpret declarative spec (works with type-only imports)
					optimisticData = this.interpretOptimisticDSL(optimisticSpec, input);
				} else if (typeof optimisticSpec === "function") {
					// Function: Legacy callback (requires runtime import)
					optimisticData = optimisticSpec({ input });
				}
			} else {
				// AUTO: if input has 'id', use input as optimistic data
				// This merges input fields into the entity with matching id
				optimisticData = this.autoOptimisticFromInput(input);
			}

			if (optimisticData) {
				optId = this.applyOptimisticFromMutation(operation, input, optimisticData);
			}
		}

		try {
			// Create operation context for link chain
			const ctx: OperationContext = {
				id: `mutation-${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				type: "mutation",
				operation,
				input,
				meta: {},
			};

			// Execute through link chain
			const result = await this.executeOperation(ctx);

			// Update any affected subscriptions
			this.updateSubscriptionsFromMutation(result);

			// Confirm optimistic update with server data
			if (optId) {
				this.confirmOptimistic(optId, result);
			}

			return {
				data: result as TOutput,
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
	// Optimistic Updates (automatic via mutation._optimistic)
	// ===========================================================================

	/**
	 * Apply optimistic update from mutation to affected subscriptions
	 * Handles: single entity, array of entities, multi-type returns
	 */
	private applyOptimisticFromMutation(
		_operation: string,
		_input: unknown,
		optimisticData: unknown,
	): string {
		const optId = `opt_${++this.optimisticCounter}`;

		// Track all affected subscriptions for rollback
		const affectedSubs: Array<{ key: string; previousData: unknown }> = [];

		// Extract all entities from optimistic data (handles nested structures)
		const entities = this.extractEntities(optimisticData);

		// Apply each entity to matching subscriptions
		for (const entity of entities) {
			const entityId = this.extractId(entity);
			if (!entityId) continue;

			for (const [key, sub] of this.subscriptions) {
				const currentData = sub.data.value;

				// Check if subscription data matches this entity
				if (this.matchesEntity(currentData, entityId)) {
					// Only record once per subscription
					if (!affectedSubs.some((s) => s.key === key)) {
						affectedSubs.push({ key, previousData: currentData });
					}

					// Merge optimistic data into current data
					const merged =
						currentData && typeof currentData === "object"
							? { ...currentData, ...(entity as object) }
							: entity;
					sub.data.value = merged;

					// Notify callbacks
					for (const callback of sub.callbacks) {
						callback(merged);
					}
				}
			}
		}

		// Store for rollback
		this.optimisticUpdates.set(optId, {
			id: optId,
			operation: _operation,
			input: _input,
			previousData: affectedSubs,
		});

		return optId;
	}

	/**
	 * Extract all entities from optimistic data
	 * Handles: { id } | [{ id }] | { users: [{ id }], posts: [{ id }] }
	 */
	private extractEntities(data: unknown): unknown[] {
		if (!data || typeof data !== "object") return [];

		// Single entity with ID
		if (this.extractId(data)) {
			return [data];
		}

		// Array of entities
		if (Array.isArray(data)) {
			return data.filter((item) => this.extractId(item));
		}

		// Multi-type return: { users: [...], posts: [...] }
		const entities: unknown[] = [];
		for (const value of Object.values(data as Record<string, unknown>)) {
			if (Array.isArray(value)) {
				entities.push(...value.filter((item) => this.extractId(item)));
			} else if (this.extractId(value)) {
				entities.push(value);
			}
		}
		return entities;
	}

	/**
	 * Check if subscription data matches entity ID
	 */
	private matchesEntity(data: unknown, entityId: string): boolean {
		const dataId = this.extractId(data);
		return dataId === entityId;
	}

	/**
	 * Extract ID from entity data
	 */
	private extractId(data: unknown): string | undefined {
		if (!data || typeof data !== "object") return undefined;
		const obj = data as Record<string, unknown>;
		if ("id" in obj && typeof obj.id === "string") return obj.id;
		return undefined;
	}

	/**
	 * Auto-derive optimistic data from mutation input
	 *
	 * UPDATE (input has id):
	 *   → Use input as optimistic data, merge into matching entity
	 *
	 * CREATE (input has no id):
	 *   → Auto-generate tempId, use as new entity
	 *
	 * @example
	 * // Update: { id: "1", name: "New" } → merge into User:1
	 * // Create: { title: "Hello" } → { id: "temp_0", title: "Hello" }
	 */
	private autoOptimisticFromInput(input: unknown): unknown {
		if (!input || typeof input !== "object") return null;

		const obj = input as Record<string, unknown>;

		// UPDATE: input has 'id' → merge into existing entity
		if ("id" in obj && typeof obj.id === "string") {
			return input;
		}

		// CREATE: input has no 'id' → auto-generate tempId
		// This creates a new optimistic entity
		return {
			id: `temp_${++this.optimisticCounter}`,
			...obj,
		};
	}

	/**
	 * Interpret OptimisticDSL to compute optimistic data
	 *
	 * This allows declarative optimistic updates that work with type-only imports.
	 * The DSL is pure data, interpreted at runtime on the client.
	 *
	 * @example
	 * // 'merge' + input { id: "1", name: "New" }
	 * // → { id: "1", name: "New" }
	 *
	 * // 'create' + input { title: "Hello" }
	 * // → { id: "temp_0", title: "Hello" }
	 *
	 * // { merge: { published: true } } + input { id: "1" }
	 * // → { id: "1", published: true }
	 *
	 * // { updateMany: { entity: 'User', ids: '$userIds', set: { role: '$newRole' } } }
	 * // + input { userIds: ["1", "2"], newRole: "admin" }
	 * // → [{ id: "1", role: "admin" }, { id: "2", role: "admin" }]
	 */
	private interpretOptimisticDSL(dsl: OptimisticDSL, input: unknown): unknown {
		const inputObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
		const normalized = normalizeOptimisticDSL(dsl);

		switch (normalized.type) {
			case "merge": {
				// Merge input into entity (UPDATE)
				// Requires input to have 'id'
				const id = inputObj.id;
				if (typeof id !== "string") return null;

				const result: Record<string, unknown> = { ...inputObj };

				// Apply additional 'set' fields (with $ reference resolution)
				if (normalized.set) {
					for (const [key, value] of Object.entries(normalized.set)) {
						result[key] = this.resolveReference(value, inputObj);
					}
				}

				return result;
			}

			case "create": {
				// Create new entity with tempId
				const result: Record<string, unknown> = {
					id: `temp_${++this.optimisticCounter}`,
					...inputObj,
				};

				// Apply additional 'set' fields
				if (normalized.set) {
					for (const [key, value] of Object.entries(normalized.set)) {
						result[key] = this.resolveReference(value, inputObj);
					}
				}

				return result;
			}

			case "delete": {
				// Delete entity - mark as deleted
				const id = inputObj.id;
				if (typeof id !== "string") return null;
				return { id, _deleted: true };
			}

			case "updateMany": {
				// Update multiple entities (cross-entity)
				if (!normalized.config) return null;

				const ids = this.resolveReference(normalized.config.ids, inputObj);
				if (!Array.isArray(ids)) return null;

				// Resolve set fields
				const setData: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(normalized.config.set)) {
					setData[key] = this.resolveReference(value, inputObj);
				}

				// Create optimistic entity for each ID
				return ids.map((id: unknown) => ({
					id,
					...setData,
				}));
			}

			case "custom": {
				// Custom function (escape hatch)
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
	 *
	 * @example
	 * resolveReference('$newRole', { newRole: 'admin' }) → 'admin'
	 * resolveReference('literal', {}) → 'literal'
	 * resolveReference(true, {}) → true
	 */
	private resolveReference(value: unknown, input: Record<string, unknown>): unknown {
		// String starting with $ is a reference to input field
		if (typeof value === "string" && value.startsWith("$")) {
			const fieldName = value.slice(1);
			return input[fieldName];
		}
		// Otherwise, return literal value
		return value;
	}

	/**
	 * Confirm optimistic update with server data
	 * Handles multi-entity server responses
	 */
	private confirmOptimistic(optId: string, serverData?: unknown): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Update affected subscriptions with authoritative server data
		if (serverData !== undefined) {
			const entities = this.extractEntities(serverData);
			for (const entity of entities) {
				const entityId = this.extractId(entity);
				if (!entityId) continue;

				for (const [_key, sub] of this.subscriptions) {
					if (this.matchesEntity(sub.data.value, entityId)) {
						sub.data.value = entity;
						for (const callback of sub.callbacks) {
							callback(entity);
						}
					}
				}
			}
		}

		this.optimisticUpdates.delete(optId);
	}

	/**
	 * Rollback optimistic update
	 */
	private rollbackOptimistic(optId: string): void {
		const entry = this.optimisticUpdates.get(optId);
		if (!entry) return;

		// Restore previous data for all affected subscriptions
		const affectedSubs = entry.previousData as Array<{ key: string; previousData: unknown }>;
		if (Array.isArray(affectedSubs)) {
			for (const { key, previousData } of affectedSubs) {
				const sub = this.subscriptions.get(key);
				if (sub && previousData !== null) {
					sub.data.value = previousData;
					for (const callback of sub.callbacks) {
						callback(previousData);
					}
				}
			}
		}

		this.optimisticUpdates.delete(optId);
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
	 * Create dynamic accessor (for type-only mode)
	 * Returns a callable that works as both query and mutation
	 */
	createDynamicAccessor(name: string): unknown {
		// Return a function that:
		// - Has QueryResult-like interface for subscriptions
		// - Is callable for one-time execution
		// The transport determines if it's a query or mutation
		const accessor = (input?: unknown) => {
			return this.executeQuery(name, input);
		};

		// Add subscribe method for real-time
		(accessor as Record<string, unknown>).subscribe = (callback?: (data: unknown) => void) => {
			return this.executeQuery(name, undefined).subscribe(callback);
		};

		return accessor;
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

/** Lens client type with flat namespace */
export type LensClient<Q extends QueriesMap, M extends MutationsMap> = {
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
 * Create Lens client with flat namespace
 *
 * Two usage patterns:
 *
 * 1. Type inference from server (recommended):
 * ```typescript
 * import type { Api } from './server';
 * const client = createClient<Api>({
 *   links: [loggerLink(), websocketLink({ url })],
 * });
 * ```
 *
 * 2. Direct definitions (deprecated):
 * ```typescript
 * const client = createClient({
 *   queries: { whoami, getUser },
 *   mutations: { updateUser },
 *   links: [...],
 * });
 * ```
 */
export function createClient<
	TApi extends ApiShape<QueriesMap, MutationsMap> = ApiShape<QueriesMap, MutationsMap>,
>(
	config: LensClientConfig<TApi["queries"], TApi["mutations"]>,
): LensClient<TApi["queries"], TApi["mutations"]> {
	type Q = TApi["queries"];
	type M = TApi["mutations"];

	const impl = new ClientImpl(config);

	// Track known operation names for runtime (if provided)
	const queryNames = new Set(Object.keys(config.queries ?? {}));
	const mutationNames = new Set(Object.keys(config.mutations ?? {}));
	const hasRuntimeInfo = queryNames.size > 0 || mutationNames.size > 0;

	// Create proxy with flat namespace
	const client = new Proxy({} as LensClient<Q, M>, {
		get(target, prop) {
			const key = prop as string;

			// Built-in properties
			if (key === "$store") return impl.$store;
			if (key === "$queryNames") return () => impl.$queryNames();
			if (key === "$mutationNames") return () => impl.$mutationNames();

			// Skip symbol properties and internals
			if (typeof prop === "symbol" || key.startsWith("_")) return undefined;

			// If we have runtime info, use it
			if (hasRuntimeInfo) {
				if (queryNames.has(key)) {
					return impl.createQueryAccessor(key as keyof Q);
				}
				if (mutationNames.has(key)) {
					return impl.createMutationAccessor(key as keyof M);
				}
				return undefined;
			}

			// Type-only mode: create accessor dynamically
			// Server will validate if operation exists
			// Type system prevents invalid calls at compile time
			return impl.createDynamicAccessor(key);
		},
	});

	return client;
}
