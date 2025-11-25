/**
 * @sylphx/client - QueryResolver
 *
 * Resolves queries by deriving from existing subscriptions or fetching new data.
 * Handles query deduplication, request batching, and caching.
 */

import type { SubscriptionManager } from "./subscription-manager";
import { EntitySignal, deriveEntitySignal } from "./entity-signal";
import { computed, type Signal } from "../signals/signal";

// =============================================================================
// Types
// =============================================================================

/** Query definition */
export interface QueryDef {
	/** Entity name */
	entityName: string;
	/** Entity ID (for single entity queries) */
	entityId?: string;
	/** Fields to select (undefined = all fields) */
	fields?: string[];
	/** Where clause (for list queries) */
	where?: Record<string, unknown>;
	/** Order by clause */
	orderBy?: Record<string, "asc" | "desc">;
	/** Take limit */
	take?: number;
	/** Skip offset */
	skip?: number;
}

/** Query result */
export interface QueryResult<T extends Record<string, unknown>> {
	/** The result signal */
	signal: EntitySignal<T>;
	/** Whether this was derived from existing data */
	derived: boolean;
	/** Query key for tracking */
	key: string;
}

/** List query result */
export interface ListQueryResult<T extends Record<string, unknown>> {
	/** The result signals (one per entity) */
	signals: EntitySignal<T>[];
	/** Combined list signal */
	list: Signal<T[]>;
	/** Whether any were derived */
	derived: boolean;
	/** Query key for tracking */
	key: string;
}

/** Pending request for batching */
interface PendingRequest {
	query: QueryDef;
	resolve: (data: unknown) => void;
	reject: (error: Error) => void;
}

/** Transport for fetching data */
export interface QueryTransport {
	/** Fetch a single entity */
	fetch(entityName: string, entityId: string, fields?: string[]): Promise<Record<string, unknown>>;
	/** Fetch a list of entities */
	fetchList(
		entityName: string,
		options?: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			fields?: string[];
		},
	): Promise<Record<string, unknown>[]>;
	/** Batch fetch multiple entities */
	batchFetch?(
		requests: Array<{ entityName: string; entityId: string; fields?: string[] }>,
	): Promise<Array<Record<string, unknown> | null>>;
}

// =============================================================================
// QueryResolver
// =============================================================================

/**
 * Resolves queries by deriving from existing data or fetching new data.
 *
 * Key responsibilities:
 * - Check if query can be derived from existing subscriptions
 * - Batch multiple queries into single request
 * - Create and track EntitySignals
 * - Handle query deduplication
 */
export class QueryResolver {
	/** Subscription manager */
	private subscriptionManager: SubscriptionManager;

	/** Transport for fetching */
	private transport: QueryTransport | null = null;

	/** Pending queries for batching */
	private pendingQueries: PendingRequest[] = [];

	/** Batch timer */
	private batchTimer: ReturnType<typeof setTimeout> | null = null;

	/** Batch delay in ms */
	private readonly batchDelay = 10;

	/** In-flight queries (for dedup) */
	private inFlight = new Map<string, Promise<unknown>>();

	/** Query refCount tracking */
	private queryRefs = new Map<string, number>();

	constructor(subscriptionManager: SubscriptionManager) {
		this.subscriptionManager = subscriptionManager;
	}

	// ===========================================================================
	// Setup
	// ===========================================================================

	/**
	 * Set the transport for data fetching
	 */
	setTransport(transport: QueryTransport): void {
		this.transport = transport;
	}

	// ===========================================================================
	// Single Entity Queries
	// ===========================================================================

