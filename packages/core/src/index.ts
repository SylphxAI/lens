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
	// Input types
	type CreateInput,
	type UpdateInput,
	type DeleteInput,
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
	// Utility types
	type RequireKeys,
	type OptionalKeys,
	type DeepPartial,
} from "./schema/infer";

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
