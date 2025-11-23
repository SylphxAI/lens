/**
 * Resource Definition API
 *
 * Core API for defining resources with automatic validation and registration.
 *
 * @module @sylphx/lens-core/resource/define-resource
 */

import type { ZodType } from "zod";
import type { Resource, ResourceDefinition, Relationship } from "./types";
import { ResourceRegistry, ResourceRegistryError, getRegistry } from "./registry";
import { generateResourceAPI } from "../codegen/api-generator";

/**
 * Validation error for resource definitions
 */
export class ResourceDefinitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ResourceDefinitionError";
	}
}

/**
 * Validate resource name format
 *
 * Resource names must be:
 * - camelCase (lowercase first letter)
 * - Alphanumeric only
 * - Start with a letter
 * - 2-50 characters
 *
 * @param name - Resource name to validate
 * @throws {ResourceDefinitionError} If name is invalid
 */
function validateResourceName(name: string): void {
	// Check length
	if (name.length < 2 || name.length > 50) {
		throw new ResourceDefinitionError(
			`Resource name must be between 2 and 50 characters. Got: '${name}' (${name.length} chars)`,
		);
	}

	// Check format: camelCase, starts with lowercase letter
	const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/;
	if (!camelCasePattern.test(name)) {
		throw new ResourceDefinitionError(
			`Resource name must be camelCase (start with lowercase letter, alphanumeric only). Got: '${name}'`,
		);
	}

	// Reserved names
	const reserved = ["api", "query", "mutation", "subscription", "resource", "registry"];
	if (reserved.includes(name.toLowerCase())) {
		throw new ResourceDefinitionError(
			`Resource name '${name}' is reserved and cannot be used. Reserved: ${reserved.join(", ")}`,
		);
	}
}

/**
 * Validate resource definition
 *
 * Ensures definition is well-formed before registration.
 *
 * @param definition - Resource definition to validate
 * @throws {ResourceDefinitionError} If definition is invalid
 */
function validateResourceDefinition<
	TName extends string,
	TFields extends ZodType,
	TRelationships extends Record<string, Relationship>,
>(definition: ResourceDefinition<TName, TFields, TRelationships>): void {
	// Validate name
	validateResourceName(definition.name);

	// Validate fields (Zod schema)
	if (!definition.fields) {
		throw new ResourceDefinitionError(
			`Resource '${definition.name}' must have a 'fields' property with a Zod schema.`,
		);
	}

	// Validate that fields is a Zod type
	if (typeof definition.fields !== "object" || !("_def" in definition.fields)) {
		throw new ResourceDefinitionError(
			`Resource '${definition.name}' fields must be a Zod schema (z.object(...)).`,
		);
	}

	// Validate relationships
	if (definition.relationships) {
		for (const [relationName, relationship] of Object.entries(definition.relationships)) {
			// Validate relationship name format (same as resource name)
			try {
				validateResourceName(relationName);
			} catch (error) {
				if (error instanceof ResourceDefinitionError) {
					throw new ResourceDefinitionError(
						`Resource '${definition.name}' has invalid relationship name '${relationName}': ${error.message}`,
					);
				}
				throw error;
			}

			// Validate relationship has required fields
			if (!relationship.type) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' relationship '${relationName}' must have a 'type' property.`,
				);
			}

			if (!relationship.target) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' relationship '${relationName}' must have a 'target' property.`,
				);
			}

			if (!relationship.foreignKey) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' relationship '${relationName}' must have a 'foreignKey' property.`,
				);
			}

			// Validate manyToMany specific fields
			if (relationship.type === "manyToMany") {
				if (!relationship.through) {
					throw new ResourceDefinitionError(
						`Resource '${definition.name}' manyToMany relationship '${relationName}' must have a 'through' property.`,
					);
				}
				if (!relationship.targetForeignKey) {
					throw new ResourceDefinitionError(
						`Resource '${definition.name}' manyToMany relationship '${relationName}' must have a 'targetForeignKey' property.`,
					);
				}
			}
		}
	}

	// Validate computed fields
	if (definition.computed) {
		for (const [fieldName, computedFn] of Object.entries(definition.computed)) {
			if (typeof computedFn !== "function") {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' computed field '${fieldName}' must be a function.`,
				);
			}
		}
	}

	// Validate hooks
	if (definition.hooks) {
		const validHooks = [
			"beforeCreate",
			"afterCreate",
			"beforeUpdate",
			"afterUpdate",
			"beforeDelete",
			"afterDelete",
		];

		for (const [hookName, hookFn] of Object.entries(definition.hooks)) {
			if (!validHooks.includes(hookName)) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' has invalid hook '${hookName}'. Valid hooks: ${validHooks.join(", ")}`,
				);
			}

			if (typeof hookFn !== "function") {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' hook '${hookName}' must be a function.`,
				);
			}
		}
	}

	// Validate optimistic config
	if (definition.optimistic) {
		if (typeof definition.optimistic.apply !== "function") {
			throw new ResourceDefinitionError(
				`Resource '${definition.name}' optimistic config must have an 'apply' function.`,
			);
		}

		if (
			definition.optimistic.rollback &&
			typeof definition.optimistic.rollback !== "function"
		) {
			throw new ResourceDefinitionError(
				`Resource '${definition.name}' optimistic config 'rollback' must be a function if provided.`,
			);
		}
	}

	// Validate update strategy
	if (definition.updateStrategy) {
		const validStrategies = ["auto", "value", "delta", "patch"];

		// Support both string and object formats
		if (typeof definition.updateStrategy === "string") {
			if (!validStrategies.includes(definition.updateStrategy)) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' has invalid updateStrategy '${definition.updateStrategy}'. ` +
						`Valid strategies: ${validStrategies.join(", ")}`,
				);
			}
		} else if (typeof definition.updateStrategy === "object") {
			// Validate UpdateStrategyConfig object
			const config = definition.updateStrategy;

			if (config.mode && !validStrategies.includes(config.mode)) {
				throw new ResourceDefinitionError(
					`Resource '${definition.name}' has invalid updateStrategy.mode '${config.mode}'. ` +
						`Valid strategies: ${validStrategies.join(", ")}`,
				);
			}

			if (config.fieldStrategies) {
				if (typeof config.fieldStrategies !== "object") {
					throw new ResourceDefinitionError(
						`Resource '${definition.name}' updateStrategy.fieldStrategies must be an object.`,
					);
				}

				for (const [fieldName, strategy] of Object.entries(config.fieldStrategies)) {
					if (!validStrategies.includes(strategy)) {
						throw new ResourceDefinitionError(
							`Resource '${definition.name}' has invalid strategy '${strategy}' for field '${fieldName}'. ` +
								`Valid strategies: ${validStrategies.join(", ")}`,
						);
					}
				}
			}

			if (config.streamingFields) {
				if (!Array.isArray(config.streamingFields)) {
					throw new ResourceDefinitionError(
						`Resource '${definition.name}' updateStrategy.streamingFields must be an array.`,
					);
				}
			}
		} else {
			throw new ResourceDefinitionError(
				`Resource '${definition.name}' updateStrategy must be a string or UpdateStrategyConfig object.`,
			);
		}
	}

	// Validate tableName if provided
	if (definition.tableName) {
		if (typeof definition.tableName !== "string" || definition.tableName.length === 0) {
			throw new ResourceDefinitionError(
				`Resource '${definition.name}' tableName must be a non-empty string.`,
			);
		}
	}
}

