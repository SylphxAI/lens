/**
 * @sylphx/lens-core - Reconnection Module
 *
 * Version-based reconnection system for seamless state synchronization
 * after connection loss.
 */

// =============================================================================
// Types
// =============================================================================

export type {
	ConnectionQuality,
	// Connection state
	ConnectionState,
	OperationLogConfig,
	OperationLogEntry,
	OperationLogStats,
	// Operation log
	PatchOperation,
	ReconnectAckMessage,
	ReconnectConfig,
	ReconnectionHealth,
	// Metrics
	ReconnectionMetrics,
	ReconnectMessage,
	ReconnectResult,
	ReconnectStatus,
	// Protocol messages
	ReconnectSubscription,
	SubscriptionAckMessage,
	SubscriptionObserver,
	SubscriptionRegistryStats,
	SubscriptionResult,
	// Subscription tracking
	SubscriptionState,
	TrackedSubscription,
	// Version tracking
	Version,
	VersionedArrayState,
	VersionedEntityState,
	VersionedEntityUpdate,
	VersionedFieldUpdate,
	VersionedUpdateMessage,
} from "./types.js";

export {
	DEFAULT_OPERATION_LOG_CONFIG,
	DEFAULT_RECONNECT_CONFIG,
	generateReconnectId,
	// Constants
	PROTOCOL_VERSION,
} from "./types.js";

// =============================================================================
// Hashing
// =============================================================================

export {
	deepEqual,
	FieldHashMap,
	// Hash utilities
	HashCache,
	hashEntityFields,
	hashEntityState,
	// Value hashing
	hashValue,
	// MurmurHash3
	murmurhash3,
	stableStringify,
	// Comparison
	valuesEqual,
} from "./hash.js";

// =============================================================================
// Patch Utilities (shared between client and server)
// =============================================================================

export { applyPatch } from "./operation-log.js";

// =============================================================================
// Metrics
// =============================================================================

export {
	createMetricsTracker,
	DEFAULT_METRICS_CONFIG,
	type MetricsCollector,
	type MetricsConfig,
	type MetricsEvent,
	ReconnectionMetricsTracker,
	type ReconnectionRecord,
} from "./metrics.js";

// =============================================================================
// Subscription Registry (moved to @sylphx/lens-client)
// =============================================================================

/**
 * @deprecated Import from @sylphx/lens-client instead:
 * `import { SubscriptionRegistry } from "@sylphx/lens-client"`
 */
/**
 * @deprecated Import from @sylphx/lens-client instead:
 * `import { createSubscriptionRegistry } from "@sylphx/lens-client"`
 */
export { createSubscriptionRegistry, SubscriptionRegistry } from "./subscription-registry.js";
