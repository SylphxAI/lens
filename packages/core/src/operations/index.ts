/**
 * @sylphx/lens-core - Operations API
 *
 * Builder pattern for defining queries and mutations.
 * Inspired by tRPC but with entity-aware features.
 *
 * @example
 * ```typescript
 * import { query, mutation, tempId } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * // Query without input
 * export const whoami = query()
 *   .returns(User)
 *   .resolve(({ ctx }) => ctx.currentUser);
 *
 * // Mutation with optimistic updates
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic('create')
 *   .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }));
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
	EmitContextExtensions,
	EmitResolverContext,
	EmitResolverFn,
	EmitSubscriptionContext,
	GeneratorContextExtensions,
	GeneratorResolverContext,
	GeneratorResolverFn,
	GeneratorSubscriptionContext,
	InferReturnType,
	OptimisticCallback,
	OptimisticContext,
	OptimisticDSL,
	OptimisticSugar,
	QueryContext,
	QueryResolverContext,
	QueryResolverFn,
	ResolverFn,
	ReturnSpec,
	ZodLikeSchema,
} from "./types.js";

export { isOptimisticDSL } from "./types.js";

// =============================================================================
// Query
// =============================================================================

export type {
	AnyQueryDef,
	LiveQueryDef,
	PublisherResolverFn,
	QueryBuilder,
	QueryDef,
	QueryDefChainable,
	QueryMode,
	SubscribedQueryDef,
} from "./query.js";
export {
	isLiveQueryDef,
	isQueryDef,
	isSubscribedQueryDef,
	QueryBuilderImpl,
	query,
} from "./query.js";

// =============================================================================
// Mutation
// =============================================================================

export type {
	MutationBuilder,
	MutationBuilderWithInput,
	MutationBuilderWithOptimistic,
	MutationBuilderWithReturns,
	MutationBuilderWithReturns2,
	MutationDef,
} from "./mutation.js";
export { isMutationDef, isOperationDef, MutationBuilderImpl, mutation } from "./mutation.js";

// =============================================================================
// Operations Factory
// =============================================================================

import type { MutationBuilder } from "./mutation.js";
import { MutationBuilderImpl } from "./mutation.js";
import type { QueryBuilder } from "./query.js";
import { QueryBuilderImpl } from "./query.js";

/**
 * Operations factory result - typed query and mutation builders
 */
export interface Operations<TContext> {
	/** Create a query with pre-typed context */
	query: {
		(): QueryBuilder<void, unknown, TContext>;
		(name: string): QueryBuilder<void, unknown, TContext>;
	};
	/** Create a mutation with pre-typed context */
	mutation: {
		(): MutationBuilder<unknown, unknown, TContext>;
		(name: string): MutationBuilder<unknown, unknown, TContext>;
	};
}

/**
 * Create typed query and mutation builders with shared context.
 *
 * @example
 * ```typescript
 * type AppContext = { db: DB; user: User };
 * const { query, mutation } = operations<AppContext>();
 *
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .resolve(({ input, ctx }) => ctx.db.user.find(input.id));
 * ```
 */
export function operations<TContext>(): Operations<TContext> {
	return {
		query: ((name?: string) =>
			new QueryBuilderImpl<void, unknown, TContext>(name)) as Operations<TContext>["query"],
		mutation: ((name?: string) =>
			new MutationBuilderImpl<unknown, unknown, TContext>(
				name,
			)) as Operations<TContext>["mutation"],
	};
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a temporary ID for optimistic updates.
 * Uses timestamp + random suffix for uniqueness without global state.
 *
 * @example
 * ```typescript
 * .optimistic('create')  // Auto-generates tempId
 * tempId()  // Returns "temp_1234567890_abc123", etc.
 * ```
 */
export function tempId(): string {
	return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @deprecated No longer needed - tempId() is now stateless.
 * This function is a no-op kept for backwards compatibility.
 */
export function resetTempIdCounter(): void {
	// No-op - tempId() is now stateless
}

/** Check if an ID is a temporary ID */
export function isTempId(id: string): boolean {
	return id.startsWith("temp_");
}

// =============================================================================
// Router (Re-exported from router module)
// =============================================================================

export {
	type AnyProcedure,
	flattenRouter,
	type InferRouterClient,
	type InferRouterContext,
	isRouterDef,
	type MutationResultType,
	type QueryResultType,
	type RouterDef,
	type RouterRoutes,
	router,
} from "../router/index.js";
