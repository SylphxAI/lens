/**
 * @sylphx/lens-core - Entity Definition
 *
 * Type-safe entity definitions for schema.
 *
 * @example Function-based API (recommended)
 * ```typescript
 * import { entity } from '@sylphx/lens-core';
 *
 * // Define entities with function-based API for lazy relations and inline resolvers
 * const User = entity('User', (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === parent.id)
 *   ),
 * }));
 *
 * const Post = entity('Post', (t) => ({
 *   id: t.id(),
 *   title: t.string(),
 *   author: t.one(() => User).resolve(({ parent, ctx }) =>
 *     ctx.db.users.find(u => u.id === parent.authorId)
 *   ),
 * }));
 * ```
 *
 * @example Object-based API (legacy)
 * ```typescript
 * import { entity, t } from '@sylphx/lens-core';
 *
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 * });
 * // Field resolution defined separately with resolver()
 * ```
 */

import type { EntityMarker } from "@sylphx/standard-entity";
import { Schema } from "./create.js";
import type { InferEntity } from "./infer.js";
import {
	createTypeBuilder,
	type EntityDefinition,
	type TypeBuilder,
	t as typeBuilder,
} from "./types.js";

// =============================================================================
// Entity Definition Builder
// =============================================================================

/** Symbol to identify entity definitions */
const ENTITY_SYMBOL: unique symbol = Symbol("lens:entity");

/**
 * Entity builder function type.
 * Receives `t` type builder and returns field definitions.
 *
 * @example
 * ```typescript
 * const User = entity("User", (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === parent.id)
 *   ),
 * }));
 * ```
 */
export type EntityBuilder<Fields extends EntityDefinition> = (t: typeof typeBuilder) => Fields;

/**
 * Context-aware entity builder function type.
 * Receives a typed `t` builder where resolve/subscribe have typed context.
 *
 * @example
 * ```typescript
 * // With typed context
 * const User = entity<MyContext>()("User", (t) => ({
 *   id: t.id(),
 *   posts: t.many(() => Post).resolve(({ ctx }) => {
 *     // ctx is typed as MyContext!
 *     return ctx.db.posts.findMany();
 *   }),
 * }));
 * ```
 */
export type ContextualEntityBuilder<Fields extends EntityDefinition, TContext> = (
	t: TypeBuilder<TContext>,
) => Fields;

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
 * Define an entity with its fields.
 *
 * Supports two API styles:
 * 1. **Object-based** (legacy): `entity('Name', { id: t.id(), ... })`
 * 2. **Function-based** (new): `entity('Name', (t) => ({ id: t.id(), ... }))`
 *
 * The function-based API is recommended for new code as it:
 * - Enables lazy relations for circular references: `t.many(() => Post)`
 * - Supports inline resolvers: `t.string().resolve(({ parent }) => ...)`
 * - Supports inline subscriptions: `t.json().subscribe(({ emit }) => ...)`
 *
 * @example Object-based (legacy)
 * ```typescript
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 * });
 * ```
 *
 * @example Function-based (recommended)
 * ```typescript
 * const User = entity('User', (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === parent.id)
 *   ),
 * }));
 * ```
 */
