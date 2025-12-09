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
	FieldLiveContext,
	FieldQueryContext,
	FieldResolveFn,
	FieldResolveFnNoArgs,
	FieldResolverContext,
	FieldSubscribeFn,
	FieldSubscribeFnNoArgs,
	InferParent,
	LiveField,
	Publisher,
	RelationFieldBuilder,
	RelationFieldBuilderWithArgs,
	ResolvedField,
	ResolvedFieldChainable,
	ResolverDef,
	Resolvers,
	ScalarFieldBuilder,
	ScalarFieldBuilderWithArgs,
	SubscribedField,
} from "./resolver-types.js";

// Re-export types for external use
export type {
	ExposedField,
	FieldBuilder,
	FieldDef,
	FieldEmit,
	/** @deprecated Use FieldQueryContext or FieldSubscriptionContext */
	FieldLiveContext,
	FieldQueryContext,
	FieldResolveFn,
	FieldResolveFnNoArgs,
	FieldResolveParams,
	FieldResolverContext,
	/** @deprecated Use FieldResolveFn or FieldSubscribeFn */
	FieldResolverFn,
	/** @deprecated Use FieldResolveFnNoArgs or FieldSubscribeFnNoArgs */
	FieldResolverFnNoArgs,
	/** @deprecated Use FieldResolveParams or FieldSubscribeParams */
	FieldResolverParams,
	FieldSubscribeFn,
	FieldSubscribeFnNoArgs,
	FieldSubscribeParams,
	/** @deprecated Use Publisher pattern */
	FieldSubscriptionContext,
	InferParent,
	InferResolverOutput,
	InferResolverSelected,
	LiveField,
	OnCleanup,
	Publisher,
	RelationFieldBuilder,
	RelationFieldBuilderWithArgs,
	ResolvedField,
	ResolvedFieldChainable,
	ResolverDef,
	ResolverFields,
	Resolvers,
	ScalarFieldBuilder,
	ScalarFieldBuilderWithArgs,
	SubscribedField,
	SubscriptionCallbacks,
} from "./resolver-types.js";

// Re-export value (helper function)
export { publisher } from "./resolver-types.js";

// =============================================================================
// Implementation
// =============================================================================

