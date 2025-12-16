/**
 * @sylphx/lens-server - WebSocket Handler Types
 *
 * Type definitions for WebSocket protocol handling.
 */

import type { ReconnectMessage } from "@sylphx/lens-core";
import type { SelectionObject, WebSocketLike } from "../server/create.js";

// =============================================================================
// Handler Types
// =============================================================================

export interface WSHandlerOptions {
	/**
	 * Logger for debugging.
	 */
	logger?: {
		info?: (message: string, ...args: unknown[]) => void;
		warn?: (message: string, ...args: unknown[]) => void;
		error?: (message: string, ...args: unknown[]) => void;
	};

	/**
	 * Maximum message size in bytes.
	 * Messages larger than this will be rejected.
	 * Default: 1MB (1024 * 1024)
	 */
	maxMessageSize?: number;

	/**
	 * Maximum subscriptions per client.
	 * Prevents resource exhaustion from malicious clients.
	 * Default: 100
	 */
	maxSubscriptionsPerClient?: number;

	/**
	 * Maximum connections total.
	 * Prevents server overload.
	 * Default: 10000
	 */
	maxConnections?: number;

	/**
	 * Rate limiting configuration.
	 * Uses token bucket algorithm per client.
	 */
	rateLimit?: {
		/**
		 * Maximum messages per window.
		 * Default: 100
		 */
		maxMessages?: number;

		/**
		 * Time window in milliseconds.
		 * Default: 1000 (1 second)
		 */
		windowMs?: number;
	};
}

/**
 * WebSocket handler configuration with all required values.
 */
export interface WSHandlerConfig {
	/** Maximum message size in bytes */
	maxMessageSize: number;
	/** Maximum subscriptions per client */
	maxSubscriptionsPerClient: number;
	/** Maximum total connections */
	maxConnections: number;
	/** Rate limit: messages per window */
	rateLimitMaxMessages: number;
	/** Rate limit: window in milliseconds */
	rateLimitWindowMs: number;
}

/**
 * Default WebSocket handler configuration.
 */
export const DEFAULT_WS_HANDLER_CONFIG: WSHandlerConfig = {
	maxMessageSize: 1024 * 1024, // 1MB
	maxSubscriptionsPerClient: 100,
	maxConnections: 10000,
	rateLimitMaxMessages: 100,
	rateLimitWindowMs: 1000,
};

/**
 * WebSocket adapter for Bun's websocket handler.
 */
export interface WSHandler {
	/**
	 * Handle a new WebSocket connection.
	 * Call this when a WebSocket connection is established.
	 */
	handleConnection(ws: WebSocketLike): void;

	/**
	 * Bun-compatible websocket handler object.
	 * Use directly with Bun.serve({ websocket: wsHandler.handler })
	 */
	handler: {
		message(ws: unknown, message: string | Buffer): void;
		close(ws: unknown): void;
		open?(ws: unknown): void;
	};

	/**
	 * Close all connections and cleanup.
	 */
	close(): Promise<void>;
}

// =============================================================================
// Protocol Messages
// =============================================================================

export interface SubscribeMessage {
	type: "subscribe";
	id: string;
	operation: string;
	input?: unknown;
	fields: string[] | "*";
	select?: SelectionObject;
}

export interface UpdateFieldsMessage {
	type: "updateFields";
	id: string;
	addFields?: string[];
	removeFields?: string[];
	setFields?: string[];
}

export interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

export interface QueryMessage {
	type: "query";
	id: string;
	operation: string;
	input?: unknown;
	fields?: string[] | "*";
	select?: SelectionObject;
}

export interface MutationMessage {
	type: "mutation";
	id: string;
	operation: string;
	input: unknown;
}

export interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

export type ClientMessage =
	| SubscribeMessage
	| UpdateFieldsMessage
	| UnsubscribeMessage
	| QueryMessage
	| MutationMessage
	| HandshakeMessage
	| ReconnectMessage;

// =============================================================================
// Client Connection
// =============================================================================

export interface ClientConnection {
	id: string;
	ws: WebSocketLike;
	subscriptions: Map<string, ClientSubscription>;
}

export interface ClientSubscription {
	id: string;
	operation: string;
	input: unknown;
	fields: string[] | "*";
	entityKeys: Set<string>;
	cleanups: (() => void)[];
	lastData: unknown;
}
