/**
 * @lens/server - Server Creation
 *
 * Factory for creating a Lens server with GraphStateManager integration.
 */

import type { Schema, SchemaDefinition, UnifiedPlugin, ServerHandshake } from "@lens/core";
import type { Resolvers, BaseContext } from "../resolvers/types";
import { ExecutionEngine } from "../execution/engine";
import { GraphStateManager, type StateClient } from "../state/graph-state-manager";
import { createServerPluginManager, type ServerPluginManager } from "../plugins";

// =============================================================================
// Types
// =============================================================================

/** Plugin entry for server config */
export interface PluginEntry<T = unknown> {
	plugin: UnifiedPlugin<T>;
	config?: T;
}

export interface ServerConfig<S extends SchemaDefinition, Ctx extends BaseContext> {
	/** Schema definition */
	schema: Schema<S>;
	/** Resolvers */
	resolvers: Resolvers<S, Ctx>;
	/** Context factory */
	context?: (req?: unknown) => Ctx;
	/** Plugins */
	plugins?: Array<UnifiedPlugin | PluginEntry>;
	/** Server version (for handshake) */
	version?: string;
}

export interface LensServer<S extends SchemaDefinition, Ctx extends BaseContext> {
	/** Execution engine */
	engine: ExecutionEngine<S, Ctx>;

	/** State manager (for external access if needed) */
	stateManager: GraphStateManager;

	/** Handle WebSocket connection */
	handleWebSocket(ws: WebSocketLike): void;

	/** Handle HTTP request */
	handleRequest(req: Request): Promise<Response>;

	/** Start listening on a port */
	listen(port: number): Promise<void>;

	/** Close the server */
	close(): Promise<void>;
}

/** WebSocket-like interface */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Message Types
// =============================================================================

interface SubscribeMessage {
	type: "subscribe";
	id: string;
	entity: string;
	entityId: string;
	fields?: string[] | "*";
	select?: Record<string, unknown>;
}

interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
	entity: string;
	entityId: string;
}

interface MutateMessage {
	type: "mutate";
	id: string;
	entity: string;
	operation: "create" | "update" | "delete";
	input: Record<string, unknown>;
}

interface QueryMessage {
	type: "query";
	id: string;
	entity: string;
	queryType: "get" | "list";
	input?: Record<string, unknown>;
}

interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage | MutateMessage | QueryMessage | HandshakeMessage;

// =============================================================================
// Server Implementation
// =============================================================================

