/**
 * @sylphx/lens-core - Type Wrappers
 *
 * Re-exports from fields.ts for backward compatibility.
 * The list() and nullable() functions work for both model fields and return types.
 *
 * @example
 * ```typescript
 * import { list, nullable } from '@sylphx/lens-core'
 *
 * // Model fields
 * const User = model('User', {
 *   posts: list(() => Post),
 *   bio: nullable(string()),
 * })
 *
 * // Return types (same functions!)
 * query().returns(list(User))
 * query().returns(nullable(User))
 * ```
 */

// Re-export everything from fields.ts
// These work for both model fields AND return types
// Legacy aliases for backward compatibility
export {
	type IsList,
	type IsNullable,
	// Type guards
	isListDef,
	isListDef as isListWrapper,
	isNullableDef,
	isNullableDef as isNullableWrapper,
	// Symbols
	LIST_SYMBOL,
	LIST_SYMBOL as LIST_WRAPPER_SYMBOL,
	// Types
	type ListDef,
	type ListDef as ListWrapper,
	// Functions
	list,
	NULLABLE_SYMBOL,
	NULLABLE_SYMBOL as NULLABLE_WRAPPER_SYMBOL,
	type NullableDef,
	type NullableDef as NullableWrapper,
	nullable,
	// Utility types
	type UnwrapType,
	type UnwrapType as UnwrapModel,
} from "./fields.js";
