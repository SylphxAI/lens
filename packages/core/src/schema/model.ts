/**
 * @sylphx/lens-core - Model Definition
 *
 * v3.0 API - Plain object model definitions only.
 * No builder functions, no t. prefix.
 *
 * @example
 * ```typescript
 * import { model, id, string, int, list, nullable } from '@sylphx/lens-core'
 *
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

import type { EntityDefinition, FieldType } from "./types.js";

// =============================================================================
// Model Symbol
// =============================================================================

/** Symbol to identify model definitions */
export const MODEL_SYMBOL: unique symbol = Symbol("lens:model");

// =============================================================================
// Model Definition Types
// =============================================================================

/**
 * Plain object field definition.
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
// Type Helper
// =============================================================================

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
 * Returns a function that creates models with plain object fields.
 *
 * @example
 * ```typescript
 * const { model } = lens<AppContext>();
 *
 * const User = model("User", {
 *   id: id(),
 *   name: string(),
 * });
 * ```
 */
export type ModelFactory<TContext> = <Name extends string, FieldDefs extends PlainFieldDefinition>(
	name: Name,
	fields: FieldDefs,
) => ModelDefChainable<Name, ProcessedFields<FieldDefs>, TContext>;

function createModelFactory<TContext>(): ModelFactory<TContext> {
	return <Name extends string, FieldDefs extends PlainFieldDefinition>(
		name: Name,
		fields: FieldDefs,
	): ModelDefChainable<Name, ProcessedFields<FieldDefs>, TContext> => {
		const processedFields = processPlainFields(fields);
		return createModelDefChainable<Name, ProcessedFields<FieldDefs>, TContext>(
			name,
			processedFields as ProcessedFields<FieldDefs>,
		);
	};
}

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
 * import { model, id, string, list, nullable } from '@sylphx/lens-core'
 *
 * const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   bio: nullable(string()),
 *   posts: list(() => Post),
 * })
 * .resolve({
 *   posts: ({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id)
 * })
 * ```
 */
// model<Context>() - returns factory for typed context
export function model<TContext = unknown>(): ModelFactory<TContext>;
// model("Name", { fields }) - plain object definition
export function model<Name extends string, FieldDefs extends PlainFieldDefinition>(
	name: Name,
	fields: FieldDefs,
): ModelDefChainable<Name, ProcessedFields<FieldDefs>, unknown>;
export function model<
	TContext = unknown,
	Name extends string = string,
	FieldDefs extends PlainFieldDefinition = PlainFieldDefinition,
>(
	nameOrNothing?: Name,
	fields?: FieldDefs,
): ModelFactory<TContext> | ModelDefChainable<Name, ProcessedFields<FieldDefs>, TContext> {
	// model<Context>() - returns factory
	if (nameOrNothing === undefined) {
		return createModelFactory<TContext>();
	}

	// model("Name", { fields }) - plain object definition
	if (fields === undefined) {
		throw new Error(
			`model("${nameOrNothing}") requires fields. Use: model("${nameOrNothing}", { id: id(), ... })`,
		);
	}

	const processedFields = processPlainFields(fields);
	return createModelDefChainable<Name, ProcessedFields<FieldDefs>, TContext>(
		nameOrNothing,
		processedFields as ProcessedFields<FieldDefs>,
	);
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