class LensServerImpl<S extends SchemaDefinition, Ctx extends BaseContext>
	implements LensServer<S, Ctx>
{
	engine: ExecutionEngine<S, Ctx>;
	stateManager: GraphStateManager;
	private server: unknown = null;
	private pluginManager: ServerPluginManager;
	private version: string;
	private clientCounter = 0;

	/** Track WebSocket → clientId mapping */
	private wsToClient = new Map<WebSocketLike, string>();

	/** Track active subscriptions per client: clientId → Set<subscriptionId> */
	private clientSubscriptions = new Map<string, Map<string, { entity: string; entityId: string }>>();

	constructor(config: ServerConfig<S, Ctx>) {
		const contextFactory = config.context ?? (() => ({} as Ctx));

		// Create GraphStateManager (single source of truth)
		this.stateManager = new GraphStateManager({
			onEntityUnsubscribed: (entity, id) => {
				// Optional: cleanup when no more subscribers
			},
		});

		// Create ExecutionEngine with GraphStateManager integration
		this.engine = new ExecutionEngine(config.resolvers, {
			createContext: contextFactory,
			stateManager: this.stateManager,
		});

		this.version = config.version ?? "1.0.0";

		// Initialize plugin manager
		this.pluginManager = createServerPluginManager();

		// Register plugins
		if (config.plugins) {
			for (const entry of config.plugins) {
				if ("plugin" in entry) {
					this.pluginManager.register(entry.plugin, entry.config);
				} else {
					this.pluginManager.register(entry);
				}
			}
		}
	}

	handleWebSocket(ws: WebSocketLike): void {
		// Generate unique client ID
		const clientId = `ws_${++this.clientCounter}_${Date.now()}`;
		this.wsToClient.set(ws, clientId);
		this.clientSubscriptions.set(clientId, new Map());

		// Register client with GraphStateManager
		const stateClient: StateClient = {
			id: clientId,
			send: (msg) => {
				ws.send(JSON.stringify(msg));
			},
		};
		this.stateManager.addClient(stateClient);

		ws.onmessage = async (event) => {
			try {
				const message = JSON.parse(event.data) as ClientMessage;
				await this.handleMessage(ws, clientId, message);
			} catch (error) {
				ws.send(
					JSON.stringify({
						type: "error",
						error: { code: "PARSE_ERROR", message: "Failed to parse message" },
					}),
				);
			}
		};

		ws.onclose = () => {
			this.handleDisconnect(ws, clientId);
		};
	}

	private handleDisconnect(ws: WebSocketLike, clientId: string): void {
		// Unsubscribe from all entities
		const subs = this.clientSubscriptions.get(clientId);
		if (subs) {
			for (const [_, { entity, entityId }] of subs) {
				this.stateManager.unsubscribe(clientId, entity, entityId);
			}
		}

		// Remove client from GraphStateManager
		this.stateManager.removeClient(clientId);

		// Cleanup maps
		this.wsToClient.delete(ws);
		this.clientSubscriptions.delete(clientId);
	}

	private async handleMessage(
		ws: WebSocketLike,
		clientId: string,
		message: ClientMessage,
	): Promise<void> {
		switch (message.type) {
			case "handshake":
				this.handleHandshake(ws, message);
				break;
			case "subscribe":
				await this.handleSubscribe(ws, clientId, message);
				break;
			case "unsubscribe":
				this.handleUnsubscribe(clientId, message);
				break;
			case "query":
				await this.handleQuery(ws, message);
				break;
			case "mutate":
				await this.handleMutate(ws, message);
				break;
		}
	}

	private handleHandshake(ws: WebSocketLike, message: HandshakeMessage): void {
		const handshake: ServerHandshake = {
			version: this.version,
			plugins: this.pluginManager.getHandshakeInfo(),
		};

		ws.send(
			JSON.stringify({
				type: "handshake",
				id: message.id,
				...handshake,
			}),
		);
	}

	private async handleSubscribe(
		ws: WebSocketLike,
		clientId: string,
		message: SubscribeMessage,
	): Promise<void> {
		const { id, entity, entityId, fields = "*" } = message;

		try {
			// Track subscription
			const subs = this.clientSubscriptions.get(clientId);
			if (subs) {
				subs.set(id, { entity, entityId });
			}

			// Subscribe to GraphStateManager (will receive updates automatically)
			this.stateManager.subscribe(clientId, entity, entityId, fields);

			// Execute reactive query - this will emit initial data to GraphStateManager
			// which will then push to the client
			await this.engine.executeReactive(
				entity as keyof S & string,
				entityId,
				fields,
			);

			// Send subscription acknowledgment
			ws.send(
				JSON.stringify({
					type: "subscribed",
					subscriptionId: id,
					entity,
					entityId,
				}),
			);
		} catch (error) {
			ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: {
						code: "SUBSCRIPTION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
			);
		}
	}

	private handleUnsubscribe(clientId: string, message: UnsubscribeMessage): void {
		const { id, entity, entityId } = message;

		// Unsubscribe from GraphStateManager
		this.stateManager.unsubscribe(clientId, entity, entityId);

		// Remove from tracking
		const subs = this.clientSubscriptions.get(clientId);
		if (subs) {
			subs.delete(id);
		}
	}

	private async handleQuery(ws: WebSocketLike, message: QueryMessage): Promise<void> {
		const { id, entity, queryType, input } = message;

		try {
			let data: unknown;

			if (queryType === "get") {
				data = await this.engine.executeGet(
					entity as keyof S & string,
					(input as { id: string })?.id ?? "",
					input?.select as Parameters<typeof this.engine.executeGet>[2],
				);
			} else {
				data = await this.engine.executeList(
					entity as keyof S & string,
					input,
					input?.select as Parameters<typeof this.engine.executeList>[2],
				);
			}

			ws.send(
				JSON.stringify({
					type: "data",
					id,
					data,
				}),
			);
		} catch (error) {
			ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: {
						code: "EXECUTION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
			);
		}
	}

	private async handleMutate(ws: WebSocketLike, message: MutateMessage): Promise<void> {
		const { id, entity, operation, input } = message;

		try {
			let data: unknown;

			switch (operation) {
				case "create":
					data = await this.engine.executeCreate(
						entity as keyof S & string,
						input as Parameters<typeof this.engine.executeCreate>[1],
					);
					break;
				case "update":
					data = await this.engine.executeUpdate(
						entity as keyof S & string,
						input as Parameters<typeof this.engine.executeUpdate>[1],
					);
					// Emit update to GraphStateManager for reactive sync
					if (data && typeof data === "object" && "id" in data) {
						this.stateManager.emit(entity, (data as { id: string }).id, data as Record<string, unknown>);
					}
					break;
				case "delete":
					data = await this.engine.executeDelete(
						entity as keyof S & string,
						(input as { id: string }).id,
					);
					break;
			}

			ws.send(
				JSON.stringify({
					type: "result",
					mutationId: id,
					data,
				}),
			);
		} catch (error) {
			ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: {
						code: "MUTATION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
			);
		}
	}

	async handleRequest(req: Request): Promise<Response> {
		// HTTP fallback for queries
		if (req.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			const body = (await req.json()) as {
				entity: keyof S & string;
				operation: string;
				input: Record<string, unknown>;
			};
			const { entity, operation, input } = body;

			let data: unknown;

			switch (operation) {
				case "get":
					data = await this.engine.executeGet(
						entity,
						input.id as string,
						input.select as Parameters<typeof this.engine.executeGet>[2],
					);
					break;
				case "list":
					data = await this.engine.executeList(
						entity,
						input,
						input?.select as Parameters<typeof this.engine.executeList>[2],
					);
					break;
				case "create":
					data = await this.engine.executeCreate(
						entity,
						input as Parameters<typeof this.engine.executeCreate>[1],
					);
					break;
				case "update":
					data = await this.engine.executeUpdate(
						entity,
						input as Parameters<typeof this.engine.executeUpdate>[1],
					);
					break;
				case "delete":
					data = await this.engine.executeDelete(entity, input.id as string);
					break;
				default:
					return new Response("Invalid operation", { status: 400 });
			}

			return new Response(JSON.stringify({ data }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: {
						code: "EXECUTION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	async listen(port: number): Promise<void> {
		// Initialize plugins
		await this.pluginManager.init();

		// Use Bun's built-in server
		this.server = Bun.serve({
			port,
			fetch: (req, server) => {
				// Handle WebSocket upgrade
				if (req.headers.get("upgrade") === "websocket") {
					const success = server.upgrade(req);
					if (success) {
						return undefined as unknown as Response;
					}
				}
				return this.handleRequest(req);
			},
			websocket: {
				message: (ws, message) => {
					const clientId = this.wsToClient.get(ws as unknown as WebSocketLike);
					if (clientId) {
						const wsLike = this.createWsLike(ws);
						wsLike.onmessage?.({ data: message.toString() });
					}
				},
				open: (ws) => {
					const wsLike = this.createWsLike(ws);
					this.handleWebSocket(wsLike);
				},
				close: (ws) => {
					const wsLike = this.createWsLike(ws);
					const clientId = this.wsToClient.get(wsLike);
					if (clientId) {
						this.handleDisconnect(wsLike, clientId);
					}
				},
			},
		});

		console.log(`Lens server listening on port ${port}`);
	}

	private createWsLike(ws: unknown): WebSocketLike {
		const bunWs = ws as { send: (data: string) => void; close: () => void };
		return {
			send: (data) => bunWs.send(data),
			close: () => bunWs.close(),
		};
	}

	async close(): Promise<void> {
		// Destroy plugins
		await this.pluginManager.destroy();

		// Clear all state
		this.stateManager.clear();

		if (this.server && typeof (this.server as { stop?: () => void }).stop === "function") {
			(this.server as { stop: () => void }).stop();
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Lens server
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   schema,
 *   resolvers,
 *   context: (req) => ({
 *     db: prisma,
 *     user: req?.user,
 *   }),
 * });
 *
 * server.listen(3000);
 * ```
 */
export function createServer<S extends SchemaDefinition, Ctx extends BaseContext = BaseContext>(
	config: ServerConfig<S, Ctx>,
): LensServer<S, Ctx> {
	return new LensServerImpl(config);
}
