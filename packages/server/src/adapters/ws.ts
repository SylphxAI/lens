/**
 * @sylphx/lens-server - WebSocket Adapter
 *
 * Creates a WebSocket handler from a Lens server.
 * Handles connection management, subscriptions, and real-time updates.
 */

import type { ReconnectMessage } from "@sylphx/lens-core";
import { createPluginManager, type ServerPlugin } from "../plugin/types.js";
import type { LensServer, SelectionObject, WebSocketLike } from "../server/create.js";
import type { GraphStateManager } from "../state/graph-state-manager.js";

// =============================================================================
// Types
// =============================================================================

export interface WSAdapterOptions {
	/**
	 * GraphStateManager for tracking per-client state.
	 * Required for subscription support.
	 */
	stateManager?: GraphStateManager;

	/**
	 * Server plugins for subscription lifecycle hooks.
	 */
	plugins?: ServerPlugin[];

	/**
	 * Logger for debugging.
	 */
	logger?: {
		info?: (message: string, ...args: unknown[]) => void;
		warn?: (message: string, ...args: unknown[]) => void;
		error?: (message: string, ...args: unknown[]) => void;
	};
}

/**
 * WebSocket adapter for Bun's websocket handler.
 */
export interface WSAdapter {
	/**
	 * Handle a new WebSocket connection.
	 * Call this when a WebSocket connection is established.
	 */
	handleConnection(ws: WebSocketLike): void;

	/**
	 * Bun-compatible websocket handler object.
	 * Use directly with Bun.serve({ websocket: wsAdapter.handler })
	 */
	handler: {
		message(ws: unknown, message: string | Buffer): void;
		close(ws: unknown): void;
		open?(ws: unknown): void;
	};

	/**
	 * Get the GraphStateManager (if provided).
	 */
	getStateManager(): GraphStateManager | undefined;

	/**
	 * Close all connections and cleanup.
	 */
	close(): Promise<void>;
}

// =============================================================================
// Protocol Messages
// =============================================================================

interface SubscribeMessage {
	type: "subscribe";
	id: string;
	operation: string;
	input?: unknown;
	fields: string[] | "*";
	select?: SelectionObject;
}

interface UpdateFieldsMessage {
	type: "updateFields";
	id: string;
	addFields?: string[];
	removeFields?: string[];
	setFields?: string[];
}

interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

interface QueryMessage {
	type: "query";
	id: string;
	operation: string;
	input?: unknown;
	fields?: string[] | "*";
	select?: SelectionObject;
}

interface MutationMessage {
	type: "mutation";
	id: string;
	operation: string;
	input: unknown;
}

interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage =
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

interface ClientConnection {
	id: string;
	ws: WebSocketLike;
	subscriptions: Map<string, ClientSubscription>;
}

interface ClientSubscription {
	id: string;
	operation: string;
	input: unknown;
	fields: string[] | "*";
	entityKeys: Set<string>;
	cleanups: (() => void)[];
	lastData: unknown;
}

// =============================================================================
// WebSocket Adapter Factory
// =============================================================================

/**
 * Create a WebSocket adapter from a Lens server.
 *
 * @example
 * ```typescript
 * import { createServer, createWSAdapter, createGraphStateManager } from '@sylphx/lens-server'
 *
 * const server = createServer({ router })
 * const wsAdapter = createWSAdapter(server, {
 *   stateManager: createGraphStateManager(),
 * })
 *
 * // Bun
 * Bun.serve({
 *   port: 3000,
 *   fetch: httpHandler,
 *   websocket: wsAdapter.handler,
 * })
 * ```
 */
