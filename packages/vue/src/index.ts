/**
 * @sylphx/vue
 *
 * Vue composables for Lens API framework.
 * Uses Vue's Composition API for reactive state management.
 */

// =============================================================================
// Context
// =============================================================================

export {
	LensClientKey,
	provideLensClient,
	useLensClient,
} from "./context";

// =============================================================================
// Composables
// =============================================================================

export {
	// Query composables
	useQuery,
	useLazyQuery,
	// Mutation composable
	useMutation,
	// Types
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "./composables";
