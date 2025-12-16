/**
 * @sylphx/lens-core - Model Definition
 *
 * New unified API for defining data models (replaces entity).
 * Models with `id` field are normalizable/cacheable.
 * Models without `id` are pure types with resolvers.
 *
 * @example
 * ```typescript
 * import { model, id, string, int, list, nullable } from '@sylphx/lens-core'
 *
 * // New API (recommended) - no t. prefix
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   bio: nullable(string()),
 *   tags: list(string()),
 *   posts: list(() => Post),
 *   profile: Profile,  // direct model reference
 * })
 * .resolve({
 *   posts: ({ source, ctx }) =>
 *     ctx.db.posts.filter(p => p.authorId === source.id)
 * })
 *
 * // Legacy API (still supported) - with t. prefix
 * const User = model<AppContext>("User", (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   posts: t.many(() => Post),
 * }))
 * ```
 */

import type { EntityMarker } from "@sylphx/standard-entity";
import type { FieldDef } from "./fields.js";
import { processFieldDef } from "./fields.js";
import type { InferEntity } from "./infer.js";
import type {
	FieldResolverMap,
	FieldSubscriberMap,
	ModelDefChainable,
	ModelDefComplete,
	ModelDefWithResolvers,
	ModelDefWithSubscribers,
} from "./model-resolvers.js";

// Re-export types needed by lens.ts
export type {
	FieldResolverMap,
	FieldSubscriberMap,
	ModelDefChainable,
	ModelDefComplete,
	ModelDefWithResolvers,
	ModelDefWithSubscribers,
} from "./model-resolvers.js";

import {
	createTypeBuilder,
	type EntityDefinition,
	type FieldType,
	type TypeBuilder,
	t as typeBuilder,
} from "./types.js";

// =============================================================================
// Model Symbol
// =============================================================================

/** Symbol to identify model definitions */
export const MODEL_SYMBOL: unique symbol = Symbol("lens:model");

// =============================================================================
// Model Definition Types
// =============================================================================

/**
 * Plain object field definition (new API).
 * Each field can be a scalar type, model reference, or wrapped type.
 *
 * @example
 * ```typescript
 * {
 *   id: id(),
 *   name: string(),
 *   bio: nullable(string()),
 *   tags: list(string()),
 *   posts: list(() => Post),
 *   profile: Profile,
 * }
 * ```
 */
export type PlainFieldDefinition = Record<string, FieldDef>;

/**
 * Model builder function type (legacy API).
 * Receives `t` type builder and returns field definitions.
 */
export type ModelBuilder<Fields extends EntityDefinition> = (t: typeof typeBuilder) => Fields;

/**
 * Context-aware model builder function type (legacy API).
 * Receives a typed `t` builder where resolve/subscribe have typed context.
 */
export type ContextualModelBuilder<Fields extends EntityDefinition, TContext> = (
	t: TypeBuilder<TContext>,
) => Fields;

/**
 * Model definition with name and fields.
 *
 * Implements StandardEntity protocol for type-safe Reify operations.
 * Extends EntityMarker from @sylphx/standard-entity for protocol compliance.
 */
export interface ModelDef<
	Name extends string = string,
	Fields extends EntityDefinition = EntityDefinition,
> extends EntityMarker<Name> {
	[MODEL_SYMBOL]: true;
	/** Model name */
	_name: Name;
	/** Model fields */
	readonly fields: Fields;
	/** Whether this model has an id field (normalizable) */
	readonly _hasId: boolean;
}

/**
 * Extract the inferred model type from a ModelDef.
 * Use this when you need the actual TypeScript type of a model.
 *
 * @example
 * ```typescript
 * type UserData = InferModelType<typeof User>;
 * // { id: string; name: string; email: string; ... }
 * ```
 */
export type InferModelType<M extends ModelDef> =
	M extends ModelDef<string, infer F> ? InferEntity<F> : never;

// =============================================================================
// Model Definition Function
// =============================================================================

