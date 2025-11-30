/**
 * @sylphx/lens-core - Entity Definition
 *
 * Type-safe entity definitions for schema.
 *
 * @example
 * ```typescript
 * import { entity, t } from '@sylphx/lens-core';
 *
 * // Define entities with scalar fields
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 *   avatarKey: t.string(),  // internal field
 * });
 *
 * const Post = entity('Post', {
 *   id: t.id(),
 *   title: t.string(),
 *   authorId: t.string(),  // FK to User
 * });
 *
 * // Field resolution is defined separately with resolver()
 * // See resolvers/index.ts for details
 * ```
 */

import type { EntityMarker } from "@sylphx/standard-entity";
import { Schema } from "./create";
import type { InferEntity } from "./infer";
import type { EntityDefinition } from "./types";

// =============================================================================
// Entity Definition Builder
// =============================================================================

/** Symbol to identify entity definitions */
const ENTITY_SYMBOL: unique symbol = Symbol("lens:entity");

/**
 * Entity definition with name and fields.
 *
 * Implements StandardEntity protocol for type-safe Reify operations.
 * Extends EntityMarker from @sylphx/standard-entity for protocol compliance.
 */
export interface EntityDef<
	Name extends string = string,
	Fields extends EntityDefinition = EntityDefinition,
> extends EntityMarker<Name> {
	[ENTITY_SYMBOL]: true;
	/** Entity name (injected from export key if not provided) */
	_name?: Name;
	/** Entity fields (scalar only) */
	readonly fields: Fields;
}

/**
 * Extract the inferred entity type from an EntityDef.
 * Use this when you need the actual TypeScript type of an entity.
 *
 * @example
 * ```typescript
 * type UserData = InferEntityType<typeof User>;
 * // { id: string; name: string; email: string; ... }
 * ```
 */
export type InferEntityType<E extends EntityDef> =
	E extends EntityDef<string, infer F> ? InferEntity<F> : never;

/**
 * Define an entity with its scalar fields.
 *
 * Entity defines the internal/DB shape. Field resolution (including
 * relations) is defined separately with resolver().
 *
 * @example
 * ```typescript
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 * });
 * ```
 */
export function defineEntity<Fields extends EntityDefinition>(
	fields: Fields,
): EntityDef<string, Fields>;
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	fields: Fields,
): EntityDef<Name, Fields>;
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	nameOrFields: Name | Fields,
	maybeFields?: Fields,
): EntityDef<Name, Fields> | EntityDef<string, Fields> {
	// Overload 1: entity({ fields }) - no name
	if (typeof nameOrFields === "object" && maybeFields === undefined) {
		const fields = nameOrFields as Fields;
		return createEntityDef(undefined, fields);
	}

	// Overload 2: entity('Name', { fields }) - with name
	const name = nameOrFields as Name;
	const fields = maybeFields as Fields;
	return createEntityDef(name, fields);
}

function createEntityDef<Name extends string, Fields extends EntityDefinition>(
	name: Name | undefined,
	fields: Fields,
): EntityDef<Name, Fields> {
	return {
		[ENTITY_SYMBOL]: true,
		_name: name,
		fields,
		// StandardEntity protocol - runtime marker for type-safe Reify operations
		// The `type` property is phantom (only exists at type level)
		"~entity": {
			name: name as Name,
			type: undefined as unknown, // Phantom type - not used at runtime
		},
	} as EntityDef<Name, Fields>;
}

/** Simplified alias for defineEntity */
export const entity: typeof defineEntity = defineEntity;

/** Check if value is an EntityDef */
export function isEntityDef(value: unknown): value is EntityDef<string, EntityDefinition> {
	return typeof value === "object" && value !== null && ENTITY_SYMBOL in value;
}

// =============================================================================
// Schema Creation from Entity Definitions
// =============================================================================

/** Schema definition using EntityDef or plain EntityDefinition */
type SchemaInput = Record<string, EntityDefinition>;

/**
 * Create a typed schema from entity definitions.
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   User: User.fields,
 *   Post: Post.fields,
 * });
 * ```
 */
export function createSchema<S extends SchemaInput>(definition: S): Schema<S> {
	return new Schema(definition);
}
