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
 *     avatar: f.string().resolve(({ parent, ctx }) =>
 *       ctx.cdn.getAvatar(parent.avatarKey)
 *     ),
 *     posts: f.many(Post).resolve(({ parent, ctx }) =>
 *       ctx.loaders.post.loadByAuthorId(parent.id)
 *     ),
 *   })),
 *
 *   resolver(Post, (f) => ({
 *     id: f.expose('id'),
 *     title: f.expose('title'),
 *     // authorId not exposed = internal FK
 *     author: f.one(User).resolve(({ parent, ctx }) =>
 *       ctx.loaders.user.load(parent.authorId)
 *     ),
 *   })),
 * ];
 * ```
 */

import type { z } from "zod";
import type { EntityDef } from "../schema/define.js";
import type { InferScalar } from "../schema/infer.js";
import type { EntityDefinition } from "../schema/types.js";
import type {
	ExposedField,
	FieldBuilder,
	FieldDef,
	FieldResolverContext,
	FieldResolverFn,
	FieldResolverFnNoArgs,
	InferParent,
	RelationFieldBuilder,
	RelationFieldBuilderWithArgs,
	ResolvedField,
	ResolverDef,
	Resolvers,
	ScalarFieldBuilder,
	ScalarFieldBuilderWithArgs,
} from "./resolver-types.js";

// Re-export types for external use
export type {
	ExposedField,
	FieldBuilder,
	FieldDef,
	FieldResolverContext,
	FieldResolverFn,
	FieldResolverFnNoArgs,
	FieldResolverParams,
	InferParent,
	InferResolverOutput,
	InferResolverSelected,
	RelationFieldBuilder,
	RelationFieldBuilderWithArgs,
	ResolvedField,
	ResolverDef,
	ResolverFields,
	Resolvers,
	ScalarFieldBuilder,
	ScalarFieldBuilderWithArgs,
} from "./resolver-types.js";

// =============================================================================
// Implementation
// =============================================================================

/** Create a scalar field builder with args */
function createScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext>(
	argsSchema: z.ZodType<TArgs>,
): ScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	return {
		resolve(fn: FieldResolverFn<TParent, TArgs, TContext, T>): ResolvedField<T, TArgs, TContext> {
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: fn as (params: {
					parent: unknown;
					args: TArgs;
					ctx: TContext;
				}) => T | Promise<T>,
			};
		},
		nullable(): ScalarFieldBuilderWithArgs<T | null, TParent, TArgs, TContext> {
			return createScalarFieldBuilderWithArgs<T | null, TParent, TArgs, TContext>(argsSchema);
		},
	};
}

/** Create a scalar field builder */
function createScalarFieldBuilder<T, TParent, TContext>(): ScalarFieldBuilder<
	T,
	TParent,
	TContext
> {
	return {
		args<TArgs extends z.ZodRawShape>(
			schema: z.ZodObject<TArgs>,
		): ScalarFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext> {
			return createScalarFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>(
				schema,
			);
		},
		resolve(
			fn: FieldResolverFnNoArgs<TParent, TContext, T>,
		): ResolvedField<T, Record<string, never>, TContext> {
			// Wrap the no-args function to include empty args
			const wrappedFn = ({
				parent,
				ctx,
			}: {
				parent: unknown;
				args: Record<string, never>;
				ctx: TContext;
			}) => fn({ parent: parent as TParent, ctx });
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_argsSchema: null,
				_resolver: wrappedFn,
			};
		},
		nullable(): ScalarFieldBuilder<T | null, TParent, TContext> {
			return createScalarFieldBuilder<T | null, TParent, TContext>();
		},
	};
}

/** Create a relation field builder with args */
function createRelationFieldBuilderWithArgs<T, TParent, TArgs, TContext>(
	argsSchema: z.ZodType<TArgs>,
): RelationFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	return {
		resolve(fn: FieldResolverFn<TParent, TArgs, TContext, T>): ResolvedField<T, TArgs, TContext> {
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: fn as (params: {
					parent: unknown;
					args: TArgs;
					ctx: TContext;
				}) => T | Promise<T>,
			};
		},
		nullable(): RelationFieldBuilderWithArgs<T | null, TParent, TArgs, TContext> {
			return createRelationFieldBuilderWithArgs<T | null, TParent, TArgs, TContext>(argsSchema);
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
		args<TArgs extends z.ZodRawShape>(
			schema: z.ZodObject<TArgs>,
		): RelationFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext> {
			return createRelationFieldBuilderWithArgs<T, TParent, z.infer<z.ZodObject<TArgs>>, TContext>(
				schema,
			);
		},
		resolve(
			fn: FieldResolverFnNoArgs<TParent, TContext, T>,
		): ResolvedField<T, Record<string, never>, TContext> {
			// Wrap the no-args function to include empty args
			const wrappedFn = ({
				parent,
				ctx,
			}: {
				parent: unknown;
				args: Record<string, never>;
				ctx: TContext;
			}) => fn({ parent: parent as TParent, ctx });
			return {
				_kind: "resolved",
				_returnType: undefined as T,
				_argsSchema: null,
				_resolver: wrappedFn,
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
	TFields extends Record<string, FieldDef<any, any, any>>,
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

	getArgsSchema(name: string): z.ZodType | null {
		const field = this.fields[name];
		if (!field || field._kind === "exposed") {
			return null;
		}
		const resolvedField = field as ResolvedField<unknown, unknown, TContext>;
		return resolvedField._argsSchema ?? null;
	}

	async resolveField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
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

		const resolvedField = field as ResolvedField<unknown, unknown, TContext>;

		// Parse and validate args if schema exists
		let parsedArgs: Record<string, unknown> = args;
		if (resolvedField._argsSchema) {
			parsedArgs = resolvedField._argsSchema.parse(args) as Record<string, unknown>;
		}

		return resolvedField._resolver({ parent, args: parsedArgs, ctx });
	}

	async resolveAll(
		parent: InferParent<TEntity["fields"]>,
		ctx: TContext,
		select?: Array<{ name: string; args?: Record<string, unknown> }> | string[],
	): Promise<Record<string, unknown>> {
		// Normalize select to array of { name, args }
		const fieldsToResolve: Array<{ name: string; args?: Record<string, unknown> }> =
			select === undefined
				? this.getFieldNames().map((name) => ({ name: String(name) }))
				: Array.isArray(select) && typeof select[0] === "string"
					? (select as string[]).map((name) => ({ name }))
					: (select as Array<{ name: string; args?: Record<string, unknown> }>);

		const result: Record<string, unknown> = {};

		await Promise.all(
			fieldsToResolve.map(async ({ name, args }) => {
				if (this.hasField(name)) {
					result[name] = await this.resolveField(name as keyof TFields, parent, args ?? {}, ctx);
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
 * Two usage patterns:
 * 1. Direct call (default context): `resolver(User, (f) => ({ ... }))`
 * 2. With custom context: `resolver<{ db: DB }>()(User, (f) => ({ ... }))`
 *
 * @example
 * ```typescript
 * // Default context
 * const userResolver = resolver(User, (f) => ({
 *   id: f.expose('id'),
 *   name: f.expose('name'),
 * }));
 *
 * // Custom context (like mutation<{db: DB}>())
 * const userResolver = resolver<{ db: DB }>()(User, (f) => ({
 *   id: f.expose('id'),
 *   posts: f.many(Post).resolve(({ parent, args, ctx }) => ctx.db.posts...),
 * }));
 * ```
 */
export function resolver<TContext = FieldResolverContext>(): <
	TEntity extends EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any, TContext>>,
>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, TContext>) => TFields,
) => ResolverDef<TEntity, TFields, TContext>;

export function resolver<
	TEntity extends EntityDef<string, EntityDefinition>,
	TFields extends Record<string, FieldDef<any, any, FieldResolverContext>>,
>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, FieldResolverContext>) => TFields,
): ResolverDef<TEntity, TFields, FieldResolverContext>;

export function resolver<TContext = FieldResolverContext>(
	entityOrNothing?: EntityDef<string, EntityDefinition>,
	builder?: (f: FieldBuilder<any, TContext>) => Record<string, FieldDef<any, any, any>>,
):
	| ResolverDef<any, Record<string, FieldDef<any, any, any>>, TContext>
	| (<TEntity extends EntityDef<string, EntityDefinition>>(
			entity: TEntity,
			builder: (f: FieldBuilder<TEntity, TContext>) => Record<string, FieldDef<any, any, any>>,
	  ) => ResolverDef<TEntity, Record<string, FieldDef<any, any, any>>, TContext>) {
	// Curried call: resolver<Context>()
	if (entityOrNothing === undefined) {
		return <TEntity extends EntityDef<string, EntityDefinition>>(
			entity: TEntity,
			builderFn: (f: FieldBuilder<TEntity, TContext>) => Record<string, FieldDef<any, any>>,
		): ResolverDef<TEntity, Record<string, FieldDef<any, any>>, TContext> => {
			const fieldBuilder = createFieldBuilder<TEntity, TContext>();
			const fields = builderFn(fieldBuilder);
			return new ResolverDefImpl(entity, fields);
		};
	}

	// Direct call: resolver(Entity, builder)
	const fieldBuilder = createFieldBuilder<any, TContext>();
	const fields = builder!(fieldBuilder);
	return new ResolverDefImpl(entityOrNothing, fields);
}

// =============================================================================
// Resolvers Array Helper
// =============================================================================

/**
 * Convert resolver array to lookup map.
 *
 * @example
 * ```typescript
 * const resolverMap = toResolverMap([userResolver, postResolver]);
 * const userDef = resolverMap.get("User");
 * ```
 */
export function toResolverMap(resolvers: Resolvers): Map<string, ResolverDef<any, any, any>> {
	const map = new Map<string, ResolverDef<any, any, any>>();
	for (const resolver of resolvers) {
		const entityName = resolver.entity._name;
		if (!entityName) {
			throw new Error("Resolver entity must have a name");
		}
		map.set(entityName, resolver);
	}
	return map;
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if field is exposed */
export function isExposedField(field: FieldDef<any, any, any>): field is ExposedField<any> {
	return field._kind === "exposed";
}

/** Check if field is resolved */
export function isResolvedField<TContext = FieldResolverContext>(
	field: FieldDef<any, any, TContext>,
): field is ResolvedField<any, any, TContext> {
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
