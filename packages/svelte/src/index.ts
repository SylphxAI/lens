/**
 * @sylphx/lens-svelte
 *
 * Svelte stores for Lens API framework.
 * Provides reactive stores that integrate with Svelte's reactivity system.
 */

// =============================================================================
// Stores
// =============================================================================

export {
	type LazyQueryStore,
	lazyQuery,
	type MutationFn,
	type MutationStore,
	type MutationStoreValue,
	mutation,
	// Types
	type QueryInput,
	type QueryStore,
	type QueryStoreOptions,
	type QueryStoreValue,
	// Store factories
	query,
} from "./stores";

// =============================================================================
// Context
// =============================================================================

export {
	getLensClient,
	// Context key
	LENS_CLIENT_KEY,
	// Context functions (recommended)
	provideLensClient,
	// Legacy aliases (deprecated)
	setLensClient,
	useLensClient,
} from "./context";
