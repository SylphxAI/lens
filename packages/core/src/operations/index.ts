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
 *   .args(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic('create')
 *   .resolve(({ args, ctx }) => ctx.db.post.create({ data: args }));
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
} from "./query.js";
export {
	isLiveQueryDef,
	isQueryDef,
	QueryBuilderImpl,
	query,
} from "./query.js";

// =============================================================================
// Mutation
// =============================================================================

export type {
	MutationBuilder,
	MutationBuilderWithArgs,
	MutationBuilderWithOptimistic,
	MutationBuilderWithReturns,
	MutationBuilderWithReturns2,
	MutationDef,
} from "./mutation.js";
export { isMutationDef, isOperationDef, MutationBuilderImpl, mutation } from "./mutation.js";

// =============================================================================
// Subscription
// =============================================================================

export type { SubscriptionBuilder, SubscriptionDef } from "./subscription.js";
export { isSubscriptionDef, SubscriptionBuilderImpl, subscription } from "./subscription.js";

// =============================================================================
// Operations Factory
// =============================================================================

import type { MutationBuilder } from "./mutation.js";
import { MutationBuilderImpl } from "./mutation.js";
import type { QueryBuilder } from "./query.js";
import { QueryBuilderImpl } from "./query.js";
import type { SubscriptionBuilder } from "./subscription.js";
import { SubscriptionBuilderImpl } from "./subscription.js";

/**
 * Operations factory result - typed query, mutation, and subscription builders
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
	/** Create a subscription with pre-typed context */
	subscription: {
		(): SubscriptionBuilder<void, unknown, TContext>;
		(name: string): SubscriptionBuilder<void, unknown, TContext>;
	};
}

/**
 * Create typed query, mutation, and subscription builders with shared context.
 *
 * @example
 * ```typescript
 * type AppContext = { db: DB; user: User };
 * const { query, mutation, subscription } = operations<AppContext>();
 *
 * export const getUser = query()
 *   .args(z.object({ id: z.string() }))
 *   .resolve(({ args, ctx }) => ctx.db.user.find(args.id));
 *
 * export const onUserCreated = subscription()
 *   .returns(User)
 *   .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
 *     const unsub = ctx.events.on("user:created", emit);
 *     onCleanup(unsub);
 *   });
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
		subscription: ((name?: string) =>
			new SubscriptionBuilderImpl<void, unknown, TContext>(
				name,
			)) as Operations<TContext>["subscription"],
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
	type SubscriptionResultType,
} from "../router/index.js";
