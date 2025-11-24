/**
 * @lens/core
 *
 * Core schema types and utilities for Lens.
 * TypeScript-first reactive API framework.
 */

// =============================================================================
// Schema Types
// =============================================================================

export {
	// Type builders
	t,
	// Base classes
	FieldType,
	// Scalar types
	IdType,
	StringType,
	IntType,
	FloatType,
	BooleanType,
	DateTimeType,
	EnumType,
	ObjectType,
	ArrayType,
	// Relation types
	HasOneType,
	HasManyType,
	BelongsToType,
	// Type helpers
	type NullableType,
	type DefaultType,
	type RelationBrand,
	// Type guards
	isRelationType,
	isScalarType,
	isHasManyType,
	// Definition types
	type FieldDefinition,
	type EntityDefinition,
	type SchemaDefinition,
} from "./schema/types";

// =============================================================================
// Schema Creation
// =============================================================================

export {
	// Schema class
	Schema,
	// Factory function
	createSchema,
	// Metadata types
	type RelationMeta,
	type EntityMeta,
	// Type helpers
	type SchemaEntity,
	type SchemaEntities,
	type SchemaSelect,
	type SchemaSelected,
	// Validation types
	type ValidatedSchemaDefinition,
	// Errors
	SchemaValidationError,
} from "./schema/create";

// =============================================================================
// Two-Phase Schema Definition (Drizzle-style)
// =============================================================================

export {
	// Entity definition
	defineEntity,
	isEntityDef,
	type EntityDef,
	// Schema creation
	createSchemaFrom,
	// Relation helpers (no strings!)
	hasMany,
	hasOne,
	belongsTo,
} from "./schema/define";

// =============================================================================
// Type Inference
// =============================================================================

export {
	// Scalar inference
	type InferScalar,
	// Relation inference
	type InferRelationTarget,
	type IsRelation,
	type IsHasMany,
	// Field categorization
	type ScalarFields,
	type RelationFields,
	type NumericFields,
	// Entity inference
	type InferEntity,
	type InferFieldType,
	type InferScalarWithNullable,
	type InferRelationType,
	// Selection inference
	type Select,
	type RelationSelectOptions,
	type InferSelected,
	// Schema inference
	type InferSchemaEntities,
	type EntityNames,
	type EntityType,
	// Input types (mutations)
	type CreateInput,
	type UpdateInput,
	type DeleteInput,
	type CreateInputWithRelations,
	type UpdateInputWithRelations,
	// Batch operation types
	type CreateManyInput,
	type CreateManyResult,
	type UpdateManyInput,
	type UpdateManyResult,
	type DeleteManyInput,
	type DeleteManyResult,
	// Relation mutation types
	type ConnectInput,
	type ConnectOrCreateInput,
	type SingleRelationInput,
	type ManyRelationInput,
	// Find types
	type FindFirstInput,
	type FindUniqueInput,
	type FindManyInput,
	type WhereUniqueInput,
	type UpsertInput,
	type DistinctInput,
	// Filter types (Where)
	type StringFilter,
	type NumberFilter,
	type BooleanFilter,
	type DateTimeFilter,
	type EnumFilter,
	type FieldFilter,
	type WhereInput,
	// Sorting types (OrderBy)
	type SortOrder,
	type NullsOrder,
	type SortOrderInput,
	type OrderByInput,
	// Pagination types
	type CursorInput,
	type PaginationInput,
	// Aggregation types
	type AggregateSelect,
	type AggregateInput,
	type AggregateResult,
	type CountInput,
	type GroupByInput,
	// Utility types
	type RequireKeys,
	type OptionalKeys,
	type DeepPartial,
} from "./schema/infer";

// =============================================================================
// Shared Types
// =============================================================================

/** Entity key format: "EntityName:id" */
export type EntityKey = `${string}:${string}`;

/** Create entity key from entity name and id */
export function makeEntityKey(entity: string, id: string): EntityKey {
	return `${entity}:${id}`;
}

/** Parse entity key into entity name and id */
export function parseEntityKey(key: EntityKey): [string, string] {
	const colonIndex = key.indexOf(":");
	return [key.slice(0, colonIndex), key.slice(colonIndex + 1)];
}

// =============================================================================
// Update Strategies
// =============================================================================

export {
	// Strategy names
	type StrategyName,
	// Update types
	type Update,
	type ValueUpdate,
	type DeltaUpdate,
	type DeltaOperation,
	type PatchUpdate,
	type PatchOperation,
	// Strategy interface
	type UpdateStrategy,
	// Strategy implementations
	valueStrategy,
	deltaStrategy,
	patchStrategy,
	// Strategy selection
	selectStrategy,
	createUpdate,
	applyUpdate,
} from "./updates/strategies";

// =============================================================================
// Unified Plugin System
// =============================================================================

export {
	// Helper
	defineUnifiedPlugin,
	// Types
	type PluginMeta,
	type BasePluginConfig,
	// Client types
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
	// Server types
	type ServerRequestContext,
	type ServerPluginContext,
	type ServerPluginHooks,
	type ServerPluginInstance,
	type ServerPluginDef,
	// Unified
	type UnifiedPlugin,
	// Handshake
	type PluginHandshakeInfo,
	type ServerHandshake,
	type ClientHandshake,
	// Built-in plugins
	authPlugin,
	type AuthPluginConfig,
	type AuthClientAPI,
	type AuthServerAPI,
} from "./plugins";
