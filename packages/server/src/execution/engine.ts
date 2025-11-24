/**
 * @lens/server - Execution Engine
 *
 * Executes resolvers with field selection and batching.
 */

import type { SchemaDefinition, InferEntity, Select } from "@lens/core";
import type { Resolvers, BaseContext, ListInput } from "../resolvers/types";

// =============================================================================
// DataLoader for N+1 Elimination
// =============================================================================

/**
 * Simple DataLoader implementation for batching
 */
export class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> =
		new Map();
	private scheduled = false;

	constructor(
		private batchFn: (keys: K[]) => Promise<(V | null)[]>,
		private options: { maxBatchSize?: number } = {},
	) {}

	async load(key: K): Promise<V | null> {
		return new Promise((resolve, reject) => {
			const existing = this.batch.get(key);
			if (existing) {
				existing.push({ resolve, reject });
			} else {
				this.batch.set(key, [{ resolve, reject }]);
			}

			this.scheduleDispatch();
		});
	}

	private scheduleDispatch(): void {
		if (this.scheduled) return;
		this.scheduled = true;

		// Schedule for next microtask
		queueMicrotask(() => this.dispatch());
	}

	private async dispatch(): Promise<void> {
		this.scheduled = false;
		const batch = this.batch;
		this.batch = new Map();

		const keys = Array.from(batch.keys());
		if (keys.length === 0) return;

		try {
			const results = await this.batchFn(keys);

			// Resolve each promise with corresponding result
			keys.forEach((key, index) => {
				const callbacks = batch.get(key)!;
				const result = results[index] ?? null;
				callbacks.forEach(({ resolve }) => resolve(result));
			});
		} catch (error) {
			// Reject all on error
			for (const callbacks of batch.values()) {
				callbacks.forEach(({ reject }) => reject(error as Error));
			}
		}
	}

	clear(): void {
		this.batch.clear();
	}
}

// =============================================================================
// Execution Engine
// =============================================================================

/**
 * Execution engine for running queries
 */
export class ExecutionEngine<S extends SchemaDefinition, Ctx extends BaseContext> {
	private loaders = new Map<string, DataLoader<string, unknown>>();

	constructor(
		private resolvers: Resolvers<S, Ctx>,
		private createContext: () => Ctx,
	) {}

