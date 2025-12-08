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
}

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
