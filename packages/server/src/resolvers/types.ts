/**
 * @lens/server - Resolver Types
 *
 * Type definitions for resolver functions.
 */

import type { Schema, SchemaDefinition, InferEntity, EntityDefinition } from "@lens/core";

// =============================================================================
// Context
// =============================================================================

/** Base context type - extend with your own */
export interface BaseContext {
	[key: string]: unknown;
}

// =============================================================================
// Resolver Types
// =============================================================================

/**
 * Single entity resolver - returns one entity by ID
 * Can be async function (yields once) or async generator (yields many times for streaming)
 */
export type EntityResolver<T, Ctx extends BaseContext = BaseContext> =
	| ((id: string, ctx: Ctx) => Promise<T | null>)
	| ((id: string, ctx: Ctx) => AsyncIterable<T>);

/**
 * Batch resolver - returns multiple entities by IDs
 * Used for N+1 elimination
 */
export type BatchResolver<T, Ctx extends BaseContext = BaseContext> = (
	ids: string[],
	ctx: Ctx,
) => Promise<(T | null)[]>;

/**
 * Relation resolver - resolves a relation from parent entity
 */
export type RelationResolver<Parent, T, Ctx extends BaseContext = BaseContext> =
	| ((parent: Parent, ctx: Ctx) => Promise<T>)
	| ((parent: Parent, ctx: Ctx) => AsyncIterable<T>);

/**
 * List resolver - returns a list of entities
 */
export type ListResolver<T, Ctx extends BaseContext = BaseContext> = (
	input: ListInput,
	ctx: Ctx,
) => Promise<T[]>;

/** List input options */
export interface ListInput {
	where?: Record<string, unknown>;
	orderBy?: Record<string, "asc" | "desc">;
	take?: number;
	skip?: number;
}

// =============================================================================
// Mutation Types
// =============================================================================

/** Create resolver */
export type CreateResolver<T, Input, Ctx extends BaseContext = BaseContext> = (
	input: Input,
	ctx: Ctx,
) => Promise<T>;

/** Update resolver */
export type UpdateResolver<T, Input, Ctx extends BaseContext = BaseContext> = (
	input: Input,
	ctx: Ctx,
) => Promise<T>;

/** Delete resolver */
export type DeleteResolver<Ctx extends BaseContext = BaseContext> = (
	id: string,
	ctx: Ctx,
) => Promise<boolean>;

// =============================================================================
// Resolver Definition
// =============================================================================

/**
 * Resolver definition for an entity
 */
export interface EntityResolverDef<
	E extends EntityDefinition,
	S extends SchemaDefinition,
	Ctx extends BaseContext = BaseContext,
> {
	/** Single entity resolver (required) */
	resolve: EntityResolver<InferEntity<E, S>, Ctx>;

	/** Batch resolver for N+1 elimination (optional) */
	batch?: BatchResolver<InferEntity<E, S>, Ctx>;

	/** List resolver (optional) */
	list?: ListResolver<InferEntity<E, S>, Ctx>;

	/** Create mutation (optional) */
	create?: CreateResolver<InferEntity<E, S>, Partial<InferEntity<E, S>>, Ctx>;

	/** Update mutation (optional) */
	update?: UpdateResolver<InferEntity<E, S>, Partial<InferEntity<E, S>> & { id: string }, Ctx>;

	/** Delete mutation (optional) */
	delete?: DeleteResolver<Ctx>;

	/** Relation resolvers (keyed by field name) */
	[relationField: string]:
		| EntityResolver<InferEntity<E, S>, Ctx>
		| BatchResolver<InferEntity<E, S>, Ctx>
		| ListResolver<InferEntity<E, S>, Ctx>
		| CreateResolver<InferEntity<E, S>, Partial<InferEntity<E, S>>, Ctx>
		| UpdateResolver<InferEntity<E, S>, Partial<InferEntity<E, S>> & { id: string }, Ctx>
		| DeleteResolver<Ctx>
		| RelationResolver<InferEntity<E, S>, unknown, Ctx>
		| undefined;
}

/**
 * Full resolver definition for a schema
 */
export type ResolverDefinition<
	S extends SchemaDefinition,
	Ctx extends BaseContext = BaseContext,
> = {
	[K in keyof S]?: EntityResolverDef<S[K], S, Ctx>;
};

// =============================================================================
// Resolved Types
// =============================================================================

/**
 * Resolver instance with validated resolvers
 */
export interface Resolvers<S extends SchemaDefinition, Ctx extends BaseContext = BaseContext> {
	/** Schema reference */
	schema: Schema<S>;

	/** Get resolver for entity */
	getResolver<K extends keyof S & string>(
		entityName: K,
	): EntityResolverDef<S[K], S, Ctx> | undefined;

	/** Get batch resolver for entity */
	getBatchResolver<K extends keyof S & string>(
		entityName: K,
	): BatchResolver<InferEntity<S[K], S>, Ctx> | undefined;

	/** Check if entity has resolver */
	hasResolver(entityName: string): boolean;

	/** Get all entity names with resolvers */
	getResolverNames(): (keyof S & string)[];
}
