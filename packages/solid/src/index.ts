/**
 * @sylphx/lens-solid
 *
 * SolidJS bindings for Lens API framework.
 * Reactive primitives that integrate with SolidJS fine-grained reactivity.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, type LensProviderProps, useLensClient } from "./context";

// =============================================================================
// Reactive Primitives
// =============================================================================

export {
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type CreateQueryResult,
	createLazyQuery,
	// Mutation primitive
	createMutation,
	// Query primitives
	createQuery,
	type MutationFn,
	// Types
	type QueryInput,
} from "./primitives";
