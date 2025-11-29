/**
 * @sylphx/lens-core - Field Resolvers
 *
 * Type-safe field resolution for entities.
 * Define how each field is resolved with full type inference.
 *
 * @example
 * ```typescript
 * import { entity, resolver, t } from '@sylphx/lens-core';
 *
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   avatarKey: t.string(),  // internal field
 * });
 *
 * const Post = entity('Post', {
 *   id: t.id(),
 *   title: t.string(),
 *   authorId: t.string(),
 * });
 *
 * // Define field resolution
 * const [resolveUser, resolvePost] = [
 *   resolver(User, (f) => ({
 *     id: f.expose('id'),
 *     name: f.expose('name'),
 *     // avatarKey not exposed = private field
 *     avatar: f.string().resolve((user, ctx) =>
 *       ctx.cdn.getAvatar(user.avatarKey)
 *     ),
 *     posts: f.many(Post).resolve((user, ctx) =>
 *       ctx.loaders.post.loadByAuthorId(user.id)
 *     ),
 *   })),
 *
 *   resolver(Post, (f) => ({
 *     id: f.expose('id'),
 *     title: f.expose('title'),
 *     // authorId not exposed = internal FK
 *     author: f.one(User).resolve((post, ctx) =>
 *       ctx.loaders.user.load(post.authorId)
 *     ),
 *   })),
 * ];
 * ```
 */

import type { EntityDef } from "../schema/define";
import type { InferScalar } from "../schema/infer";
import type { EntityDefinition, FieldType } from "../schema/types";

// =============================================================================
// Context Type (passed to resolvers)
// =============================================================================

/** Base context type for field resolvers - extend this for your app */
export type FieldResolverContext = Record<string, unknown>;

// =============================================================================
// Resolver Function Types
// =============================================================================

/** Resolver function signature */
export type FieldResolverFn<TParent, TContext, TResult> = (
	parent: TParent,
	ctx: TContext,
) => TResult | Promise<TResult>;

// =============================================================================
// Field Definition Types
// =============================================================================

/** Exposed field - directly uses parent value */
export interface ExposedField<T = unknown> {
	readonly _kind: "exposed";
	readonly _fieldName: string;
	readonly _type: T;
}

/** Resolved field - uses resolver function */
export interface ResolvedField<T = unknown, TContext = FieldResolverContext> {
	readonly _kind: "resolved";
	readonly _returnType: T;
	readonly _resolver: FieldResolverFn<unknown, TContext, T>;
}

/** Field definition (exposed or resolved) */
export type FieldDef<T = unknown, TContext = FieldResolverContext> =
	| ExposedField<T>
	| ResolvedField<T, TContext>;

// =============================================================================
// Field Builder Types
// =============================================================================

/** Scalar field builder with resolve method */
export interface ScalarFieldBuilder<T, TParent, TContext> {
	/** Define how to resolve this field */
	resolve(fn: FieldResolverFn<TParent, TContext, T>): ResolvedField<T, TContext>;

	/** Make the field nullable */
	nullable(): ScalarFieldBuilder<T | null, TParent, TContext>;
}

/** Relation field builder with resolve method */
export interface RelationFieldBuilder<T, TParent, TContext> {
	/** Define how to resolve this relation */
	resolve(fn: FieldResolverFn<TParent, TContext, T>): ResolvedField<T, TContext>;

	/** Make the relation nullable */
	nullable(): RelationFieldBuilder<T | null, TParent, TContext>;
}

/** Infer parent type from entity fields */
type InferParent<E extends EntityDefinition> = {
	[K in keyof E]: E[K] extends FieldType ? InferScalar<E[K]> : never;
};

/** Field builder for an entity */
export interface FieldBuilder<
	TEntity extends EntityDef<string, EntityDefinition>,
	TContext = FieldResolverContext,
