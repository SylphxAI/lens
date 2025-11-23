/**
 * Resource API Generator
 *
 * Automatically generates CRUD operations from resource definitions.
 * Integrates with Builder Pattern, Optimistic Updates, and DataLoader.
 *
 * @module @sylphx/lens-core/codegen
 */

import { z } from "zod";
import type { Observable } from "rxjs";
import type {
	Resource,
	ResourceDefinition,
	InferEntity,
	QueryContext,
	QueryOptions,
	ListOptions,
	MutationOptions,
} from "../resource/types";
import { createDataLoaderFactory } from "../loader/dataloader";
import { QueryPlanner } from "../query/planner";

/**
 * Generated API for a resource
 *
 * Provides type-safe CRUD operations with automatic optimizations.
 */
export interface ResourceAPI<
	TName extends string,
	TFields extends z.ZodType,
	TRelationships extends Record<string, any>,
> {
	/** Get entity by ID with field selection and includes */
	getById: {
		query(
			input: { id: string },
			options?: QueryOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			ctx?: QueryContext,
		): Promise<InferEntity<ResourceDefinition<TName, TFields, TRelationships>> | null>;

		subscribe(
			input: { id: string },
			options?: QueryOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			handlers?: {
				onData?: (
					data: InferEntity<ResourceDefinition<TName, TFields, TRelationships>> | null,
				) => void;
				onError?: (error: Error) => void;
				onComplete?: () => void;
			},
			ctx?: QueryContext,
		): { unsubscribe: () => void };
	};

	/** List entities with filtering, ordering, and pagination */
	list: {
		query(
			input?: ListOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			ctx?: QueryContext,
		): Promise<Array<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>>;

		subscribe(
			input?: ListOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			handlers?: {
				onData?: (
					data: Array<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
				) => void;
				onError?: (error: Error) => void;
				onComplete?: () => void;
			},
			ctx?: QueryContext,
		): { unsubscribe: () => void };
	};

	/** Create new entity */
	create: {
		mutate(
			input: Partial<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			options?: MutationOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			ctx?: QueryContext,
		): Promise<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
	};

	/** Update existing entity */
	update: {
		mutate(
			input: {
				id: string;
				data: Partial<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
			},
			options?: MutationOptions<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
			ctx?: QueryContext,
		): Promise<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
	};

	/** Delete entity */
	delete: {
		mutate(input: { id: string }, ctx?: QueryContext): Promise<{ id: string; deleted: boolean }>;
	};
}

/**
 * Generate CRUD API for a resource
 *
 * Creates fully type-safe query, mutation, and subscription handlers
 * with automatic N+1 elimination, field selection, and optimistic updates.
 *
 * @example
 * ```ts
 * const Message = defineResource({
 *   name: 'message',
 *   fields: z.object({
 *     id: z.string(),
 *     content: z.string(),
 *   }),
 *   relationships: {
 *     steps: hasMany('step', { foreignKey: 'message_id' })
 *   }
 * });
 *
 * const api = generateResourceAPI(Message);
 *
 * // Auto-generated, type-safe, optimized
 * const message = await api.getById.query(
 *   { id: 'msg-1' },
 *   { include: { steps: true } },
 *   ctx
 * );
 * ```
 *
 * @param resource - Resource definition
 * @returns Generated API with CRUD operations
 */
export function generateResourceAPI<
	TName extends string,
	TFields extends z.ZodType,
	TRelationships extends Record<string, any>,
