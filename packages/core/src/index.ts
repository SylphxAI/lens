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
	// Context-aware type builder
	type ContextualField,
	// Custom scalar types (deprecated aliases)
	CustomType,
	type CustomTypeDefinition,
	createTypeBuilder,
	DateTimeType,
	DecimalType,
	type DefaultType,
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
	// Custom scalar types (new names)
	ScalarType,
	type ScalarTypeDefinition,
	type SchemaDefinition,
	StringType,
	TimestampType,
	type TypeBuilder,
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
// Model Definition (Primary API - New)
// =============================================================================

export {
	// Model factory
	type ContextualModelBuilder,
	type InferModelType,
	isModelDef,
	isNormalizableModel,
	MODEL_SYMBOL,
	type ModelBuilder,
	ModelBuilderClass,
	type ModelDef,
	type ModelFactory,
	model,
	type PlainFieldDefinition,
} from "./schema/model.js";

// =============================================================================
// Field Type Builders (New API - no t. prefix)
// =============================================================================

export {
	// Scalar field builders
	bigint,
	boolean,
	bytes,
	datetime,
	decimal,
	enumType,
	// Field definition type
	type FieldDef as FieldDefinitionType,
	float,
	// Type inference
	type InferFieldDefType,
	type IsList,
	type IsNullable,
	id,
	int,
	isLazyRef,
	// Type guards
	isListDef,
	isNullableDef,
	json,
	// Symbols
	LIST_SYMBOL,
	// Types
	type ListDef,
	// Functions
	list,
	NULLABLE_SYMBOL,
	type NullableDef,
	nullable,
	object,
	processFieldDef,
	scalar,
	string,
	timestamp,
	// Utility types
	type UnwrapType,
} from "./schema/fields.js";

export {
	// Model resolver types
	type FieldResolverMap,
	type FieldSubscriberMap,
	hasFieldResolvers,
	hasFieldSubscribers,
	type InferModelSource,
	type ModelDefChainable,
	type ModelDefComplete,
	type ModelDefWithResolvers,
	type ModelDefWithSubscribers,
	type ModelFieldResolver,
	type ModelFieldSubscriber,
	type ScalarFieldsOnly,
} from "./schema/model-resolvers.js";

// =============================================================================
// Legacy Wrapper Aliases (for backward compatibility)
// =============================================================================

export {
	isListWrapper,
	isNullableWrapper,
	// Legacy aliases - prefer ListDef/NullableDef from fields.js
	type ListWrapper,
	type NullableWrapper,
	type UnwrapModel,
} from "./schema/wrappers.js";

// =============================================================================
// Model Collection Utilities
// =============================================================================

export {
	type CollectedModels,
	collectModelsFromOperations,
	collectModelsFromRouter,
	mergeModelCollections,
} from "./schema/collect.js";

// =============================================================================
// Entity & Schema Definition (Legacy - use model() instead)
// =============================================================================

export {
	/** @deprecated Use ContextualModelBuilder instead */
	type ContextualEntityBuilder,
	// Schema creation
	createSchema,
	/** @deprecated Use model() instead */
	defineEntity,
	/** @deprecated Use ModelBuilder instead */
	type EntityBuilder,
	/** @deprecated Use ModelBuilderClass instead */
	EntityBuilder_,
	type EntityDef,
	/** @deprecated Use model() instead */
	entity,
	isEntityDef,
	/** @deprecated Use model<TContext>() instead */
	type TypedEntityFactory,
	/** @deprecated Use model<TContext>() instead */
	typedEntity,
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
	type AnyQueryDef,
	flattenRouter,
	type InferRouterClient,
	type InferRouterContext,
	// Type guards
	isLiveQueryDef,
	isMutationDef,
	isOperationDef,
	isOptimisticDSL,
	isQueryDef,
	isRouterDef,
	isSubscribedQueryDef,
	isTempId,
	type LiveQueryDef,
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
	type PublisherResolverFn,
	type QueryDef,
	type QueryDefChainable,
	type QueryMode,
	type QueryResultType,
	query,
	type ReturnSpec,
	type RouterDef,
	type RouterRoutes,
	resetTempIdCounter,
	router,
	type SubscribedQueryDef,
	tempId,
} from "./operations/index.js";

// =============================================================================
// Field Resolvers
// =============================================================================

