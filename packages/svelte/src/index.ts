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
	entity,
	list,
	// Types
	type EntityStore,
	type ListStore,
	type EntityStoreOptions,
	type ListStoreOptions,
} from "./stores";

// =============================================================================
// Context
// =============================================================================

export {
	// Context key
	LENS_CLIENT_KEY,
	// Context functions
	setLensClient,
	getLensClient,
	// Reactive client context
	REACTIVE_LENS_CLIENT_KEY,
	setReactiveLensClient,
	getReactiveLensClient,
} from "./context";

// =============================================================================
// Reactive Stores (Fine-grained)
// =============================================================================

export {
	// Reactive store factories
	reactiveEntity,
	reactiveList,
	// Types
	type ReactiveEntityStore,
	type ReactiveListStore,
	type ReactiveEntityStoreOptions,
	type ReactiveListStoreOptions,
} from "./reactive-stores";
