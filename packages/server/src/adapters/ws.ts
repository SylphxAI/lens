/**
 * @sylphx/lens-server - WebSocket Adapter
 *
 * Pure protocol handler for WebSocket connections.
 * Translates WebSocket messages to server calls and delivers responses.
 *
 * All business logic (state management, diff computation, plugin hooks)
 * is handled by the server. The adapter is just a delivery mechanism.
 *
 * @example
 * ```typescript
 * // Stateless mode (sends full data)
 * const server = createServer({ router });
 * const wsAdapter = createWSAdapter(server);
 *
 * // Stateful mode (sends diffs) - add plugin at server level
 * const server = createServer({
 *   router,
 *   plugins: [diffOptimizer()],
 * });
 * const wsAdapter = createWSAdapter(server);
 * ```
 */

import type { ReconnectMessage } from "@sylphx/lens-core";
import type { LensServer, SelectionObject, WebSocketLike } from "../server/create.js";
import type { GraphStateManager } from "../state/graph-state-manager.js";

// =============================================================================
// Types
// =============================================================================

export interface WSAdapterOptions {
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
 * The adapter is a pure protocol handler - all business logic is in the server.
 * State management is controlled by server plugins (e.g., diffOptimizer).
 *
 * @example
 * ```typescript
 * import { createServer, createWSAdapter, diffOptimizer } from '@sylphx/lens-server'
 *
 * // Stateless mode (default) - sends full data
 * const server = createServer({ router });
 * const wsAdapter = createWSAdapter(server);
 *
 * // Stateful mode - sends minimal diffs
 * const serverWithState = createServer({
 *   router,
 *   plugins: [diffOptimizer()],
 * });
 * const wsAdapterWithState = createWSAdapter(serverWithState);
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
	const { logger = {} } = options;

	// Get state manager from server (if diffOptimizer plugin is configured)
	const stateManager = server.getStateManager();

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
			result = await server.execute({ path: operation, input });

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
			// Server handles plugin hooks and state manager registration
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

			// Emit initial data to state manager (if enabled)
			server.emit(entity, entityId, entityData);
		}

		conn.subscriptions.set(id, sub);

		// Send initial data to client
		conn.ws.send(
			JSON.stringify({
				type: "data",
				id,
				data: result.data,
			}),
		);
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

			// Emit to server (handles state manager if configured)
			if (result.data) {
				const entities = extractEntities(result.data);
				for (const { entity, entityId, entityData } of entities) {
					server.emit(entity, entityId, entityData);
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
		const startTime = Date.now();

		// Check if server supports reconnection (has state manager)
		const results = server.handleReconnect(message);

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

				// Re-register subscription with server
				if (stateManager) {
					stateManager.subscribe(conn.id, sub.entity, sub.entityId, sub.fields);
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