/**
 * Define a model with fields.
 *
 * Models with `id` field are normalizable and cacheable.
 * Models without `id` are pure types that can still have resolvers.
 *
 * @example
 * ```typescript
 * // New API (recommended) - plain object, no t. prefix
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   bio: nullable(string()),
 *   tags: list(string()),
 *   posts: list(() => Post),
 *   profile: Profile,
 * })
 * .resolve({
 *   posts: ({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id)
 * })
 *
 * // Legacy API - with t. prefix (still supported)
 * const User = model<AppContext>("User", (t) => ({
 *   id: t.id(),
 *   name: t.string(),
 *   posts: t.many(() => Post),
 * }))
 * ```
 */
// model<Context>() - returns factory for typed context
export function model<TContext = unknown>(): ModelFactory<TContext>;
// model<Context>("Name") - returns builder class for .define()
export function model<TContext = unknown>(name: string): ModelBuilderClass<TContext>;
// model("Name", { fields }) - NEW: plain object definition
export function model<Name extends string, FieldDefs extends PlainFieldDefinition>(
	name: Name,
	fields: FieldDefs,
): ModelDefChainable<Name, ProcessedFields<FieldDefs>, unknown>;
// model("Name", (t) => fields) - legacy builder definition
export function model<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	builder: ModelBuilder<Fields>,
): ModelDefChainable<Name, Fields, unknown>;
export function model<
	TContext = unknown,
	Name extends string = string,
	Fields extends EntityDefinition = EntityDefinition,
>(
	nameOrNothing?: Name,
	maybeBuilderOrFields?: ModelBuilder<Fields> | PlainFieldDefinition,
):
	| ModelFactory<TContext>
	| ModelBuilderClass<TContext>
	| ModelDefChainable<Name, Fields, TContext> {
	// model<Context>() - returns factory
	if (nameOrNothing === undefined) {
		return createModelFactory<TContext>();
	}

	// model<Context>("Name") - returns builder class for .define()
	if (maybeBuilderOrFields === undefined) {
		return new ModelBuilderClass<TContext>(nameOrNothing);
	}

	// Check if it's a builder function or plain object
	if (typeof maybeBuilderOrFields === "function") {
		// model("Name", (t) => fields) - legacy builder definition
		const fields = maybeBuilderOrFields(typeBuilder);
		return createModelDefChainable<Name, Fields, TContext>(nameOrNothing, fields);
	}

	// model("Name", { fields }) - NEW: plain object definition
	const processedFields = processPlainFields(maybeBuilderOrFields);
	return createModelDefChainable<Name, Fields, TContext>(nameOrNothing, processedFields as Fields);
}

/**
 * Process plain field definitions into EntityDefinition.
 * Converts field defs (scalars, model refs, list/nullable wrappers) to FieldType instances.
 */
function processPlainFields(fieldDefs: PlainFieldDefinition): EntityDefinition {
	const result: EntityDefinition = {};
	for (const [key, value] of Object.entries(fieldDefs)) {
		result[key] = processFieldDef(value);
	}
	return result;
}

/**
 * Type helper to process plain field definitions.
 * Maps FieldDef types to their processed FieldType equivalents.
 */
type ProcessedFields<T extends PlainFieldDefinition> = {
	[K in keyof T]: T[K] extends FieldType<infer V, infer S>
		? FieldType<V, S>
		: FieldType<unknown, unknown>;
};

// =============================================================================
// Model Factory (Typed Context)
// =============================================================================

/**
 * Factory for creating models with typed context.
 */
export type ModelFactory<TContext> = <Name extends string, Fields extends EntityDefinition>(
	name: Name,
	builder: ContextualModelBuilder<Fields, TContext>,
) => ModelDefChainable<Name, Fields, TContext>;

