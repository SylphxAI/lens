/**
 * @lens/client - Plugin Types
 *
 * Client-specific extensions for the plugin system.
 * Core types are in @lens/core.
 */

import type { SubscriptionManager } from "../reactive/subscription-manager";
import type { QueryResolver } from "../reactive/query-resolver";
import type { ClientPluginContext as CoreClientPluginContext } from "@lens/core";

// =============================================================================
// Extended Client Context
// =============================================================================

/**
 * Extended plugin context for @lens/client.
 * Adds access to client-specific internals beyond core's minimal context.
 */
export interface ExtendedPluginContext extends CoreClientPluginContext {
	/** Subscription manager (client-specific) */
	subscriptions: SubscriptionManager;
	/** Query resolver (client-specific) */
	resolver: QueryResolver;
}

// =============================================================================
// Config Types (client-specific plugins)
// =============================================================================

/** Optimistic updates plugin config */
export interface OptimisticPluginConfig {
	/** Enable optimistic updates (default: true) */
	enabled?: boolean;
	/** Timeout for pending updates in ms (default: 30000) */
	timeout?: number;
}
