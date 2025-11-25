/**
 * @lens/svelte
 *
 * Svelte stores for Lens API framework.
 * Provides reactive stores that integrate with Svelte's reactivity system.
 */

// =============================================================================
// Stores
// =============================================================================

export {
	// Store factories
	query,
	mutation,
	lazyQuery,
	// Types
	type QueryStore,
	type MutationStore,
	type LazyQueryStore,
	type QueryStoreValue,
	type MutationStoreValue,
	type QueryStoreOptions,
	type MutationFn,
} from "./stores";

// =============================================================================
// Context
// =============================================================================

export {
	// Context key
	LENS_CLIENT_KEY,
	// Context functions (recommended)
	provideLensClient,
	useLensClient,
	// Legacy aliases (deprecated)
	setLensClient,
	getLensClient,
} from "./context";
