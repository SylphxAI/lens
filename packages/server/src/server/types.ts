/**
 * @sylphx/lens-server - Server Types
 *
 * Type definitions for Lens server configuration and operations.
 */

import type {
	ContextValue,
	EntityDef,
	InferRouterContext,
	MutationDef,
	Observable,
	OptimisticDSL,
	QueryDef,
	Resolvers,
	RouterDef,
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
export type EntitiesMap = Record<string, EntityDef<string, any>>;

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

// =============================================================================
// Operation Metadata
// =============================================================================

/** Operation metadata for handshake */
export interface OperationMeta {
	type: "query" | "mutation" | "subscription";
	optimistic?: OptimisticDSL;
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

/** Server metadata for transport handshake */
export interface ServerMetadata {
	version: string;
	operations: OperationsMap;
}

// =============================================================================
// Operations
// =============================================================================

/** Operation for execution */
export interface LensOperation {
	path: string;
	input?: unknown;
}

/** Result from operation execution */
export interface LensResult<T = unknown> {
	data?: T;
	error?: Error;
}

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
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Server Interface
// =============================================================================

/**
 * Lens server interface
 *
 * Core methods:
 * - getMetadata() - Server metadata for transport handshake
 * - execute() - Execute any operation
 *
 * Subscription support (used by adapters):
 * - addClient() / removeClient() - Client connection management
 * - subscribe() / unsubscribe() - Subscription lifecycle
 * - send() - Send data to client (runs through plugin hooks)
 * - broadcast() - Broadcast to all entity subscribers
 * - handleReconnect() - Handle client reconnection
 *
 * The server handles all business logic including state management (via plugins).
 * Handlers are pure protocol translators that call these methods.
 */
export interface LensServer {
	/** Get server metadata for transport handshake */
	getMetadata(): ServerMetadata;

	/**
	 * Execute operation - auto-detects query vs mutation.
	 *
	 * Returns:
	 * - Promise<LensResult> for one-shot queries/mutations
	 * - Observable<LensResult> for streaming (AsyncIterable resolvers or emit-based)
	 *
	 * Transports should handle both:
	 * - HTTP: Use firstValueFrom() to get single value
	 * - WS/SSE: Subscribe to Observable for streaming
	 * - direct: Pass through as-is for full streaming support
	 */
	execute(op: LensOperation): Promise<LensResult> | Observable<LensResult>;

	// =========================================================================
	// Subscription Support (Optional - used by WS/SSE handlers)
	// =========================================================================

	/**
	 * Register a client connection.
	 * Call when a client connects via WebSocket/SSE.
	 */
	addClient(clientId: string, send: ClientSendFn): Promise<boolean>;

	/**
	 * Remove a client connection.
	 * Call when a client disconnects.
	 */
	removeClient(clientId: string, subscriptionCount: number): void;

	/**
	 * Subscribe a client to an entity.
	 * Runs plugin hooks and sets up state tracking (if clientState is enabled).
	 */
	subscribe(ctx: import("../plugin/types.js").SubscribeContext): Promise<boolean>;

	/**
	 * Unsubscribe a client from an entity.
	 * Runs plugin hooks and cleans up state tracking.
	 */
	unsubscribe(ctx: import("../plugin/types.js").UnsubscribeContext): void;

	/**
	 * Send data to a client for a specific subscription.
	 * Runs through plugin hooks (beforeSend/afterSend) for optimization.
	 */
	send(
		clientId: string,
		subscriptionId: string,
		entity: string,
		entityId: string,
		data: Record<string, unknown>,
		isInitial: boolean,
	): Promise<void>;

	/**
	 * Broadcast data to all subscribers of an entity.
	 * Runs through plugin hooks for each subscriber.
	 */
	broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void>;

	/**
	 * Handle a reconnection request from a client.
	 * Uses plugin hooks (onReconnect) for reconnection logic.
	 */
	handleReconnect(
		ctx: import("../plugin/types.js").ReconnectContext,
	): Promise<import("../plugin/types.js").ReconnectHookResult[] | null>;

	/**
	 * Update subscribed fields for a client's subscription.
	 * Runs plugin hooks (onUpdateFields) to sync state.
	 */
	updateFields(ctx: import("../plugin/types.js").UpdateFieldsContext): Promise<void>;

	/**
	 * Get the plugin manager for direct hook access.
	 */
	getPluginManager(): PluginManager;
}

// =============================================================================
// Type Inference
// =============================================================================

import type { FieldType } from "@sylphx/lens-core";

export type InferInput<T> =
	T extends QueryDef<infer I, any> ? I : T extends MutationDef<infer I, any> ? I : never;

export type InferOutput<T> =
	T extends QueryDef<any, infer O>
		? O
		: T extends MutationDef<any, infer O>
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
