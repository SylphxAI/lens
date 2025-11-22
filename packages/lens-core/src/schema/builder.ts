/**
 * Schema builder - The core API for defining Lens APIs
 *
 * Usage:
 * ```ts
 * import { lens } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * export const user = lens.object({
 *   get: lens.query({
 *     input: z.object({ id: z.string() }),
 *     output: UserSchema,
 *     resolve: async ({ id }) => db.users.findOne({ id })
 *   }),
 *   update: lens.mutation({
 *     input: z.object({ id: z.string(), data: UserUpdateSchema }),
 *     output: UserSchema,
 *     resolve: async ({ id, data }) => db.users.update({ id }, data)
 *   })
 * });
 * ```
 */

import type { Observable } from "rxjs";
import type { z } from "zod";
import type {
	LensQuery,
	LensMutation,
	LensObject,
} from "./types.js";

/**
 * Query configuration without input (parameterless)
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.query({
 *   output: z.array(UserSchema),
 *   resolve: async (ctx) => ctx.db.users.findAll()  // ctx auto-inferred!
 * })
 * ```
 */
export interface QueryConfigNoInput<TOutputSchema extends z.ZodTypeAny, TContext> {
	output: TOutputSchema;
	resolve: (ctx: TContext) => Promise<z.infer<TOutputSchema>>;
	subscribe?: (ctx: TContext) => Observable<z.infer<TOutputSchema>>;
}

/**
 * Query configuration with input
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.query({
 *   input: z.object({ id: z.string() }),
 *   output: UserSchema,
 *   resolve: async ({ id }, ctx) => ctx.db.users.findOne({ id })
 * })
 * ```
 */
export interface QueryConfigWithInput<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny, TContext> {
	input: TInputSchema;
	output: TOutputSchema;
	resolve: (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>;
	subscribe?: (input: z.infer<TInputSchema>, ctx: TContext) => Observable<z.infer<TOutputSchema>>;
}

/**
 * Mutation configuration without input (parameterless)
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.mutation({
 *   output: z.object({ success: z.boolean() }),
 *   resolve: async (ctx) => ctx.performAction()  // ctx auto-inferred!
 * })
 * ```
 */
export interface MutationConfigNoInput<TOutputSchema extends z.ZodTypeAny, TContext> {
	output: TOutputSchema;
	resolve: (ctx: TContext) => Promise<z.infer<TOutputSchema>>;
}

/**
 * Mutation configuration with input
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.mutation({
 *   input: z.object({ id: z.string(), data: UpdateSchema }),
 *   output: UserSchema,
 *   resolve: async ({ id, data }, ctx) => ctx.db.users.update({ id }, data)
 * })
 * ```
 */
export interface MutationConfigWithInput<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny, TContext> {
	input: TInputSchema;
	output: TOutputSchema;
	resolve: (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>;
}

// Legacy type aliases for backward compatibility
// Note: These use the old generic pattern. Prefer direct use of the specific interfaces.
export type QueryConfig<TInputSchema extends z.ZodTypeAny | void, TOutputSchema extends z.ZodTypeAny, TContext> =
	TInputSchema extends void
		? QueryConfigNoInput<TOutputSchema, TContext>
		: TInputSchema extends z.ZodTypeAny
			? QueryConfigWithInput<TInputSchema, TOutputSchema, TContext>
			: never;

export type MutationConfig<TInputSchema extends z.ZodTypeAny | void, TOutputSchema extends z.ZodTypeAny, TContext> =
	TInputSchema extends void
		? MutationConfigNoInput<TOutputSchema, TContext>
		: TInputSchema extends z.ZodTypeAny
			? MutationConfigWithInput<TInputSchema, TOutputSchema, TContext>
			: never;

/**
 * Schema builder class with typed context
 * Context type flows through all queries/mutations for auto-inference
 */
class LensBuilder<TContext = any> {
	/**
	 * Define a parameterless query operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const listUsers = lens.query({
	 *   output: z.array(UserSchema),
	 *   resolve: async (ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.findAll();
	 *   }
	 * });
	 * ```
	 */
	query<TOutputSchema extends z.ZodTypeAny>(
		config: QueryConfigNoInput<TOutputSchema, TContext>
	): LensQuery<void, z.infer<TOutputSchema>, TContext>;

	/**
	 * Define a query operation with input and auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const getUser = lens.query({
	 *   input: z.object({ id: z.string() }),
	 *   output: UserSchema,
	 *   resolve: async ({ id }, ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.findOne({ id });
	 *   }
	 * });
	 * ```
	 */
	query<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		config: QueryConfigWithInput<TInputSchema, TOutputSchema, TContext>
	): LensQuery<z.infer<TInputSchema>, z.infer<TOutputSchema>, TContext>;

	// Implementation
	query<TInput, TOutput>(config: any): any {
		return {
			type: "query" as const,
			path: [],
			input: config.input,
			output: config.output,
			resolve: config.resolve,
			subscribe: config.subscribe,
		};
	}

	/**
	 * Define a parameterless mutation operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const performAction = lens.mutation({
	 *   output: z.object({ success: z.boolean() }),
	 *   resolve: async (ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.performAction();
	 *   }
	 * });
	 * ```
	 */
	mutation<TOutputSchema extends z.ZodTypeAny>(
		config: MutationConfigNoInput<TOutputSchema, TContext>
	): LensMutation<void, z.infer<TOutputSchema>, TContext>;

