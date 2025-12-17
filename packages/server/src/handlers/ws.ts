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
	isError,
	isSnapshot,
	type ReconnectMessage,
	type ReconnectSubscription,
} from "@sylphx/lens-core";
import type { LensServer, WebSocketLike } from "../server/create.js";
import {
	type ClientConnection,
	type ClientMessage,
	type ClientSubscription,
	DEFAULT_WS_HANDLER_CONFIG,
	type HandshakeMessage,
	type MutationMessage,
	type QueryMessage,
	type SubscribeMessage,
	type UnsubscribeMessage,
	type UpdateFieldsMessage,
	type WSHandler,
	type WSHandlerConfig,
	type WSHandlerOptions,
} from "./ws-types.js";

// Re-export types and config for external use
export type { WSHandler, WSHandlerConfig, WSHandlerOptions } from "./ws-types.js";
export { DEFAULT_WS_HANDLER_CONFIG } from "./ws-types.js";

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

	// Get plugin manager for direct hook calls
	const pluginManager = server.getPluginManager();

	// Resolve configuration with defaults
	const config: WSHandlerConfig = {
		maxMessageSize: options.maxMessageSize ?? DEFAULT_WS_HANDLER_CONFIG.maxMessageSize,
		maxSubscriptionsPerClient:
			options.maxSubscriptionsPerClient ?? DEFAULT_WS_HANDLER_CONFIG.maxSubscriptionsPerClient,
		maxConnections: options.maxConnections ?? DEFAULT_WS_HANDLER_CONFIG.maxConnections,
		rateLimitMaxMessages:
			options.rateLimit?.maxMessages ?? DEFAULT_WS_HANDLER_CONFIG.rateLimitMaxMessages,
		rateLimitWindowMs: options.rateLimit?.windowMs ?? DEFAULT_WS_HANDLER_CONFIG.rateLimitWindowMs,
	};

	// Rate limit tracking per client (sliding window)
	const clientMessageTimestamps = new Map<string, number[]>();

	/**
	 * Check if client is rate limited using sliding window algorithm.
	 * Returns true if the message should be rejected.
	 */
	function isRateLimited(clientId: string): boolean {
		const now = Date.now();
		const windowStart = now - config.rateLimitWindowMs;

		let timestamps = clientMessageTimestamps.get(clientId);
		if (!timestamps) {
			timestamps = [];
			clientMessageTimestamps.set(clientId, timestamps);
		}

		// Remove expired timestamps (outside window)
		while (timestamps.length > 0 && timestamps[0] < windowStart) {
			timestamps.shift();
		}

		// Check if over limit
		if (timestamps.length >= config.rateLimitMaxMessages) {
			return true;
		}

		// Record this message
		timestamps.push(now);
		return false;
	}

	/**
	 * Sanitize error message to avoid leaking internal details.
	 * Only exposes safe, actionable error messages to clients.
	 */
	function sanitizeErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			const message = error.message;
			// Don't expose messages that look like stack traces or internal paths
			if (
				message.includes("\n") ||
				message.includes("/") ||
				message.includes("\\") ||
				message.includes("at ") ||
				message.length > 200
			) {
				return "An internal error occurred";
			}
			return message;
		}
		return "An error occurred";
	}

	/**
	 * Send an error message to a client.
	 * Used for async handler errors to avoid leaking internal details.
	 */
	function sendErrorToClient(
		conn: ClientConnection,
		id: string | undefined,
		code: string,
		message: string,
	): void {
		try {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					...(id !== undefined && { id }),
					error: { code, message },
				}),
			);
		} catch (sendError) {
			// Log actual error - don't silently swallow
			// Common case is "connection already closed" but could be serialization failure
			logger.debug?.(
				`Failed to send error to client ${conn.id}:`,
				sendError instanceof Error ? sendError.message : String(sendError),
			);
		}
	}

	// Connection tracking
	const connections = new Map<string, ClientConnection>();
	const wsToConnection = new WeakMap<object, ClientConnection>();
	let connectionCounter = 0;

	// Handle new WebSocket connection
	async function handleConnection(ws: WebSocketLike): Promise<void> {
		// Check connection limit
		if (connections.size >= config.maxConnections) {
			logger.warn?.(
				`Connection limit reached (${config.maxConnections}), rejecting new connection`,
			);
			ws.close(1013, "Server at capacity");
			return;
		}

		const clientId = `client_${++connectionCounter}`;

		const conn: ClientConnection = {
			id: clientId,
			ws,
			subscriptions: new Map(),
		};

		connections.set(clientId, conn);
		wsToConnection.set(ws as object, conn);

		// Register client with plugins
		const sendFn = (message: unknown) => {
			ws.send(JSON.stringify(message));
		};
		const allowed = await pluginManager.runOnConnect({ clientId, send: sendFn });
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
		// Check message size limit
		if (data.length > config.maxMessageSize) {
			logger.warn?.(
				`Message too large (${data.length} bytes > ${config.maxMessageSize}), rejecting`,
			);
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "MESSAGE_TOO_LARGE",
						message: `Message exceeds ${config.maxMessageSize} byte limit`,
					},
				}),
			);
			return;
		}

		// Check rate limit
		if (isRateLimited(conn.id)) {
			logger.warn?.(`Rate limit exceeded for client ${conn.id}`);
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "RATE_LIMITED",
						message: `Rate limit exceeded: max ${config.rateLimitMaxMessages} messages per ${config.rateLimitWindowMs}ms`,
					},
				}),
			);
			return;
		}

		try {
			const message = JSON.parse(data) as ClientMessage;

			switch (message.type) {
				case "handshake":
					handleHandshake(conn, message);
					break;
				case "subscribe":
					handleSubscribe(conn, message).catch((error) => {
						logger.error?.("Subscribe handler error:", error);
						sendErrorToClient(conn, message.id, "INTERNAL_ERROR", "Subscription failed");
					});
					break;
				case "updateFields":
					handleUpdateFields(conn, message).catch((error) => {
						logger.error?.("UpdateFields handler error:", error);
						sendErrorToClient(conn, message.id, "INTERNAL_ERROR", "Field update failed");
					});
					break;
				case "unsubscribe":
					handleUnsubscribe(conn, message);
					break;
				case "query":
					handleQuery(conn, message).catch((error) => {
						logger.error?.("Query handler error:", error);
						sendErrorToClient(conn, message.id, "INTERNAL_ERROR", "Query failed");
					});
					break;
				case "mutation":
					handleMutation(conn, message).catch((error) => {
						logger.error?.("Mutation handler error:", error);
						sendErrorToClient(conn, message.id, "INTERNAL_ERROR", "Mutation failed");
					});
					break;
				case "reconnect":
					handleReconnect(conn, message).catch((error) => {
						logger.error?.("Reconnect handler error:", error);
						sendErrorToClient(conn, undefined, "INTERNAL_ERROR", "Reconnect failed");
					});
					break;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: { code: "PARSE_ERROR", message: sanitizeErrorMessage(error) },
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

		// Check subscription limit (skip if replacing existing subscription)
		if (
			!conn.subscriptions.has(id) &&
			conn.subscriptions.size >= config.maxSubscriptionsPerClient
		) {
			logger.warn?.(
				`Subscription limit reached for client ${conn.id} (${config.maxSubscriptionsPerClient}), rejecting`,
			);
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: {
						code: "SUBSCRIPTION_LIMIT",
						message: `Maximum ${config.maxSubscriptionsPerClient} subscriptions per client`,
					},
				}),
			);
			return;
		}

		// Execute query first to get data
		let resultData: unknown;
		try {
			const result = await firstValueFrom(server.execute({ path: operation, input }));

			if (isError(result)) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id,
						error: { code: "EXECUTION_ERROR", message: result.error },
					}),
				);
				return;
			}

			if (isSnapshot(result)) {
				resultData = result.data;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "EXECUTION_ERROR", message: sanitizeErrorMessage(error) },
				}),
			);
			return;
		}

		// Extract entities from result
		const entities = resultData ? extractEntities(resultData) : [];

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
			// Unsubscribe via plugins
			Promise.resolve(
				pluginManager.runOnUnsubscribe({
					clientId: conn.id,
					subscriptionId: id,
					operation: existingSub.operation,
					entityKeys: Array.from(existingSub.entityKeys),
				}),
			).catch((error) => {
				logger.error?.("Plugin unsubscribe error:", error);
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
			lastData: resultData,
		};

		// Register subscriptions with plugins for each entity
		for (const { entity, entityId, entityData } of entities) {
			// Plugin handles subscription tracking
			const allowed = await pluginManager.runOnSubscribe({
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

			// Send initial data through plugin hooks
			const transformedData = await pluginManager.runBeforeSend({
				clientId: conn.id,
				subscriptionId: id,
				entity,
				entityId,
				data: entityData,
				isInitial: true,
				fields: "*",
			});

			await pluginManager.runAfterSend({
				clientId: conn.id,
				subscriptionId: id,
				entity,
				entityId,
				data: transformedData,
				isInitial: true,
				fields: "*",
				timestamp: Date.now(),
			});
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

		// Notify plugins of field updates
		for (const entityKey of sub.entityKeys) {
			const parts = entityKey.split(":");
			// Validate entityKey format (must be "Entity:id")
			if (parts.length < 2) {
				logger.warn?.(`Invalid entityKey format: "${entityKey}" (expected "Entity:id")`);
				continue;
			}
			const [entity, entityId] = parts;
			await pluginManager.runOnUpdateFields({
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

		// Plugin handles unsubscription
		Promise.resolve(
			pluginManager.runOnUnsubscribe({
				clientId: conn.id,
				subscriptionId: message.id,
				operation: sub.operation,
				entityKeys: Array.from(sub.entityKeys),
			}),
		).catch((error) => {
			logger.error?.("Plugin unsubscribe error:", error);
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

			if (isError(result)) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id: message.id,
						error: { code: "EXECUTION_ERROR", message: result.error },
					}),
				);
				return;
			}

			if (isSnapshot(result)) {
				// Apply field selection if specified
				const selected = message.fields ? applySelection(result.data, message.fields) : result.data;

				conn.ws.send(
					JSON.stringify({
						type: "result",
						id: message.id,
						data: selected,
					}),
				);
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: sanitizeErrorMessage(error) },
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

			if (isError(result)) {
				conn.ws.send(
					JSON.stringify({
						type: "error",
						id: message.id,
						error: { code: "EXECUTION_ERROR", message: result.error },
					}),
				);
				return;
			}

			if (isSnapshot(result)) {
				// Broadcast to all subscribers of affected entities
				const entities = extractEntities(result.data);
				for (const { entity, entityId, entityData } of entities) {
					const broadcastResult = await pluginManager.runOnBroadcast({
						entity,
						entityId,
						data: entityData,
					});

					// Route broadcast to all subscribers of this entity
					if (broadcastResult) {
						const entityKey = `${entity}:${entityId}`;
						for (const [clientId, clientConn] of connections) {
							// Skip the client that made the mutation (they'll get the result below)
							if (clientId === conn.id) continue;

							for (const sub of clientConn.subscriptions.values()) {
								if (sub.entityKeys.has(entityKey)) {
									// Send update to subscriber
									const updateMessage = broadcastResult.patch
										? {
												type: "update",
												subscriptionId: sub.id,
												version: broadcastResult.version,
												patch: broadcastResult.patch,
											}
										: {
												type: "update",
												subscriptionId: sub.id,
												version: broadcastResult.version,
												data: broadcastResult.data,
											};

									clientConn.ws.send(JSON.stringify(updateMessage));
								}
							}
						}
					}
				}

				conn.ws.send(
					JSON.stringify({
						type: "result",
						id: message.id,
						data: result.data,
					}),
				);
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: sanitizeErrorMessage(error) },
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
		const results = await pluginManager.runOnReconnect(ctx);

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
						message: sanitizeErrorMessage(error),
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

		// Cleanup rate limit tracking
		clientMessageTimestamps.delete(conn.id);

		// Plugin handles disconnection
		Promise.resolve(pluginManager.runOnDisconnect({ clientId: conn.id, subscriptionCount })).catch(
			(error) => {
				logger.error?.("Plugin disconnect error:", error);
			},
		);
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
