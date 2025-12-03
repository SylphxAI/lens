/**
 * @sylphx/lens-signals
 *
 * Signals-based reactive store for Lens client.
 * Uses Preact Signals for fine-grained reactivity.
 *
 * @example
 * ```typescript
 * import { createStore, signal, computed, effect } from "@sylphx/lens-signals";
 *
 * // Create reactive store
 * const store = createStore();
 *
 * // Get entity signal
 * const user = store.getEntity<User>("User", "123");
 *
 * // React to changes
 * effect(() => {
 *   console.log("User:", user.value.data);
 * });
 * ```
 */

// =============================================================================
// Signals
// =============================================================================

export {
	batch,
	computed,
	derive,
	effect,
	isSignal,
	// Types
	type Signal,
	type Subscriber,
	// Functions
	signal,
	toPromise,
	type Unsubscribe,
	type WritableSignal,
} from "./signal.js";

// =============================================================================
// Store
// =============================================================================

export {
	type CascadeRule,
	createStore,
	type EntityKey,
	type EntityState,
	type InvalidationOptions,
	type OptimisticEntry,
	type OptimisticTransaction,
	ReactiveStore,
	type StoreConfig,
} from "./reactive-store.js";
