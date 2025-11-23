/**
 * OptimisticExecutor - Execute optimistic updates on normalized cache
 *
 * Takes serialized optimistic operations and applies them to the cache.
 * Handles descriptor resolution, transform execution, and operation application.
 */

import type { OptimisticConfig, Descriptor, Operation } from "@sylphx/lens-core";
import { NormalizedCache } from "./cache.js";
import { executeTransform } from "./transforms.js";

/**
 * Optimistic executor for applying updates to cache
 *
 * Usage:
 * ```ts
 * const executor = new OptimisticExecutor(cache);
 *
 * // Execute optimistic update
 * executor.execute(mutationId, optimisticConfig, input);
 *
 * // Confirm when server responds with success
 * executor.confirm(mutationId, entityType, entityId);
 *
 * // Rollback on error
 * executor.rollback(mutationId, entityType, entityId);
 * ```
 */
export class OptimisticExecutor {
	constructor(private cache: NormalizedCache) {}

	/**
	 * Execute optimistic update
	 *
	 * @param mutationId - Unique mutation ID (for tracking)
	 * @param config - Optimistic configuration from mutation metadata
	 * @param input - Mutation input data
	 */
	execute(mutationId: string, config: OptimisticConfig, input: any): void {
		// 1. Extract entity ID from input
		const entityId = this.resolveDescriptor(config.id, input);

		if (entityId == null) {
			throw new Error(
				`Failed to resolve entity ID from input. Path: ${JSON.stringify(config.id.path)}`,
			);
		}

		// 2. Get current entity state (or create empty)
		const currentEntity = this.cache.get(config.entity, entityId) || {};

		// 3. Execute operations to build optimistic data
		const optimisticData: Record<string, any> = {};

		for (const operation of config.operations) {
			this.executeOperation(operation, optimisticData, currentEntity, input);
		}

		// 4. Apply optimistic data to cache
		this.cache.applyOptimistic(mutationId, config.entity, entityId, optimisticData);
	}

	/**
	 * Confirm optimistic update (merge into base)
	 *
	 * @param mutationId - Unique mutation ID
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 */
	confirm(mutationId: string, entityType: string, entityId: string | number): void {
		this.cache.confirmOptimistic(mutationId, entityType, entityId);
	}

	/**
	 * Rollback optimistic update (remove optimistic layer)
	 *
	 * @param mutationId - Unique mutation ID
	 * @param entityType - Entity type
	 * @param entityId - Entity ID
	 */
	rollback(mutationId: string, entityType: string, entityId: string | number): void {
		this.cache.rollbackOptimistic(mutationId, entityType, entityId);
	}

	/**
	 * Execute a single operation
	 *
	 * @param operation - Operation to execute
	 * @param target - Target object to apply operation to
	 * @param currentEntity - Current entity state (for reference)
	 * @param input - Mutation input data (for field resolution)
	 */
	private executeOperation(
		operation: Operation,
		target: Record<string, any>,
		currentEntity: Record<string, any>,
		input: any,
	): void {
		const context = { ...input, __entity: currentEntity };

		switch (operation.op) {
			case "set": {
				const value = this.resolveDescriptor(operation.value, context);
				this.setAtPath(target, operation.path, value);
				break;
			}

			case "array-push": {
				const items = operation.items.map((item) => this.resolveDescriptor(item, context));
				// Get current array from entity (not from target which is empty)
				const currentArray = this.getAtPath(currentEntity, operation.path) || [];
				this.setAtPath(target, operation.path, [...currentArray, ...items]);
				break;
			}

			case "array-splice": {
				const items = operation.items.map((item) => this.resolveDescriptor(item, context));
				// Get current array from entity (not from target which is empty)
				const currentArray = this.getAtPath(currentEntity, operation.path) || [];
				const newArray = [...currentArray];
				newArray.splice(operation.start, operation.deleteCount, ...items);
				this.setAtPath(target, operation.path, newArray);
				break;
			}

			default:
				throw new Error(`Unknown operation: ${(operation as any).op}`);
		}
	}

	/**
	 * Resolve descriptor to actual value
	 *
	 * @param descriptor - Descriptor to resolve
	 * @param context - Context for field resolution (input + current entity)
	 * @returns Resolved value
	 */
	private resolveDescriptor(descriptor: Descriptor, context: any): any {
		switch (descriptor.type) {
			case "literal":
				return descriptor.value;

			case "field":
				return this.resolveFieldPath(descriptor.path, context);

			case "transform":
				return executeTransform(descriptor, context);

			default:
				throw new Error(`Unknown descriptor type: ${(descriptor as any).type}`);
		}
	}

	/**
	 * Resolve field path from context
	 *
	 * @param path - Field path (e.g., ['user', 'name'])
	 * @param context - Context object (input or entity)
	 * @returns Resolved value
	 */
	private resolveFieldPath(path: string[], context: any): any {
		let value = context;
		for (const key of path) {
			if (value == null) return undefined;
			value = value[key];
		}
		return value;
	}

	/**
	 * Set value at path in target object
	 *
	 * @param target - Target object
	 * @param path - Path to set (e.g., ['user', 'name'])
	 * @param value - Value to set
	 */
	private setAtPath(target: Record<string, any>, path: string[], value: any): void {
		if (path.length === 0) return;

		let current = target;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (!(key in current) || typeof current[key] !== "object") {
				current[key] = {};
			}
			current = current[key];
		}

		current[path[path.length - 1]] = value;
	}

	/**
	 * Get value at path in target object
	 *
	 * @param target - Target object
	 * @param path - Path to get (e.g., ['user', 'name'])
	 * @returns Value at path, or undefined if not found
	 */
	private getAtPath(target: Record<string, any>, path: string[]): any {
		let current = target;
		for (const key of path) {
			if (current == null || typeof current !== "object") {
				return undefined;
			}
			current = current[key];
		}
		return current;
	}
}
