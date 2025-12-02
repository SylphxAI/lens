/**
 * @sylphx/lens-core - Reconnection Types
 *
 * Type definitions for the version-based reconnection system.
 * Enables seamless state synchronization after connection loss.
 */

// =============================================================================
// Version Tracking
// =============================================================================

/**
 * Version number for entity state.
 * Monotonically increasing, incremented on every state change.
 */
export type Version = number;

/**
 * Versioned entity state stored on server.
 */
export interface VersionedEntityState<T = Record<string, unknown>> {
	/** Current entity data */
	data: T;

	/** Monotonically increasing version number */
	version: Version;

	/** Timestamp of last update (Unix ms) */
	updatedAt: number;
}

/**
 * Versioned array state stored on server.
 */
export interface VersionedArrayState<T = unknown> {
	/** Current array items */
	items: T[];

	/** Version number */
	version: Version;

	/** Timestamp of last update */
	updatedAt: number;
}

// =============================================================================
// Operation Log
// =============================================================================

/**
 * JSON Patch operation (RFC 6902).
 */
export interface PatchOperation {
	op: "add" | "remove" | "replace" | "move" | "copy" | "test";
	path: string;
	value?: unknown;
	from?: string;
}

/**
 * Single operation log entry.
 * Represents one state change that can be replayed.
 */
export interface OperationLogEntry {
	/** Entity key (e.g., "user:123") */
	entityKey: string;

	/** Version AFTER this operation */
	version: Version;

	/** Timestamp when operation occurred (Unix ms) */
	timestamp: number;

	/** JSON Patch operations (RFC 6902) */
	patch: PatchOperation[];

	/** Size of patch in bytes (for memory tracking) */
	patchSize: number;
}

/**
 * Configuration for operation log.
 */
export interface OperationLogConfig {
	/** Maximum number of entries to retain (default: 10000) */
	maxEntries: number;

	/** Maximum age of entries in milliseconds (default: 300000 = 5 min) */
	maxAge: number;

	/** Maximum total memory usage in bytes (default: 10485760 = 10MB) */
	maxMemory: number;

	/** Cleanup interval in milliseconds (default: 60000 = 1 min) */
	cleanupInterval: number;
}

/**
 * Statistics for operation log.
 */
export interface OperationLogStats {
	/** Current number of entries */
	entryCount: number;

	/** Number of unique entities tracked */
	entityCount: number;

	/** Total memory usage in bytes */
	memoryUsage: number;

	/** Oldest entry timestamp */
	oldestTimestamp: number | null;

	/** Newest entry timestamp */
	newestTimestamp: number | null;

	/** Configuration limits */
	config: OperationLogConfig;
}

// =============================================================================
// Client Subscription Tracking
// =============================================================================

/**
 * Subscription state.
 */
export type SubscriptionState = "pending" | "active" | "reconnecting" | "error";

/**
 * Tracked subscription with version information.
 */
export interface TrackedSubscription<T = unknown> {
	/** Unique subscription ID */
	id: string;

	/** Entity type (e.g., "user") */
	entity: string;

	/** Entity ID (e.g., "123") */
	entityId: string;

	/** Subscribed fields or "*" for all */
	fields: string[] | "*";

	/** Last received version from server */
	version: Version;

	/** Last known data (for optimistic updates and reconnect) */
	lastData: Record<string, unknown> | null;

	/** Hash of last data (for efficient comparison) */
	lastDataHash: string | null;

	/** Observer callbacks */
	observer: SubscriptionObserver<T>;

	/** Subscription state */
	state: SubscriptionState;

	/** Original subscription input */
	input: unknown;

	/** Timestamp when subscription was created */
	createdAt: number;

	/** Timestamp of last update received */
	lastUpdateAt: number | null;
}

/**
 * Observer callbacks for subscription.
 */
export interface SubscriptionObserver<T = unknown> {
	next?: (result: SubscriptionResult<T>) => void;
	error?: (error: Error) => void;
	complete?: () => void;
}

