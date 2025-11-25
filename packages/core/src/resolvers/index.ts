/**
 * @sylphx/core - Entity Resolvers API
 *
 * Define resolvers for nested data handling.
 * These resolvers are reused across ALL operations.
 *
 * @example
 * ```typescript
 * import { entityResolvers } from '@sylphx/core';
 *
 * export const resolvers = entityResolvers({
 *   User: {
 *     // Simple resolver
 *     posts: (user) => useDB().post.findMany({ where: { authorId: user.id } }),
 *   },
 *   Post: {
 *     // Batch resolver for N+1 prevention
 *     author: {
 *       batch: async (posts) => {
 *         const authorIds = [...new Set(posts.map(p => p.authorId))];
 *         const authors = await useDB().user.findMany({ where: { id: { in: authorIds } } });
 *         const authorMap = new Map(authors.map(a => [a.id, a]));
 *         return posts.map(p => authorMap.get(p.authorId));
 *       },
 *     },
 *   },
 * });
 * ```
 */

import type { EntityDef } from "../schema/define";
import type { EntityDefinition } from "../schema/types";

// =============================================================================
// Type Definitions
// =============================================================================

/** Simple field resolver function */
export type FieldResolverFn<TParent, TResult> =
	| ((parent: TParent) => TResult)
	| ((parent: TParent) => Promise<TResult>);

/** Batch resolver function (for N+1 prevention) */
export type BatchResolverFn<TParent, TResult> =
	| ((parents: TParent[]) => TResult[])
	| ((parents: TParent[]) => Promise<TResult[]>);

/** Field resolver configuration */
export type FieldResolver<TParent, TResult> =
	| FieldResolverFn<TParent, TResult>
	| { batch: BatchResolverFn<TParent, TResult> };

/** Entity resolver definition */
export type EntityResolverDef<TEntity> = {
	[K in string]?: FieldResolver<TEntity, unknown>;
};

/** Check if resolver is a batch resolver */
export function isBatchResolver<T, R>(
	resolver: FieldResolver<T, R>,
): resolver is { batch: BatchResolverFn<T, R> } {
	return typeof resolver === "object" && resolver !== null && "batch" in resolver;
}

// =============================================================================
// Entity Resolvers Container
// =============================================================================

/** Entity resolvers definition (map of entity name to resolvers) */
export type EntityResolversDefinition = {
	[entityName: string]: EntityResolverDef<unknown>;
};

/** Entity resolvers instance */
export interface EntityResolvers<T extends EntityResolversDefinition> {
	/** The resolver definitions */
	readonly definitions: T;

	/** Get resolver for an entity field */
	getResolver<E extends keyof T & string, F extends keyof T[E] & string>(
		entityName: E,
		fieldName: F,
	): T[E][F] | undefined;

	/** Get all field resolvers for an entity */
	getEntityResolvers<E extends keyof T & string>(entityName: E): T[E] | undefined;

	/** Check if entity has resolvers */
	hasEntity(entityName: string): boolean;

	/** Check if entity has specific field resolver */
	hasFieldResolver(entityName: string, fieldName: string): boolean;

	/** Get all entity names with resolvers */
	getEntityNames(): (keyof T & string)[];

	/** Execute a resolver */
	resolve<TParent, TResult>(
		entityName: string,
		fieldName: string,
		parent: TParent,
	): Promise<TResult | undefined>;

	/** Execute a batch resolver */
	resolveBatch<TParent, TResult>(
		entityName: string,
		fieldName: string,
		parents: TParent[],
	): Promise<TResult[] | undefined>;
}

class EntityResolversImpl<T extends EntityResolversDefinition> implements EntityResolvers<T> {
	constructor(public readonly definitions: T) {}

	getResolver<E extends keyof T & string, F extends keyof T[E] & string>(
		entityName: E,
		fieldName: F,
	): T[E][F] | undefined {
		const entityResolvers = this.definitions[entityName];
		if (!entityResolvers) return undefined;
		return entityResolvers[fieldName] as T[E][F] | undefined;
	}

	getEntityResolvers<E extends keyof T & string>(entityName: E): T[E] | undefined {
		return this.definitions[entityName];
	}

	hasEntity(entityName: string): boolean {
		return entityName in this.definitions;
	}

	hasFieldResolver(entityName: string, fieldName: string): boolean {
		const entityResolvers = this.definitions[entityName];
		if (!entityResolvers) return false;
		return fieldName in entityResolvers;
	}

	getEntityNames(): (keyof T & string)[] {
		return Object.keys(this.definitions) as (keyof T & string)[];
	}

	async resolve<TParent, TResult>(
		entityName: string,
		fieldName: string,
		parent: TParent,
	): Promise<TResult | undefined> {
		const resolver = this.getResolver(entityName as keyof T & string, fieldName);
		if (!resolver) return undefined;

		if (isBatchResolver(resolver)) {
			// For single resolve, wrap in array and unwrap result
			const results = await resolver.batch([parent]);
			return results[0] as TResult;
		}

		// Simple resolver
		const resolverFn = resolver as FieldResolverFn<TParent, TResult>;
		return resolverFn(parent);
	}

	async resolveBatch<TParent, TResult>(
		entityName: string,
		fieldName: string,
		parents: TParent[],
	): Promise<TResult[] | undefined> {
		const resolver = this.getResolver(entityName as keyof T & string, fieldName);
		if (!resolver) return undefined;

		if (isBatchResolver(resolver)) {
			return resolver.batch(parents) as Promise<TResult[]>;
		}

		// For non-batch resolver, execute individually
		const resolverFn = resolver as FieldResolverFn<TParent, TResult>;
		return Promise.all(parents.map((parent) => resolverFn(parent)));
	}
}

/**
 * Define entity resolvers for nested data handling.
 *
 * @param definitions - Map of entity name to field resolvers
 * @returns EntityResolvers instance
 *
 * @example
 * ```typescript
 * const resolvers = entityResolvers({
 *   User: {
 *     posts: (user) => db.post.findMany({ where: { authorId: user.id } }),
 *     comments: (user) => db.comment.findMany({ where: { authorId: user.id } }),
 *   },
 *   Post: {
 *     author: {
 *       batch: async (posts) => {
 *         // N+1 prevention - fetch all authors in one query
 *         const authorIds = [...new Set(posts.map(p => p.authorId))];
 *         const authors = await db.user.findMany({ where: { id: { in: authorIds } } });
 *         const authorMap = new Map(authors.map(a => [a.id, a]));
 *         return posts.map(p => authorMap.get(p.authorId));
 *       },
 *     },
 *     comments: (post) => db.comment.findMany({ where: { postId: post.id } }),
 *   },
 * });
 * ```
 */
export function entityResolvers<T extends EntityResolversDefinition>(
	definitions: T,
): EntityResolvers<T> {
	return new EntityResolversImpl(definitions);
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is an EntityResolvers instance */
export function isEntityResolvers(value: unknown): value is EntityResolvers<EntityResolversDefinition> {
	return (
		typeof value === "object" &&
		value !== null &&
		"definitions" in value &&
		"getResolver" in value &&
		"resolve" in value
	);
}
