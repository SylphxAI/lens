/**
 * Resource System
 *
 * Core resource-based architecture for Lens.
 * Declarative resource definitions with auto-generated APIs.
 *
 * @module @sylphx/lens-core/resource
 */

// Main API
export {
	defineResource,
	validateAllResources,
	getResource,
	getAllResources,
	ResourceDefinitionError,
} from "./define-resource";

// Relationship helpers
export { hasMany, belongsTo, hasOne, manyToMany } from "./relationships";
export type {
	HasManyOptions,
	BelongsToOptions,
	HasOneOptions,
	ManyToManyOptions,
} from "./relationships";

// Registry
export { ResourceRegistry, ResourceRegistryError, getRegistry } from "./registry";

// Types
export type {
	// Core types
	Resource,
	ResourceDefinition,
	InferEntity,
	// Relationships
	Relationship,
	RelationshipType,
	HasManyRelationship,
	BelongsToRelationship,
	HasOneRelationship,
	ManyToManyRelationship,
	BaseRelationship,
	// Computed fields
	ComputedField,
	// Hooks
	ResourceHooks,
	// Optimistic updates
	OptimisticConfig,
	// Update strategies
	UpdateStrategy,
	// Query types
	QueryOptions,
	ListOptions,
	MutationOptions,
	Select,
	Include,
	// Subscriptions
	Subscription,
	SubscriptionHandlers,
	// Context
	QueryContext,
	DatabaseAdapter,
	EventStreamInterface,
} from "./types";