	/**
	 * Define a mutation operation with input and auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const updateUser = lens.mutation({
	 *   input: z.object({ id: z.string(), data: UpdateSchema }),
	 *   output: UserSchema,
	 *   resolve: async ({ id, data }, ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.update({ id }, data);
	 *   }
	 * });
	 * ```
	 */
	mutation<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		config: MutationConfigWithInput<TInputSchema, TOutputSchema, TContext>
	): LensMutation<z.infer<TInputSchema>, z.infer<TOutputSchema>, TContext>;

	// Implementation
	mutation<TInput, TOutput>(config: any): any {
		return {
			type: "mutation" as const,
			path: [],
			input: config.input,
			output: config.output,
			resolve: config.resolve,
		};
	}

	/**
	 * Group queries and mutations into an object
	 *
	 * @example
	 * ```ts
	 * const api = lens.object({
	 *   user: lens.object({
	 *     get: lens.query({ ... }),
	 *     update: lens.mutation({ ... })
	 *   }),
	 *   post: lens.object({
	 *     get: lens.query({ ... }),
	 *     create: lens.mutation({ ... })
	 *   })
	 * });
	 * ```
	 */
	object<T extends Record<string, any>>(obj: T): LensObject<T> {
		// Set paths for nested queries/mutations
		const setPath = (obj: any, path: string[]): any => {
			if (obj.type === "query" || obj.type === "mutation") {
				obj.path = path;
				return obj;
			}

			if (typeof obj === "object" && obj !== null) {
				const result: any = {};
				for (const [key, value] of Object.entries(obj)) {
					result[key] = setPath(value, [...path, key]);
				}
				return result;
			}

			return obj;
		};

		return setPath(obj, []) as LensObject<T>;
	}
}

/**
 * Create a typed Lens builder with context type inference
 *
 * This is the recommended way to create a Lens API with full type safety.
 * Context type is specified once and auto-inferred everywhere.
 *
 * @example
 * ```ts
 * // Define your context type
 * interface AppContext {
 *   db: Database;
 *   user: User;
 * }
 *
 * // Create typed builder (one-time setup)
 * const lens = createLensBuilder<AppContext>();
 *
 * // All handlers now have auto-inferred context!
 * export const api = lens.object({
 *   users: lens.object({
 *     list: lens.query({
 *       output: z.array(UserSchema),
 *       resolve: async (ctx) => {
 *         // ctx is AppContext - fully typed!
 *         return ctx.db.users.findAll();
 *       }
 *     }),
 *     get: lens.query({
 *       input: z.object({ id: z.string() }),
 *       output: UserSchema,
 *       resolve: async (input, ctx) => {
 *         // input is { id: string } - auto-inferred!
 *         // ctx is AppContext - auto-inferred!
 *         return ctx.db.users.findOne({ id: input.id });
 *       }
 *     })
 *   })
 * });
 * ```
 */
export function createLensBuilder<TContext = any>(): LensBuilder<TContext> & {
	/**
	 * Helper for defining queries with proper type inference
	 * Use this when TypeScript fails to infer parameter types in arrow functions
	 */
	defineQuery<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		input: TInputSchema,
		output: TOutputSchema,
		resolve: (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>,
		subscribe?: (input: z.infer<TInputSchema>, ctx: TContext) => Observable<z.infer<TOutputSchema>>
	): QueryConfigWithInput<TInputSchema, TOutputSchema, TContext>;

	defineQuery<TOutputSchema extends z.ZodTypeAny>(
		output: TOutputSchema,
		resolve: (ctx: TContext) => Promise<z.infer<TOutputSchema>>,
		subscribe?: (ctx: TContext) => Observable<z.infer<TOutputSchema>>
	): QueryConfigNoInput<TOutputSchema, TContext>;

	/**
	 * Helper for defining mutations with proper type inference
	 */
	defineMutation<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		input: TInputSchema,
		output: TOutputSchema,
		resolve: (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>
	): MutationConfigWithInput<TInputSchema, TOutputSchema, TContext>;

	defineMutation<TOutputSchema extends z.ZodTypeAny>(
		output: TOutputSchema,
		resolve: (ctx: TContext) => Promise<z.infer<TOutputSchema>>
	): MutationConfigNoInput<TOutputSchema, TContext>;
} {
	const builder = new LensBuilder<TContext>();

	return Object.assign(builder, {
		defineQuery(...args: any[]): any {
			if (args.length === 4 || (args.length === 3 && typeof args[0] === 'object' && 'parse' in args[0] && typeof args[1] === 'object' && 'parse' in args[1])) {
				// With input: (input, output, resolve, subscribe?)
				const [input, output, resolve, subscribe] = args;
				return { input, output, resolve, subscribe };
			} else {
				// Without input: (output, resolve, subscribe?)
				const [output, resolve, subscribe] = args;
				return { output, resolve, subscribe };
			}
		},

		defineMutation(...args: any[]): any {
			if (args.length === 3) {
				// With input: (input, output, resolve)
				const [input, output, resolve] = args;
				return { input, output, resolve };
			} else {
				// Without input: (output, resolve)
				const [output, resolve] = args;
				return { output, resolve };
			}
		}
	});
}

/**
 * Default untyped builder (legacy)
 * @deprecated Use createLensBuilder<YourContext>() for type safety
 */
export const lens = new LensBuilder<any>();
