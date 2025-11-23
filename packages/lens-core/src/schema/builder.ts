/**
 * Schema builder - The core API for defining Lens APIs
 *
 * Builder Pattern API (recommended):
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * // With input
 * lens.input(z.object({ id: z.string() }))
 *     .output(UserSchema)
 *     .query(async ({ input, ctx }) => { ... });
 *
 * // Without input
 * lens.output(UserSchema)
 *     .query(async ({ ctx }) => { ... });
 * ```
 */

import type { Observable } from "rxjs";
import type { z } from "zod";
import type { LensQuery, LensMutation, LensObject } from "./types.js";
import { OptimisticBuilder } from "./optimistic-builder.js";
import type { OptimisticConfig } from "./optimistic-types.js";

/**
 * Handler function signatures for Builder Pattern API
 * Uses { input, ctx } object pattern for consistency
 */
type QueryHandler<TInputSchema, TOutputSchema, TContext> = TInputSchema extends z.ZodTypeAny
	? TOutputSchema extends z.ZodTypeAny
		? (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Promise<z.infer<TOutputSchema>>
		: (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Promise<any>
	: TOutputSchema extends z.ZodTypeAny
		? (opts: { ctx: TContext }) => Promise<z.infer<TOutputSchema>>
		: (opts: { ctx: TContext }) => Promise<any>;

type MutationHandler<TInputSchema, TOutputSchema, TContext> = TInputSchema extends z.ZodTypeAny
	? TOutputSchema extends z.ZodTypeAny
		? (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Promise<z.infer<TOutputSchema>>
		: (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Promise<any>
	: TOutputSchema extends z.ZodTypeAny
		? (opts: { ctx: TContext }) => Promise<z.infer<TOutputSchema>>
		: (opts: { ctx: TContext }) => Promise<any>;

type SubscriptionHandler<TInputSchema, TOutputSchema, TContext> = TInputSchema extends z.ZodTypeAny
	? TOutputSchema extends z.ZodTypeAny
		? (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Observable<z.infer<TOutputSchema>>
		: (opts: { input: z.infer<TInputSchema>; ctx: TContext }) => Observable<any>
	: TOutputSchema extends z.ZodTypeAny
		? (opts: { ctx: TContext }) => Observable<z.infer<TOutputSchema>>
		: (opts: { ctx: TContext }) => Observable<any>;


/**
 * Procedure builder for fluent API
 * Statically typed at each step for perfect inference
 */
export class ProcedureBuilder<TContext, TInputSchema = undefined, TOutputSchema = undefined> {
	constructor(
		private readonly _context: TContext,
		private readonly inputSchema: TInputSchema,
		private readonly outputSchema: TOutputSchema,
		private readonly optimisticConfig?: OptimisticConfig
	) {}

	/**
	 * Set input schema
	 * Returns new builder with updated type state
	 */
	input<TSchema extends z.ZodTypeAny>(schema: TSchema): ProcedureBuilder<TContext, TSchema, TOutputSchema> {
		return new ProcedureBuilder(this._context, schema, this.outputSchema, this.optimisticConfig);
	}

	/**
	 * Set output schema
	 * Returns new builder with updated type state
	 */
	output<TSchema extends z.ZodTypeAny>(schema: TSchema): ProcedureBuilder<TContext, TInputSchema, TSchema> {
		return new ProcedureBuilder(this._context, this.inputSchema, schema, this.optimisticConfig);
	}

	/**
	 * Define optimistic update configuration for mutations
	 * Returns new builder with optimistic config
	 *
	 * @example
	 * ```ts
	 * lens.input(UpdateSessionInput)
	 *     .output(SessionSchema)
	 *     .optimistic((opt) => opt
	 *       .entity('Session')
	 *       .id($ => $.sessionId)
	 *       .apply((draft, input, t) => {
	 *         draft.title = input.newTitle;
	 *         draft.updatedAt = t.now();
	 *       })
	 *     )
	 *     .mutation(async ({ input, ctx }) => { ... })
	 * ```
	 */
	optimistic(
		builder: (opt: OptimisticBuilder<TInputSchema, TOutputSchema>) => OptimisticBuilder<TInputSchema, TOutputSchema>
	): ProcedureBuilder<TContext, TInputSchema, TOutputSchema> {
		const opt = new OptimisticBuilder<TInputSchema, TOutputSchema>();
		const configured = builder(opt);
		const config = configured.build();
		return new ProcedureBuilder(this._context, this.inputSchema, this.outputSchema, config);
	}

	/**
	 * Build query operation
	 * Adapter converts { input, ctx } to (input, ctx) for LensQuery
	 *
	 * @param resolveHandler - Required resolve function for one-time fetch
	 * @param subscribeHandler - Optional subscribe function for real-time updates
	 */
	query(
		resolveHandler: QueryHandler<TInputSchema, TOutputSchema, TContext>,
		subscribeHandler?: SubscriptionHandler<TInputSchema, TOutputSchema, TContext>
	): any {
		return {
			type: "query" as const,
			path: [],
			input: this.inputSchema,
			output: this.outputSchema,
			resolve: this.inputSchema !== undefined
				? ((input: any, ctx: TContext) => resolveHandler({ input, ctx }))
				: ((ctx: TContext) => resolveHandler({ ctx } as any)),
			subscribe: subscribeHandler
				? (this.inputSchema !== undefined
					? ((input: any, ctx: TContext) => subscribeHandler({ input, ctx }))
					: ((ctx: TContext) => subscribeHandler({ ctx } as any)))
				: undefined,
		};
	}

	/**
	 * Build mutation operation
	 * Adapter converts { input, ctx } to (input, ctx) for LensMutation
	 */
	mutation(handler: MutationHandler<TInputSchema, TOutputSchema, TContext>): any {
		return {
			type: "mutation" as const,
			path: [],
			input: this.inputSchema,
			output: this.outputSchema,
			resolve: this.inputSchema !== undefined
				? ((input: any, ctx: TContext) => handler({ input, ctx }))
				: ((ctx: TContext) => handler({ ctx } as any)),
			optimistic: this.optimisticConfig,
		};
	}

	/**
	 * Build subscription operation
	 * Adapter converts { input, ctx } to (input, ctx) for LensQuery
	 */
	subscription(handler: SubscriptionHandler<TInputSchema, TOutputSchema, TContext>): any {
		return {
			type: "query" as const,
			path: [],
			input: this.inputSchema,
			output: this.outputSchema,
			resolve: undefined as any,
			subscribe: this.inputSchema !== undefined
				? ((input: any, ctx: TContext) => handler({ input, ctx }))
				: ((ctx: TContext) => handler({ ctx } as any)),
		};
	}
}


/**
 * Schema builder class with typed context
 *
 * Builder Pattern API:
 *   lens.input(schema).output(schema).query(handler)
 *   lens.output(schema).query(handler)
 */
class LensBuilder<TContext = any> {
	/**
	 * Start building with input schema
	 *
	 * @example
	 * ```ts
	 * lens.input(z.object({ id: z.string() }))
	 *     .output(UserSchema)
	 *     .query(async ({ input, ctx }) => {
	 *       // Perfect type inference!
	 *       const id: string = input.id;
	 *       return ctx.db.users.findOne(id);
	 *     });
	 * ```
	 */
	input<TSchema extends z.ZodTypeAny>(schema: TSchema): ProcedureBuilder<TContext, TSchema, undefined> {
		return new ProcedureBuilder<TContext, TSchema, undefined>(undefined as any, schema, undefined as any);
	}

	/**
	 * Start building with output schema
	 *
	 * @example
	 * ```ts
	 * lens.output(z.array(UserSchema))
	 *     .query(async ({ ctx }) => {
	 *       // Perfect type inference!
	 *       return ctx.db.users.findAll();
	 *     });
	 * ```
	 */
	output<TSchema extends z.ZodTypeAny>(schema: TSchema): ProcedureBuilder<TContext, undefined, TSchema> {
		return new ProcedureBuilder<TContext, undefined, TSchema>(undefined as any, undefined as any, schema);
	}

	/**
	 * Group queries and mutations into an object
	 * Sets path for each nested operation
	 *
	 * @example
	 * ```ts
	 * const api = lens.object({
	 *   users: lens.object({
	 *     get: lens.input(...).output(...).query(...),
	 *     list: lens.output(...).query(...),
	 *   })
	 * });
	 * ```
	 */
	object<T extends Record<string, any>>(obj: T): LensObject<T> {
		const setPath = (obj: any, path: string[]): any => {
			if (obj?.type === "query" || obj?.type === "mutation") {
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
 * @example
 * ```ts
 * interface AppContext {
 *   db: Database;
 *   user: User;
 * }
 *
 * const lens = createLensBuilder<AppContext>();
 *
 * export const api = lens.object({
 *   users: lens.object({
 *     // With input
 *     get: lens
 *       .input(z.object({ id: z.string() }))
 *       .output(UserSchema)
 *       .query(async ({ input, ctx }) => {
 *         // input: { id: string } - fully typed!
 *         // ctx: AppContext - fully typed!
 *         return ctx.db.users.findOne(input.id);
 *       }),
 *
 *     // Without input
 *     list: lens
 *       .output(z.array(UserSchema))
 *       .query(async ({ ctx }) => {
 *         // ctx: AppContext - fully typed!
 *         return ctx.db.users.findAll();
 *       }),
 *   })
 * });
 * ```
 */
export function createLensBuilder<TContext = any>(): LensBuilder<TContext> {
	return new LensBuilder<TContext>();
}

/**
 * Default untyped builder
 * For typed version, use: createLensBuilder<YourContext>()
 */
export const lens = new LensBuilder<any>();
