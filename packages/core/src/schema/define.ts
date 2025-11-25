/**
 * @sylphx/lens-core - Two-Phase Schema Definition
 *
 * Drizzle-style API that allows direct entity references instead of strings.
 * This eliminates string-based relation targets and provides full type safety.
 *
 * @example
 * ```typescript
 * import { entity, createSchema, hasMany, belongsTo, t } from '@sylphx/lens-core';
 *
 * // Step 1: Define entities (without relations)
 * const User = defineEntity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 * });
 *
 * const Post = defineEntity('Post', {
 *   id: t.id(),
 *   title: t.string(),
 *   content: t.string(),
 * });
 *
 * // Step 2: Create schema with type-safe relations
 * const schema = createSchema({
 *   User: User.with({
 *     posts: hasMany(Post),  // Direct reference!
 *   }),
 *   Post: Post.with({
 *     author: belongsTo(User),  // Direct reference!
 *   }),
 * });
 * ```
 */

import { Schema } from "./create";
import type { EntityDefinition } from "./types";
import { BelongsToType, HasManyType, HasOneType } from "./types";

// =============================================================================
// Field Accessor Helper (Proxy-based field extraction)
// =============================================================================

/**
 * Extract field name from accessor function using Proxy.
 * Used for type-safe relation definitions.
 *
 * @example
 * extractFieldName((e) => e.authorId) // Returns "authorId"
 */
function extractFieldName<T>(accessor: (entity: T) => unknown): string {
	let fieldName: string | undefined;
	const proxy = new Proxy(
		{},
		{
			get(_, key) {
				fieldName = String(key);
				return fieldName;
			},
		},
	);
	accessor(proxy as T);
	if (!fieldName) {
		throw new Error("Field accessor must access a property (e.g., e => e.authorId)");
	}
	return fieldName;
}

// =============================================================================
// Entity Definition Builder
// =============================================================================

/** Symbol to identify entity definitions */
const ENTITY_SYMBOL = Symbol("lens:entity");

/** Entity definition with name and fields */
export interface EntityDef<
	Name extends string = string,
	Fields extends EntityDefinition = EntityDefinition,
> {
	[ENTITY_SYMBOL]: true;
	/** Entity name (injected from export key if not provided) */
	_name?: Name;
	/** Entity fields (without relations) */
	readonly fields: Fields;
	/** Combine with additional fields (relations) */
	with<R extends EntityDefinition>(relations: R): Fields & R;
	/** Create hasOne relation to this entity */
	hasOne<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasOneType<Target["_name"] & string>;
	/** Create hasMany relation to this entity */
	hasMany<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasManyType<Target["_name"] & string>;
	/** Create belongsTo relation to this entity */
	belongsTo<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): BelongsToType<Target["_name"] & string>;
}

/**
 * Define an entity with its scalar fields.
 * Relations are added separately using `.with()` method.
 *
 * Name is optional - if not provided, it will be injected from the export key.
 *
 * @example
 * ```typescript
 * // Recommended: name derived from export key
 * const User = entity({
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * // Explicit name (backward compatible)
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * // Export - key becomes the name
 * export const entities = { User, Post };
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
		with<R extends EntityDefinition>(relations: R): Fields & R {
			return { ...this.fields, ...relations } as Fields & R;
		},
		hasOne<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasOneType<Target["_name"] & string> {
			return new HasOneType(target._name ?? "");
		},
		hasMany<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasManyType<Target["_name"] & string> {
			return new HasManyType(target._name ?? "");
		},
		belongsTo<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): BelongsToType<Target["_name"] & string> {
			return new BelongsToType(target._name ?? "");
		},
	} as EntityDef<Name, Fields>;
}

/**
 * Simplified alias for defineEntity.
 * Recommended API for new projects.
 *
 * @example
 * ```typescript
 * // Name derived from export key (recommended)
 * const User = entity({
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * export const entities = { User };  // "User" becomes the entity name
 * ```
 */
export const entity = defineEntity;

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
 *   User: User.with({
 *     posts: hasMany(Post),
 *   }),
 *   Post: Post.with({
 *     author: belongsTo(User),
 *   }),
 * });
 * ```
 */
export function createSchema<S extends SchemaInput>(definition: S): Schema<S> {
	return new Schema(definition);
}

// =============================================================================
// Convenience: Relation Helpers on Entity
// =============================================================================

/** Relation type with foreign key info */
export interface RelationTypeWithForeignKey {
	_type: string;
	target: string;
	foreignKey?: string;
}

/**
 * Create a hasMany relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key (e.g., e => e.authorId)
 *
 * @example
 * ```typescript
 * // Without foreign key (backward compatible)
 * hasMany(Post)
 *
 * // With foreign key (new API)
 * hasMany(Post, e => e.authorId)
 * ```
 */
export function hasMany<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: unknown) => unknown,
): HasManyType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor ? extractFieldName(fieldAccessor) : undefined;
	return new HasManyType(target._name ?? "", foreignKey);
}

/**
 * Create a hasOne relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key
 */
export function hasOne<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: unknown) => unknown,
): HasOneType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor ? extractFieldName(fieldAccessor) : undefined;
	return new HasOneType(target._name ?? "", foreignKey);
}

/**
 * Create a belongsTo relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key
 */
export function belongsTo<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: unknown) => unknown,
): BelongsToType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor ? extractFieldName(fieldAccessor) : undefined;
	return new BelongsToType(target._name ?? "", foreignKey);
}

// =============================================================================
// Relation Definition (Separate from Schema)
// =============================================================================

/** Relation definition for an entity */
export interface RelationDef<
	E extends EntityDef<string, EntityDefinition>,
	R extends Record<string, RelationTypeWithForeignKey>,
> {
	entity: E;
	relations: R;
}

/**
 * Define relations for an entity separately from the entity definition.
 * This allows for a cleaner separation of concerns.
 *
 * @param entity - The entity to define relations for
 * @param relations - Object of relation definitions
 *
 * @example
 * ```typescript
 * const userRelations = relation(User, {
 *   posts: hasMany(Post, e => e.authorId),
 * });
 *
 * const postRelations = relation(Post, {
 *   author: belongsTo(User, e => e.authorId),
 * });
 *
 * // Can be collected as an array
 * const relations = [userRelations, postRelations];
 * ```
 */
export function relation<
	E extends EntityDef<string, EntityDefinition>,
	R extends Record<string, RelationTypeWithForeignKey>,
>(entity: E, relations: R): RelationDef<E, R> {
	return {
		entity,
		relations,
	};
}
