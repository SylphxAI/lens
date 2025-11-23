/**
 * @lens/react
 *
 * React bindings for Lens API framework.
 * Hooks, context provider, and signal integration.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, useLensClient, type LensProviderProps } from "./context";

// =============================================================================
// Hooks
// =============================================================================

export {
	// Entity hooks
	useEntity,
	useList,
	// Mutation hook
	useMutation,
	// Signal hooks
	useSignalValue,
	useLensComputed,
	// Types
	type EntityInput,
	type SelectOptions,
	type UseEntityResult,
	type UseListResult,
	type UseMutationResult,
} from "./hooks";

// =============================================================================
// Re-exports from @preact/signals-react
// =============================================================================

export { useSignal, useComputed, useSignalEffect } from "@preact/signals-react";
