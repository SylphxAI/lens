/**
 * @sylphx/lens-server - WebSocket Handler
 *
 * Pure protocol handler for WebSocket connections.
 * Translates WebSocket messages to server calls and delivers responses.
 *
 * All business logic (state management, diff computation, plugin hooks)
 * is handled by the server. The handler is just a delivery mechanism.
 *
 * @example
 * ```typescript
 * // Stateless mode (sends full data)
 * const app = createApp({ router });
 * const wsHandler = createWSHandler(app);
 *
 * // Stateful mode - add plugin at server level
 * const app = createApp({
 *   router,
 *   plugins: [clientState()],
 * });
 * const wsHandler = createWSHandler(app);
 * ```
 */

import {
	firstValueFrom,
	type ReconnectMessage,
	type ReconnectSubscription,
} from "@sylphx/lens-core";
import type { LensServer, WebSocketLike } from "../server/create.js";
import type {
	ClientConnection,
	ClientMessage,
	ClientSubscription,
	HandshakeMessage,
	MutationMessage,
	QueryMessage,
	SubscribeMessage,
	UnsubscribeMessage,
	UpdateFieldsMessage,
	WSHandler,
	WSHandlerOptions,
} from "./ws-types.js";

// Re-export types for external use
export type { WSHandler, WSHandlerOptions } from "./ws-types.js";

// =============================================================================
// WebSocket Handler Factory
// =============================================================================

/**
 * Create a WebSocket handler from a Lens app.
 *
 * The handler is a pure protocol translator - all business logic is in the server.
 * State management is controlled by server plugins (e.g., clientState).
 *
 * @example
 * ```typescript
 * import { createApp, createWSHandler, clientState } from '@sylphx/lens-server'
 *
 * // Stateless mode (default) - sends full data
 * const app = createApp({ router });
 * const wsHandler = createWSHandler(app);
 *
 * // Stateful mode - sends minimal diffs
 * const appWithState = createApp({
 *   router,
 *   plugins: [clientState()],
 * });
 * const wsHandlerWithState = createWSHandler(appWithState);
 *
 * // Bun
 * Bun.serve({
 *   port: 3000,
 *   fetch: httpHandler,
 *   websocket: wsHandler.handler,
 * })
 * ```
 */