// Overload 1: entity({ fields }) - no name, object-based
export function defineEntity<Fields extends EntityDefinition>(
	fields: Fields,
): EntityDef<string, Fields>;
// Overload 2: entity('Name', { fields }) - with name, object-based
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	fields: Fields,
): EntityDef<Name, Fields>;
// Overload 3: entity('Name', (t) => fields) - with name, function-based
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	builder: EntityBuilder<Fields>,
): EntityDef<Name, Fields>;
// Implementation
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	nameOrFields: Name | Fields,
	maybeFieldsOrBuilder?: Fields | EntityBuilder<Fields>,
): EntityDef<Name, Fields> | EntityDef<string, Fields> {
	// Overload 1: entity({ fields }) - no name, object-based
	if (typeof nameOrFields === "object" && maybeFieldsOrBuilder === undefined) {
		const fields = nameOrFields as Fields;
		return createEntityDef(undefined, fields);
	}

	const name = nameOrFields as Name;

	// Builder pattern: entity<TContext>('Name') returns EntityBuilder_
	// This is used when type parameter is provided for typed context
	if (maybeFieldsOrBuilder === undefined) {
		return new EntityBuilder_(name) as unknown as EntityDef<Name, Fields>;
	}

	// Overload 3: entity('Name', (t) => fields) - function-based
	if (typeof maybeFieldsOrBuilder === "function") {
		const builder = maybeFieldsOrBuilder as EntityBuilder<Fields>;
		const fields = builder(typeBuilder);
		return createEntityDef(name, fields);
	}

	// Overload 2: entity('Name', { fields }) - object-based
	const fields = maybeFieldsOrBuilder as Fields;
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

/**
 * Simplified alias for defineEntity.
 *
 * @deprecated Use `model()` instead for a cleaner API:
 * ```typescript
 * // Old (deprecated)
 * const User = entity<AppContext>("User").define((t) => ({ ... }));
 *
 * // New (recommended)
 * const User = model<AppContext>("User", (t) => ({ ... }));
 * ```
 */
export const entity: typeof defineEntity & {
	/**
	 * Create an entity with typed context using builder pattern.
	 *
	 * @deprecated Use `model<Context>("Name", (t) => ...)` instead
	 *
	 * @example
	 * ```typescript
	 * // Old (deprecated)
	 * const User = entity<MyContext>('User').define((t) => ({
	 *   id: t.id(),
	 *   posts: t.many(() => Post).resolve(({ ctx }) => {
	 *     // ctx is typed as MyContext!
	 *     return ctx.db.posts.findMany();
	 *   }),
	 * }));
	 *
	 * // New (recommended)
	 * const User = model<MyContext>("User", (t) => ({
	 *   id: t.id(),
	 *   posts: t.many(() => Post).resolve(({ ctx }) => ctx.db.posts.findMany()),
	 * }));
	 * ```
	 */
	<TContext>(name: string): EntityBuilder_<TContext>;
} = Object.assign(defineEntity, <TContext>(name: string) => new EntityBuilder_<TContext>(name));

// =============================================================================
// Entity Builder (Typed Context)
// =============================================================================

/**
 * Builder for creating entities with typed context.
 * Use `entity<Context>('Name').define((t) => ...)` for typed resolvers.
 */
export class EntityBuilder_<TContext, Name extends string = string> {
	constructor(private readonly _name: Name) {}

	/**
	 * Define entity fields with typed context.
	 * The `t` builder provides typed context to resolve/subscribe methods.
	 */
	define<Fields extends EntityDefinition>(
		builder: ContextualEntityBuilder<Fields, TContext>,
	): EntityDef<Name, Fields> {
		const contextualBuilder = createTypeBuilder<TContext>();
		const fields = builder(contextualBuilder);
		return createEntityDef(this._name, fields);
	}
}

// =============================================================================
// Context-Aware Entity Factory (Curried API) - Legacy
// =============================================================================

/**
 * Result of curried entity factory - a function that creates entities with typed context.
 * The `t` builder's resolve/subscribe methods will have TContext typed.
 *
 * @deprecated Use `entity<TContext>('Name').define((t) => ...)` instead
 */
export type TypedEntityFactory<TContext> = <Name extends string, Fields extends EntityDefinition>(
	name: Name,
	builder: ContextualEntityBuilder<Fields, TContext>,
) => EntityDef<Name, Fields>;

/**
 * Create a typed entity factory with context type.
 * This is the curried form of entity() that provides typed context to resolvers.
 *
 * @deprecated Use `entity<TContext>('Name').define((t) => ...)` instead
 *
 * Use this when you want typed context in your resolve/subscribe functions
 * without having to specify the context type on every field.
 *
 * @example
 * ```typescript
 * interface MyContext {
 *   db: Database;
 *   user: User;
 * }
 *
 * // Option 1: Curried factory (recommended for multiple entities)
 * const typedEntity = entity<MyContext>();
 *
 * const User = typedEntity("User", (t) => ({
 *   id: t.id(),
 *   posts: t.many(() => Post).resolve(({ ctx }) => {
 *     // ctx is typed as MyContext!
 *     return ctx.db.posts.findMany();
 *   }),
 * }));
 *
 * // Option 2: Inline curried (for single entity)
 * const Post = entity<MyContext>()("Post", (t) => ({
 *   id: t.id(),
 *   author: t.one(() => User).resolve(({ ctx }) => {
 *     // ctx is typed as MyContext!
 *     return ctx.db.users.findById(ctx.user.id);
 *   }),
 * }));
 * ```
 */
export function typedEntity<TContext>(): TypedEntityFactory<TContext> {
	return <Name extends string, Fields extends EntityDefinition>(
		name: Name,
		builder: ContextualEntityBuilder<Fields, TContext>,
	): EntityDef<Name, Fields> => {
		const contextualBuilder = createTypeBuilder<TContext>();
		const fields = builder(contextualBuilder);
		return createEntityDef(name, fields);
	};
}

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
