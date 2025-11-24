/**
 * @lens/core - Plugin System
 *
 * Unified plugin architecture for client and server.
 */

export {
	// Helper
	defineUnifiedPlugin,
	isConfiguredPlugin,
	// Types
	type PluginMeta,
	type BasePluginConfig,
	// Client types
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
	// Server types
	type ServerRequestContext,
	type ServerPluginContext,
	type ServerPluginHooks,
	type ServerPluginInstance,
	type ServerPluginDef,
	// Unified
	type UnifiedPlugin,
	type CallableUnifiedPlugin,
	type ConfiguredPlugin,
	// Handshake
	type PluginHandshakeInfo,
	type ServerHandshake,
	type ClientHandshake,
} from "./types";

// Built-in plugins
export {
	authPlugin,
	type AuthPluginConfig,
	type AuthClientAPI,
	type AuthServerAPI,
} from "./auth";

export {
	cachePlugin,
	type CachePluginConfig,
	type CacheClientAPI,
	type CacheServerAPI,
	type CascadeRule,
} from "./cache";

export {
	paginationPlugin,
	type PaginationPluginConfig,
	type PaginationClientAPI,
	type PaginationServerAPI,
	type PageInfo,
	type PaginatedResult,
	type PaginationInput,
} from "./pagination";

export {
	offlinePlugin,
	type OfflinePluginConfig,
	type OfflineClientAPI,
	type OfflineServerAPI,
	type PendingOperation,
	type ConflictStrategy,
	type StorageAdapter,
} from "./offline";

export {
	rateLimitPlugin,
	type RateLimitPluginConfig,
	type RateLimitClientAPI,
	type RateLimitServerAPI,
	type RateLimitRule,
} from "./rate-limit";

export {
	subscriptionBatchingPlugin,
	type SubscriptionBatchingConfig,
	type BatchingClientAPI,
	type BatchingServerAPI,
	type BatchedUpdate,
} from "./subscription-batching";

export {
	validationPlugin,
	type ValidationPluginConfig,
	type ValidationClientAPI,
	type ValidationServerAPI,
	type ValidationRule,
	type EntityValidation,
	type ValidationError,
	type ValidationResult,
} from "./validation";

export {
	devToolsPlugin,
	type DevToolsPluginConfig,
	type DevToolsClientAPI,
	type DevToolsServerAPI,
	type LogEntry,
	type PerformanceMetric,
} from "./devtools";
