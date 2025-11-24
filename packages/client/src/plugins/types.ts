/**
 * @lens/client - Plugin System Types
 *
 * Extensible plugin architecture for optional features.
 * Each plugin is independent and composable.
 */

import type { SubscriptionManager } from "../reactive/subscription-manager";
import type { QueryResolver } from "../reactive/query-resolver";
import type { OperationContext, OperationResult } from "../links/types";

// =============================================================================
// Plugin Lifecycle
// =============================================================================

/** Plugin context - access to client internals */
export interface PluginContext {
	/** Subscription manager */
	subscriptions: SubscriptionManager;
	/** Query resolver */
	resolver: QueryResolver;
	/** Execute operation through link chain */
	execute: (
		type: "query" | "mutation",
		entity: string,
		op: string,
		input: unknown,
	) => Promise<OperationResult>;
}

/** Plugin lifecycle hooks */
export interface PluginHooks {
	/** Called when client is created */
	onInit?: (ctx: PluginContext) => void | Promise<void>;

	/** Called before mutation executes */
	onBeforeMutation?: (
		ctx: PluginContext,
		entity: string,
		op: string,
		input: unknown,
	) => { input: unknown; meta?: Record<string, unknown> } | void;

	/** Called after mutation completes */
	onAfterMutation?: (
		ctx: PluginContext,
		entity: string,
		op: string,
		result: OperationResult,
		meta?: Record<string, unknown>,
	) => void;

	/** Called on mutation error */
	onMutationError?: (
		ctx: PluginContext,
		entity: string,
		op: string,
		error: Error,
		meta?: Record<string, unknown>,
	) => void;

	/** Called before query executes */
	onBeforeQuery?: (
		ctx: PluginContext,
		entity: string,
		id: string,
		options?: unknown,
	) => void;

	/** Called after query completes */
	onAfterQuery?: (
		ctx: PluginContext,
		entity: string,
		id: string,
		result: unknown,
	) => void;

	/** Called when subscription connects */
	onConnect?: (ctx: PluginContext) => void;

	/** Called when subscription disconnects */
	onDisconnect?: (ctx: PluginContext) => void;

	/** Called when subscription reconnects */
	onReconnect?: (ctx: PluginContext) => void;

	/** Called when client is destroyed */
	onDestroy?: (ctx: PluginContext) => void;
}

// =============================================================================
// Plugin Definition
// =============================================================================

/** Plugin definition */
export interface Plugin<TConfig = unknown> {
	/** Unique plugin name */
	name: string;

	/** Plugin version */
	version?: string;

	/** Dependencies (other plugin names) */
	dependencies?: string[];

	/** Default configuration */
	defaultConfig?: TConfig;

	/** Create plugin instance */
	create: (config?: TConfig) => PluginInstance;
}

/** Plugin instance (created from Plugin.create) */
export interface PluginInstance extends PluginHooks {
	/** Plugin name */
	name: string;

	/** Exposed API (accessible via client.$plugins.name) */
	api?: Record<string, unknown>;

	/** Cleanup function */
	destroy?: () => void;
}

// =============================================================================
// Plugin Manager
// =============================================================================

/** Plugin manager interface */
export interface PluginManager {
	/** Register a plugin */
	register<T>(plugin: Plugin<T>, config?: T): void;

	/** Get plugin API */
	get<T = unknown>(name: string): T | undefined;

	/** Check if plugin is registered */
	has(name: string): boolean;

	/** List all registered plugins */
	list(): string[];

	/** Initialize all plugins */
	init(ctx: PluginContext): Promise<void>;

	/** Destroy all plugins */
	destroy(): void;

	/** Call hook on all plugins */
	callHook<K extends keyof PluginHooks>(
		hook: K,
		...args: Parameters<NonNullable<PluginHooks[K]>>
	): void;
}

// =============================================================================
// Built-in Plugin Configs
// =============================================================================

/** Optimistic updates plugin config */
export interface OptimisticPluginConfig {
	/** Enable optimistic updates (default: true) */
	enabled?: boolean;
	/** Timeout for pending updates in ms (default: 30000) */
	timeout?: number;
}

/** Offline support plugin config */
export interface OfflinePluginConfig {
	/** Storage key prefix */
	storageKey?: string;
	/** Max offline queue size */
	maxQueueSize?: number;
	/** Sync on reconnect */
	syncOnReconnect?: boolean;
}

/** DevTools plugin config */
export interface DevToolsPluginConfig {
	/** Enable in production (default: false) */
	enableInProduction?: boolean;
	/** Log level */
	logLevel?: "debug" | "info" | "warn" | "error";
}

/** Cache plugin config */
export interface CachePluginConfig {
	/** Cache TTL in ms */
	ttl?: number;
	/** Max cache entries */
	maxEntries?: number;
	/** Stale-while-revalidate */
	staleWhileRevalidate?: boolean;
}

/** Retry plugin config */
export interface RetryPluginConfig {
	/** Max retry attempts */
	maxAttempts?: number;
	/** Retry delay in ms */
	delay?: number;
	/** Exponential backoff */
	exponential?: boolean;
	/** Retry on specific errors only */
	retryOn?: (error: Error) => boolean;
}
