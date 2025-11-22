/**
 * Core type definitions for Lens schema system
 *
 * This module defines the fundamental building blocks:
 * - LensQuery: Read operations with optional subscriptions
 * - LensMutation: Write operations that trigger updates
 * - LensObject: Nested grouping of queries/mutations
 */

import type { Observable } from "rxjs";
import type { z } from "zod";

/**
 * Type-safe field selection for a model
 * Provides autocomplete and compile-time validation
 *
 * @example
 * ```ts
 * type User = { id: string; name: string; email: string; posts: Post[] }
 *
 * const select: Select<User> = {
 *   id: true,        // ✅ Autocomplete
 *   name: true,      // ✅ Autocomplete
 *   invalid: true    // ❌ Compile error - field doesn't exist
 * }
 * ```
 */
export type Select<T> = {
	[K in keyof T]?: T[K] extends Array<infer U>
		? boolean | Select<U> // Array fields: true or nested selection
		: T[K] extends object
			? boolean | Select<T[K]> // Object fields: true or nested selection
			: boolean; // Primitive fields: true only
};

/**
 * Legacy field selection type (deprecated - use Select<T> instead)
 * Kept for backward compatibility during migration
 *
 * @deprecated Use Select<T> for type-safe field selection
 */
export type FieldSelection =
	| { [key: string]: boolean | FieldSelection } // Object syntax only
	| string; // Template syntax (for advanced use cases)

/**
 * Extract selected fields from a type based on Select<T>
 * Returns a new type containing only the selected fields
 *
 * @example
 * ```ts
 * type User = { id: string; name: string; email: string; age: number }
 * type Selection = { id: true; name: true }
 * type Result = Selected<User, Selection>
 * // Result = { id: string; name: string }
 * ```
 */
export type Selected<T, S> = S extends Select<T>
	? {
			[K in keyof S & keyof T]: S[K] extends true
				? T[K]
				: S[K] extends Select<any>
					? T[K] extends Array<infer U>
						? Array<Selected<U, S[K]>>
						: T[K] extends object
							? Selected<T[K], S[K]>
							: never
					: never;
		}
	: T; // If no selection, return full type

/**
 * Query definition with Zod schemas
 *
 * Stores schemas directly for maximum type safety.
 * Input schema is optional - undefined for parameterless queries.
 *
 * @example
 * ```ts
 * // With input:
 * const getUserQuery: LensQuery<typeof UserIdSchema, typeof UserSchema, AppContext> = {
 *   type: "query",
 *   input: z.object({ id: z.string() }),
 *   output: UserSchema,
 *   resolve: async (input, ctx) => ctx.db.users.findOne(input.id)
 * }
 *
 * // Without input:
 * const listUsersQuery: LensQuery<undefined, typeof UserArraySchema, AppContext> = {
 *   type: "query",
 *   input: undefined,
 *   output: z.array(UserSchema),
 *   resolve: async (ctx) => ctx.db.users.findAll()
 * }
 * ```
 */
export interface LensQuery<TInputSchema extends z.ZodTypeAny | undefined, TOutputSchema extends z.ZodTypeAny, TContext = any> {
	type: "query";
	path: string[];
	input: TInputSchema;
	output: TOutputSchema;
	resolve: TInputSchema extends z.ZodTypeAny
		? (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>
		: (ctx: TContext) => Promise<z.infer<TOutputSchema>>;
	subscribe?: TInputSchema extends z.ZodTypeAny
		? (input: z.infer<TInputSchema>, ctx: TContext) => Observable<z.infer<TOutputSchema>>
		: (ctx: TContext) => Observable<z.infer<TOutputSchema>>;
}

/**
 * Mutation definition with Zod schemas
 *
 * Stores schemas directly for maximum type safety.
 * Input schema is optional - undefined for parameterless mutations.
 *
 * @example
 * ```ts
 * // With input:
 * const updateUserMutation: LensMutation<typeof UpdateUserSchema, typeof UserSchema, AppContext> = {
 *   type: "mutation",
 *   input: z.object({ id: z.string(), data: UpdateSchema }),
 *   output: UserSchema,
 *   resolve: async (input, ctx) => ctx.db.users.update(input.id, input.data)
 * }
 *
 * // Without input:
 * const performActionMutation: LensMutation<undefined, typeof SuccessSchema, AppContext> = {
 *   type: "mutation",
 *   input: undefined,
 *   output: z.object({ success: z.boolean() }),
 *   resolve: async (ctx) => ctx.performAction()
 * }
 * ```
 */
export interface LensMutation<TInputSchema extends z.ZodTypeAny | undefined, TOutputSchema extends z.ZodTypeAny, TContext = any> {
	type: "mutation";
	path: string[];
	input: TInputSchema;
	output: TOutputSchema;
	resolve: TInputSchema extends z.ZodTypeAny
		? (input: z.infer<TInputSchema>, ctx: TContext) => Promise<z.infer<TOutputSchema>>
		: (ctx: TContext) => Promise<z.infer<TOutputSchema>>;
}

/**
 * Object grouping queries and mutations
 */
export type LensObject<T = any> = {
	[K in keyof T]: T[K] extends LensQuery<any, any, any>
		? T[K]
		: T[K] extends LensMutation<any, any, any>
			? T[K]
			: T[K] extends LensObject<any>
				? T[K]
				: never;
};

/**
 * Type inference utilities
 */
export type InferInput<T> = T extends LensQuery<infer I, any, any>
	? I
	: T extends LensMutation<infer I, any, any>
		? I
		: never;

export type InferOutput<T> = T extends LensQuery<any, infer O, any>
	? O
	: T extends LensMutation<any, infer O, any>
		? O
		: never;

export type InferContext<T> = T extends LensQuery<any, any, infer C>
	? C
	: T extends LensMutation<any, any, infer C>
		? C
		: never;

/**
 * Request/Response types
 */
export interface LensRequest {
	type: "query" | "mutation" | "subscription";
	path: string[];
	input: unknown;
	select?: FieldSelection;
}

export interface LensResponse<T> {
	data?: T;
	error?: {
		message: string;
		code?: string;
		data?: unknown;
	};
}

/**
 * Update strategies for minimal transfer
 */
export type UpdateMode = "value" | "delta" | "patch" | "auto";

export interface UpdatePayload {
	mode: UpdateMode;
	data: unknown;
}
