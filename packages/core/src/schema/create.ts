/**
 * @sylphx/lens-core - Schema Creation
 *
 * Creates and validates schemas from definitions.
 */

import type { InferEntity, InferSchemaEntities, InferSelected, Select } from "./infer.js";
import type {
	BelongsToType,
	EntityDefinition,
	FieldDefinition,
	HasManyType,
	HasOneType,
	SchemaDefinition,
} from "./types.js";
import { isRelationType } from "./types.js";

// =============================================================================
// Type-Level Relation Validation
// =============================================================================

/** Extract all relation target names from an entity definition */
type ExtractEntityRelationTargets<E extends EntityDefinition> = {
	[K in keyof E]: E[K] extends HasOneType<infer T>
		? T
		: E[K] extends HasManyType<infer T>
			? T
			: E[K] extends BelongsToType<infer T>
				? T
				: never;
}[keyof E];

/** Extract all relation target names from a schema definition */
type ExtractAllRelationTargets<S extends SchemaDefinition> = {
	[E in keyof S]: ExtractEntityRelationTargets<S[E]>;
}[keyof S];

/** Check if all relation targets exist in the schema */
type InvalidRelationTargets<S extends SchemaDefinition> = Exclude<
	ExtractAllRelationTargets<S>,
	keyof S | never
>;

/** Validated schema definition - ensures all relation targets exist */
export type ValidatedSchemaDefinition<S extends SchemaDefinition> =
	InvalidRelationTargets<S> extends never
		? S
		: {
				__error: "Invalid relation target(s) found";
				__invalidTargets: InvalidRelationTargets<S>;
				__validEntities: keyof S;
			};

// =============================================================================
// Schema Class
// =============================================================================

/** Relation metadata */
export interface RelationMeta {
	name: string;
	kind: "hasOne" | "hasMany" | "belongsTo";
	target: string;
	inverse?: string;
}

/** Entity metadata */
export interface EntityMeta {
	name: string;
	fields: Map<string, FieldDefinition>;
	relations: Map<string, RelationMeta>;
	primaryKey: string;
}

/**
 * Schema instance with runtime metadata and type information
 */
export class Schema<S extends SchemaDefinition> {
	/** Entity metadata map */
	readonly entities: Map<string, EntityMeta>;

	/** Relation graph (entity -> entity[]) */
	readonly relationGraph: Map<string, Set<string>>;

	/** Original definition (for type inference) */
	readonly definition: S;

	constructor(definition: S) {
		this.definition = definition;
		this.entities = new Map();
		this.relationGraph = new Map();

		// Build metadata
		this.buildEntityMeta(definition);
		this.buildRelationGraph();
		this.validateRelations();
	}

	/** Build entity metadata from definition */
	private buildEntityMeta(definition: S): void {
		for (const [entityName, entityDef] of Object.entries(definition)) {
			const fields = new Map<string, FieldDefinition>();
			const relations = new Map<string, RelationMeta>();
			let primaryKey = "id";

			for (const [fieldName, fieldDef] of Object.entries(entityDef as EntityDefinition)) {
				fields.set(fieldName, fieldDef);

				// Track primary key
				if (fieldDef._type === "id") {
					primaryKey = fieldName;
				}

				// Track relations
				if (isRelationType(fieldDef)) {
					const relationField = fieldDef as
						| HasOneType<string>
						| HasManyType<string>
						| BelongsToType<string>;
					relations.set(fieldName, {
						name: fieldName,
						kind: relationField._type as "hasOne" | "hasMany" | "belongsTo",
						target: relationField.target,
					});
				}
			}

			this.entities.set(entityName, {
				name: entityName,
				fields,
				relations,
				primaryKey,
			});
		}
	}

	/** Build relation graph for traversal */
	private buildRelationGraph(): void {
		for (const [entityName, meta] of this.entities) {
			const targets = new Set<string>();
			for (const relation of meta.relations.values()) {
				targets.add(relation.target);
			}
			this.relationGraph.set(entityName, targets);
		}
	}

	/** Validate all relations point to existing entities */
	private validateRelations(): void {
		const errors: string[] = [];

		for (const [entityName, meta] of this.entities) {
			for (const [fieldName, relation] of meta.relations) {
				if (!this.entities.has(relation.target)) {
					errors.push(
						`${entityName}.${fieldName}: Target entity "${relation.target}" does not exist`,
					);
				}
			}
		}

		if (errors.length > 0) {
			throw new SchemaValidationError(errors);
		}
	}

	/** Get entity metadata by name */
	getEntity<K extends keyof S & string>(name: K): EntityMeta | undefined {
		return this.entities.get(name);
	}

	/** Get all entity names */
	getEntityNames(): (keyof S & string)[] {
		return Array.from(this.entities.keys()) as (keyof S & string)[];
	}

	/** Check if entity exists */
	hasEntity(name: string): name is keyof S & string {
		return this.entities.has(name);
	}

	/** Get field metadata */
	getField(entityName: string, fieldName: string): FieldDefinition | undefined {
		return this.entities.get(entityName)?.fields.get(fieldName);
	}

	/** Get relation metadata */
	getRelation(entityName: string, fieldName: string): RelationMeta | undefined {
		return this.entities.get(entityName)?.relations.get(fieldName);
	}

	/** Get entities that have relations to a target entity */
	getRelatedEntities(targetEntity: string): string[] {
		const related: string[] = [];
		for (const [entityName, targets] of this.relationGraph) {
			if (targets.has(targetEntity)) {
				related.push(entityName);
			}
		}
		return related;
	}
}

// =============================================================================
// Schema Creation
// =============================================================================

/**
 * Create a typed schema from entity definitions.
 *
 * **Compile-time validation**: If a relation points to a non-existent entity,
 * TypeScript will show an error with the invalid target name.
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   User: {
 *     id: t.id(),
 *     name: t.string(),
 *     email: t.string(),
 *     posts: t.hasMany('Post'),
 *   },
 *   Post: {
 *     id: t.id(),
 *     title: t.string(),
 *     content: t.string(),
 *     author: t.belongsTo('User'),
 *   },
 * });
 *
 * // ❌ This would cause a compile error:
 * // createSchema({
 * //   User: { posts: t.hasMany('Posts') }  // 'Posts' doesn't exist!
 * // });
 *
 * // Type inference works automatically
 * type User = InferEntity<typeof schema.definition.User, typeof schema.definition>;
 * // { id: string; name: string; email: string; posts: Post[] }
 * ```
 */

// =============================================================================
// Type Helpers (re-exported for convenience)
// =============================================================================

/** Get entity type from schema */
export type SchemaEntity<
	S extends Schema<SchemaDefinition>,
	Name extends keyof S["definition"] & string,
> = InferEntity<S["definition"][Name], S["definition"]>;

/** Get all entity types from schema */
export type SchemaEntities<S extends Schema<SchemaDefinition>> = InferSchemaEntities<
	S["definition"]
>;

/** Selection type for an entity */
export type SchemaSelect<
	S extends Schema<SchemaDefinition>,
	Name extends keyof S["definition"] & string,
> = Select<S["definition"][Name], S["definition"]>;

/** Selected type from a selection */
export type SchemaSelected<
	S extends Schema<SchemaDefinition>,
	Name extends keyof S["definition"] & string,
	Sel extends SchemaSelect<S, Name>,
> = InferSelected<S["definition"][Name], Sel, S["definition"]>;

// =============================================================================
// Errors
// =============================================================================

/** Schema validation error */
export class SchemaValidationError extends Error {
	constructor(public readonly errors: string[]) {
		super(`Schema validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
		this.name = "SchemaValidationError";
	}
}
