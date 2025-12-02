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
	// Version tracking
	Version,
	VersionedEntityState,
	VersionedArrayState,

	// Operation log
	PatchOperation,
	OperationLogEntry,
	OperationLogConfig,
	OperationLogStats,

	// Subscription tracking
	SubscriptionState,
	TrackedSubscription,
	SubscriptionObserver,
	SubscriptionResult,
	SubscriptionRegistryStats,

	// Protocol messages
	ReconnectSubscription,
	ReconnectMessage,
	ReconnectStatus,
	ReconnectResult,
	ReconnectAckMessage,
	SubscriptionAckMessage,
	VersionedFieldUpdate,
	VersionedEntityUpdate,
	VersionedUpdateMessage,

	// Connection state
	ConnectionState,
	ReconnectConfig,
	ConnectionQuality,

	// Metrics
	ReconnectionMetrics,
	ReconnectionHealth,

	// Compression
	CompressionAlgorithm,
	CompressedPayload,
} from "./types.js";

export {
	// Constants
	PROTOCOL_VERSION,
	DEFAULT_OPERATION_LOG_CONFIG,
	DEFAULT_RECONNECT_CONFIG,

	// Utilities
	isCompressedPayload,
	generateReconnectId,
} from "./types.js";

// =============================================================================
// Hashing
// =============================================================================

export {
	// MurmurHash3
	murmurhash3,

	// Value hashing
	hashValue,
	stableStringify,
	hashEntityState,
	hashEntityFields,

	// Hash utilities
	HashCache,
	FieldHashMap,

	// Comparison
	valuesEqual,
	deepEqual,
} from "./hash.js";

// =============================================================================
// Operation Log
// =============================================================================

export {
	OperationLog,
	coalescePatches,
	estimatePatchSize,
	applyPatch,
} from "./operation-log.js";

// =============================================================================
// Subscription Registry
// =============================================================================

export {
	SubscriptionRegistry,
	createSubscriptionRegistry,
} from "./subscription-registry.js";
