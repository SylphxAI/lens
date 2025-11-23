/**
 * @lens/server - Resolver Creation
 *
 * Factory for creating typed resolvers from a schema.
 */

import type { Schema, SchemaDefinition, InferEntity } from "@lens/core";
import type {
	BaseContext,
	ResolverDefinition,
	Resolvers,
	EntityResolverDef,
	BatchResolver,
} from "./types";

// =============================================================================
// Resolver Instance
// =============================================================================

class ResolversImpl<S extends SchemaDefinition, Ctx extends BaseContext>
	implements Resolvers<S, Ctx>
{
	private resolvers: Map<string, EntityResolverDef<S[keyof S], S, Ctx>>;

	constructor(
		public readonly schema: Schema<S>,
		definition: ResolverDefinition<S, Ctx>,
	) {
		this.resolvers = new Map();

		// Validate and store resolvers
		for (const [entityName, resolverDef] of Object.entries(definition)) {
			if (!schema.hasEntity(entityName)) {
				throw new ResolverValidationError(
					`Resolver defined for unknown entity: ${entityName}`,
				);
			}

			if (!resolverDef?.resolve) {
				throw new ResolverValidationError(
					`Entity ${entityName} must have a 'resolve' function`,
				);
			}

			this.resolvers.set(
				entityName,
				resolverDef as EntityResolverDef<S[keyof S], S, Ctx>,
			);
		}
	}

	getResolver<K extends keyof S & string>(
		entityName: K,
	): EntityResolverDef<S[K], S, Ctx> | undefined {
		return this.resolvers.get(entityName) as EntityResolverDef<S[K], S, Ctx> | undefined;
	}

	getBatchResolver<K extends keyof S & string>(
		entityName: K,
	): BatchResolver<InferEntity<S[K], S>, Ctx> | undefined {
		const resolver = this.resolvers.get(entityName);
		return resolver?.batch as BatchResolver<InferEntity<S[K], S>, Ctx> | undefined;
	}

	hasResolver(entityName: string): boolean {
		return this.resolvers.has(entityName);
	}

	getResolverNames(): (keyof S & string)[] {
		return Array.from(this.resolvers.keys()) as (keyof S & string)[];
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create resolvers for a schema
 *
 * @example
 * ```typescript
 * const resolvers = createResolvers(schema, {
 *   User: {
 *     // Required: single entity resolver
 *     resolve: async (id, ctx) => {
 *       return await ctx.db.user.findUnique({ where: { id } });
 *     },
 *
 *     // Optional: batch resolver for N+1 elimination
 *     batch: async (ids, ctx) => {
 *       return await ctx.db.user.findMany({ where: { id: { in: ids } } });
 *     },
 *
 *     // Optional: list resolver
 *     list: async (input, ctx) => {
 *       return await ctx.db.user.findMany(input);
 *     },
 *
 *     // Optional: mutations
 *     create: async (input, ctx) => {
 *       return await ctx.db.user.create({ data: input });
 *     },
 *
 *     update: async (input, ctx) => {
 *       return await ctx.db.user.update({ where: { id: input.id }, data: input });
 *     },
 *
 *     delete: async (id, ctx) => {
 *       await ctx.db.user.delete({ where: { id } });
 *       return true;
 *     },
 *
 *     // Optional: relation resolvers
 *     posts: async (user, ctx) => {
 *       return await ctx.db.post.findMany({ where: { authorId: user.id } });
 *     },
 *   },
 * });
 * ```
 */
export function createResolvers<S extends SchemaDefinition, Ctx extends BaseContext = BaseContext>(
	schema: Schema<S>,
	definition: ResolverDefinition<S, Ctx>,
): Resolvers<S, Ctx> {
	return new ResolversImpl(schema, definition);
}

// =============================================================================
// Errors
// =============================================================================

export class ResolverValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ResolverValidationError";
	}
}
