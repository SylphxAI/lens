/**
 * @sylphx/lens-core
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

export type {
	// Scalar inference
	InferScalar,
	// Relation inference
	InferRelationTarget,
	IsRelation,
	IsHasMany,
	// Field categorization
	ScalarFields,
	RelationFields,
	NumericFields,
	// Entity inference
	InferEntity,
	InferFieldType,
	InferScalarWithNullable,
	InferRelationType,
	// Selection inference
	Select,
	RelationSelectOptions,
	InferSelected,
	// Schema inference
	InferSchemaEntities,
	EntityNames,
	EntityType,
	// Input types (mutations)
	CreateInput,
	UpdateInput,
	DeleteInput,
	CreateInputWithRelations,
	UpdateInputWithRelations,
	// Batch operation types
	CreateManyInput,
	CreateManyResult,
	UpdateManyInput,
	UpdateManyResult,
	DeleteManyInput,
	DeleteManyResult,
	// Relation mutation types
	ConnectInput,
	ConnectOrCreateInput,
	SingleRelationInput,
	ManyRelationInput,
	// Find types
	FindFirstInput,
	FindUniqueInput,
	FindManyInput,
	WhereUniqueInput,
	UpsertInput,
	DistinctInput,
	// Filter types (Where)
	StringFilter,
	NumberFilter,
	BooleanFilter,
	DateTimeFilter,
	EnumFilter,
	FieldFilter,
	WhereInput,
	// Sorting types (OrderBy)
	SortOrder,
	NullsOrder,
	SortOrderInput,
	OrderByInput,
	// Pagination types
	CursorInput,
	PaginationInput,
	// Aggregation types
	AggregateSelect,
	AggregateInput,
	AggregateResult,
	CountInput,
	GroupByInput,
	// Utility types
	RequireKeys,
	OptionalKeys,
	DeepPartial,
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
	router,
	// Helpers
	tempId,
	resetTempIdCounter,
	isTempId,
	flattenRouter,
	// Type guards
	isQueryDef,
	isMutationDef,
	isOperationDef,
	isRouterDef,
	isOptimisticDSL,
	normalizeOptimisticDSL,
	// Types
	type QueryDef,
	type MutationDef,
	type RouterDef,
	type RouterRoutes,
	type AnyProcedure,
	type InferRouterClient,
	type InferRouterContext,
	type QueryResultType,
	type MutationResultType,
	type QueryBuilder,
	type MutationBuilder,
	type ResolverContext,
	type ResolverFn,
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
// Emit API
// =============================================================================

export {
	// Factory
	createEmit,
	createEmitObject,
	createEmitArray,
	// Types
	type Emit,
	type EmitObject,
	type EmitArray,
	type FieldUpdate,
	type EmitCommand,
	type InternalFieldUpdate,
	type ArrayOperation,
} from "./emit/index";

// =============================================================================
// Context System (Internal - used by server)
// =============================================================================

// Note: Context is now passed directly to resolvers via `ctx` parameter (tRPC style).
// These exports are kept for advanced use cases and server internals.
export {
	// Core functions (internal use)
	createContext,
	runWithContext,
	runWithContextAsync,
	// Types
	type ContextStore,
	type ContextValue,
} from "./context/index";
