/**
 * @sylphx/react
 *
 * React bindings for Lens API framework.
 * Hooks and context provider for reactive data access.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, useLensClient, type LensProviderProps } from "./context";

// =============================================================================
// Hooks (Operations-based API)
// =============================================================================

export {
	// Query hooks
	useQuery,
	useLazyQuery,
	// Mutation hook
	useMutation,
	// Types
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "./hooks";

// =============================================================================
// Re-exports from @preact/signals-react
// =============================================================================

export { useSignal, useComputed, useSignalEffect } from "@preact/signals-react";
