/**
 * @sylphx/lens-client - Reconnection Module
 *
 * Client-side reconnection utilities for seamless state synchronization.
 */

// Subscription Registry (client-side runtime)
export {
	createSubscriptionRegistry,
	type ReconnectSubscription,
	type SubscriptionObserver,
	SubscriptionRegistry,
	type SubscriptionRegistryStats,
	type SubscriptionState,
	type TrackedSubscription,
} from "./subscription-registry.js";
