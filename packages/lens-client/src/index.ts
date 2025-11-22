/**
 * @sylphx/lens-client
 *
 * Type-safe client for Lens APIs with inference from server schema.
 * Provides Router-like API similar to tRPC client.
 */

import type { LensObject, LensRequest, LensTransport, Select, Selected } from "@sylphx/lens-core";
import type { Observable } from "@sylphx/lens-core";

/**
 * Client configuration
 */
export interface LensClientConfig {
	transport: LensTransport;
}

/**
 * Type-safe query options with field selection
 *
 * @example
 * ```ts
 * // Type-safe field selection with autocomplete
 * const user = await client.user.get.query(
 *   { id: '1' },
 *   {
 *     select: {
 *       id: true,        // ✅ Autocomplete
 *       name: true,      // ✅ Autocomplete
 *       email: true,     // ✅ Autocomplete
 *       invalid: true    // ❌ Compile error
 *     }
 *   }
 * );
 * // user type: { id: string; name: string; email: string }
 * ```
 */
export interface QueryOptions<TOutput = any, TSelect = Select<TOutput>> {
	/** Type-safe field selection - only valid fields allowed */
	select?: TSelect;
	/** Update mode for subscriptions */
	updateMode?: "value" | "delta" | "patch" | "auto";
}

/**
 * Infer input type from schema path
 */
type InferInput<T> = T extends { input: { parse: (val: any) => infer I } }
	? I
	: never;

/**
 * Infer output type from schema path
 */
type InferOutput<T> = T extends { output: { parse: (val: any) => infer O } }
	? O
	: never;

/**
 * Create proxy for nested path building
 */
function createProxy<T extends LensObject>(
	transport: LensTransport,
	path: string[] = [],
): any {
	return new Proxy(
		{},
		{
			get(_, prop: string) {
				const newPath = [...path, prop];

				// Terminal methods
				if (prop === "query") {
					return async (input: any, options?: QueryOptions) => {
						return transport.query({
							type: "query",
							path,
							input,
							select: options?.select,
						});
					};
				}

				if (prop === "mutate") {
					return async (input: any, options?: QueryOptions) => {
						return transport.mutate({
							type: "mutation",
							path,
							input,
							select: options?.select,
						});
					};
				}

				if (prop === "subscribe") {
					return (input: any, options?: QueryOptions): Observable<any> => {
						return transport.subscribe({
							type: "subscription",
							path,
							input,
							select: options?.select,
						});
					};
				}

				// Continue building path
				return createProxy(transport, newPath);
			},
		},
	);
}

/**
 * Create type-safe Lens client
 *
 * @example
 * ```ts
 * const client = createLensClient<typeof api>({ transport });
 *
 * // Type-safe queries
 * const user = await client.user.get.query({ id: '1' });
 *
 * // Type-safe mutations
 * const updated = await client.user.update.mutate({
 *   id: '1',
 *   data: { name: 'Alice' }
 * });
 *
 * // Type-safe subscriptions
 * client.user.get.subscribe({ id: '1' }).subscribe({
 *   next: (user) => console.log(user)
 * });
 * ```
 */
export function createLensClient<T extends LensObject>(
	config: LensClientConfig,
): LensClient<T> {
	return createProxy(config.transport) as LensClient<T>;
}

/**
 * Type-safe client interface with field selection inference
 *
 * Features:
 * - Autocomplete for field selection
 * - Return type changes based on selected fields
 * - Compile-time validation of field names
 * - Nested selection support
 *
 * @example
 * ```ts
 * const client = createLensClient<typeof api>({ transport });
 *
 * // Without selection - full type
 * const user = await client.user.get.query({ id: '1' });
 * // user: { id: string; name: string; email: string; posts: Post[] }
 *
 * // With selection - partial type
 * const partial = await client.user.get.query(
 *   { id: '1' },
 *   { select: { id: true, name: true } }
 * );
 * // partial: { id: string; name: string }
 *
 * // Nested selection
 * const nested = await client.user.get.query(
 *   { id: '1' },
 *   { select: { id: true, posts: { title: true } } }
 * );
 * // nested: { id: string; posts: Array<{ title: string }> }
 * ```
 */
export type LensClient<T> = {
	[K in keyof T]: T[K] extends { type: "query" }
		? {
				// Query without selection - returns full type
				query(input: InferInput<T[K]>): Promise<InferOutput<T[K]>>;

				// Query with selection - returns partial type based on selection
				query<TSelect extends Select<InferOutput<T[K]>>>(
					input: InferInput<T[K]>,
					options: QueryOptions<InferOutput<T[K]>, TSelect>,
				): Promise<Selected<InferOutput<T[K]>, TSelect>>;

				// Subscribe without selection - returns full type
				subscribe(input: InferInput<T[K]>): Observable<InferOutput<T[K]>>;

				// Subscribe with selection - returns partial type based on selection
				subscribe<TSelect extends Select<InferOutput<T[K]>>>(
					input: InferInput<T[K]>,
					options: QueryOptions<InferOutput<T[K]>, TSelect>,
				): Observable<Selected<InferOutput<T[K]>, TSelect>>;
			}
		: T[K] extends { type: "mutation" }
			? {
					// Mutation without selection - returns full type
					mutate(input: InferInput<T[K]>): Promise<InferOutput<T[K]>>;

					// Mutation with selection - returns partial type based on selection
					mutate<TSelect extends Select<InferOutput<T[K]>>>(
						input: InferInput<T[K]>,
						options: QueryOptions<InferOutput<T[K]>, TSelect>,
					): Promise<Selected<InferOutput<T[K]>, TSelect>>;
				}
			: T[K] extends LensObject
				? LensClient<T[K]>
				: never;
};
