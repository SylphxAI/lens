/**
 * @sylphx/lens-server - Server Types
 *
 * Type definitions for Lens server configuration and operations.
 */

import type {
	AnyQueryDef,
	ContextValue,
	InferRouterContext,
	ModelDef,
	MutationDef,
	Observable,
	OptimisticDSL,
	QueryDef,
	Resolvers,
	RouterDef,
	SubscriptionDef,
} from "@sylphx/lens-core";
import type { PluginManager, ServerPlugin } from "../plugin/types.js";

// =============================================================================
// Selection Types
// =============================================================================

/**
 * Nested selection object with optional input.
 * Used for relations that need their own params.
 */
export interface NestedSelection {
	/** Input/params for this nested query */
	input?: Record<string, unknown>;
	/** Field selection for this nested query */
	select?: SelectionObject;
}

/**
 * Selection object for field selection.
 * Supports:
 * - `true` - Select this field
 * - `{ select: {...} }` - Nested selection only
 * - `{ input: {...}, select?: {...} }` - Nested with input params
 */
export interface SelectionObject {
	[key: string]: boolean | SelectionObject | { select: SelectionObject } | NestedSelection;
}

// =============================================================================
// Map Types
// =============================================================================

/** Entity map type */
export type EntitiesMap = Record<string, ModelDef<string, any>>;

/** Queries map type */
export type QueriesMap = Record<string, AnyQueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Subscriptions map type */
export type SubscriptionsMap = Record<string, SubscriptionDef<unknown, unknown>>;

// =============================================================================
// Operation Metadata
// =============================================================================

/** Operation metadata for handshake */
export interface OperationMeta {
	type: "query" | "mutation" | "subscription";
	optimistic?: OptimisticDSL;
	/**
	 * Return entity type name (if operation returns an entity).
	 * Used by client for field-level subscription detection.
	 */
	returnType?: string;
}

/** Nested operations structure for handshake */
export type OperationsMap = {
	[key: string]: OperationMeta | OperationsMap;
};

// =============================================================================
// Logger
// =============================================================================

/** Logger interface */
export interface LensLogger {
	info?: (message: string, ...args: unknown[]) => void;
	warn?: (message: string, ...args: unknown[]) => void;
	error?: (message: string, ...args: unknown[]) => void;
}

// =============================================================================
// Server Configuration
// =============================================================================

/** Server configuration */
export interface LensServerConfig<
	TContext extends ContextValue = ContextValue,
	TRouter extends RouterDef = RouterDef,
> {
	/** Entity definitions */
	entities?: EntitiesMap | undefined;
	/** Router definition (namespaced operations) */
	router?: TRouter | undefined;
	/** Query definitions (flat) */
	queries?: QueriesMap | undefined;
	/** Mutation definitions (flat) */
	mutations?: MutationsMap | undefined;
	/** Field resolvers array */
	resolvers?: Resolvers | undefined;
	/** Logger for server messages (default: silent) */
	logger?: LensLogger | undefined;
	/** Context factory */
	context?: ((req?: unknown) => TContext | Promise<TContext>) | undefined;
	/** Server version */
	version?: string | undefined;
	/**
	 * Server-level plugins for subscription lifecycle and state management.
	 * Plugins are processed at the server level, not adapter level.
	 */
	plugins?: ServerPlugin[] | undefined;
}

// =============================================================================
// Server Metadata
// =============================================================================

/** Field mode for entity fields */
export type FieldMode = "exposed" | "resolve" | "subscribe" | "live";

/** Entity field metadata for client-side routing decisions */
export interface EntityFieldMetadata {
	[fieldName: string]: FieldMode;
}

/** All entities field metadata */
export interface EntitiesMetadata {
	[entityName: string]: EntityFieldMetadata;
}

/** Server metadata for transport handshake */
export interface ServerMetadata {
	version: string;
	operations: OperationsMap;
	/**
	 * Entity field metadata for client-side transport routing.
	 * Client uses this to determine if any selected field requires streaming transport.
	 */
	entities: EntitiesMetadata;
}

