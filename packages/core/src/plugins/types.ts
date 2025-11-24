/**
 * @lens/core - Unified Plugin System Types
 *
 * Plugin architecture that works across client and server.
 * Plugins can define both client and server parts in one package.
 */

// =============================================================================
// Base Plugin Types
// =============================================================================

/** Plugin metadata */
export interface PluginMeta {
	/** Unique plugin name */
	name: string;
	/** Plugin version */
	version?: string;
	/** Required plugins */
	dependencies?: string[];
}

/** Base plugin config */
export interface BasePluginConfig {
	/** Enable/disable plugin */
	enabled?: boolean;
}

// =============================================================================
// Client Plugin Types
// =============================================================================

/** Client plugin context */
export interface ClientPluginContext {
	/** Execute operation through link chain */
	execute: (
		type: "query" | "mutation",
		entity: string,
		op: string,
		input: unknown,
	) => Promise<{ data?: unknown; error?: Error }>;
}

/** Client plugin hooks */
export interface ClientPluginHooks {
	/** Called when client initializes */
	onInit?: (ctx: ClientPluginContext) => void | Promise<void>;
	/** Called before mutation */
	onBeforeMutation?: (
		ctx: ClientPluginContext,
		entity: string,
		op: string,
		input: unknown,
	) => void;
	/** Called after mutation */
	onAfterMutation?: (
		ctx: ClientPluginContext,
		entity: string,
		op: string,
		result: { data?: unknown; error?: Error },
	) => void;
	/** Called on mutation error */
	onMutationError?: (
		ctx: ClientPluginContext,
		entity: string,
		op: string,
		error: Error,
	) => void;
	/** Called when subscription connects */
	onConnect?: (ctx: ClientPluginContext) => void;
	/** Called when subscription disconnects */
	onDisconnect?: (ctx: ClientPluginContext) => void;
	/** Called when subscription reconnects */
	onReconnect?: (ctx: ClientPluginContext) => void;
	/** Called when client is destroyed */
	onDestroy?: (ctx: ClientPluginContext) => void;
}

/** Client plugin instance */
export interface ClientPluginInstance extends ClientPluginHooks {
	/** Plugin name */
	name: string;
	/** Exposed API */
	api?: Record<string, unknown>;
	/** Cleanup */
	destroy?: () => void;
}

/** Client plugin definition */
export interface ClientPluginDef<TConfig = unknown> {
	/** Create client plugin instance */
	(config?: TConfig): ClientPluginInstance;
}

// =============================================================================
// Server Plugin Types
// =============================================================================

/** Server request context */
export interface ServerRequestContext {
	/** Request headers */
	headers?: Record<string, string>;
	/** Request IP */
	ip?: string;
	/** User (if authenticated) */
	user?: unknown;
	/** Custom data */
	[key: string]: unknown;
}

/** Server plugin context */
export interface ServerPluginContext {
	/** Request context */
	request?: ServerRequestContext;
}

/** Server plugin hooks */
export interface ServerPluginHooks {
	/** Called when server initializes */
	onInit?: () => void | Promise<void>;
	/** Called before resolving operation */
	onBeforeResolve?: (
		ctx: ServerPluginContext,
		entity: string,
		op: string,
		input: unknown,
	) => { input?: unknown; ctx?: ServerPluginContext } | void;
	/** Called after resolving operation */
	onAfterResolve?: (
		ctx: ServerPluginContext,
		entity: string,
		op: string,
		result: unknown,
	) => unknown | void;
	/** Called on resolve error */
	onResolveError?: (
		ctx: ServerPluginContext,
		entity: string,
		op: string,
		error: Error,
	) => Error | void;
	/** Called when WebSocket connects */
	onWSConnect?: (ctx: ServerPluginContext) => boolean | Promise<boolean>;
	/** Called when WebSocket disconnects */
	onWSDisconnect?: (ctx: ServerPluginContext) => void;
	/** Called when server shuts down */
	onShutdown?: () => void | Promise<void>;
}