export {
	// Entity to resolver conversion (unified entity definition)
	createResolverFromEntity,
	// Types
	type ExposedField,
	type FieldBuilder,
	type FieldDef,
	type FieldEmit,
	type FieldQueryContext,
	type FieldResolveParams,
	type FieldResolverContext,
	hasInlineResolvers,
	type InferResolverOutput,
	type InferResolverSelected,
	// Type guards
	isExposedField,
	isResolvedField,
	isResolverDef,
	type OnCleanup,
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
	createEmitScalar,
	// Types
	type Emit,
	type EmitArray,
	type EmitCommand,
	type EmitObject,
	type EmitScalar,
	type FieldUpdate,
	type InternalFieldUpdate,
	// Op conversion
	toOps,
} from "./emit/index.js";

// =============================================================================
// Context System (Types only - implementation in server)
// =============================================================================

// Note: Context is now passed directly to resolvers via `ctx` parameter (tRPC style).
// Type exports only - implementation is in @sylphx/lens-server to avoid Node.js deps.
export type { ContextStore, ContextValue } from "./context/index.js";

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
	type LensBuilder,
	type LensConfig,
	type LensModel,
	type LensMutation,
	type LensQuery,
	type LensResolver,
	type LensWithPlugins,
	// Main factory
	lens,
} from "./lens.js";

// =============================================================================
// Reconnection System
// =============================================================================

export {
	// Patch utilities (shared)
	applyPatch,
	type ConnectionQuality,
	type ConnectionState,
	createMetricsTracker,
	// Subscription tracking
	createSubscriptionRegistry,
	DEFAULT_METRICS_CONFIG,
	DEFAULT_OPERATION_LOG_CONFIG,
	DEFAULT_RECONNECT_CONFIG,
	deepEqual,
	FieldHashMap,
	generateReconnectId,
	HashCache,
	hashEntityFields,
	hashEntityState,
	hashValue,
	type MetricsCollector,
	type MetricsConfig,
	type MetricsEvent,
	// Hashing
	murmurhash3,
	// Operation Log types (implementation in server)
	type OperationLogConfig,
	type OperationLogEntry,
	type OperationLogStats,
	// Constants
	PROTOCOL_VERSION,
	type ReconnectAckMessage,
	type ReconnectConfig,
	type ReconnectionHealth,
	type ReconnectionMetrics,
	// Metrics
	ReconnectionMetricsTracker,
	type ReconnectionRecord,
	type ReconnectMessage,
	type ReconnectResult,
	type ReconnectStatus,
	type ReconnectSubscription,
	type SubscriptionAckMessage,
	type SubscriptionObserver,
	SubscriptionRegistry,
	type SubscriptionRegistryStats,
	type SubscriptionResult,
	type SubscriptionState,
	stableStringify,
	type TrackedSubscription,
	// Types
	type Version,
	type VersionedArrayState,
	type VersionedEntityState,
	type VersionedEntityUpdate,
	type VersionedFieldUpdate,
	type VersionedUpdateMessage,
	valuesEqual,
} from "./reconnect/index.js";

// =============================================================================
// Observable Types
// =============================================================================

export {
	// Functions
	firstValueFrom,
	fromAsyncIterable,
	fromPromise,
	isObservable,
	// Types
	type Observable,
	type Observer,
	of,
	throwError,
	type Unsubscribable,
} from "./observable/index.js";

// =============================================================================
// Wire Protocol
// =============================================================================

export {
	applyOp,
	applyOps,
	isError,
	isOps,
	isSnapshot,
	type Message,
	type MessageData,
	type MessageObservable,
	type MessageObserver,
	type Op,
} from "./protocol/index.js";

// =============================================================================
// Plugin System
// =============================================================================

export {
	// Legacy extraction types (backward compatibility)
	type ExtractExtension,
	type ExtractPluginExtensions,
	// Direct type lookup extraction (for generic-aware plugins)
	type ExtractPluginMethods,
	type HasPlugin,
	type IfPlugin,
	isOptimisticPlugin,
	// Paired Plugin (Client/Server plugin pairs)
	isPairedPlugin,
	isRuntimePlugin,
	type MergeExtensions,
	type MutationBuilderWithOptimisticExt,
	type NoExtension,
	type NoPlugins,
	OPTIMISTIC_PLUGIN_SYMBOL,
	// Optimistic Plugin Extension
	type OptimisticPluginExtension,
	type OptimisticPluginMarker,
	// Optimistic Plugin Methods (for type composition)
	type OptimisticPluginMethods,
	type PairedPlugin,
	// Plugin Extension Protocol
	type PluginExtension,
	type PluginHooks,
	type Prettify,
	// Runtime
	type RuntimePlugin,
	resolveClientPlugins,
	resolveServerPlugins,
	// Type Utilities
	type UnionToIntersection,
} from "./plugin/index.js";
