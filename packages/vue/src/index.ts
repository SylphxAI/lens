/**
 * @sylphx/lens-vue
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
	type MutationFn,
	// Types
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	// Mutation composable
	useMutation,
	// Query composables
	useQuery,
} from "./composables";
