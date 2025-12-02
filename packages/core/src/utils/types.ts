/**
 * @sylphx/lens-core - Shared Type Utilities
 *
 * Common utility types used across the codebase.
 */

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Convert union type to intersection type.
 *
 * @example
 * ```typescript
 * type A = { a: 1 } | { b: 2 };
 * type B = UnionToIntersection<A>; // { a: 1 } & { b: 2 }
 * ```
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never;

/**
 * Flatten intersection types for better IDE display.
 *
 * @example
 * ```typescript
 * type Messy = { a: 1 } & { b: 2 } & { c: 3 };
 * type Clean = Prettify<Messy>; // { a: 1; b: 2; c: 3 }
 * ```
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
