/**
 * @sylphx/lens-client - Client Types
 *
 * Type definitions for Lens client configuration and operations.
 */

import type { MutationDef, Observer, QueryDef, RouterDef, RouterRoutes } from "@sylphx/lens-core";
import type { TypedTransport } from "../transport/direct.js";
import type { Plugin } from "../transport/plugin.js";
import type { Transport } from "../transport/types.js";

// =============================================================================
// Map Types
// =============================================================================

/** Query map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutation map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

// =============================================================================
// Selection Types
// =============================================================================

/**
 * Nested selection object with optional input.
 * Used for relations that need their own params.
 */
export interface NestedSelection {
	/** Input/params for this nested query */
	input?: Record<string, unknown>;
	/** Field selection for this nested query */
	select?: SelectionObject;
}

/**
 * Selection object for field selection.
 * Supports:
 * - `true` - Select this field
 * - `{ select: {...} }` - Nested selection only
 * - `{ input: {...}, select?: {...} }` - Nested with input params
 */
export interface SelectionObject {
	[key: string]: boolean | SelectionObject | { select: SelectionObject } | NestedSelection;
}

/**
 * Query descriptor with unified { input, select } pattern.
 * Used at top-level and nested levels for consistency.
 */
export interface QueryDescriptor<
	TInput = unknown,
	TSelect extends SelectionObject = SelectionObject,
> {
	/** Input params for the query */
	input?: TInput;
	/** Field selection */
	select?: TSelect;
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
			: S[K] extends { input?: unknown; select?: infer Nested extends SelectionObject }
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

// =============================================================================
// Client Configuration
// =============================================================================

/** Client configuration */
export interface LensClientConfig<TApi = unknown> {
	/** Transport for server communication (can be typed for inference) */
	transport: Transport | TypedTransport<TApi>;
	/** Plugins for request/response processing */
	plugins?: Plugin[];
}

/** Config with typed transport for automatic type inference */
export interface TypedClientConfig<TApi> {
	/** Typed transport with server type marker */
	transport: TypedTransport<TApi>;
	/** Plugins for request/response processing */
	plugins?: Plugin[];
}

// =============================================================================
// Query/Mutation Results
// =============================================================================

/**
 * Query result with reactive subscription support.
 *
 * Supports both simple callback and RxJS-style Observer patterns:
 * @example
 * ```typescript
 * // Simple callback (returns unsubscribe function)
 * const unsubscribe = result.subscribe((data) => console.log(data));
 *
 * // RxJS-style Observer object
 * const unsubscribe = result.subscribe({
 *   next: (data) => console.log(data),
 *   error: (err) => console.error(err),
 *   complete: () => console.log('done'),
 * });
 * ```
 */
export interface QueryResult<T> {
	/** Current value (for peeking without subscribing) */
	readonly value: T | null;
	/**
	 * Subscribe to updates.
	 * @param observerOrCallback - Either a callback function or an Observer object
	 * @returns Unsubscribe function
	 */
	subscribe(observerOrCallback?: Observer<T> | ((data: T) => void)): () => void;
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
}

// =============================================================================
// Type Inference
// =============================================================================

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
export type ExtractRouter<T> = T extends { router: infer R extends RouterDef } ? R : never;

/**
 * Query function type with unified { input, select } pattern.
 * Handles both queries with and without required input.
 */
export type QueryFn<TInput, TOutput> = TInput extends void
	? <TSelect extends SelectionObject = SelectionObject>(
			descriptor?: QueryDescriptor<void, TSelect>,
		) => QueryResult<TSelect extends SelectionObject ? SelectedType<TOutput, TSelect> : TOutput>
	: <TSelect extends SelectionObject = SelectionObject>(
			descriptor: QueryDescriptor<TInput, TSelect>,
		) => QueryResult<TSelect extends SelectionObject ? SelectedType<TOutput, TSelect> : TOutput>;

/**
 * Mutation function type with unified { input, select } pattern.
 */
export type MutationFn<TInput, TOutput> = <TSelect extends SelectionObject = SelectionObject>(
	descriptor: QueryDescriptor<TInput, TSelect>,
) => Promise<
	MutationResult<TSelect extends SelectionObject ? SelectedType<TOutput, TSelect> : TOutput>
>;

/** Infer client type from router routes */
export type InferRouterClientType<TRoutes extends RouterRoutes> = {
	[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
		? InferRouterClientType<TNestedRoutes>
		: TRoutes[K] extends QueryDef<infer TInput, infer TOutput>
			? QueryFn<TInput, TOutput>
			: TRoutes[K] extends MutationDef<infer TInput, infer TOutput>
				? MutationFn<TInput, TOutput>
				: never;
};

/** Router-based client type */
export type RouterLensClient<TRouter extends RouterDef> =
	TRouter extends RouterDef<infer TRoutes> ? InferRouterClientType<TRoutes> : never;

/** Generic client type (for framework adapters) */
export type LensClient<_Q = unknown, _M = unknown> = {
	[key: string]: unknown;
};