/**
 * Result delivered to subscription observer.
 */
export interface SubscriptionResult<T = unknown> {
	data: T | null;
	deleted?: boolean;
	version?: Version;
}

/**
 * Statistics for subscription registry.
 */
export interface SubscriptionRegistryStats {
	/** Total subscriptions */
	total: number;

	/** By state */
	byState: Record<SubscriptionState, number>;

	/** By entity type */
	byEntity: Record<string, number>;
}

// =============================================================================
// Protocol Messages
// =============================================================================

/**
 * Current protocol version.
 */
export const PROTOCOL_VERSION = 2;

/**
 * Subscription info sent during reconnect.
 */
export interface ReconnectSubscription {
	/** Original subscription ID */
	id: string;

	/** Entity type */
	entity: string;

	/** Entity ID */
	entityId: string;

	/** Subscribed fields */
	fields: string[] | "*";

	/** Last received version */
	version: Version;

	/** Hash of last known data for verification */
	dataHash?: string;

	/** Original subscription input */
	input?: unknown;
}

/**
 * Client → Server: Request to restore subscriptions after reconnect.
 */
export interface ReconnectMessage {
	type: "reconnect";

	/** Protocol version for forward compatibility */
	protocolVersion: number;

	/** Subscriptions to restore */
	subscriptions: ReconnectSubscription[];

	/** Client-generated reconnect ID for deduplication */
	reconnectId: string;

	/** Client timestamp for latency measurement */
	clientTime: number;
}

/**
 * Reconnect status for single subscription.
 */
export type ReconnectStatus =
	| "current" // Client is up-to-date, no action needed
	| "patched" // Send patches to catch up
	| "snapshot" // Send full state (patches too old)
	| "deleted" // Entity was deleted
	| "error"; // Error processing subscription

/**
 * Result for single subscription in reconnect response.
 */
export interface ReconnectResult {
	/** Subscription ID */
	id: string;

	/** Entity type */
	entity: string;

	/** Entity ID */
	entityId: string;

	/** Sync status */
	status: ReconnectStatus;

	/** Current server version */
	version: Version;

	/** For "patched": ordered patches to apply */
	patches?: PatchOperation[][];

	/** For "snapshot": full current state */
	data?: Record<string, unknown>;

	/** For "snapshot": hash of data for verification */
	dataHash?: string;

	/** Error message if status is "error" */
	error?: string;
}

/**
 * Server → Client: Response with catch-up data.
 */
export interface ReconnectAckMessage {
	type: "reconnect_ack";

	/** Results for each subscription */
	results: ReconnectResult[];

	/** Server timestamp for sync */
	serverTime: number;

	/** Reconnect ID echo for correlation */
	reconnectId: string;

	/** Processing duration on server (ms) */
	processingTime: number;
}

/**
 * Server → Client: Subscription acknowledgment with initial state.
 */
export interface SubscriptionAckMessage {
	type: "subscription_ack";

	/** Subscription ID */
	id: string;

	/** Entity type */
	entity: string;

	/** Entity ID */
	entityId: string;

	/** Initial version */
	version: Version;

	/** Initial data */
	data: Record<string, unknown>;

	/** Data hash for future verification */
	dataHash: string;
}

/**
 * Field update in versioned update message.
 */
export interface VersionedFieldUpdate {
	/** Update strategy: value, delta, patch */
	s: "v" | "d" | "p";

	/** Update data */
	d: unknown;
}

/**
 * Entity update with version.
 */
export interface VersionedEntityUpdate {
	/** New version after this update */
	v: Version;

	/** Field updates */
	[field: string]: VersionedFieldUpdate | Version;
}

/**
 * Server → Client: State update with version.
 */
export interface VersionedUpdateMessage {
	type: "update";

	/** Grouped updates by entity type and ID */
	updates: {
		[entity: string]: {
			[id: string]: VersionedEntityUpdate;
		};
	};