> {
	/**
	 * Expose a field from the parent entity directly.
	 * The field must exist in the entity definition.
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (f) => ({
	 *   id: f.expose('id'),     // expose parent.id
	 *   name: f.expose('name'), // expose parent.name
	 * }));
	 * ```
	 */
	expose<K extends keyof TEntity["fields"] & string>(
		fieldName: K,
	): ExposedField<InferScalar<TEntity["fields"][K]>>;

	// Scalar type builders

	/** String field */
	string(): ScalarFieldBuilder<string, InferParent<TEntity["fields"]>, TContext>;

	/** Integer field */
	int(): ScalarFieldBuilder<number, InferParent<TEntity["fields"]>, TContext>;

	/** Float field */
	float(): ScalarFieldBuilder<number, InferParent<TEntity["fields"]>, TContext>;

	/** Boolean field */
	boolean(): ScalarFieldBuilder<boolean, InferParent<TEntity["fields"]>, TContext>;

	/** DateTime field */
	datetime(): ScalarFieldBuilder<Date, InferParent<TEntity["fields"]>, TContext>;

	/** Date field */
	date(): ScalarFieldBuilder<Date, InferParent<TEntity["fields"]>, TContext>;

	// Relation type builders

	/**
	 * One-to-one or many-to-one relation (returns single entity)
	 *
	 * @example
	 * ```typescript
	 * resolver(Post, (f) => ({
	 *   author: f.one(User).resolve((post, ctx) =>
	 *     ctx.loaders.user.load(post.authorId)
	 *   ),
	 * }));
	 * ```
	 */
	one<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): RelationFieldBuilder<InferParent<Target["fields"]>, InferParent<TEntity["fields"]>, TContext>;

	/**
	 * One-to-many relation (returns array of entities)
	 *
	 * @example
	 * ```typescript
	 * resolver(User, (f) => ({
	 *   posts: f.many(Post).resolve((user, ctx) =>
	 *     ctx.loaders.post.loadByAuthorId(user.id)
	 *   ),
	 * }));
	 * ```
	 */
	many<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): RelationFieldBuilder<
		InferParent<Target["fields"]>[],
		InferParent<TEntity["fields"]>,
		TContext
	>;
}

// =============================================================================
// Resolver Definition
// =============================================================================

/** Resolver fields definition */
export type ResolverFields<TContext = FieldResolverContext> = Record<
	string,
	FieldDef<unknown, TContext>
>;

/** Resolver definition for an entity */
export interface ResolverDef<
	TEntity extends EntityDef<string, EntityDefinition> = EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any>> = Record<string, FieldDef<any, any>>,
	TContext = FieldResolverContext,
> {
	/** The entity this resolver is for */
	readonly entity: TEntity;

	/** Field definitions */
	readonly fields: TFields;

	/** Get field names */
	getFieldNames(): (keyof TFields)[];

	/** Check if field exists */
	hasField(name: string): boolean;

	/** Check if field is exposed (vs resolved) */
	isExposed(name: string): boolean;

	/** Resolve a single field */
	resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		ctx: TContext,
	): Promise<unknown>;

	/** Resolve all fields for a parent */
	resolveAll(
		parent: InferParent<TEntity["fields"]>,
		ctx: TContext,
		select?: string[],
	): Promise<Record<string, unknown>>;
}

// =============================================================================
// Implementation
// =============================================================================

/** Create a scalar field builder */
function createScalarFieldBuilder<T, TParent, TContext>(): ScalarFieldBuilder<
	T,
	TParent,
	TContext
> {
	return {
		resolve(fn: FieldResolverFn<TParent, TContext, T>): ResolvedField<T, TContext> {
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_resolver: fn as FieldResolverFn<unknown, TContext, T>,
			};
		},
		nullable(): ScalarFieldBuilder<T | null, TParent, TContext> {
			return createScalarFieldBuilder<T | null, TParent, TContext>();
		},
	};
}

/** Create a relation field builder */
function createRelationFieldBuilder<T, TParent, TContext>(): RelationFieldBuilder<
	T,
	TParent,
	TContext
> {
	return {
		resolve(fn: FieldResolverFn<TParent, TContext, T>): ResolvedField<T, TContext> {
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_resolver: fn as FieldResolverFn<unknown, TContext, T>,
			};
		},
		nullable(): RelationFieldBuilder<T | null, TParent, TContext> {
			return createRelationFieldBuilder<T | null, TParent, TContext>();
		},
	};
}

/** Create a field builder for an entity */
function createFieldBuilder<
	TEntity extends EntityDef<string, EntityDefinition>,
	TContext = FieldResolverContext,