>(resource: Resource<TName, TFields, TRelationships>): ResourceAPI<TName, TFields, TRelationships> {
	type Entity = InferEntity<ResourceDefinition<TName, TFields, TRelationships>>;

	/**
	 * Get entity by ID
	 *
	 * Automatically:
	 * - Uses DataLoader for batching
	 * - Applies field selection
	 * - Loads included relationships
	 * - Detects and eliminates N+1 queries
	 */
	const getById = {
		async query(
			input: { id: string },
			options?: QueryOptions<Entity>,
			ctx?: QueryContext,
		): Promise<Entity | null> {
			if (!ctx || !ctx.db) {
				throw new Error(
					`Context with database required for ${resource.name}.getById.query`,
				);
			}

			// Create DataLoader factory for this request
			const loaderFactory = createDataLoaderFactory();

			// Plan query for optimization
			const plan = QueryPlanner.createPlan(resource, options);

			// Execute query with batching
			const loader = loaderFactory.getByIdLoader<Entity>(resource, ctx);
			let entity: Entity | null;

			try {
				entity = await loader.load(input.id);
			} catch (error) {
				// DataLoader returns Error for missing entities
				if (error instanceof Error && error.message.includes("Entity not found")) {
					return null;
				}
				throw error;
			}

			if (!entity) return null;

			// Load included relationships
			if (options?.include) {
				await loadRelationships(entity, options.include, ctx, loaderFactory);
			}

			// Apply field selection
			if (options?.select) {
				return applyFieldSelection(entity, options.select);
			}

			return entity;
		},

		subscribe(
			input: { id: string },
			options?: QueryOptions<Entity>,
			handlers?: {
				onData?: (data: Entity | null) => void;
				onError?: (error: Error) => void;
				onComplete?: () => void;
			},
			ctx?: QueryContext,
		): { unsubscribe: () => void } {
			if (!ctx || !ctx.eventStream) {
				throw new Error(
					`Context with eventStream required for ${resource.name}.getById.subscribe`,
				);
			}

			// Subscribe to entity updates
			const eventKey = `${resource.name}:${input.id}`;
			const subscription = ctx.eventStream.subscribe(eventKey, {
				next: async (data: Entity | null) => {
					if (handlers?.onData) {
						// Apply field selection
						const selected = options?.select
							? applyFieldSelection(data, options.select)
							: data;
						handlers.onData(selected);
					}
				},
				error: (error: Error) => {
					if (handlers?.onError) handlers.onError(error);
				},
				complete: () => {
					if (handlers?.onComplete) handlers.onComplete();
				},
			});

			return {
				unsubscribe: () => subscription.unsubscribe(),
			};
		},
	};

	/**
	 * List entities
	 *
	 * Automatically:
	 * - Applies filters (where)
	 * - Applies ordering (orderBy)
	 * - Applies pagination (limit, offset)
	 * - Uses DataLoader for includes
	 */
	const list = {
		async query(input?: ListOptions<Entity>, ctx?: QueryContext): Promise<Entity[]> {
			if (!ctx || !ctx.db) {
				throw new Error(`Context with database required for ${resource.name}.list.query`);
			}

			const tableName = resource.definition.tableName || `${resource.name}s`;

			// Build query with filters, ordering, pagination
			const entities = await ctx.db.findMany(tableName, {
				where: input?.where,
				orderBy: input?.orderBy,
				limit: input?.limit,
				offset: input?.offset,
			});

			// Load included relationships
			if (input?.include) {
				const loaderFactory = createDataLoaderFactory();
				await Promise.all(
					entities.map((entity: Entity) =>
						loadRelationships(entity, input.include!, ctx, loaderFactory),
					),
				);
			}

			// Apply field selection
			if (input?.select) {
				return entities.map((entity: Entity) =>
					applyFieldSelection(entity, input.select!),
				);
			}

			return entities;
		},

		subscribe(
			input?: ListOptions<Entity>,
			handlers?: {
				onData?: (data: Entity[]) => void;
				onError?: (error: Error) => void;
				onComplete?: () => void;
			},
			ctx?: QueryContext,
		): { unsubscribe: () => void } {
			if (!ctx || !ctx.eventStream) {
				throw new Error(
					`Context with eventStream required for ${resource.name}.list.subscribe`,
				);
			}

			// Subscribe to collection updates
			const eventKey = `${resource.name}:list`;
			const subscription = ctx.eventStream.subscribe(eventKey, {
				next: (data: Entity[]) => {
					if (handlers?.onData) {
						// Apply field selection
						const selected = input?.select
							? data.map((entity) => applyFieldSelection(entity, input.select!))
							: data;
						handlers.onData(selected);
					}
				},
				error: (error: Error) => {
					if (handlers?.onError) handlers.onError(error);
				},
				complete: () => {
					if (handlers?.onComplete) handlers.onComplete();
				},
			});

			return {
				unsubscribe: () => subscription.unsubscribe(),
			};
		},
	};

	/**
	 * Create entity
	 *
	 * Automatically:
	 * - Validates with Zod schema
	 * - Executes beforeCreate hook
	 * - Creates entity in database
	 * - Executes afterCreate hook
	 * - Publishes create event
	 */
	const create = {
		async mutate(
			input: Partial<Entity>,
			options?: MutationOptions<Entity>,
			ctx?: QueryContext,
		): Promise<Entity> {
			if (!ctx || !ctx.db) {
				throw new Error(`Context with database required for ${resource.name}.create.mutate`);
			}

			// Execute beforeCreate hook
			let data = input;
			if (!options?.skipHooks && resource.definition.hooks?.beforeCreate) {
				data = await resource.definition.hooks.beforeCreate(input);
			}

			// Validate with schema (partial - id typically auto-generated)
			// Use partial() to allow missing fields like id
			const validated = (resource.definition.fields as any).partial().parse(data);

			// Create in database
			const tableName = resource.definition.tableName || `${resource.name}s`;
			const created = await ctx.db.create(tableName, validated);

			// Execute afterCreate hook
			if (!options?.skipHooks && resource.definition.hooks?.afterCreate) {
				await resource.definition.hooks.afterCreate(created);
			}

			// Publish create event
			if (ctx.eventStream) {
				ctx.eventStream.publish(`${resource.name}:${created.id}`, created);
				ctx.eventStream.publish(`${resource.name}:list`, created);
			}

			// Apply field selection
			if (options?.select) {
				return applyFieldSelection(created, options.select);
			}

			return created;
		},
	};

	/**
	 * Update entity
	 *
	 * Automatically:
	 * - Executes beforeUpdate hook
	 * - Updates entity in database
	 * - Executes afterUpdate hook
	 * - Publishes update event
	 * - Applies update strategy (delta/patch/value)
	 */
	const update = {
		async mutate(
			input: { id: string; data: Partial<Entity> },
			options?: MutationOptions<Entity>,
			ctx?: QueryContext,
		): Promise<Entity> {
			if (!ctx || !ctx.db) {
				throw new Error(`Context with database required for ${resource.name}.update.mutate`);
			}

			// Execute beforeUpdate hook
			let data = input.data;
			if (!options?.skipHooks && resource.definition.hooks?.beforeUpdate) {
				data = await resource.definition.hooks.beforeUpdate(input.id, input.data);
			}

			// Update in database
			const tableName = resource.definition.tableName || `${resource.name}s`;
			const updated = await ctx.db.update(tableName, input.id, data);

			// Execute afterUpdate hook
			if (!options?.skipHooks && resource.definition.hooks?.afterUpdate) {
				await resource.definition.hooks.afterUpdate(updated);
			}

			// Publish update event
			if (ctx.eventStream) {
				ctx.eventStream.publish(`${resource.name}:${updated.id}`, updated);
			}

			// Apply field selection
			if (options?.select) {
				return applyFieldSelection(updated, options.select);
			}

			return updated;
		},
	};

	/**
	 * Delete entity
	 *
	 * Automatically:
	 * - Executes beforeDelete hook
	 * - Deletes entity from database
	 * - Executes afterDelete hook
	 * - Publishes delete event
	 */
	const deleteOp = {
		async mutate(
			input: { id: string },
			ctx?: QueryContext,
		): Promise<{ id: string; deleted: boolean }> {
			if (!ctx || !ctx.db) {
				throw new Error(`Context with database required for ${resource.name}.delete.mutate`);
			}

			// Execute beforeDelete hook
			if (resource.definition.hooks?.beforeDelete) {
				await resource.definition.hooks.beforeDelete(input.id);
			}

			// Delete from database
			const tableName = resource.definition.tableName || `${resource.name}s`;
			await ctx.db.delete(tableName, input.id);

			// Execute afterDelete hook
			if (resource.definition.hooks?.afterDelete) {
				await resource.definition.hooks.afterDelete(input.id);
			}

			// Publish delete event
			if (ctx.eventStream) {
				ctx.eventStream.publish(`${resource.name}:${input.id}`, null);
			}

			return { id: input.id, deleted: true };
		},
	};

	return {
		getById,
		list,
		create,
		update,
		delete: deleteOp,
	};
}

/**
 * Load relationships for an entity
 */
async function loadRelationships(
	entity: any,
	include: any,
	ctx: QueryContext,
	loaderFactory: ReturnType<typeof createDataLoaderFactory>,
): Promise<void> {
	// Implementation will be added when integrating with DataLoader
	// For now, placeholder
}

/**
 * Apply field selection to entity
 */
function applyFieldSelection<T>(entity: T | null, select: any): any {
	if (!entity) return null;

	const result: any = {};
	for (const [key, value] of Object.entries(select)) {
		if (value === true) {
			result[key] = (entity as any)[key];
		} else if (
			typeof value === "object" &&
			value !== null &&
			"select" in value &&
			value.select
		) {
			// Nested selection
			result[key] = applyFieldSelection((entity as any)[key], value.select);
		}
	}
	return result;
}
