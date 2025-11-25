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
	DecimalType,
	EnumType,
	ObjectType,
	ArrayType,
	// Custom types
	CustomType,
	defineType,
	type CustomTypeDefinition,
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
// Entity & Schema Definition (Primary API)
// =============================================================================

export {
	// Entity definition
	defineEntity,
	entity,
	isEntityDef,
	type EntityDef,
	// Schema creation (primary)
	createSchema,
	// Relation helpers
	hasMany,
	hasOne,
	belongsTo,
	// Separate relation definition
	relation,
	type RelationDef,
	type RelationTypeWithForeignKey,
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
// Operations API (query, mutation)
// =============================================================================

export {
	// Builders
	query,
	mutation,
	// Helpers
	tempId,
	resetTempIdCounter,
	isTempId,
	// Type guards
	isQueryDef,
	isMutationDef,
	isOperationDef,
	isOptimisticDSL,
	normalizeOptimisticDSL,
	// Types
	type QueryDef,
	type MutationDef,
	type QueryBuilder,
	type MutationBuilder,
	type ResolverContext,
	type ResolverFn,
	type OptimisticFn,
	type ReturnSpec,
	type ZodLikeSchema,
	// Optimistic DSL types
	type OptimisticDSL,
	type OptimisticUpdateManyConfig,
} from "./operations/index";

// =============================================================================
// Entity Resolvers
// =============================================================================

export {
	// Main function
	entityResolvers,
	// Type guards
	isBatchResolver,
	isEntityResolvers,
	// Types
	type EntityResolvers,
	type EntityResolversDefinition,
	type EntityResolverDef,
	type FieldResolver,
	type FieldResolverFn,
	type BatchResolverFn,
} from "./resolvers/index";

// =============================================================================
// Context System (AsyncLocalStorage)
// =============================================================================

export {
	// Core functions
	createContext,
	useContext,
	tryUseContext,
	runWithContext,
	runWithContextAsync,
	// Composable helpers
	createComposable,
	createComposables,
	// Utilities
	hasContext,
	getContextStore,
	extendContext,
	// Types
	type ContextStore,
	type ContextValue,
} from "./context/index";