>(): FieldBuilder<TEntity, TContext> {
	type Parent = InferParent<TEntity["fields"]>;

	return {
		expose<K extends keyof TEntity["fields"] & string>(
			fieldName: K,
		): ExposedField<InferScalar<TEntity["fields"][K]>> {
			return {
				_kind: "exposed",
				_fieldName: fieldName,
				_type: undefined as InferScalar<TEntity["fields"][K]>,
			};
		},

		string(): ScalarFieldBuilder<string, Parent, TContext> {
			return createScalarFieldBuilder<string, Parent, TContext>();
		},

		int(): ScalarFieldBuilder<number, Parent, TContext> {
			return createScalarFieldBuilder<number, Parent, TContext>();
		},

		float(): ScalarFieldBuilder<number, Parent, TContext> {
			return createScalarFieldBuilder<number, Parent, TContext>();
		},

		boolean(): ScalarFieldBuilder<boolean, Parent, TContext> {
			return createScalarFieldBuilder<boolean, Parent, TContext>();
		},

		datetime(): ScalarFieldBuilder<Date, Parent, TContext> {
			return createScalarFieldBuilder<Date, Parent, TContext>();
		},

		date(): ScalarFieldBuilder<Date, Parent, TContext> {
			return createScalarFieldBuilder<Date, Parent, TContext>();
		},

		one<Target extends EntityDef<string, EntityDefinition>>(
			_target: Target,
		): RelationFieldBuilder<InferParent<Target["fields"]>, Parent, TContext> {
			return createRelationFieldBuilder<InferParent<Target["fields"]>, Parent, TContext>();
		},

		many<Target extends EntityDef<string, EntityDefinition>>(
			_target: Target,
		): RelationFieldBuilder<InferParent<Target["fields"]>[], Parent, TContext> {
			return createRelationFieldBuilder<InferParent<Target["fields"]>[], Parent, TContext>();
		},
	};
}

/** Resolver definition implementation */
class ResolverDefImpl<
	TEntity extends EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any>>,
	TContext = FieldResolverContext,
> implements ResolverDef<TEntity, TFields, TContext>
{
	constructor(
		public readonly entity: TEntity,
		public readonly fields: TFields,
	) {}

	getFieldNames(): (keyof TFields)[] {
		return Object.keys(this.fields) as (keyof TFields)[];
	}

	hasField(name: string): boolean {
		return name in this.fields;
	}

	isExposed(name: string): boolean {
		const field = this.fields[name];
		return field?._kind === "exposed";
	}

	async resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		ctx: TContext,
	): Promise<unknown> {
		const field = this.fields[name];
		if (!field) {
			throw new Error(`Field "${String(name)}" not found in resolver`);
		}

		if (field._kind === "exposed") {
			const exposedField = field as ExposedField;
			return (parent as Record<string, unknown>)[exposedField._fieldName];
		}

		const resolvedField = field as ResolvedField<unknown, TContext>;
		return resolvedField._resolver(parent, ctx);
	}

	async resolveAll(
		parent: InferParent<TEntity["fields"]>,
		ctx: TContext,
		select?: string[],
	): Promise<Record<string, unknown>> {
		const fieldsToResolve = select ?? this.getFieldNames().map(String);
		const result: Record<string, unknown> = {};

		await Promise.all(
			fieldsToResolve.map(async (fieldName) => {
				if (this.hasField(fieldName)) {
					result[fieldName] = await this.resolveField(fieldName as keyof TFields, parent, ctx);
				}
			}),
		);

		return result;
	}
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Define field resolvers for an entity.
 *
 * This defines how each field in the public API is resolved:
 * - `f.expose('fieldName')` - expose parent field directly
 * - `f.string().resolve(...)` - computed scalar field
 * - `f.one(Entity).resolve(...)` - single relation
 * - `f.many(Entity).resolve(...)` - array relation
 *
 * @param entity - The entity to define resolvers for
 * @param builder - Builder function that defines field resolution
 * @returns Resolver definition
 *
 * @example
 * ```typescript
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   avatarKey: t.string(),
 * });
 *
 * const userResolver = resolver(User, (f) => ({
 *   id: f.expose('id'),
 *   name: f.expose('name'),
 *   // avatarKey not exposed = private
 *   avatar: f.string().resolve((user, ctx) =>
 *     ctx.cdn.getAvatar(user.avatarKey)
 *   ),
 *   posts: f.many(Post).resolve((user, ctx) =>
 *     ctx.loaders.post.loadByAuthorId(user.id)
 *   ),
 * }));
 * ```
 */
