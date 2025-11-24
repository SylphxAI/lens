/**
 * @lens/vue
 *
 * Vue composables for Lens API framework.
 * Provides reactive composables that integrate with Vue's Composition API.
 */

// =============================================================================
// Composables
// =============================================================================

export {
	// Standard composables
	useEntity,
	useList,
	useMutation,
	// Types
	type UseEntityOptions,
	type UseListOptions,
	type UseEntityResult,
	type UseListResult,
	type UseMutationResult,
} from "./composables";

// =============================================================================
// Plugin
// =============================================================================

export {
	// Vue plugin
	LensPlugin,
	// Inject keys
	LENS_CLIENT_KEY,
	REACTIVE_LENS_CLIENT_KEY,
	// Manual injection
	useLensClient,
	useReactiveLensClient,
} from "./plugin";

// =============================================================================
// Reactive Composables (Fine-grained)
// =============================================================================

export {
	// Reactive composables with field-level signals
	useReactiveEntity,
	useReactiveList,
	// Types
	type UseReactiveEntityOptions,
	type UseReactiveListOptions,
	type UseReactiveEntityResult,
	type UseReactiveListResult,
} from "./reactive-composables";
