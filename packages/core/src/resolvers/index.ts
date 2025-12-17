/**
 * @sylphx/lens-core - Field Resolvers
 *
 * Type-safe field resolution for models.
 * Define how each field is resolved with full type inference.
 *
 * Model = pure schema (types only)
 * Resolver = separate implementation
 *
 * @example
 * ```typescript
 * import { model, id, string, resolver } from '@sylphx/lens-core';
 *
 * // Schema only
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   avatarKey: string(),
 * });
 *
 * // Implementation - separate resolver
 * const userResolver = resolver(User, (t) => ({
 *   id: t.expose('id'),
 *   name: t.expose('name'),
 *   avatarKey: t.expose('avatarKey'),
 *   // Computed fields use plain functions
 *   avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
 *   // Relations with args use builder
 *   posts: t.args(z.object({ limit: z.number() }))
 *     .resolve(({ source, args, ctx }) => ctx.db.posts.filter(...)),
 * }));
 * ```
 */

import type { z } from "zod";
import type {
	AnyEntityLike,
	AnyFieldDef,
	ExposedField,
	FieldBuilder,
	FieldBuilderWithArgs,
	FieldDef,
	FieldLiveSubscribeFn,
	FieldLiveSubscribeFnNoArgs,
	FieldQueryContext,
	FieldResolveFn,
	FieldResolveFnNoArgs,
	FieldResolverContext,
	LiveField,
	Publisher,
	ResolvedField,
	ResolvedFieldChainable,
	ResolverDef,
	Resolvers,
} from "./resolver-types.js";

// Re-export types for external use
export type {
	AnyEntityLike,
	ExposedField,
	FieldBuilder,
	FieldBuilderWithArgs,
	FieldDef,
	FieldEmit,
	FieldLiveSubscribeFn,
	FieldLiveSubscribeFnNoArgs,
	FieldQueryContext,
	FieldResolveFn,
	FieldResolveFnNoArgs,
	FieldResolveParams,
	FieldResolverContext,
	FieldSubscribeParams,
	InferParent,
	InferResolverOutput,
	InferResolverSelected,
	LiveField,
	OnCleanup,
	Publisher,
	ResolvedField,
	ResolvedFieldChainable,
	ResolverDef,
	ResolverFields,
	Resolvers,
	SubscriptionCallbacks,
} from "./resolver-types.js";

// =============================================================================
// Implementation
// =============================================================================

/** Create a field builder with args */
function createFieldBuilderWithArgs<TParent, TArgs, TContext>(
	argsSchema: z.ZodType<TArgs>,
): FieldBuilderWithArgs<TParent, TArgs, TContext> {
	return {
		resolve<TResult>(
			fn: FieldResolveFn<TParent, TArgs, TContext, TResult>,
		): ResolvedFieldChainable<TResult, TArgs, TParent, TContext> {
			// Wrap to translate parent -> source for user-facing API
			const resolver = ({
				parent,
				args,
				ctx,
			}: {
				parent: unknown;
				args: TArgs;
				ctx: FieldQueryContext<TContext>;
			}) => fn({ source: parent as TParent, args, ctx });

			// Return ResolvedField with chainable .subscribe()
			const resolvedField = {
				_kind: "resolved" as const,
				_mode: "resolve" as const,
				_returnType: undefined as TResult,
				_argsSchema: argsSchema,
				_resolver: resolver,
				// Chainable subscribe - creates LiveField with Publisher pattern
				subscribe(
					subscribeFn: FieldLiveSubscribeFn<TParent, TArgs, TContext, TResult>,
				): LiveField<TResult, TArgs, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as TResult,
						_argsSchema: argsSchema,
						_resolver: resolver,
						// Wrap to translate parent -> source for user-facing API
						_subscriber: ({ parent, args, ctx }: { parent: unknown; args: TArgs; ctx: TContext }) =>
							subscribeFn({ source: parent as TParent, args, ctx }),
					};
				},
			} as ResolvedFieldChainable<TResult, TArgs, TParent, TContext>;
			return resolvedField;
		},
	};
}

/** Create a field builder for an entity */
function createFieldBuilder<
	TEntity extends AnyEntityLike,
	TContext = FieldResolverContext,