	/**
	 * Execute a single entity query
	 */
	async executeGet<K extends keyof S & string>(
		entityName: K,
		id: string,
		select?: Select<S[K], S>,
	): Promise<InferEntity<S[K], S> | null> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver) {
			throw new ExecutionError(`No resolver found for entity: ${entityName}`);
		}

		// Try batch resolver first if available
		const batchResolver = this.resolvers.getBatchResolver(entityName);
		if (batchResolver) {
			const loader = this.getOrCreateLoader(entityName, batchResolver, ctx);
			const result = await loader.load(id);
			return this.applySelection(result, select) as InferEntity<S[K], S> | null;
		}

		// Fall back to single resolver
		const resolveResult = resolver.resolve(id, ctx);

		// Handle async generator (streaming)
		if (isAsyncIterable(resolveResult)) {
			// For now, just get the first value
			// TODO: Support streaming
			for await (const value of resolveResult) {
				return this.applySelection(value, select) as InferEntity<S[K], S> | null;
			}
			return null;
		}

		// Handle promise
		const result = await resolveResult;
		return this.applySelection(result, select) as InferEntity<S[K], S> | null;
	}

	/**
	 * Execute a list query
	 */
	async executeList<K extends keyof S & string>(
		entityName: K,
		input?: ListInput,
		select?: Select<S[K], S>,
	): Promise<InferEntity<S[K], S>[]> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.list) {
			throw new ExecutionError(`No list resolver found for entity: ${entityName}`);
		}

		const results = await resolver.list(input ?? {}, ctx);
		return results.map((r) => this.applySelection(r, select)) as InferEntity<S[K], S>[];
	}

	/**
	 * Execute a create mutation
	 */
	async executeCreate<K extends keyof S & string>(
		entityName: K,
		input: Partial<InferEntity<S[K], S>>,
	): Promise<InferEntity<S[K], S>> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.create) {
			throw new ExecutionError(`No create resolver found for entity: ${entityName}`);
		}

		const result = await resolver.create(input, ctx);
		this.invalidateLoaders(entityName);
		return result as InferEntity<S[K], S>;
	}

	/**
	 * Execute an update mutation
	 */
	async executeUpdate<K extends keyof S & string>(
		entityName: K,
		input: Partial<InferEntity<S[K], S>> & { id: string },
	): Promise<InferEntity<S[K], S>> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.update) {
			throw new ExecutionError(`No update resolver found for entity: ${entityName}`);
		}

		const result = await resolver.update(input, ctx);
		this.invalidateLoaders(entityName);
		return result as InferEntity<S[K], S>;
	}

	/**
	 * Execute a delete mutation
	 */
	async executeDelete<K extends keyof S & string>(
		entityName: K,
		id: string,
	): Promise<boolean> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver?.delete) {
			throw new ExecutionError(`No delete resolver found for entity: ${entityName}`);
		}

		const result = await resolver.delete(id, ctx);
		this.invalidateLoaders(entityName);
		return result;
	}

	/**
	 * Subscribe to entity updates (streaming)
	 */
	async *subscribe<K extends keyof S & string>(
		entityName: K,
		id: string,
		select?: Select<S[K], S>,
	): AsyncIterable<InferEntity<S[K], S> | null> {
		const ctx = this.createContext();
		const resolver = this.resolvers.getResolver(entityName);

		if (!resolver) {
			throw new ExecutionError(`No resolver found for entity: ${entityName}`);
		}

		const resolveResult = resolver.resolve(id, ctx);

		// Handle async generator (streaming)
		if (isAsyncIterable(resolveResult)) {
			for await (const value of resolveResult) {
				yield this.applySelection(value, select) as InferEntity<S[K], S> | null;
			}
			return;
		}

		// Handle single promise (emit once)
		const result = await resolveResult;
		yield this.applySelection(result, select) as InferEntity<S[K], S> | null;
	}

	/**
	 * Get or create a DataLoader for an entity
	 */
	private getOrCreateLoader<K extends keyof S & string>(
		entityName: K,
		batchFn: (ids: string[], ctx: Ctx) => Promise<(InferEntity<S[K], S> | null)[]>,
		ctx: Ctx,
	): DataLoader<string, InferEntity<S[K], S>> {
		if (!this.loaders.has(entityName)) {
			this.loaders.set(
				entityName,
				new DataLoader((ids) => batchFn(ids, ctx)) as DataLoader<string, unknown>,
			);
		}
		return this.loaders.get(entityName) as DataLoader<string, InferEntity<S[K], S>>;
	}

	/**
	 * Invalidate loaders for an entity (after mutations)
	 */
	private invalidateLoaders(entityName: string): void {
		this.loaders.get(entityName)?.clear();
	}

	/**
	 * Apply field selection to result
	 *
	 * Filters the data object to only include selected fields.
	 * Supports nested selection for relations.
	 */
	private applySelection<T>(data: T | null, select?: Record<string, unknown>): T | null {
		if (data === null || !select) return data;

		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(select)) {
			if (value === false) continue;

			const dataValue = (data as Record<string, unknown>)[key];

			if (value === true) {
				// Simple field selection
				result[key] = dataValue;
			} else if (typeof value === "object" && value !== null) {
				// Nested selection (relations or nested select)
				const nestedSelect = (value as { select?: Record<string, unknown> }).select ?? value;

				if (Array.isArray(dataValue)) {
					// HasMany relation
					result[key] = dataValue.map((item) =>
						this.applySelection(item as Record<string, unknown>, nestedSelect as Record<string, unknown>),
					);
				} else if (dataValue !== null && typeof dataValue === "object") {
					// HasOne/BelongsTo relation
					result[key] = this.applySelection(
						dataValue as Record<string, unknown>,
						nestedSelect as Record<string, unknown>,
					);
				} else {
					result[key] = dataValue;
				}
			}
		}

		// Always include id if present in data (unless explicitly excluded)
		if ("id" in (data as Record<string, unknown>) && !("id" in select)) {
			result.id = (data as Record<string, unknown>).id;
		}

		return result as T;
	}
}

// =============================================================================
// Utilities
// =============================================================================

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		Symbol.asyncIterator in value
	);
}

// =============================================================================
// Errors
// =============================================================================

export class ExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionError";
	}
}
