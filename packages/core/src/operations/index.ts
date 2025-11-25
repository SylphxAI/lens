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
 * // Query without input - ctx contains user-defined context (db, user, etc.)
 * export const whoami = query()
 *   .returns(User)
 *   .resolve(({ ctx }) => ctx.currentUser);
 *
 * // Query with input
 * export const user = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }));
 *
 * // Mutation with optimistic updates
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic(({ input }) => ({ id: tempId(), ...input }))
 *   .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }));
 * ```
 */

import type { EntityDef } from "../schema/define";
import type { EntityDefinition } from "../schema/types";

// =============================================================================
// Type Definitions
// =============================================================================

/** Zod-like schema interface (minimal subset we need) */
export interface ZodLikeSchema<T = unknown> {
	parse: (data: unknown) => T;
	safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown };
	_output: T;
}

/** Return type specification - can be entity, array, or object of entities */
export type ReturnSpec =
	| EntityDef<string, EntityDefinition>
	| [EntityDef<string, EntityDefinition>]
	| Record<string, EntityDef<string, EntityDefinition> | [EntityDef<string, EntityDefinition>]>;

/** Infer TypeScript type from return spec */
export type InferReturnType<R extends ReturnSpec> = R extends EntityDef<string, infer F>
	? { [K in keyof F]: unknown } // Simplified - actual inference would be more complex
	: R extends [EntityDef<string, infer F>]
		? { [K in keyof F]: unknown }[]
		: R extends Record<string, unknown>
			? { [K in keyof R]: R[K] extends [EntityDef<string, EntityDefinition>] ? unknown[] : unknown }
			: never;

/** Resolver context - passed directly to resolver function (tRPC style) */
export interface ResolverContext<TInput = unknown, TContext = unknown> {
	/** Parsed and validated input */
	input: TInput;
	/** User-defined context (db, user, etc.) - set via createServer({ context }) */
	ctx: TContext;
	/** Emit data for subscriptions */
	emit?: (data: unknown) => void;
	/** Register cleanup function for subscriptions */
	onCleanup?: (fn: () => void) => () => void;
}

/** Resolver function type */
export type ResolverFn<TInput, TOutput, TContext = unknown> =
	| ((ctx: ResolverContext<TInput, TContext>) => Promise<TOutput>)
	| ((ctx: ResolverContext<TInput, TContext>) => TOutput)
	| ((ctx: ResolverContext<TInput, TContext>) => AsyncGenerator<TOutput>);

/** Optimistic function type (legacy - still supported) */
export type OptimisticFn<TInput, TOutput> = (ctx: { input: TInput }) => Partial<TOutput>;

// =============================================================================
// Optimistic DSL (Declarative - for type-only client imports)
// =============================================================================

/**
 * Declarative optimistic update DSL
 *
 * Simple, minimal syntax for common cases:
 * - String shorthand: 'merge', 'create', 'delete'
 * - Object for additional fields: { merge: { published: true } }
 * - Full object for cross-entity: { updateMany: { ... } }
 *
 * @example
 * ```typescript
 * // Simple (90% of cases)
 * .optimistic('merge')   // UPDATE: merge input into entity
 * .optimistic('create')  // CREATE: auto tempId
 * .optimistic('delete')  // DELETE: mark deleted
 *
 * // With additional fields
 * .optimistic({ merge: { published: true } })
 * .optimistic({ create: { status: 'draft' } })
 *
 * // Cross-entity update
 * .optimistic({
 *   updateMany: {
 *     entity: 'User',
 *     ids: '$userIds',      // $ = reference input field
 *     set: { role: '$newRole' }
 *   }
 * })
 * ```
 *
 * Future: Could auto-derive from naming convention:
 * - updateX → merge
 * - createX → create
 * - deleteX → delete
 */
export type OptimisticDSL =
	// String shorthand (simple cases)
	| "merge"
	| "create"
	| "delete"
	// Object with additional fields
	| { merge: Record<string, unknown> }
	| { create: Record<string, unknown> }
	// Cross-entity
	| { updateMany: OptimisticUpdateManyConfig }
	// Escape hatch
	| { custom: OptimisticFn<unknown, unknown> };

/** Config for updateMany */
export interface OptimisticUpdateManyConfig {
	/** Target entity type */
	entity: string;
	/** Input field containing IDs (use $ prefix for references) */
	ids: string;
	/** Fields to set (use $ prefix for input references) */
	set: Record<string, unknown>;
}

/**
 * Check if value is an OptimisticDSL
 */
export function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	// String shorthand
	if (value === "merge" || value === "create" || value === "delete") {
		return true;
	}
	// Object form
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		return "merge" in obj || "create" in obj || "updateMany" in obj || "custom" in obj;
	}
	return false;
}

/**
 * Normalize DSL to internal format for interpreter
 */
export function normalizeOptimisticDSL(dsl: OptimisticDSL): {
	type: "merge" | "create" | "delete" | "updateMany" | "custom";
	set?: Record<string, unknown>;
	config?: OptimisticUpdateManyConfig;
	fn?: OptimisticFn<unknown, unknown>;
} {
	// String shorthand
	if (dsl === "merge") return { type: "merge" };
	if (dsl === "create") return { type: "create" };
	if (dsl === "delete") return { type: "delete" };

	// Object form
	if ("merge" in dsl) return { type: "merge", set: dsl.merge };
	if ("create" in dsl) return { type: "create", set: dsl.create };
	if ("updateMany" in dsl) return { type: "updateMany", config: dsl.updateMany };
	if ("custom" in dsl) return { type: "custom", fn: dsl.custom };

	return { type: "merge" }; // fallback
}

// =============================================================================
// Query Builder
// =============================================================================

/** Query definition */
export interface QueryDef<TInput = void, TOutput = unknown> {
	_type: "query";
	/** Query name (optional - derived from export key if not provided) */
	_name?: string;
	_input?: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	_resolve?: ResolverFn<TInput, TOutput>;
}

/** Query builder - fluent interface */
export interface QueryBuilder<TInput = void, TOutput = unknown> {
	/** Define input validation schema (optional for queries) */
	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput>;

	/** Define return type */
	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>>;

	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): QueryDef<TInput, TOutput>;
}

class QueryBuilderImpl<TInput = void, TOutput = unknown> implements QueryBuilder<TInput, TOutput> {
	private _name?: string;
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;

	constructor(name?: string) {
		this._name = name;
	}

	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput> {
		const builder = new QueryBuilderImpl<T, TOutput>(this._name);
		builder._inputSchema = schema;
		builder._outputSpec = this._outputSpec;
		return builder;
	}

	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>> {
		const builder = new QueryBuilderImpl<TInput, InferReturnType<R>>(this._name);
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	resolve(fn: ResolverFn<TInput, TOutput>): QueryDef<TInput, TOutput> {
		return {
			_type: "query",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_resolve: fn,
		};
	}
}

/**
 * Create a query builder
 *
 * Name is optional - if not provided, it will be derived from the export key.
 *
 * @example
 * ```typescript
 * // Name derived from export key (recommended)
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 *
 * // Explicit name (for edge cases)
 * export const getUser = query('getUser')
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 * ```
 */
export function query(): QueryBuilder<void, unknown>;
export function query(name: string): QueryBuilder<void, unknown>;
export function query(name?: string): QueryBuilder<void, unknown> {
	return new QueryBuilderImpl(name);
}

// =============================================================================
// Mutation Builder
// =============================================================================

/** Mutation definition */
export interface MutationDef<TInput = unknown, TOutput = unknown> {
	_type: "mutation";
	/** Mutation name (optional - derived from export key if not provided) */
	_name?: string;
	_input: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	/**
	 * Optimistic update specification
	 * - DSL object: Declarative, works with type-only imports
	 * - Function: Legacy, requires runtime import
	 */
	_optimistic?: OptimisticDSL | OptimisticFn<TInput, TOutput>;
	_resolve: ResolverFn<TInput, TOutput>;
}

/** Mutation builder - fluent interface */
export interface MutationBuilder<TInput = unknown, TOutput = unknown> {
	/** Define input validation schema (required for mutations) */
	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput>;
}

/** Mutation builder after input is defined */
export interface MutationBuilderWithInput<TInput, TOutput = unknown> {
	/** Define return type */
	returns<R extends ReturnSpec>(spec: R): MutationBuilderWithReturns<TInput, InferReturnType<R>>;
}

/** Mutation builder after returns is defined */
export interface MutationBuilderWithReturns<TInput, TOutput> {
	/**
	 * Define optimistic update (optional)
	 *
	 * @param spec - DSL object (recommended) or function (legacy)
	 *
	 * @example DSL (works with type-only imports)
	 * ```typescript
	 * .optimistic({ type: 'merge' })
	 * .optimistic({ type: 'create' })
	 * .optimistic({ type: 'merge', set: { published: true } })
	 * ```
	 *
	 * @example Function (legacy, requires runtime import)
	 * ```typescript
	 * .optimistic(({ input }) => ({ id: input.id, ...input }))
	 * ```
	 */
	optimistic(
		spec: OptimisticDSL | OptimisticFn<TInput, TOutput>,
	): MutationBuilderWithOptimistic<TInput, TOutput>;

	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput>;
}

/** Mutation builder after optimistic is defined */
export interface MutationBuilderWithOptimistic<TInput, TOutput> {
	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput>;
}

class MutationBuilderImpl<TInput = unknown, TOutput = unknown>
	implements
		MutationBuilder<TInput, TOutput>,
		MutationBuilderWithInput<TInput, TOutput>,
		MutationBuilderWithReturns<TInput, TOutput>,
		MutationBuilderWithOptimistic<TInput, TOutput>
{
	private _name?: string;
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;
	private _optimisticSpec?: OptimisticDSL | OptimisticFn<TInput, TOutput>;

	constructor(name?: string) {
		this._name = name;
	}

	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput> {
		const builder = new MutationBuilderImpl<T, TOutput>(this._name);
		builder._inputSchema = schema;
		return builder;
	}

	returns<R extends ReturnSpec>(spec: R): MutationBuilderWithReturns<TInput, InferReturnType<R>> {
		const builder = new MutationBuilderImpl<TInput, InferReturnType<R>>(this._name);
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	optimistic(
		spec: OptimisticDSL | OptimisticFn<TInput, TOutput>,
	): MutationBuilderWithOptimistic<TInput, TOutput> {
		const builder = new MutationBuilderImpl<TInput, TOutput>(this._name);
		builder._inputSchema = this._inputSchema;
		builder._outputSpec = this._outputSpec;
		builder._optimisticSpec = spec;
		return builder;
	}

	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput> {
		if (!this._inputSchema) {
			throw new Error("Mutation requires input schema. Use .input(schema) first.");
		}
		return {
			_type: "mutation",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_optimistic: this._optimisticSpec,
			_resolve: fn,
		};
	}
}

/**
 * Create a mutation builder
 *
 * Name is optional - if not provided, it will be derived from the export key.
 *
 * @example
 * ```typescript
 * // Name derived from export key (recommended)
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .resolve(({ input }) => db.post.create({ data: input }));
 *
 * // Explicit name (for edge cases)
 * export const createPost = mutation('createPost')
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .resolve(({ input }) => db.post.create({ data: input }));
 * ```
 */
export function mutation(): MutationBuilder<unknown, unknown>;
export function mutation(name: string): MutationBuilder<unknown, unknown>;
export function mutation(name?: string): MutationBuilder<unknown, unknown> {
	return new MutationBuilderImpl(name);
}

// =============================================================================
// Helpers
// =============================================================================

let tempIdCounter = 0;

/**
 * Generate a temporary ID for optimistic updates.
 * The server will replace this with the real ID.
 *
 * @example
 * ```typescript
 * .optimistic(({ input }) => ({
 *   id: tempId(),  // Will be "temp_0", "temp_1", etc.
 *   title: input.title,
 * }))
 * ```
 */
export function tempId(): string {
	return `temp_${tempIdCounter++}`;
}

/**
 * Reset temp ID counter (for testing)
 */
export function resetTempIdCounter(): void {
	tempIdCounter = 0;
}

/**
 * Check if an ID is a temporary ID
 */
export function isTempId(id: string): boolean {
	return id.startsWith("temp_");
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a query definition */
export function isQueryDef(value: unknown): value is QueryDef {
	return typeof value === "object" && value !== null && (value as QueryDef)._type === "query";
}

/** Check if value is a mutation definition */
export function isMutationDef(value: unknown): value is MutationDef {
	return typeof value === "object" && value !== null && (value as MutationDef)._type === "mutation";
}

/** Check if value is any operation definition */
export function isOperationDef(value: unknown): value is QueryDef | MutationDef {
	return isQueryDef(value) || isMutationDef(value);
}

// =============================================================================
// Router (Namespace Support)
// =============================================================================

/** Any procedure (query or mutation) */
export type AnyProcedure = QueryDef<unknown, unknown> | MutationDef<unknown, unknown>;

/** Router routes - can contain procedures or nested routers */
export type RouterRoutes = {
	[key: string]: AnyProcedure | RouterDef<RouterRoutes>;
};

/** Router definition */
export interface RouterDef<TRoutes extends RouterRoutes = RouterRoutes> {
	_type: "router";
	_routes: TRoutes;
}

/** Check if value is a router definition */
export function isRouterDef(value: unknown): value is RouterDef {
	return typeof value === "object" && value !== null && (value as RouterDef)._type === "router";
}

/**
 * Create a router for namespacing operations
 *
 * Routers allow organizing operations into logical groups with nested access.
 *
 * @example
 * ```typescript
 * import { router, query, mutation } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * export const appRouter = router({
 *   user: router({
 *     get: query()
 *       .input(z.object({ id: z.string() }))
 *       .returns(User)
 *       .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } })),
 *     list: query()
 *       .returns([User])
 *       .resolve(({ ctx }) => ctx.db.user.findMany()),
 *     create: mutation()
 *       .input(z.object({ name: z.string(), email: z.string() }))
 *       .returns(User)
 *       .resolve(({ input, ctx }) => ctx.db.user.create({ data: input })),
 *   }),
 *   post: router({
 *     get: query()
 *       .input(z.object({ id: z.string() }))
 *       .returns(Post)
 *       .resolve(({ input, ctx }) => ctx.db.post.findUnique({ where: { id: input.id } })),
 *     create: mutation()
 *       .input(z.object({ title: z.string(), content: z.string() }))
 *       .returns(Post)
 *       .resolve(({ input, ctx }) => ctx.db.post.create({ data: input })),
 *   }),
 * });
 *
 * // Client usage:
 * // client.user.get({ id: "1" })
 * // client.user.list()
 * // client.post.create({ title: "Hello", content: "World" })
 * ```
 */
export function router<TRoutes extends RouterRoutes>(routes: TRoutes): RouterDef<TRoutes> {
	return {
		_type: "router",
		_routes: routes,
	};
}

/** Flatten router to dot-notation paths for server processing */
export function flattenRouter(
	routerDef: RouterDef,
	prefix = "",
): Map<string, AnyProcedure> {
	const result = new Map<string, AnyProcedure>();

	for (const [key, value] of Object.entries(routerDef._routes)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (isRouterDef(value)) {
			// Recursively flatten nested routers
			const nested = flattenRouter(value, path);
			for (const [nestedPath, procedure] of nested) {
				result.set(nestedPath, procedure);
			}
		} else {
			// It's a procedure (query or mutation)
			result.set(path, value);
		}
	}

	return result;
}

// =============================================================================
// Type Inference for Router
// =============================================================================

/** Infer the client type from a router definition */
export type InferRouterClient<TRouter extends RouterDef> = TRouter extends RouterDef<infer TRoutes>
	? {
			[K in keyof TRoutes]: TRoutes[K] extends RouterDef<infer TNestedRoutes>
				? InferRouterClient<RouterDef<TNestedRoutes>>
				: TRoutes[K] extends QueryDef<infer TInput, infer TOutput>
					? TInput extends void
						? () => Promise<TOutput>
						: (input: TInput) => Promise<TOutput>
					: TRoutes[K] extends MutationDef<infer TInput, infer TOutput>
						? (input: TInput) => Promise<TOutput>
						: never;
		}
	: never;