	/** Server timestamp */
	serverTime: number;
}

// =============================================================================
// Connection State
// =============================================================================

/**
 * Connection state for client.
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

/**
 * Reconnect configuration.
 */
export interface ReconnectConfig {
	/** Enable auto-reconnect (default: true) */
	enabled: boolean;

	/** Maximum reconnect attempts (default: 10) */
	maxAttempts: number;

	/** Base delay between reconnects in ms (default: 1000) */
	baseDelay: number;

	/** Maximum delay between reconnects in ms (default: 30000) */
	maxDelay: number;

	/** Jitter factor 0-1 (default: 0.3) */
	jitter: number;
}

/**
 * Connection quality metrics.
 */
export interface ConnectionQuality {
	/** Round-trip latency in ms */
	latency: number;

	/** Estimated bandwidth in bytes/sec */
	bandwidth: number;

	/** Packet loss ratio 0-1 */
	packetLoss: number;

	/** Number of successful pings */
	successfulPings: number;

	/** Number of failed pings */
	failedPings: number;
}

// =============================================================================
// Metrics & Observability
// =============================================================================

/**
 * Reconnection metrics.
 */
export interface ReconnectionMetrics {
	/** Total reconnect attempts */
	totalAttempts: number;

	/** Successful reconnects */
	successfulReconnects: number;

	/** Failed reconnects */
	failedReconnects: number;

	/** Success rate (0-1) */
	successRate: number;

	/** Average latency in ms */
	averageLatency: number;

	/** 50th percentile latency in ms */
	p50Latency: number;

	/** 95th percentile latency in ms */
	p95Latency: number;

	/** 99th percentile latency in ms */
	p99Latency: number;

	/** Total subscriptions processed */
	totalSubscriptionsProcessed: number;

	/** Breakdown by status */
	statusBreakdown: Record<string, number>;

	/** Total bytes transferred */
	bytesTransferred: number;

	/** Total bytes saved by compression */
	bytesSaved: number;

	/** Compression ratio (0-1) */
	compressionRatio: number;
}

/**
 * Health check result.
 */
export interface ReconnectionHealth {
	/** Health status */
	status: "healthy" | "degraded" | "unhealthy";

	/** Current metrics */
	metrics: ReconnectionMetrics;

	/** Issues detected */
	issues: string[];

	/** Last reconnect timestamp */
	lastReconnect: number | null;

	/** Number of pending reconnections */
	pendingReconnects: number;
}

// =============================================================================
// Compressed Payload (for large snapshots)
// =============================================================================

/**
 * Compression algorithm.
 */
export type CompressionAlgorithm = "gzip" | "deflate" | "none";

/**
 * Compressed payload wrapper.
 */
export interface CompressedPayload {
	/** Indicates this is compressed */
	compressed: true;

	/** Compression algorithm used */
	algorithm: CompressionAlgorithm;

	/** Base64 encoded compressed data */
	data: string;

	/** Original size in bytes (for logging) */
	originalSize: number;

	/** Compressed size in bytes */
	compressedSize: number;
}

/**
 * Check if value is compressed payload.
 */
export function isCompressedPayload(value: unknown): value is CompressedPayload {
	return (
		typeof value === "object" &&
		value !== null &&
		"compressed" in value &&
		(value as CompressedPayload).compressed === true
	);
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Generate unique ID.
 */
export function generateReconnectId(): string {
	return `rc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Default operation log config.
 */
export const DEFAULT_OPERATION_LOG_CONFIG: OperationLogConfig = {
	maxEntries: 10000,
	maxAge: 5 * 60 * 1000, // 5 minutes
	maxMemory: 10 * 1024 * 1024, // 10MB
	cleanupInterval: 60 * 1000, // 1 minute
};

/**
 * Default reconnect config.
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
	enabled: true,
	maxAttempts: 10,
	baseDelay: 1000,
	maxDelay: 30000,
	jitter: 0.3,
};