export function createWSHandler(server: LensServer, options: WSHandlerOptions = {}): WSHandler {
	const { logger = {} } = options;

	// Connection tracking
	const connections = new Map<string, ClientConnection>();
	const wsToConnection = new WeakMap<object, ClientConnection>();
	let connectionCounter = 0;

	// Handle new WebSocket connection
	async function handleConnection(ws: WebSocketLike): Promise<void> {
		const clientId = `client_${++connectionCounter}`;

		const conn: ClientConnection = {
			id: clientId,
			ws,
			subscriptions: new Map(),
		};

		connections.set(clientId, conn);
		wsToConnection.set(ws as object, conn);

		// Register client with server (handles plugins + state manager)
		const sendFn = (msg: unknown) => {
			ws.send(JSON.stringify(msg));
		};
		const allowed = await server.addClient(clientId, sendFn);
		if (!allowed) {
			ws.close();
			connections.delete(clientId);
			return;
		}

		// Set up message and close handlers
		ws.onmessage = (event) => {
			handleMessage(conn, event.data as string);
		};

		ws.onclose = () => {
			handleDisconnect(conn);
		};
	}

	// Handle incoming message
	function handleMessage(conn: ClientConnection, data: string): void {
		try {
			const message = JSON.parse(data) as ClientMessage;

			switch (message.type) {
				case "handshake":
					handleHandshake(conn, message);
					break;
				case "subscribe":
					handleSubscribe(conn, message);
					break;
				case "updateFields":
					handleUpdateFields(conn, message);
					break;
				case "unsubscribe":
					handleUnsubscribe(conn, message);
					break;
				case "query":
					handleQuery(conn, message);
					break;
				case "mutation":
					handleMutation(conn, message);
					break;
				case "reconnect":
					handleReconnect(conn, message);
					break;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: { code: "PARSE_ERROR", message: String(error) },
				}),
			);
		}
	}

	// Handle handshake
	function handleHandshake(conn: ClientConnection, message: HandshakeMessage): void {
		const metadata = server.getMetadata();
		conn.ws.send(
			JSON.stringify({
				type: "handshake",
				id: message.id,
				version: metadata.version,
				operations: metadata.operations,
			}),
		);
	}

	// Handle subscribe
	async function handleSubscribe(conn: ClientConnection, message: SubscribeMessage): Promise<void> {
		const { id, operation, input, fields } = message;

		// Execute query first to get data
		let result: { data?: unknown; error?: Error };
		try {
			result = await firstValueFrom(server.execute({ path: operation, input }));

			if (result.error) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id,
						error: { code: "EXECUTION_ERROR", message: result.error.message },
					}),
				);
				return;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
			return;
		}

		// Extract entities from result
		const entities = result.data ? extractEntities(result.data) : [];

		// Check for duplicate subscription ID - cleanup old one first
		const existingSub = conn.subscriptions.get(id);
		if (existingSub) {
			// Cleanup old subscription
			for (const cleanup of existingSub.cleanups) {
				try {
					cleanup();
				} catch (e) {
					logger.error?.("Cleanup error:", e);
				}
			}
			// Unsubscribe from server
			server.unsubscribe({
				clientId: conn.id,
				subscriptionId: id,
				operation: existingSub.operation,
				entityKeys: Array.from(existingSub.entityKeys),
			});
			conn.subscriptions.delete(id);
		}

		// Create subscription tracking
		const sub: ClientSubscription = {
			id,
			operation,
			input,
			fields,
			entityKeys: new Set(entities.map(({ entity, entityId }) => `${entity}:${entityId}`)),
			cleanups: [],
			lastData: result.data,
		};

		// Register subscriptions with server for each entity
		for (const { entity, entityId, entityData } of entities) {
			// Server handles plugin hooks and subscription tracking
			const allowed = await server.subscribe({
				clientId: conn.id,
				subscriptionId: id,
				operation,
				input,
				fields,
				entity,
				entityId,
			});

			if (!allowed) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id,
						error: { code: "SUBSCRIPTION_REJECTED", message: "Subscription rejected by plugin" },
					}),
				);
				return;
			}

			// Send initial data through server (runs through plugin hooks)
			await server.send(conn.id, id, entity, entityId, entityData, true);
		}

		conn.subscriptions.set(id, sub);
	}

	// Handle updateFields
	// Note: This updates local tracking only. The server tracks fields via subscribe().
	// Field updates affect future sends through the subscription context.
	async function handleUpdateFields(
		conn: ClientConnection,
		message: UpdateFieldsMessage,
	): Promise<void> {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		const previousFields = sub.fields;
		let newFields: string[] | "*";

		// Handle upgrade to full subscription ("*")
		if (message.addFields?.includes("*")) {
			newFields = "*";
		} else if (message.setFields !== undefined) {
			// Handle downgrade from "*" to specific fields
			newFields = message.setFields;
		} else if (sub.fields === "*") {
			// Already subscribing to all fields - no-op
			return;
		} else {
			// Normal field add/remove
			const fields = new Set(sub.fields);

			if (message.addFields) {
				for (const field of message.addFields) {
					fields.add(field);
				}
			}

			if (message.removeFields) {
				for (const field of message.removeFields) {
					fields.delete(field);
				}
			}

			newFields = Array.from(fields);
		}

		// Update adapter tracking
		sub.fields = newFields;

		// Notify server (runs plugin hooks)
		for (const entityKey of sub.entityKeys) {
			const [entity, entityId] = entityKey.split(":");
			await server.updateFields({
				clientId: conn.id,
				subscriptionId: sub.id,
				entity,
				entityId,
				fields: newFields,
				previousFields,
			});
		}
	}

	// Handle unsubscribe
	function handleUnsubscribe(conn: ClientConnection, message: UnsubscribeMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		// Cleanup
		for (const cleanup of sub.cleanups) {
			try {
				cleanup();
			} catch (e) {
				logger.error?.("Cleanup error:", e);
			}
		}

		conn.subscriptions.delete(message.id);

		// Server handles unsubscription (plugin hooks + state manager cleanup)
		server.unsubscribe({
			clientId: conn.id,
			subscriptionId: message.id,
			operation: sub.operation,
			entityKeys: Array.from(sub.entityKeys),
		});
	}

	// Handle query
	async function handleQuery(conn: ClientConnection, message: QueryMessage): Promise<void> {
		try {
			const result = await firstValueFrom(
				server.execute({
					path: message.operation,
					input: message.input,
				}),
			);

			if (result.error) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id: message.id,
						error: { code: "EXECUTION_ERROR", message: result.error.message },
					}),
				);
				return;
			}

			// Apply field selection if specified
			const selected = message.fields ? applySelection(result.data, message.fields) : result.data;

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: selected,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	// Handle mutation
	async function handleMutation(conn: ClientConnection, message: MutationMessage): Promise<void> {
		try {
			const result = await firstValueFrom(
				server.execute({
					path: message.operation,
					input: message.input,
				}),
			);

			if (result.error) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id: message.id,
						error: { code: "EXECUTION_ERROR", message: result.error.message },
					}),
				);
				return;
			}

			// Broadcast to all subscribers of affected entities
			if (result.data) {
				const entities = extractEntities(result.data);
				for (const { entity, entityId, entityData } of entities) {
					await server.broadcast(entity, entityId, entityData);
				}
			}

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: result.data,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	// Handle reconnect
	async function handleReconnect(conn: ClientConnection, message: ReconnectMessage): Promise<void> {
		const startTime = Date.now();

		// Convert ReconnectMessage to ReconnectContext
		const ctx = {
			clientId: conn.id,
			reconnectId: message.reconnectId,
			subscriptions: message.subscriptions.map((sub: ReconnectSubscription) => {
				const mapped: {
					id: string;
					entity: string;
					entityId: string;
					fields: string[] | "*";
					version: number;
					dataHash?: string;
					input?: unknown;
				} = {
					id: sub.id,
					entity: sub.entity,
					entityId: sub.entityId,
					fields: sub.fields,
					version: sub.version,
				};
				if (sub.dataHash !== undefined) {
					mapped.dataHash = sub.dataHash;
				}
				if (sub.input !== undefined) {
					mapped.input = sub.input;
				}
				return mapped;
			}),
		};

		// Check if server supports reconnection (via plugins)
		const results = await server.handleReconnect(ctx);

		if (results === null) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "RECONNECT_ERROR",
						message: "State management not available for reconnection",
						reconnectId: message.reconnectId,
					},
				}),
			);
			return;
		}

		try {
			// Re-establish subscriptions in adapter tracking
			// (Server handles subscription registration via plugin hooks)
			for (const sub of message.subscriptions) {
				let clientSub = conn.subscriptions.get(sub.id);
				if (!clientSub) {
					clientSub = {
						id: sub.id,
						operation: "",
						input: sub.input,
						fields: sub.fields,
						entityKeys: new Set([`${sub.entity}:${sub.entityId}`]),
						cleanups: [],
						lastData: null,
					};
					conn.subscriptions.set(sub.id, clientSub);
				}
			}

			conn.ws.send(
				JSON.stringify({
					type: "reconnect_ack",
					results,
					serverTime: Date.now(),
					reconnectId: message.reconnectId,
					processingTime: Date.now() - startTime,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "RECONNECT_ERROR",
						message: String(error),
						reconnectId: message.reconnectId,
					},
				}),
			);
		}
	}

	// Handle disconnect
	function handleDisconnect(conn: ClientConnection): void {
		const subscriptionCount = conn.subscriptions.size;

		// Cleanup all subscriptions
		for (const sub of conn.subscriptions.values()) {
			for (const cleanup of sub.cleanups) {
				try {
					cleanup();
				} catch (e) {
					logger.error?.("Cleanup error:", e);
				}
			}
		}

		// Remove connection
		connections.delete(conn.id);

		// Server handles removal (plugin hooks + state manager cleanup)
		server.removeClient(conn.id, subscriptionCount);
	}

	// Helper: Extract entities from data
	function extractEntities(
		data: unknown,
	): Array<{ entity: string; entityId: string; entityData: Record<string, unknown> }> {
		const results: Array<{
			entity: string;
			entityId: string;
			entityData: Record<string, unknown>;
		}> = [];

		if (!data) return results;

		if (Array.isArray(data)) {
			for (const item of data) {
				if (item && typeof item === "object" && "id" in item) {
					const entityName = getEntityName(item);
					results.push({
						entity: entityName,
						entityId: String((item as { id: unknown }).id),
						entityData: item as Record<string, unknown>,
					});
				}
			}
		} else if (typeof data === "object" && "id" in data) {
			const entityName = getEntityName(data);
			results.push({
				entity: entityName,
				entityId: String((data as { id: unknown }).id),
				entityData: data as Record<string, unknown>,
			});
		}

		return results;
	}

	// Helper: Get entity name from data
	function getEntityName(data: unknown): string {
		if (!data || typeof data !== "object") return "unknown";
		if ("__typename" in data) return String((data as { __typename: unknown }).__typename);
		if ("_type" in data) return String((data as { _type: unknown })._type);
		return "unknown";
	}

	// Helper: Apply field selection
	function applySelection(data: unknown, fields: string[] | "*"): unknown {
		if (fields === "*" || !data) return data;

		if (Array.isArray(data)) {
			return data.map((item) => applySelectionToObject(item, fields));
		}

		return applySelectionToObject(data, fields);
	}

	function applySelectionToObject(data: unknown, fields: string[]): Record<string, unknown> | null {
		if (!data || typeof data !== "object") return null;

		const result: Record<string, unknown> = {};
		const obj = data as Record<string, unknown>;

		// Always include id
		if ("id" in obj) {
			result.id = obj.id;
		}

		for (const field of fields) {
			if (field in obj) {
				result[field] = obj[field];
			}
		}

		return result;
	}

	// Create the handler
	const handler: WSHandler = {
		handleConnection,

		handler: {
			open(ws: unknown): void {
				// For Bun, we need to handle connection via the fetch upgrade
				// But if open is called, we can try to set up the connection
				if (ws && typeof ws === "object" && "send" in ws) {
					handleConnection(ws as WebSocketLike);
				}
			},

			message(ws: unknown, message: string | Buffer): void {
				const conn = wsToConnection.get(ws as object);
				if (conn) {
					handleMessage(conn, String(message));
				} else if (ws && typeof ws === "object" && "send" in ws) {
					// Connection not tracked yet, set it up
					handleConnection(ws as WebSocketLike);
					const newConn = wsToConnection.get(ws as object);
					if (newConn) {
						handleMessage(newConn, String(message));
					}
				}
			},

			close(ws: unknown): void {
				const conn = wsToConnection.get(ws as object);
				if (conn) {
					handleDisconnect(conn);
				}
			},
		},

		async close(): Promise<void> {
			// Close all connections
			for (const conn of connections.values()) {
				handleDisconnect(conn);
				conn.ws.close();
			}
			connections.clear();
		},
	};

	return handler;
}
