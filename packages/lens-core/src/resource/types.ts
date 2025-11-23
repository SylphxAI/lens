/**
 * Resource Type Definitions
 *
 * Core types for resource-based Lens architecture.
 * Resources are declarative definitions of domain entities with fields, relationships, and behavior.
 *
 * @module @sylphx/lens-core/resource
 */

import type { ZodType, z } from "zod";
import type { Observable } from "rxjs";

/**
 * Infer entity type from resource definition
 *
 * @example
 * ```ts
 * const Message = defineResource({
 *   name: 'message',
 *   fields: z.object({ id: z.string(), content: z.string() })
 * });
 *
 * type MessageType = InferEntity<typeof Message.definition>;
 * // { id: string; content: string }
 * ```
 */
export type InferEntity<T extends ResourceDefinition> = z.infer<T["fields"]>;

/**
 * Relationship types
 */
export type RelationshipType = "hasMany" | "belongsTo" | "hasOne" | "manyToMany";

/**
 * Base relationship interface
 */
export interface BaseRelationship {
	type: RelationshipType;
	target: string;
	foreignKey: string;
}

/**
 * One-to-many relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   steps: hasMany('step', {
 *     foreignKey: 'message_id',
 *     orderBy: { created_at: 'asc' }
 *   })
 * }
 * ```
 */
export interface HasManyRelationship extends BaseRelationship {
	type: "hasMany";
	orderBy?: Record<string, "asc" | "desc">;
}

/**
 * Many-to-one relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   session: belongsTo('session', {
 *     foreignKey: 'session_id'
 *   })
 * }
 * ```
 */
export interface BelongsToRelationship extends BaseRelationship {
	type: "belongsTo";
}

/**
 * One-to-one relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   profile: hasOne('profile', {
 *     foreignKey: 'user_id'
 *   })
 * }
 * ```
 */
export interface HasOneRelationship extends BaseRelationship {
	type: "hasOne";
}

/**
 * Many-to-many relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   tags: manyToMany('tag', {
 *     through: 'message_tags',
 *     foreignKey: 'message_id',
 *     targetForeignKey: 'tag_id'
 *   })
 * }
 * ```
 */
export interface ManyToManyRelationship extends BaseRelationship {
	type: "manyToMany";
	through: string;
	targetForeignKey: string;
}

/**
 * Relationship union type
 */
export type Relationship =
	| HasManyRelationship
	| BelongsToRelationship
	| HasOneRelationship
	| ManyToManyRelationship;

/**
 * Computed field function
 *
 * Can be sync or async. Receives entity and context.
 *
 * @example
 * ```ts
 * computed: {
 *   fullName: (user) => `${user.firstName} ${user.lastName}`,
 *   avatar: async (user, ctx) => {
 *     return await ctx.db.avatars.findOne({ userId: user.id });
 *   }
 * }
 * ```
 */
export type ComputedField<TEntity = any, TContext = any> =
	| ((entity: TEntity) => any)
	| ((entity: TEntity, ctx: TContext) => Promise<any>);

/**
 * Resource lifecycle hooks
 *
 * @example
 * ```ts
 * hooks: {
 *   beforeCreate: async (data) => ({
 *     ...data,
 *     created_at: new Date()
 *   }),
 *   afterUpdate: async (entity) => {
 *     await invalidateCache(entity.id);
 *   }
 * }
 * ```
 */
export interface ResourceHooks<TEntity = any> {
	/** Before entity creation - can transform data */
	beforeCreate?: (data: Partial<TEntity>) => Promise<Partial<TEntity>>;

	/** After entity created - side effects only */
	afterCreate?: (entity: TEntity) => Promise<void>;

	/** Before entity update - can transform data */
	beforeUpdate?: (id: string, data: Partial<TEntity>) => Promise<Partial<TEntity>>;

	/** After entity updated - side effects only */
	afterUpdate?: (entity: TEntity) => Promise<void>;

	/** Before entity deletion - validation or archival */
	beforeDelete?: (id: string) => Promise<void>;

	/** After entity deleted - cleanup */
	afterDelete?: (id: string) => Promise<void>;
}

/**
 * Optimistic update configuration
 *
 * @example
 * ```ts
 * optimistic: {
 *   idField: 'id',
 *   apply: (draft, mutation) => {
 *     Object.assign(draft, mutation.data);
 *   },
 *   rollback: (draft, original) => {
 *     Object.assign(draft, original);
 *   }
 * }
 * ```
 */
export interface OptimisticConfig<TEntity = any> {
	/** Field to use as entity ID (default: 'id') */
	idField?: keyof TEntity & string;

	/** Apply optimistic update to draft */
	apply: (draft: TEntity, mutation: { type: string; data: Partial<TEntity> }) => void;

	/** Optional custom rollback logic */
	rollback?: (draft: TEntity, original: TEntity) => void;
}

/**
 * Update strategy types
 *
 * - auto: Automatically selects strategy based on field types
 * - value: Always send full value
 * - delta: Delta encoding for strings (57% savings)
 * - patch: JSON Patch for objects (99% savings)
 */
export type UpdateStrategy = "auto" | "value" | "delta" | "patch";

/**
 * Resource definition
 *
 * Complete declarative definition of a domain entity.
 *
 * @example
 * ```ts
 * const Message = defineResource({
 *   name: 'message',
 *   fields: z.object({
 *     id: z.string(),
 *     role: z.enum(['user', 'assistant']),
 *     content: z.string()
 *   }),
 *   relationships: {
 *     steps: hasMany('step', { foreignKey: 'message_id' })
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
 * ```
 */
