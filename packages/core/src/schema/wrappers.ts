/**
 * @sylphx/lens-core - Return Type Wrappers
 *
 * Wrappers for specifying nullable and list return types.
 *
 * @example
 * ```typescript
 * // Non-null (default)
 * query().returns(User)              // User
 *
 * // Nullable
 * query().returns(nullable(User))    // User | null
 *
 * // List
 * query().returns(list(User))        // User[]
 *
 * // Nullable list
 * query().returns(nullable(list(User))) // User[] | null
 *
 * // List of nullable (not supported - use optional fields instead)
 * ```
 */

import type { EntityDef } from "./define.js";
import type { ModelDef } from "./model.js";
import type { EntityDefinition } from "./types.js";

// =============================================================================
// Wrapper Symbols
// =============================================================================

export const NULLABLE_SYMBOL: unique symbol = Symbol("lens:nullable");
export const LIST_SYMBOL: unique symbol = Symbol("lens:list");

// =============================================================================
// Wrapper Types
// =============================================================================

/**
 * Nullable wrapper - marks a return type as nullable.
 * @example `nullable(User)` → `User | null`
 */
export interface NullableWrapper<T> {
	[NULLABLE_SYMBOL]: true;
	_inner: T;
}

/**
 * List wrapper - marks a return type as an array.
 * @example `list(User)` → `User[]`
 */
export interface ListWrapper<T> {
	[LIST_SYMBOL]: true;
	_inner: T;
}

/**
 * Model-like type (EntityDef or ModelDef)
 */
type ModelLike = EntityDef<string, EntityDefinition> | ModelDef<string, EntityDefinition>;

// =============================================================================
// Wrapper Functions
// =============================================================================

/**
 * Mark a return type as nullable.
 *
 * @example
 * ```typescript
 * // Single entity
 * query()
 *   .returns(nullable(User))  // User | null
 *   .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }));
 *
 * // List
 * query()
 *   .returns(nullable(list(User)))  // User[] | null
 *   .resolve(({ ctx }) => ctx.db.user.findMany());
 * ```
 */
export function nullable<T extends ModelLike>(model: T): NullableWrapper<T>;
export function nullable<T extends ModelLike>(
	listWrapper: ListWrapper<T>,
): NullableWrapper<ListWrapper<T>>;
export function nullable<T>(inner: T): NullableWrapper<T> {
	return {
		[NULLABLE_SYMBOL]: true,
		_inner: inner,
	};
}

/**
 * Mark a return type as an array.
 *
 * @example
 * ```typescript
 * query()
 *   .returns(list(User))  // User[]
 *   .resolve(({ ctx }) => ctx.db.user.findMany());
 * ```
 */
export function list<T extends ModelLike>(model: T): ListWrapper<T> {
	return {
		[LIST_SYMBOL]: true,
		_inner: model,
	};
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a NullableWrapper */
export function isNullableWrapper(value: unknown): value is NullableWrapper<unknown> {
	return typeof value === "object" && value !== null && NULLABLE_SYMBOL in value;
}

/** Check if value is a ListWrapper */
export function isListWrapper(value: unknown): value is ListWrapper<unknown> {
	return typeof value === "object" && value !== null && LIST_SYMBOL in value;
}

// =============================================================================
// Utility Types for Inference
// =============================================================================

/**
 * Unwrap a wrapped type to get the inner model.
 */
export type UnwrapModel<T> =
	T extends NullableWrapper<infer Inner>
		? UnwrapModel<Inner>
		: T extends ListWrapper<infer Inner>
			? UnwrapModel<Inner>
			: T;

/**
 * Check if a type is nullable.
 */
export type IsNullable<T> = T extends NullableWrapper<unknown> ? true : false;

/**
 * Check if a type is a list.
 */
export type IsList<T> =
	T extends NullableWrapper<infer Inner>
		? IsList<Inner>
		: T extends ListWrapper<unknown>
			? true
			: false;