function createModelFactory<TContext>(): ModelFactory<TContext> {
	return <Name extends string, Fields extends EntityDefinition>(
		name: Name,
		builder: ContextualModelBuilder<Fields, TContext>,
	): ModelDefChainable<Name, Fields, TContext> => {
		const contextualBuilder = createTypeBuilder<TContext>();
		const fields = builder(contextualBuilder);
		return createModelDefChainable<Name, Fields, TContext>(name, fields);
	};
}

// =============================================================================
// Model Builder Class (Fluent API)
// =============================================================================

/**
 * Builder for creating models with typed context using fluent API.
 * Use `model<Context>("Name").define((t) => ...)` for typed resolvers.
 */
export class ModelBuilderClass<TContext, Name extends string = string> {
	constructor(private readonly _name: Name) {}

	/**
	 * Define model fields with typed context.
	 * The `t` builder provides typed context to resolve/subscribe methods.
	 */
	define<Fields extends EntityDefinition>(
		builder: ContextualModelBuilder<Fields, TContext>,
	): ModelDefChainable<Name, Fields, TContext> {
		const contextualBuilder = createTypeBuilder<TContext>();
		const fields = builder(contextualBuilder);
		return createModelDefChainable<Name, Fields, TContext>(this._name, fields);
	}
}

// =============================================================================
// Internal Helper
// =============================================================================

/**
 * Create a model definition with chain methods for field resolvers/subscribers.
 */
function createModelDefChainable<Name extends string, Fields extends EntityDefinition, TContext>(
	name: Name,
	fields: Fields,
): ModelDefChainable<Name, Fields, TContext> {
	// Check if model has an id field
	const hasId = "id" in fields;

	const modelDef = {
		[MODEL_SYMBOL]: true,
		_name: name,
		fields,
		_hasId: hasId,
		// StandardEntity protocol - runtime marker for type-safe Reify operations
		"~entity": {
			name: name,
			type: undefined as unknown, // Phantom type - not used at runtime
		},

		/**
		 * Define field resolvers for this model.
		 * Source type is automatically inferred from scalar fields.
		 */
		resolve<R extends FieldResolverMap<Fields, TContext>>(
			this: ModelDefChainable<Name, Fields, TContext>,
			resolvers: R,
		): ModelDefWithResolvers<Name, Fields, R, TContext> {
			const result = {
				...this,
				_fieldResolvers: resolvers,
				subscribe<S extends FieldSubscriberMap<Fields, TContext>>(
					subscribers: S,
				): ModelDefComplete<Name, Fields, R, S, TContext> {
					return {
						...this,
						_fieldResolvers: resolvers,
						_fieldSubscribers: subscribers,
					} as ModelDefComplete<Name, Fields, R, S, TContext>;
				},
			};
			return result as ModelDefWithResolvers<Name, Fields, R, TContext>;
		},

		/**
		 * Define field subscribers without resolvers.
		 * Useful for purely live fields.
		 */
		subscribe<S extends FieldSubscriberMap<Fields, TContext>>(
			this: ModelDefChainable<Name, Fields, TContext>,
			subscribers: S,
		): ModelDefWithSubscribers<Name, Fields, S, TContext> {
			const result = {
				...this,
				_fieldSubscribers: subscribers,
				resolve<R extends FieldResolverMap<Fields, TContext>>(
					resolvers: R,
				): ModelDefComplete<Name, Fields, R, S, TContext> {
					return {
						...this,
						_fieldResolvers: resolvers,
						_fieldSubscribers: subscribers,
					} as ModelDefComplete<Name, Fields, R, S, TContext>;
				},
			};
			return result as ModelDefWithSubscribers<Name, Fields, S, TContext>;
		},
	};

	return modelDef as ModelDefChainable<Name, Fields, TContext>;
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a ModelDef */
export function isModelDef(value: unknown): value is ModelDef<string, EntityDefinition> {
	return typeof value === "object" && value !== null && MODEL_SYMBOL in value;
}

/** Check if model is normalizable (has id) */
export function isNormalizableModel(value: unknown): boolean {
	return isModelDef(value) && value._hasId;
}
