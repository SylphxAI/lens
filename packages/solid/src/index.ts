/**
 * @lens/solid
 *
 * SolidJS bindings for Lens API framework.
 * Reactive primitives that integrate with SolidJS fine-grained reactivity.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, useLensClient, type LensProviderProps } from "./context";

// =============================================================================
// Reactive Primitives
// =============================================================================

export {
	// Query primitives
	createQuery,
	createLazyQuery,
	// Mutation primitive
	createMutation,
	// Types
	type CreateQueryResult,
	type CreateMutationResult,
	type CreateLazyQueryResult,
	type CreateQueryOptions,
	type MutationFn,
} from "./primitives";