>(): FieldBuilder<TEntity, TContext> {
	// Use any for internal implementation to avoid type constraints
	// The external FieldBuilder interface uses InferParentAny for proper typing
	type Parent = any;

	return {
		expose<K extends keyof TEntity["fields"] & string>(fieldName: K): ExposedField<any> {
			return {
				_kind: "exposed",
				_fieldName: fieldName,
				_type: undefined as any,
			};
		},

		args<TArgs extends z.ZodRawShape>(
			schema: z.ZodObject<TArgs>,
		): FieldBuilderWithArgs<Parent, z.infer<z.ZodObject<TArgs>>, TContext> {
			return createFieldBuilderWithArgs<Parent, z.infer<z.ZodObject<TArgs>>, TContext>(schema);
		},

		resolve<TResult>(
			fn: FieldResolveFnNoArgs<Parent, TContext, TResult>,
		): ResolvedFieldChainable<TResult, Record<string, never>, Parent, TContext> {
			const resolver = ({
				parent,
				ctx,
			}: {
				parent: unknown;
				args: Record<string, never>;
				ctx: FieldQueryContext<TContext>;
			}) => fn({ source: parent as Parent, ctx });

			// Return ResolvedField with chainable .subscribe()
			const resolvedField: ResolvedFieldChainable<
				TResult,
				Record<string, never>,
				Parent,
				TContext
			> = {
				_kind: "resolved",
				_mode: "resolve",
				_returnType: undefined as TResult,
				_argsSchema: null,
				_resolver: resolver,
				// Chainable subscribe - creates LiveField with Publisher pattern
				subscribe(
					subscribeFn: FieldLiveSubscribeFnNoArgs<Parent, TContext, TResult>,
				): LiveField<TResult, Record<string, never>, TContext> {
					return {
						_kind: "resolved",
						_mode: "live",
						_returnType: undefined as TResult,
						_argsSchema: null,
						_resolver: resolver,
						_subscriber: ({
							parent,
							ctx,
						}: {
							parent: unknown;
							args: Record<string, never>;
							ctx: TContext;
						}) => subscribeFn({ source: parent as Parent, ctx }),
					};
				},
			};
			return resolvedField;
		},
	};
}

/** Resolver definition implementation */
class ResolverDefImpl<
	TEntity extends AnyEntityLike,
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
		// Cast to get the mode - ResolvedField or LiveField
		const mode = (field as { _mode?: "resolve" | "live" })._mode;
		// "live" mode uses subscription pattern
		return mode === "live";
	}

	isLive(name: string): boolean {
		const field = this.fields[name];
		if (!field || field._kind === "exposed") return false;
		const mode = (field as { _mode?: "resolve" | "live" })._mode;
		return mode === "live";
	}

	getFieldMode(name: string): "exposed" | "resolve" | "live" | null {
		const field = this.fields[name];
		if (!field) return null;
		if (field._kind === "exposed") return "exposed";
		// Cast to get the mode - ResolvedField or LiveField
		const mode = (field as { _mode?: "resolve" | "live" })._mode;
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
		parent: unknown,
		args: Record<string, unknown>,
		ctx: FieldQueryContext<TContext>,
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

	subscribeField<K extends keyof TFields>(
		name: K,
		parent: unknown,
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

		const mode = (field as { _mode?: "resolve" | "live" })._mode;

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
		parent: unknown,
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
 * Define field resolvers for a model.
 *
 * Model = pure schema (types only)
 * Resolver = separate implementation
 *
 * Every field must have a resolver (use t.expose() for passthrough fields).
 *
 * @example
 * ```typescript
 * const userResolver = resolver(User, (t) => ({
 *   id: t.expose('id'),
 *   name: t.expose('name'),
 *   avatarKey: t.expose('avatarKey'),
 *   // Computed field with plain function
 *   avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
 * }));
 *
 * // With typed context
 * const userResolver = resolver<AppContext>()(User, (t) => ({
 *   id: t.expose('id'),
 *   posts: ({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id),
 * }));
 * ```
 */
/**
 * Structural type for resolver entity parameter.
 * Accepts both EntityDef and ModelDef without strict constraint issues.
 */
type ResolverEntity = {
	readonly _name: string | undefined;
	readonly fields: Record<string, unknown>;
};

export function resolver<TContext = FieldResolverContext>(): <TEntity extends ResolverEntity>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, TContext>) => {
		[K in keyof TEntity["fields"]]: AnyFieldDef<TContext>;
	},
) => ResolverDef<TEntity, Record<string, FieldDef<any, any, any>>, TContext>;

