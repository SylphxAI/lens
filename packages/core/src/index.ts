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
	ArrayType,
	BelongsToType,
	BooleanType,
	// Custom types
	CustomType,
	type CustomTypeDefinition,
	DateTimeType,
	DecimalType,
	type DefaultType,
	defineType,
	type EntityDefinition,
	EnumType,
	// Definition types
	type FieldDefinition,
	// Base classes
	FieldType,
	FloatType,
	HasManyType,
	// Relation types
	HasOneType,
	// Scalar types
	IdType,
	IntType,
	isHasManyType,
	// Type guards
	isRelationType,
	isScalarType,
	// Type helpers
	type NullableType,
	ObjectType,
	type RelationBrand,
	type SchemaDefinition,
	StringType,
	// Type builders
	t,
} from "./schema/types.js";

// =============================================================================
// Schema Creation
// =============================================================================

export {
	type EntityMeta,
	// Metadata types
	type RelationMeta,
	// Schema class
	Schema,
	type SchemaEntities,
	// Type helpers
	type SchemaEntity,
	type SchemaSelect,
	type SchemaSelected,
	// Errors
	SchemaValidationError,
	// Validation types
	type ValidatedSchemaDefinition,
} from "./schema/create.js";

// =============================================================================
// Entity & Schema Definition (Primary API)
// =============================================================================

export {
	// Schema creation
	createSchema,
	// Entity definition
	defineEntity,
	type EntityDef,
	entity,
	isEntityDef,
} from "./schema/define.js";

// =============================================================================
// Type Inference
// =============================================================================

export type {
	// Input types (mutations)
	CreateInput,
	DeepPartial,
	DeleteInput,
	EntityNames,
	EntityType,
	// Field arguments (GraphQL-style)
	FieldArgs,
	// Entity inference
	InferEntity,
	InferFieldType,
	// Relation inference
	InferRelationTarget,
	InferRelationType,
	// Scalar inference
	InferScalar,
	InferScalarWithNullable,
	// Schema inference
	InferSchemaEntities,
	InferSelected,
	IsBelongsTo,
	IsHasMany,
	IsHasOne,
	IsRelation,
	OptionalKeys,
	RelationFields,
	RelationSelectOptions,
	// Utility types
	RequireKeys,
	// Field categorization
	ScalarFields,
	// Scalar selection options (with args)
	ScalarSelectOptions,
	// Selection inference
	Select,
	UpdateInput,
} from "./schema/infer.js";

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
	type ArrayDiffOperation,
	type ArrayUpdate,
	// Array diff
	applyArrayDiff,
	applyUpdate,
	computeArrayDiff,
	createArrayUpdate,
	createUpdate,
	type DeltaOperation,
	type DeltaUpdate,
	deltaStrategy,
	type PatchOperation,
	type PatchUpdate,
	patchStrategy,
	// Strategy names
	type StrategyName,
	// Strategy selection
	selectStrategy,
	// Update types
	type Update,
	// Strategy interface
	type UpdateStrategy,
	type ValueUpdate,
	// Strategy implementations
	valueStrategy,
} from "./updates/strategies.js";

// =============================================================================
// Operations API (query, mutation)
// =============================================================================

export {
	type AnyProcedure,
	flattenRouter,
	type InferRouterClient,
	type InferRouterContext,
	// Type guards
	isMutationDef,
	isOperationDef,
	isOptimisticDSL,
	isQueryDef,
	isRouterDef,
	isTempId,
	// Context types
	type LensContext,
	type LensContextExtensions,
	// Types
	type MutationDef,
	type MutationResultType,
	// Builders
	mutation,
	type Operations,
	type OptimisticCallback,
	type OptimisticContext,
	type OptimisticDSL,
	type OptimisticSugar,
	operations,
	type QueryDef,
	type QueryResultType,
	query,
	type ResolverContext,
	type ResolverFn,
	type ReturnSpec,
	type RouterDef,
	type RouterRoutes,
	resetTempIdCounter,
	router,
	tempId,
	type ZodLikeSchema,
} from "./operations/index.js";

// =============================================================================
// Field Resolvers
// =============================================================================

export {
	// Types
	type ExposedField,
	type FieldBuilder,
	type FieldDef,
	type FieldResolverContext,
	type InferResolverOutput,
	type InferResolverSelected,
	// Type guards
	isExposedField,
	isResolvedField,
	isResolverDef,
	type ResolvedField,
	type ResolverDef,
	// Resolver array
	type Resolvers,
	// Main function (prefer lens() factory instead)
	resolver,
	toResolverMap,
} from "./resolvers/index.js";

// =============================================================================
// Emit API
// =============================================================================

export {
	type ArrayOperation,
	// Factory
	createEmit,
	createEmitArray,
	createEmitObject,
	// Types
	type Emit,
	type EmitArray,
	type EmitCommand,
	type EmitObject,
	type FieldUpdate,
	type InternalFieldUpdate,
} from "./emit/index.js";

// =============================================================================
// Context System (Internal - used by server)
// =============================================================================

// Note: Context is now passed directly to resolvers via `ctx` parameter (tRPC style).
// These exports are kept for advanced use cases and server internals.
export {
	// Types
	type ContextStore,
	type ContextValue,
	// Core functions (internal use)
	createContext,
	runWithContext,
	runWithContextAsync,
} from "./context/index.js";

// =============================================================================
// Optimistic Updates (Internal)
// =============================================================================

// Note: For Reify DSL (pipe, entity, ref, temp, etc.), import directly from @sylphx/reify
export {
	// Internal (for type checking)
	isPipeline,
	type Pipeline,
} from "./optimistic/index.js";

// =============================================================================
// Lens Factory (Primary API)
// =============================================================================

export {
	// Types
	type Lens,
	type LensMutation,
	type LensQuery,
	type LensResolver,
	// Main factory
	lens,
} from "./lens.js";

// =============================================================================
// Reconnection System
// =============================================================================

export {
	// Types
	type Version,
	type VersionedEntityState,
	type VersionedArrayState,
	type OperationLogEntry,
	type OperationLogConfig,
	type OperationLogStats,
	type SubscriptionState,
	type TrackedSubscription,
	type SubscriptionObserver,
	type SubscriptionResult,
	type SubscriptionRegistryStats,
	type ReconnectSubscription,
	type ReconnectMessage,
	type ReconnectStatus,
	type ReconnectResult,
	type ReconnectAckMessage,
	type SubscriptionAckMessage,
	type VersionedFieldUpdate,
	type VersionedEntityUpdate,
	type VersionedUpdateMessage,
	type ConnectionState,
	type ReconnectConfig,
	type ConnectionQuality,
	type ReconnectionMetrics,
	type ReconnectionHealth,
	type CompressionAlgorithm,
	type CompressedPayload,

	// Constants
	PROTOCOL_VERSION,
	DEFAULT_OPERATION_LOG_CONFIG,
	DEFAULT_RECONNECT_CONFIG,

	// Utilities
	isCompressedPayload,
	generateReconnectId,

	// Hashing
	murmurhash3,
	hashValue,
	stableStringify,
	hashEntityState,
	hashEntityFields,
	HashCache,
	FieldHashMap,
	valuesEqual,
	deepEqual,

	// Operation Log
	OperationLog,
	coalescePatches,
	estimatePatchSize,
	applyPatch,

	// Subscription Registry
	SubscriptionRegistry,
	createSubscriptionRegistry,
} from "./reconnect/index.js";