export function createWSAdapter(server: LensServer, options: WSAdapterOptions = {}): WSAdapter {
	const { stateManager, plugins = [], logger = {} } = options;

	// Initialize plugin manager
	const pluginManager = createPluginManager();
	for (const plugin of plugins) {
		pluginManager.register(plugin);
	}

	// Connection tracking
	const connections = new Map<string, ClientConnection>();
	const wsToConnection = new WeakMap<object, ClientConnection>();
	let connectionCounter = 0;

	// Handle new WebSocket connection
	function handleConnection(ws: WebSocketLike): void {
		const clientId = `client_${++connectionCounter}`;

		const conn: ClientConnection = {
			id: clientId,
			ws,
			subscriptions: new Map(),
		};

		connections.set(clientId, conn);
		wsToConnection.set(ws as object, conn);

		// Register with GraphStateManager if available
		if (stateManager) {
			stateManager.addClient({
				id: clientId,
				send: (msg) => {
					ws.send(JSON.stringify(msg));
				},
			});
		}

		// Run onConnect hooks
		pluginManager.runOnConnect({ clientId }).then((allowed) => {
			if (!allowed) {
				ws.close();
				handleDisconnect(conn);
			}
		});

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

		// Run onSubscribe hooks
		const allowed = await pluginManager.runOnSubscribe({
			clientId: conn.id,
			subscriptionId: id,
			operation,
			input,
			fields,
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

		// Create subscription
		const sub: ClientSubscription = {
			id,
			operation,
			input,
			fields,
			entityKeys: new Set(),
			cleanups: [],
			lastData: null,
		};

		conn.subscriptions.set(id, sub);

		// Execute query
		try {
			const result = await server.execute({ path: operation, input });

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

			// Send initial data
			conn.ws.send(
				JSON.stringify({
					type: "data",
					id,
					data: result.data,
				}),
			);

			sub.lastData = result.data;

			// If stateManager exists, track entities for updates
			if (stateManager && result.data) {
				const entities = extractEntities(result.data);
				for (const { entity, entityId, entityData } of entities) {
					const entityKey = `${entity}:${entityId}`;
					sub.entityKeys.add(entityKey);
					stateManager.subscribe(conn.id, entity, entityId, fields);
					stateManager.emit(entity, entityId, entityData);
				}
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	// Handle updateFields
	function handleUpdateFields(conn: ClientConnection, message: UpdateFieldsMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub || !stateManager) return;

		// Handle upgrade to full subscription ("*")
		if (message.addFields?.includes("*")) {
			sub.fields = "*";
			for (const entityKey of sub.entityKeys) {
				const [entity, id] = entityKey.split(":");
				stateManager.updateSubscription(conn.id, entity, id, "*");
			}
			return;
		}

		// Handle downgrade from "*" to specific fields
		if (message.setFields !== undefined) {
			sub.fields = message.setFields;
			for (const entityKey of sub.entityKeys) {
				const [entity, id] = entityKey.split(":");
				stateManager.updateSubscription(conn.id, entity, id, sub.fields);
			}
			return;
		}

		// Already subscribing to all fields - no-op
		if (sub.fields === "*") {
			return;
		}

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

		sub.fields = Array.from(fields);

		// Update subscriptions
		for (const entityKey of sub.entityKeys) {
			const [entity, id] = entityKey.split(":");
			stateManager.updateSubscription(conn.id, entity, id, sub.fields);
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

		// Unsubscribe from entities
		if (stateManager) {
			for (const entityKey of sub.entityKeys) {
				const [entity, id] = entityKey.split(":");
				stateManager.unsubscribe(conn.id, entity, id);
			}
		}

		conn.subscriptions.delete(message.id);

		// Run onUnsubscribe hooks
		pluginManager.runOnUnsubscribe({
			clientId: conn.id,
			subscriptionId: message.id,
			operation: sub.operation,
			entityKeys: Array.from(sub.entityKeys),
		});
	}

	// Handle query
	async function handleQuery(conn: ClientConnection, message: QueryMessage): Promise<void> {
		try {
			const result = await server.execute({
				path: message.operation,
				input: message.input,
			});

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
			const result = await server.execute({
				path: message.operation,
				input: message.input,
			});

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

			// Emit to state manager if available
			if (stateManager && result.data) {
				const entities = extractEntities(result.data);
				for (const { entity, entityId, entityData } of entities) {
					stateManager.emit(entity, entityId, entityData);
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
	function handleReconnect(conn: ClientConnection, message: ReconnectMessage): void {
		if (!stateManager) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: {
						code: "RECONNECT_ERROR",
						message: "State manager not available for reconnection",
						reconnectId: message.reconnectId,
					},
				}),
			);
			return;
		}

		const startTime = Date.now();

		try {
			// Re-register client if needed
			if (!stateManager.hasClient(conn.id)) {
				stateManager.addClient({
					id: conn.id,
					send: (msg) => {
						conn.ws.send(JSON.stringify(msg));
					},
				});
			}

			// Process reconnection
			const results = stateManager.handleReconnect(message.subscriptions);

			// Re-establish subscriptions
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

				stateManager.subscribe(conn.id, sub.entity, sub.entityId, sub.fields);
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

		// Remove from state manager
		if (stateManager) {
			stateManager.removeClient(conn.id);
		}

		// Remove connection
		connections.delete(conn.id);

		// Run onDisconnect hooks
		pluginManager.runOnDisconnect({
			clientId: conn.id,
			subscriptionCount,
		});
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

	// Create the adapter
	const adapter: WSAdapter = {
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

		getStateManager(): GraphStateManager | undefined {
			return stateManager;
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

	return adapter;
}