export function resolver<
	TEntity extends EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any>>,
	TContext = FieldResolverContext,
>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, TContext>) => TFields,
): ResolverDef<TEntity, TFields, TContext> {
	const fieldBuilder = createFieldBuilder<TEntity, TContext>();
	const fields = builder(fieldBuilder);
	return new ResolverDefImpl(entity, fields);
}

// =============================================================================
// Type Inference Helpers
// =============================================================================

/** Infer the resolved type from a resolver definition */
export type InferResolverOutput<R extends ResolverDef> = {
	[K in keyof R["fields"]]: R["fields"][K] extends ExposedField<infer T>
		? T
		: R["fields"][K] extends ResolvedField<infer T>
			? T
			: never;
};

/** Infer selected fields from resolver */
export type InferResolverSelected<
	R extends ResolverDef,
	Select extends (keyof R["fields"])[] | undefined,
> = Select extends (keyof R["fields"])[]
	? Pick<InferResolverOutput<R>, Select[number]>
	: InferResolverOutput<R>;

// =============================================================================
// Resolver Registry
// =============================================================================

/** Registry of resolvers by entity name */
export interface ResolverRegistry<TContext = FieldResolverContext> {
	/** All registered resolvers */
	readonly resolvers: Map<
		string,
		ResolverDef<EntityDef<string, EntityDefinition>, Record<string, FieldDef<any, any>>, TContext>
	>;

	/** Register a resolver */
	register<TEntity extends EntityDef<string, EntityDefinition>>(
		resolver: ResolverDef<TEntity, Record<string, FieldDef<any, any>>, TContext>,
	): void;

	/** Get resolver for an entity */
	get(
		entityName: string,
	):
		| ResolverDef<EntityDef<string, EntityDefinition>, Record<string, FieldDef<any, any>>, TContext>
		| undefined;

	/** Check if resolver exists for entity */
	has(entityName: string): boolean;
}

/**
 * Create a resolver registry for collecting entity resolvers.
 *
 * @example
 * ```typescript
 * const registry = createResolverRegistry();
 *
 * registry.register(resolver(User, (f) => ({ ... })));
 * registry.register(resolver(Post, (f) => ({ ... })));
 *
 * // Use in execution engine
 * const userResolver = registry.get('User');
 * ```
 */
export function createResolverRegistry<
	TContext = FieldResolverContext,
>(): ResolverRegistry<TContext> {
	const resolvers = new Map<
		string,
		ResolverDef<EntityDef<string, EntityDefinition>, Record<string, FieldDef<any, any>>, TContext>
	>();

	return {
		resolvers,

		register<TEntity extends EntityDef<string, EntityDefinition>>(
			resolverDef: ResolverDef<TEntity, Record<string, FieldDef<any, any>>, TContext>,
		): void {
			const entityName = resolverDef.entity._name;
			if (!entityName) {
				throw new Error("Entity must have a name to register resolver");
			}
			resolvers.set(
				entityName,
				resolverDef as ResolverDef<
					EntityDef<string, EntityDefinition>,
					Record<string, FieldDef<any, any>>,
					TContext
				>,
			);
		},

		get(entityName: string) {
			return resolvers.get(entityName);
		},

		has(entityName: string): boolean {
			return resolvers.has(entityName);
		},
	};
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if field is exposed */
export function isExposedField(field: FieldDef): field is ExposedField {
	return field._kind === "exposed";
}

/** Check if field is resolved */
export function isResolvedField<TContext = FieldResolverContext>(
	field: FieldDef<unknown, TContext>,
): field is ResolvedField<unknown, TContext> {
	return field._kind === "resolved";
}

/** Check if value is a resolver definition */
export function isResolverDef(value: unknown): value is ResolverDef {
	return (
		typeof value === "object" &&
		value !== null &&
		"entity" in value &&
		"fields" in value &&
		"resolveField" in value
	);
}