/** Create a scalar field builder with args */
function createScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext>(
	argsSchema: z.ZodType<TArgs>,
): ScalarFieldBuilderWithArgs<T, TParent, TArgs, TContext> {
	return {
		resolve(
			fn: FieldResolveFn<TParent, TArgs, TContext, T>,
		): ResolvedFieldChainable<T, TArgs, TParent, TContext> {
			const resolver = fn as (params: {
				parent: unknown;
				args: TArgs;
				ctx: FieldQueryContext<TContext>;
			}) => T | Promise<T>;

			// Return ResolvedField with chainable .subscribe()
			const resolvedField: ResolvedFieldChainable<T, TArgs, TParent, TContext> = {
				_kind: "resolved",
				_mode: "resolve",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: resolver,
				// Chainable subscribe - creates LiveField with Publisher pattern
				subscribe(
					subscribeFn: FieldSubscribeFn<TParent, TArgs, TContext, T>,
				): LiveField<T, TArgs, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as T,
						_argsSchema: argsSchema,
						_resolver: resolver,
						_subscriber: subscribeFn as (params: {
							parent: unknown;
							args: TArgs;
							ctx: TContext;
						}) => Publisher<T>,
					};
				},
			};
			return resolvedField;
		},
		subscribe(
			fn: FieldSubscribeFn<TParent, TArgs, TContext, T>,
		): SubscribedField<T, TArgs, TContext> {
			return {
				_kind: "resolved",
				_mode: "subscribe",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: fn as (params: { parent: unknown; args: TArgs; ctx: TContext }) => Publisher<T>,
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
			fn: FieldResolveFnNoArgs<TParent, TContext, T>,
		): ResolvedFieldChainable<T, Record<string, never>, TParent, TContext> {
			const resolver = ({
				parent,
				ctx,
			}: {
				parent: unknown;
				args: Record<string, never>;
				ctx: FieldQueryContext<TContext>;
			}) => fn({ parent: parent as TParent, ctx });

			// Return ResolvedField with chainable .subscribe()
			const resolvedField: ResolvedFieldChainable<T, Record<string, never>, TParent, TContext> = {
				_kind: "resolved",
				_mode: "resolve",
				_returnType: undefined as T,
				_argsSchema: null,
				_resolver: resolver,
				// Chainable subscribe - creates LiveField with Publisher pattern
				subscribe(
					subscribeFn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
				): LiveField<T, Record<string, never>, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as T,
						_argsSchema: null,
						_resolver: resolver,
						_subscriber: ({
							parent,
							ctx,
						}: {
							parent: unknown;
							args: Record<string, never>;
							ctx: TContext;
						}) => subscribeFn({ parent: parent as TParent, ctx }),
					};
				},
			};
			return resolvedField;
		},
		subscribe(
			fn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
		): SubscribedField<T, Record<string, never>, TContext> {
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
				_mode: "subscribe",
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
		resolve(
			fn: FieldResolveFn<TParent, TArgs, TContext, T>,
		): ResolvedFieldChainable<T, TArgs, TParent, TContext> {
			const resolver = fn as (params: {
				parent: unknown;
				args: TArgs;
				ctx: FieldQueryContext<TContext>;
			}) => T | Promise<T>;

			const resolvedField: ResolvedFieldChainable<T, TArgs, TParent, TContext> = {
				_kind: "resolved",
				_mode: "resolve",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: resolver,
				subscribe(
					subscribeFn: FieldSubscribeFn<TParent, TArgs, TContext, T>,
				): LiveField<T, TArgs, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as T,
						_argsSchema: argsSchema,
						_resolver: resolver,
						_subscriber: subscribeFn as (params: {
							parent: unknown;
							args: TArgs;
							ctx: TContext;
						}) => Publisher<T>,
					};
				},
			};
			return resolvedField;
		},
		subscribe(
			fn: FieldSubscribeFn<TParent, TArgs, TContext, T>,
		): SubscribedField<T, TArgs, TContext> {
			return {
				_kind: "resolved",
				_mode: "subscribe",
				_returnType: undefined as T,
				_argsSchema: argsSchema,
				_resolver: fn as (params: { parent: unknown; args: TArgs; ctx: TContext }) => Publisher<T>,
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
			fn: FieldResolveFnNoArgs<TParent, TContext, T>,
		): ResolvedFieldChainable<T, Record<string, never>, TParent, TContext> {
			const resolver = ({
				parent,
				ctx,
			}: {
				parent: unknown;
				args: Record<string, never>;
				ctx: FieldQueryContext<TContext>;
			}) => fn({ parent: parent as TParent, ctx });

			const resolvedField: ResolvedFieldChainable<T, Record<string, never>, TParent, TContext> = {
				_kind: "resolved",
				_mode: "resolve",
				_returnType: undefined as T,
				_argsSchema: null,
				_resolver: resolver,
				subscribe(
					subscribeFn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
				): LiveField<T, Record<string, never>, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as T,
						_argsSchema: null,
						_resolver: resolver,
						_subscriber: ({
							parent,
							ctx,
						}: {
							parent: unknown;
							args: Record<string, never>;
							ctx: TContext;
						}) => subscribeFn({ parent: parent as TParent, ctx }),
					};
				},
			};
			return resolvedField;
		},
		subscribe(
			fn: FieldSubscribeFnNoArgs<TParent, TContext, T>,
		): SubscribedField<T, Record<string, never>, TContext> {
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
				_mode: "subscribe",
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

		/**
		 * Create a JSON/object field builder with custom type T.
		 * Use for JSON fields that need .resolve() or .subscribe().
		 *
		 * @example
		 * status: f.json<SessionStatus>().subscribe(({ ctx }) => {
		 *   ctx.emit({ isActive: true, text: "Working..." });
		 * }),
		 */
		json<T = unknown>(): ScalarFieldBuilder<T, Parent, TContext> {
			return createScalarFieldBuilder<T, Parent, TContext>();
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

	isSubscription(name: string): boolean {
		const field = this.fields[name];
		if (!field || field._kind === "exposed") return false;
		// Cast to get the mode - could be ResolvedField, SubscribedField, or LiveField
		const mode = (field as { _mode?: "resolve" | "subscribe" | "live" })._mode;
		// "subscribe" and "live" both use emit pattern
		return mode === "subscribe" || mode === "live";
	}

	isLive(name: string): boolean {
		const field = this.fields[name];
		if (!field || field._kind === "exposed") return false;
		const mode = (field as { _mode?: "resolve" | "subscribe" | "live" })._mode;
		return mode === "live";
	}

	getFieldMode(name: string): "exposed" | "resolve" | "subscribe" | "live" | null {
		const field = this.fields[name];
		if (!field) return null;
		if (field._kind === "exposed") return "exposed";
		// Cast to get the mode - could be ResolvedField, SubscribedField, or LiveField
		const mode = (field as { _mode?: "resolve" | "subscribe" | "live" })._mode;
		return mode ?? "resolve";
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
		ctx: FieldLiveContext<TContext, unknown>,
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

		// ctx already contains emit and onCleanup for live query capabilities
		return resolvedField._resolver({ parent, args: parsedArgs, ctx });
	}

	subscribeField<K extends keyof TFields>(
		name: K,
		parent: InferParent<TEntity["fields"]>,
		args: Record<string, unknown>,
		ctx: TContext,
	): Publisher<unknown> | null {
		const field = this.fields[name];
		if (!field) {
			throw new Error(`Field "${String(name)}" not found in resolver`);
		}

		if (field._kind === "exposed") {
			// Exposed fields don't have subscriptions
			return null;
		}

		const mode = (field as { _mode?: "resolve" | "subscribe" | "live" })._mode;

		if (mode === "subscribe") {
			// "subscribe" mode: _resolver returns Publisher
			const subscribedField = field as SubscribedField<unknown, unknown, TContext>;
			let parsedArgs: Record<string, unknown> = args;
			if (subscribedField._argsSchema) {
				parsedArgs = subscribedField._argsSchema.parse(args) as Record<string, unknown>;
			}
			return subscribedField._resolver({ parent, args: parsedArgs, ctx });
		}

		if (mode === "live") {
			// "live" mode: _subscriber returns Publisher
			const liveField = field as LiveField<unknown, unknown, TContext>;
			if (!liveField._subscriber) {
				return null;
			}
			let parsedArgs: Record<string, unknown> = args;
			if (liveField._argsSchema) {
				parsedArgs = liveField._argsSchema.parse(args) as Record<string, unknown>;
			}
			return liveField._subscriber({ parent, args: parsedArgs, ctx });
		}

		// "resolve" mode has no subscription
		return null;
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

		// Create a no-op live context for batch resolution (no live query support)
		const liveCtx: FieldLiveContext<TContext, unknown> = {
			...ctx,
			emit: () => {}, // No-op: resolveAll doesn't support live queries
			onCleanup: () => () => {}, // No-op: resolveAll doesn't support live queries
		};

		await Promise.all(
			fieldsToResolve.map(async ({ name, args }) => {
				if (this.hasField(name)) {
					result[name] = await this.resolveField(
						name as keyof TFields,
						parent,
						args ?? {},
						liveCtx,
					);
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
 * @deprecated Use unified entity definition with inline resolvers instead.
 * Define resolvers directly in the entity using `.resolve()` and `.subscribe()`:
 *
 * ```typescript
 * // NEW: Unified entity definition (recommended)
 * const User = entity("User", (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   fullName: t.string().resolve(({ parent }) =>
 *     `${parent.firstName} ${parent.lastName}`
 *   ),
 *   posts: t.many(() => Post).resolve(({ parent, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === parent.id)
 *   ),
 * }));
 *
 * // Convert to resolver for server
 * const userResolver = createResolverFromEntity(User);
 * ```
 *
 * Legacy patterns (still supported but deprecated):
 * 1. Direct call (default context): `resolver(User, (f) => ({ ... }))`
 * 2. With custom context: `resolver<{ db: DB }>()(User, (f) => ({ ... }))`
 *
 * @example Legacy usage
 * ```typescript
 * // OLD: Separate resolver definition (deprecated)
 * const userResolver = resolver(User, (f) => ({
 *   id: f.expose('id'),
 *   name: f.expose('name'),
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

// =============================================================================
// Entity to Resolver Conversion (Phase 4 - ADR-001)
// =============================================================================

/**
 * Create a ResolverDef from an entity's inline field definitions.
 *
 * Extracts `.resolve()` and `.subscribe()` handlers from entity fields
 * and creates a ResolverDef that can be used by the execution engine.
 *
 * Field resolution rules:
 * - Fields without `.resolve()` or `.subscribe()` → exposed (passthrough from parent)
 * - Fields with `.resolve(fn)` → computed field
 * - Fields with `.subscribe(fn)` → subscription field
 *
 * @example
 * ```typescript
 * const User = entity("User", (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   fullName: t.string().resolve(({ parent }) =>
 *     `${parent.firstName} ${parent.lastName}`
 *   ),
 * }));
 *
 * // Create resolver from entity
 * const userResolver = createResolverFromEntity(User);
 *
 * // Use in server config
 * const server = createLensServer({
 *   resolvers: [userResolver],
 * });
 * ```
 */
export function createResolverFromEntity<
	TEntity extends EntityDef<string, EntityDefinition>,
	TContext = FieldResolverContext,
>(entity: TEntity): ResolverDef<TEntity, Record<string, FieldDef<any, any, TContext>>, TContext> {
	const fields: Record<string, FieldDef<any, any, TContext>> = {};

	for (const [fieldName, fieldType] of Object.entries(entity.fields)) {
		// Cast through unknown to avoid exactOptionalPropertyTypes issues
		const ft = fieldType as unknown as {
			_resolutionMode?: "exposed" | "resolve" | "subscribe";
			_resolver?: (params: { parent: unknown; args: unknown; ctx: unknown }) => unknown;
			_subscriptionResolver?: (params: { parent: unknown; ctx: unknown }) => void;
		};

		if (ft._resolutionMode === "resolve" && ft._resolver) {
			// Computed field - wrap the inline resolver
			fields[fieldName] = {
				_kind: "resolved" as const,
				_mode: "resolve" as const,
				_returnType: undefined,
				_argsSchema: null,
				_resolver: ({ parent, ctx }: { parent: unknown; ctx: FieldQueryContext<TContext> }) => {
					// Inline resolvers use { parent, ctx } format (no args)
					return ft._resolver!({ parent, args: {}, ctx });
				},
			};
		} else if (ft._resolutionMode === "subscribe" && ft._subscriptionResolver) {
			// Subscription field - wrap the inline subscription resolver with Publisher pattern
			fields[fieldName] = {
				_kind: "resolved" as const,
				_mode: "subscribe" as const,
				_returnType: undefined,
				_argsSchema: null,
				_resolver: ({ parent, ctx }: { parent: unknown; ctx: TContext }): Publisher<unknown> => {
					// Return a Publisher that wraps the legacy inline subscription
					return ({ emit, onCleanup }) => {
						// Legacy inline subscriptions expect emit/onCleanup on ctx
						const legacyCtx = { ...ctx, emit, onCleanup };
						ft._subscriptionResolver!({ parent, ctx: legacyCtx });
					};
				},
			};
		} else {
			// Exposed field - passthrough from parent data
			fields[fieldName] = {
				_kind: "exposed" as const,
				_fieldName: fieldName,
				_type: undefined,
			};
		}
	}

	return new ResolverDefImpl(entity, fields) as ResolverDef<
		TEntity,
		Record<string, FieldDef<any, any, TContext>>,
		TContext
	>;
}

/**
 * Check if an entity has any inline resolvers defined.
 *
 * @example
 * ```typescript
 * const User = entity("User", (t) => ({
 *   id: t.id(),
 *   fullName: t.string().resolve(({ parent }) => ...),
 * }));
 *
 * hasInlineResolvers(User); // true
 * ```
 */
export function hasInlineResolvers(entity: EntityDef<string, EntityDefinition>): boolean {
	for (const fieldType of Object.values(entity.fields)) {
		const ft = fieldType as {
			_resolutionMode?: "exposed" | "resolve" | "subscribe";
		};
		if (ft._resolutionMode === "resolve" || ft._resolutionMode === "subscribe") {
			return true;
		}
	}
	return false;
}
