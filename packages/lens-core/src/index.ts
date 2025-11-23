/**
 * @sylphx/lens-core
 *
 * Type-safe, real-time API framework
 * Combines GraphQL field selection + tRPC type inference + Zod validation
 */

// Schema builder
export { lens, createLensBuilder } from "./schema/builder.js";

// Optimistic updates
export { OptimisticBuilder } from "./schema/optimistic-builder.js";
export { TransformUtils } from "./schema/transform-utils.js";
export type {
	OptimisticConfig,
	Descriptor,
	FieldDescriptor,
	TransformDescriptor,
	LiteralDescriptor,
	Operation,
	SetOperation,
	ArrayPushOperation,
	ArraySpliceOperation,
	OptimisticUpdate,
} from "./schema/optimistic-types.js";

// Types
export type {
	LensQuery,
	LensMutation,
	LensObject,
	LensRequest,
	LensResponse,
	FieldSelection,
	Select,
	Selected,
	InferInput,
	InferOutput,
	InferContext,
	UpdateMode,
	UpdatePayload,
} from "./schema/types.js";

// Transport
export type {
	LensTransport,
	QueryTransport,
	SubscriptionTransport,
	TransportMiddleware,
} from "./transport/interface.js";

export {
	MiddlewareTransport,
	TransportRouter,
} from "./transport/interface.js";

export { InProcessTransport } from "./transport/in-process.js";

// Update strategies
export type { UpdateStrategy } from "./update-strategy/types.js";
export { ValueStrategy } from "./update-strategy/value.js";
export { DeltaStrategy } from "./update-strategy/delta.js";
export { PatchStrategy } from "./update-strategy/patch.js";
export { AutoStrategy } from "./update-strategy/auto.js";

// Re-export Observable for convenience
export type { Observable } from "rxjs";

// Resource system
export {
	defineResource,
	validateAllResources,
	getResource,
	getAllResources,
	ResourceDefinitionError,
	hasMany,
	belongsTo,
	hasOne,
	manyToMany,
	ResourceRegistry,
	ResourceRegistryError,
	getRegistry,
} from "./resource/index.js";

export type {
	Resource,
	ResourceDefinition,
	InferEntity,
	Relationship,
	RelationshipType,
	HasManyRelationship,
	BelongsToRelationship,
	HasOneRelationship,
	ManyToManyRelationship,
	BaseRelationship,
	ComputedField,
	ResourceHooks,
	QueryOptions,
	ListOptions,
	MutationOptions,
	Subscription,
	SubscriptionHandlers,
	QueryContext,
	DatabaseAdapter,
	EventStreamInterface,
	HasManyOptions,
	BelongsToOptions,
	HasOneOptions,
	ManyToManyOptions,
	UpdateStrategyMode,
	UpdateStrategyConfig,
	StrategyConfig,
} from "./resource/index.js";

// Update strategy integration
export {
	UpdateStrategySelector,
	applyUpdateStrategy,
	applyUpdateStrategies,
	createOptimisticUpdate,
	encodeUpdate,
	decodeUpdate,
	getStrategyMetadata,
	DEFAULT_STRATEGY_CONFIG,
} from "./resource/index.js";

// Query planning
export { QueryPlanner } from "./query/index.js";
export type {
	QueryPlan,
	QueryStrategy,
	N1Detection,
	DepthAnalysis,
} from "./query/index.js";

// DataLoader
export {
	DataLoader,
	ResourceDataLoaderFactory,
	createDataLoaderFactory,
} from "./loader/index.js";

export type { BatchLoadFn, DataLoaderOptions } from "./loader/index.js";

// Code generation
export { generateResourceAPI, type ResourceAPI } from "./codegen/index.js";

// Event system
export {
	EventStream,
	createEventStream,
	type Event,
	type SubscriptionOptions,
} from "./events/index.js";

// Error system
export {
	LensError,
	ValidationError,
	QueryError,
	EntityNotFoundError,
	MutationError,
	RelationshipError,
	ResourceError,
	ContextError,
	DataLoaderError,
	EventError,
	ErrorHelpers,
	LensErrorCode,
	type LensErrorMeta,
} from "./errors/index.js";

// Performance monitoring
export {
	PerformanceMonitor,
	getPerformanceMonitor,
	setPerformanceMonitor,
	measure,
	type PerformanceMetric,
	type PerformanceSummary,
} from "./performance/index.js";

// Field-level subscriptions
export {
	FieldSubscriptionManager,
	getFieldSubscriptionManager,
	setFieldSubscriptionManager,
	isStreamingHandlers,
	isFieldHandlers,
	applyDelta,
	type DeltaOperation,
	type StreamingFieldHandlers,
	type FieldHandlers,
	type FieldSubscriptionHandlers,
	type FieldSubscriptions,
	type FieldSubscriptionOptions,
	type FieldUpdateEvent,
} from "./subscription/index.js";