export interface ResourceDefinition<
	TName extends string = string,
	TFields extends ZodType = ZodType,
	TRelationships extends Record<string, Relationship> = Record<string, Relationship>,
> {
	/** Unique resource name (camelCase) */
	name: TName;

	/** Zod schema for entity fields */
	fields: TFields;

	/** Relationships to other resources */
	relationships?: TRelationships;

	/** Computed fields (virtual fields) */
	computed?: Record<string, ComputedField<z.infer<TFields>>>;

	/** Lifecycle hooks */
	hooks?: ResourceHooks<z.infer<TFields>>;

	/** Optimistic update configuration */
	optimistic?: OptimisticConfig<z.infer<TFields>>;

	/** Update strategy for subscriptions */
	updateStrategy?: UpdateStrategy;

	/** Optional: database table name (defaults to `${name}s`) */
	tableName?: string;
}

/**
 * Resource handle (returned by defineResource)
 *
 * Provides typed access to resource definition and metadata.
 */
export interface Resource<
	TName extends string = string,
	TFields extends ZodType = ZodType,
	TRelationships extends Record<string, Relationship> = Record<string, Relationship>,
> {
	/** Resource definition */
	definition: ResourceDefinition<TName, TFields, TRelationships>;

	/** Resource name */
	name: TName;

	/** Type helper for entity (compile-time only) */
	entity: InferEntity<ResourceDefinition<TName, TFields, TRelationships>>;

	/** Relationships */
	relationships: TRelationships;

	/** Auto-generated API with CRUD operations */
	api: {
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
		create: {
			mutate(
				input: Partial<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>,
				options?: MutationOptions<
					InferEntity<ResourceDefinition<TName, TFields, TRelationships>>
				>,
				ctx?: QueryContext,
			): Promise<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
		};
		update: {
			mutate(
				input: {
					id: string;
					data: Partial<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
				},
				options?: MutationOptions<
					InferEntity<ResourceDefinition<TName, TFields, TRelationships>>
				>,
				ctx?: QueryContext,
			): Promise<InferEntity<ResourceDefinition<TName, TFields, TRelationships>>>;
		};
		delete: {
			mutate(
				input: { id: string },
				ctx?: QueryContext,
			): Promise<{ id: string; deleted: boolean }>;
		};
	};
}

/**
 * Field selection options
 *
 * @example
 * ```ts
 * select: {
 *   id: true,
 *   content: true,
 *   steps: {
 *     select: { id: true, output: true }
 *   }
 * }
 * ```
 */
export type Select<T> = {
	[K in keyof T]?: T[K] extends Array<infer U>
		? boolean | { select?: Select<U> } // Array fields
		: T[K] extends object
			? boolean | { select?: Select<T[K]> } // Object fields
			: boolean; // Primitive fields
};

/**
 * Relationship inclusion options
 *
 * @example
 * ```ts
 * include: {
 *   steps: true,
 *   session: {
 *     include: { messages: true }
 *   }
 * }
 * ```
 */
export type Include<TRelationships> = {
	[K in keyof TRelationships]?: boolean | { include?: any; select?: any };
};

/**
 * Query options
 *
 * @example
 * ```ts
 * {
 *   select: { id: true, content: true },
 *   include: { steps: true }
 * }
 * ```
 */
export interface QueryOptions<TEntity = any, TRelationships = any> {
	/** Field selection */
	select?: Select<TEntity>;

	/** Relationship inclusion */
	include?: Include<TRelationships>;
}

/**
 * List query filters
 *
 * @example
 * ```ts
 * {
 *   where: { role: 'user', status: 'active' },
 *   orderBy: { created_at: 'desc' },
 *   limit: 10,
 *   offset: 0
 * }
 * ```
 */
export interface ListOptions<TEntity = any> extends QueryOptions<TEntity> {
	/** Filter conditions */
	where?: Partial<TEntity>;

	/** Ordering */
	orderBy?: Record<keyof TEntity, "asc" | "desc">;

	/** Limit */
	limit?: number;

	/** Offset */
	offset?: number;
}

/**
 * Mutation options
 *
 * @example
 * ```ts
 * {
 *   skipHooks: false,
 *   select: { id: true, content: true }
 * }
 * ```
 */
export interface MutationOptions<TEntity = any> extends QueryOptions<TEntity> {
	/** Skip lifecycle hooks */
	skipHooks?: boolean;
}

/**
 * Subscription handlers
 *
 * @example
 * ```ts
 * {
 *   onData: (message) => console.log('Updated:', message),
 *   onError: (error) => console.error(error),
 *   onComplete: () => console.log('Complete')
 * }
 * ```
 */
export interface SubscriptionHandlers<T> {
	onData?: (data: T) => void;
	onError?: (error: Error) => void;
	onComplete?: () => void;
}

/**
 * Subscription
 *
 * Returned by subscribe methods. Call unsubscribe() to cleanup.
 */
export interface Subscription {
	unsubscribe(): void;
}

/**
 * Query context
 *
 * Passed to all query, mutation, and subscription handlers.
 * Contains database access, loaders, event streams, etc.
 */
export interface QueryContext {
	/** Database access */
	db: any;

	/** DataLoader for batching */
	loader: any;

	/** Event stream for subscriptions */
	eventStream: any;

	/** Optional: user context */
	user?: any;

	/** Optional: custom context */
	[key: string]: any;
}