/** Server plugin instance */
export interface ServerPluginInstance extends ServerPluginHooks {
	/** Plugin name */
	name: string;
	/** Exposed API */
	api?: Record<string, unknown>;
	/** Cleanup */
	destroy?: () => void;
}

/** Server plugin definition */
export interface ServerPluginDef<TConfig = unknown> {
	/** Create server plugin instance */
	(config?: TConfig): ServerPluginInstance;
}

// =============================================================================
// Unified Plugin
// =============================================================================

/**
 * Unified plugin that works on both client and server.
 *
 * @example
 * ```typescript
 * const authPlugin = definePlugin({
 *   name: "auth",
 *   version: "1.0.0",
 *
 *   client: (config) => ({
 *     name: "auth",
 *     onBeforeMutation: (ctx, entity, op, input) => {
 *       // Add auth header
 *     },
 *     api: {
 *       login: async (credentials) => { ... },
 *       logout: () => { ... },
 *     },
 *   }),
 *
 *   server: (config) => ({
 *     name: "auth",
 *     onBeforeResolve: (ctx, entity, op, input) => {
 *       // Verify auth
 *     },
 *   }),
 * });
 * ```
 */
export interface UnifiedPlugin<TConfig = unknown> extends PluginMeta {
	/** Default config */
	defaultConfig?: TConfig;
	/** Client plugin factory */
	client?: ClientPluginDef<TConfig>;
	/** Server plugin factory */
	server?: ServerPluginDef<TConfig>;
	/** Config sent to client during handshake (sanitized, no secrets) */
	getClientConfig?: (config?: TConfig) => Record<string, unknown>;
}

/** Configured plugin instance (result of calling plugin with config) */
export interface ConfiguredPlugin<TConfig = unknown> {
	/** Original plugin definition */
	__plugin: UnifiedPlugin<TConfig>;
	/** Configuration */
	__config: TConfig | undefined;
	/** Plugin name */
	name: string;
}

/** Callable unified plugin */
export interface CallableUnifiedPlugin<TConfig = unknown> extends UnifiedPlugin<TConfig> {
	/** Call with config to create configured instance */
	(config?: TConfig): ConfiguredPlugin<TConfig>;
}

/** Helper to define a unified plugin with type safety */
export function defineUnifiedPlugin<TConfig = void>(
	plugin: UnifiedPlugin<TConfig>,
): CallableUnifiedPlugin<TConfig> {
	// Use Object.defineProperties to set name on function
	const configure = (config?: TConfig): ConfiguredPlugin<TConfig> => ({
		__plugin: plugin,
		__config: config,
		name: plugin.name,
	});

	// Define all properties including name (which is normally readonly on functions)
	Object.defineProperties(configure, {
		name: { value: plugin.name, writable: false, configurable: true },
		version: { value: plugin.version, writable: true, configurable: true },
		dependencies: { value: plugin.dependencies, writable: true, configurable: true },
		defaultConfig: { value: plugin.defaultConfig, writable: true, configurable: true },
		client: { value: plugin.client, writable: true, configurable: true },
		server: { value: plugin.server, writable: true, configurable: true },
		getClientConfig: { value: plugin.getClientConfig, writable: true, configurable: true },
	});

	return configure as CallableUnifiedPlugin<TConfig>;
}

/** Check if value is a configured plugin */
export function isConfiguredPlugin(value: unknown): value is ConfiguredPlugin {
	return (
		typeof value === "object" &&
		value !== null &&
		"__plugin" in value &&
		"__config" in value
	);
}

// =============================================================================
// Handshake Protocol
// =============================================================================

/** Plugin info sent during handshake */
export interface PluginHandshakeInfo {
	/** Plugin name */
	name: string;
	/** Plugin version */
	version?: string;
	/** Client config (sanitized) */
	config?: Record<string, unknown>;
}

/** Server handshake response */
export interface ServerHandshake {
	/** Server version */
	version: string;
	/** Enabled plugins */
	plugins: PluginHandshakeInfo[];
	/** Schema hash (for validation) */
	schemaHash?: string;
}

/** Client handshake request */
export interface ClientHandshake {
	/** Client version */
	version: string;
	/** Requested plugins */
	plugins?: string[];
}