// =============================================================================
// Operations
// =============================================================================

/** Operation for execution */
export interface LensOperation {
	path: string;
	input?: unknown;
}

/**
 * Result from operation execution.
 * Uses the new Message protocol format.
 */
export type LensResult<T = unknown> = import("@sylphx/lens-core").Message<T>;

// =============================================================================
// Client Communication
// =============================================================================

/**
 * Client send function type for subscription updates.
 */
export type ClientSendFn = (message: unknown) => void;

/** WebSocket interface for adapters */
export interface WebSocketLike {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Server Interface
// =============================================================================

/**
 * Lens server interface - Pure Executor
 *
 * The server is a pure operation executor. It receives operations and returns results.
 * Runtime concerns (connections, transport, protocol) are handled by adapters/handlers.
 *
 * Core methods:
 * - getMetadata() - Server metadata for transport handshake
 * - execute() - Execute any operation (returns Observable)
 *
 * For handlers that need plugin integration (WS, SSE with state management),
 * use getPluginManager() to access plugin hooks directly.
 */
export interface LensServer {
	/** Get server metadata for transport handshake */
	getMetadata(): ServerMetadata;

	/**
	 * Execute operation - auto-detects query vs mutation.
	 *
	 * Always returns Observable<LensResult>:
	 * - One-shot: emits once, then completes
	 * - Streaming: emits multiple times (AsyncIterable or emit-based)
	 *
	 * Usage:
	 * - HTTP: `await firstValueFrom(server.execute(op))`
	 * - WS/SSE: `server.execute(op).subscribe(...)`
	 * - direct: pass through Observable directly
	 */
	execute(op: LensOperation): Observable<LensResult>;

	/**
	 * Get the plugin manager for handlers that need plugin integration.
	 *
	 * Handlers should use this to call plugin hooks directly:
	 * - pluginManager.runOnConnect() - When client connects
	 * - pluginManager.runOnDisconnect() - When client disconnects
	 * - pluginManager.runOnSubscribe() - When client subscribes
	 * - pluginManager.runOnUnsubscribe() - When client unsubscribes
	 * - pluginManager.runOnReconnect() - For reconnection handling
	 * - etc.
	 */
	getPluginManager(): PluginManager;
}

// =============================================================================
// Type Inference
// =============================================================================

import type { FieldType } from "@sylphx/lens-core";

export type InferInput<T> =
	T extends QueryDef<infer I, any>
		? I
		: T extends MutationDef<infer I, any>
			? I
			: T extends SubscriptionDef<infer I, any>
				? I
				: never;

export type InferOutput<T> =
	T extends QueryDef<any, infer O>
		? O
		: T extends MutationDef<any, infer O>
			? O
			: T extends SubscriptionDef<any, infer O>
				? O
				: T extends FieldType<infer F>
					? F
					: never;

export type InferApi<T> = T extends { _types: infer Types } ? Types : never;

export type ServerConfigWithInferredContext<
	TRouter extends RouterDef,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	router: TRouter;
	entities?: EntitiesMap;
	queries?: Q;
	mutations?: M;
	resolvers?: Resolvers;
	logger?: LensLogger;
	context?: () => InferRouterContext<TRouter> | Promise<InferRouterContext<TRouter>>;
	version?: string;
	/** Server-level plugins (clientState, etc.) */
	plugins?: ServerPlugin[];
};

export type ServerConfigLegacy<
	TContext extends ContextValue,
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> = {
	router?: RouterDef | undefined;
	entities?: EntitiesMap;
	queries?: Q;
	mutations?: M;
	resolvers?: Resolvers;
	logger?: LensLogger;
	context?: () => TContext | Promise<TContext>;
	version?: string;
	/** Server-level plugins (clientState, etc.) */
	plugins?: ServerPlugin[];
};