export function resolver<TEntity extends ResolverEntity>(
	entity: TEntity,
	builder: (f: FieldBuilder<TEntity, FieldResolverContext>) => {
		[K in keyof TEntity["fields"]]: AnyFieldDef<FieldResolverContext>;
	},
): ResolverDef<TEntity, Record<string, FieldDef<any, any, any>>, FieldResolverContext>;

export function resolver<TContext = FieldResolverContext>(
	entityOrNothing?: AnyEntityLike,
	builder?: (f: FieldBuilder<any, TContext>) => Record<string, unknown>,
): unknown {
	// Helper to wrap plain functions into ResolvedField
	const wrapPlainFunctions = (
		fields: Record<string, any>,
	): Record<string, FieldDef<any, any, any>> => {
		const result: Record<string, FieldDef<any, any, any>> = {};
		for (const [key, value] of Object.entries(fields)) {
			if (typeof value === "function" && !("_kind" in value)) {
				// Plain function - wrap as ResolvedField
				result[key] = {
					_kind: "resolved" as const,
					_mode: "resolve" as const,
					_returnType: undefined,
					_argsSchema: null,
					_resolver: ({ parent, ctx }: { parent: unknown; args: any; ctx: any }) =>
						value({ source: parent, parent, ctx }),
				};
			} else {
				// Already a FieldDef (expose, resolved, live)
				result[key] = value;
			}
		}
		return result;
	};

	// Validate that resolver covers all entity fields
	const validateFields = (entity: AnyEntityLike, fields: Record<string, unknown>): void => {
		const entityFields = Object.keys(entity.fields);
		const resolverFields = Object.keys(fields);
		const missingFields = entityFields.filter((f) => !resolverFields.includes(f));

		if (missingFields.length > 0) {
			throw new Error(
				`resolver(${entity._name}): Missing fields: ${missingFields.join(", ")}. ` +
					`All model fields must have a resolver (use t.expose() for passthrough fields).`,
			);
		}
	};

	// Curried call: resolver<Context>()
	if (entityOrNothing === undefined) {
		return <TEntity extends AnyEntityLike>(
			entity: TEntity,
			builderFn: (f: FieldBuilder<TEntity, TContext>) => Record<string, unknown>,
		) => {
			const fieldBuilder = createFieldBuilder<TEntity, TContext>();
			const rawFields = builderFn(fieldBuilder);
			const fields = wrapPlainFunctions(rawFields);
			validateFields(entity, fields);
			return new ResolverDefImpl(entity, fields);
		};
	}

	// Direct call: resolver(Entity, builder)
	const fieldBuilder = createFieldBuilder<any, TContext>();
	const rawFields = builder!(fieldBuilder);
	const fields = wrapPlainFunctions(rawFields);
	validateFields(entityOrNothing, fields);
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
// Model to Resolver Conversion
// =============================================================================

/**
 * Create a ResolverDef from a model with all fields exposed.
 *
 * Use this when you want a simple passthrough resolver for all fields.
 * For custom field resolution, use the `resolver()` function instead.
 *
 * @example
 * ```typescript
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   email: string(),
 * });
 *
 * // Create simple exposed-only resolver
 * const simpleResolver = createResolverFromEntity(User);
 *
 * // Or use resolver() for custom field handling
 * const customResolver = resolver(User, (t) => ({
 *   id: t.expose('id'),
 *   name: t.expose('name'),
 *   email: t.expose('email'),
 *   avatar: ({ source, ctx }) => ctx.cdn.getAvatar(source.avatarKey),
 * }));
 * ```
 */
export function createResolverFromEntity<
	TEntity extends AnyEntityLike,
	TContext = FieldResolverContext,
>(entity: TEntity): ResolverDef<TEntity, Record<string, FieldDef<any, any, TContext>>, TContext> {
	const fields: Record<string, FieldDef<any, any, TContext>> = {};

	// All fields are exposed (passthrough from parent data)
	for (const fieldName of Object.keys(entity.fields)) {
		fields[fieldName] = {
			_kind: "exposed" as const,
			_fieldName: fieldName,
			_type: undefined,
		};
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
 * @deprecated Models no longer support inline resolvers.
 * Use standalone `resolver(Model, ...)` instead.
 *
 * This function always returns false for new ModelDef instances.
 * Kept for backward compatibility during migration.
 */
export function hasInlineResolvers(_entity: AnyEntityLike): boolean {
	// Models no longer have inline resolvers (v3.0+)
	// Use standalone resolver(Model, ...) instead
	return false;
}