	/**
	 * Resolve a single entity query
	 */
	async resolveEntity<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
		fields?: string[],
	): Promise<QueryResult<T>> {
		const key = this.makeEntityKey(entityName, entityId, fields);

		// Check if we can derive from existing subscription
		const canDerive = fields
			? this.subscriptionManager.canDerive(entityName, entityId, fields)
			: false;

		if (canDerive && fields) {
			// Derive from existing
			const sourceSignal = this.subscriptionManager.getSignal<T>(entityName, entityId);
			if (sourceSignal) {
				const derived = deriveEntitySignal(sourceSignal, fields as (keyof T)[]);
				return { signal: derived, derived: true, key };
			}
		}

		// Check for existing full subscription
		const existingSignal = this.subscriptionManager.getSignal<T>(entityName, entityId);
		if (existingSignal && !fields) {
			// Already have full entity
			this.subscriptionManager.subscribeFullEntity(entityName, entityId);
			return { signal: existingSignal, derived: false, key };
		}

		// Need to fetch
		const data = await this.fetchEntity<T>(entityName, entityId, fields);

		// Create subscription
		const subscription = this.subscriptionManager.getOrCreateSubscription<T>(
			entityName,
			entityId,
			data,
		);

		// Subscribe to requested fields
		if (fields) {
			for (const field of fields) {
				this.subscriptionManager.subscribeField(entityName, entityId, field);
			}
		} else {
			this.subscriptionManager.subscribeFullEntity(entityName, entityId);
		}

		return { signal: subscription.signal, derived: false, key };
	}

	/**
	 * Release a query reference
	 */
	releaseQuery(key: string): void {
		const refs = this.queryRefs.get(key) ?? 0;
		if (refs <= 1) {
			this.queryRefs.delete(key);
			// Parse key and unsubscribe
			const parsed = this.parseEntityKey(key);
			if (parsed) {
				const { entityName, entityId, fields } = parsed;
				if (fields) {
					for (const field of fields) {
						this.subscriptionManager.unsubscribeField(entityName, entityId, field);
					}
				} else {
					this.subscriptionManager.unsubscribeFullEntity(entityName, entityId);
				}
			}
		} else {
			this.queryRefs.set(key, refs - 1);
		}
	}

	// ===========================================================================
	// List Queries
	// ===========================================================================

	/**
	 * Resolve a list query
	 */
	async resolveList<T extends Record<string, unknown>>(
		entityName: string,
		options?: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			fields?: string[];
		},
	): Promise<ListQueryResult<T>> {
		const key = this.makeListKey(entityName, options);

		// Fetch list data
		const items = await this.fetchList<T>(entityName, options);

		// Create EntitySignals for each item
		const signals: EntitySignal<T>[] = [];
		for (const item of items) {
			const id = (item as { id?: string }).id;
			if (!id) continue;

			const subscription = this.subscriptionManager.getOrCreateSubscription<T>(
				entityName,
				id,
				item,
			);

			// Subscribe to fields
			if (options?.fields) {
				for (const field of options.fields) {
					this.subscriptionManager.subscribeField(entityName, id, field);
				}
			} else {
				this.subscriptionManager.subscribeFullEntity(entityName, id);
			}

			signals.push(subscription.signal);
		}

		// Create combined list signal
		const list = computed(() => signals.map((s) => s.value.value));

		return { signals, list, derived: false, key };
	}

	// ===========================================================================
	// Data Fetching
	// ===========================================================================

	/**
	 * Fetch a single entity (with dedup)
	 */
	private async fetchEntity<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
		fields?: string[],
	): Promise<T> {
		if (!this.transport) {
			throw new Error("QueryResolver: No transport configured");
		}

		const key = this.makeEntityKey(entityName, entityId, fields);

		// Check for in-flight request
		const inFlight = this.inFlight.get(key);
		if (inFlight) {
			return inFlight as Promise<T>;
		}

		// Create request
		const request = this.transport.fetch(entityName, entityId, fields);
		this.inFlight.set(key, request);

		try {
			const data = await request;
			return data as T;
		} finally {
			this.inFlight.delete(key);
		}
	}

	/**
	 * Fetch a list of entities
	 */
	private async fetchList<T extends Record<string, unknown>>(
		entityName: string,
		options?: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			fields?: string[];
		},
	): Promise<T[]> {
		if (!this.transport) {
			throw new Error("QueryResolver: No transport configured");
		}

		const key = this.makeListKey(entityName, options);

		// Check for in-flight request
		const inFlight = this.inFlight.get(key);
		if (inFlight) {
			return inFlight as Promise<T[]>;
		}

		// Create request
		const request = this.transport.fetchList(entityName, options);
		this.inFlight.set(key, request);

		try {
			const data = await request;
			return data as T[];
		} finally {
			this.inFlight.delete(key);
		}
	}

	// ===========================================================================
	// Batch Fetching (for N+1 prevention)
	// ===========================================================================

	/**
	 * Queue a fetch for batching
	 */
	queueFetch<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
		fields?: string[],
	): Promise<T> {
		return new Promise((resolve, reject) => {
			this.pendingQueries.push({
				query: { entityName, entityId, fields },
				resolve: resolve as (data: unknown) => void,
				reject,
			});

			this.scheduleBatch();
		});
	}

	/**
	 * Schedule batch processing
	 */
	private scheduleBatch(): void {
		if (this.batchTimer) return;

		this.batchTimer = setTimeout(() => {
			this.processBatch();
			this.batchTimer = null;
		}, this.batchDelay);
	}

	/**
	 * Process batched queries
	 */
	private async processBatch(): Promise<void> {
		if (!this.transport?.batchFetch) {
			// No batch support, fetch individually
			for (const pending of this.pendingQueries) {
				const { query, resolve, reject } = pending;
				try {
					const data = await this.fetchEntity(
						query.entityName,
						query.entityId!,
						query.fields,
					);
					resolve(data);
				} catch (err) {
					reject(err instanceof Error ? err : new Error(String(err)));
				}
			}
			this.pendingQueries = [];
			return;
		}

		// Group by entity type for batching
		const pending = [...this.pendingQueries];
		this.pendingQueries = [];

		const requests = pending.map((p) => ({
			entityName: p.query.entityName,
			entityId: p.query.entityId!,
			fields: p.query.fields,
		}));

		try {
			const results = await this.transport.batchFetch(requests);

			for (let i = 0; i < pending.length; i++) {
				const result = results[i];
				if (result) {
					pending[i].resolve(result);
				} else {
					pending[i].reject(new Error(`Entity not found: ${requests[i].entityId}`));
				}
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			for (const p of pending) {
				p.reject(error);
			}
		}
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Create a unique key for an entity query
	 */
	private makeEntityKey(entityName: string, entityId: string, fields?: string[]): string {
		const fieldKey = fields ? fields.sort().join(",") : "*";
		return `${entityName}:${entityId}:${fieldKey}`;
	}

	/**
	 * Parse an entity key
	 */
	private parseEntityKey(
		key: string,
	): { entityName: string; entityId: string; fields?: string[] } | null {
		const parts = key.split(":");
		if (parts.length < 3) return null;

		const [entityName, entityId, fieldKey] = parts;
		const fields = fieldKey === "*" ? undefined : fieldKey.split(",");

		return { entityName, entityId, fields };
	}

	/**
	 * Create a unique key for a list query
	 */
	private makeListKey(
		entityName: string,
		options?: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			fields?: string[];
		},
	): string {
		return `list:${entityName}:${JSON.stringify(options ?? {})}`;
	}

	/**
	 * Get resolver statistics
	 */
	getStats(): {
		inFlightQueries: number;
		pendingBatch: number;
		trackedQueries: number;
	} {
		return {
			inFlightQueries: this.inFlight.size,
			pendingBatch: this.pendingQueries.length,
			trackedQueries: this.queryRefs.size,
		};
	}

	/**
	 * Clear all state
	 */
	clear(): void {
		this.inFlight.clear();
		this.pendingQueries = [];
		this.queryRefs.clear();

		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a QueryResolver
 */
export function createQueryResolver(subscriptionManager: SubscriptionManager): QueryResolver {
	return new QueryResolver(subscriptionManager);
}