/**
 * Define a resource
 *
 * Creates a typed resource definition with automatic validation and registration.
 * This is the main entry point for the resource-based architecture.
 *
 * @example
 * ```ts
 * const Message = defineResource({
 *   name: 'message',
 *   fields: z.object({
 *     id: z.string(),
 *     role: z.enum(['user', 'assistant']),
 *     content: z.string(),
 *   }),
 *   relationships: {
 *     steps: hasMany('step', { foreignKey: 'message_id' }),
 *     session: belongsTo('session', { foreignKey: 'session_id' })
 *   },
 *   optimistic: {
 *     idField: 'id',
 *     apply: (draft, mutation) => {
 *       Object.assign(draft, mutation.data);
 *     }
 *   },
 *   hooks: {
 *     beforeCreate: async (data) => ({
 *       ...data,
 *       created_at: new Date()
 *     })
 *   },
 *   updateStrategy: 'auto'
 * });
 *
 * // Access auto-generated API (Phase 2)
 * const messageAPI = Message.api;
 * ```
 *
 * @param definition - Resource definition
 * @returns Typed resource handle
 * @throws {ResourceDefinitionError} If definition is invalid
 * @throws {ResourceRegistryError} If resource name already exists
 */
export function defineResource<
	TName extends string,
	TFields extends ZodType,
	TRelationships extends Record<string, Relationship> = Record<string, never>,
>(
	definition: ResourceDefinition<TName, TFields, TRelationships>,
): Resource<TName, TFields, TRelationships> {
	// Validate definition
	validateResourceDefinition(definition);

	// Create resource handle
	const resource: Resource<TName, TFields, TRelationships> = {
		definition,
		name: definition.name,
		// @ts-expect-error - entity is compile-time only, never has runtime value
		entity: undefined,
		relationships: (definition.relationships || {}) as TRelationships,
		// api will be generated
		api: undefined as any,
	};

	// Register resource
	const registry = getRegistry();
	registry.register(resource);

	// Generate API
	resource.api = generateResourceAPI(resource);

	return resource;
}

/**
 * Validate all registered resources
 *
 * Call this after defining all resources to ensure relationship integrity.
 * Validates that all relationship targets exist.
 *
 * @example
 * ```ts
 * const Session = defineResource({ ... });
 * const Message = defineResource({ ... });
 * const Step = defineResource({ ... });
 *
 * // Validate all relationships
 * validateAllResources();
 * ```
 *
 * @throws {ResourceRegistryError} If any relationship target is missing
 */
export function validateAllResources(): void {
	const registry = getRegistry();
	registry.validateRelationships();
}

/**
 * Get a registered resource by name
 *
 * Useful for dynamic resource lookup.
 *
 * @param name - Resource name
 * @returns Resource or undefined if not found
 */
export function getResource(name: string): Resource | undefined {
	const registry = getRegistry();
	return registry.get(name);
}

/**
 * Get all registered resources
 *
 * @returns Array of all resources
 */
export function getAllResources(): Resource[] {
	const registry = getRegistry();
	return registry.getAll();
}
