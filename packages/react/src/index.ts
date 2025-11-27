/**
 * @sylphx/lens-react
 *
 * React bindings for Lens API framework.
 * Hooks and context provider for reactive data access.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, type LensProviderProps, useLensClient } from "./context";

// =============================================================================
// Hooks (Operations-based API)
// =============================================================================

export {
	type MutationFn,
	// Types
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	// Mutation hook
	useMutation,
	// Query hooks
	useQuery,
} from "./hooks";
