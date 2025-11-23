/**
 * @lens/server - Server Creation
 *
 * Factory for creating a Lens server.
 */

import type { Schema, SchemaDefinition, createUpdate } from "@lens/core";
import type { Resolvers, BaseContext } from "../resolvers/types";
import { ExecutionEngine } from "../execution/engine";

// =============================================================================
// Types
// =============================================================================

export interface ServerConfig<S extends SchemaDefinition, Ctx extends BaseContext> {
	/** Schema definition */
	schema: Schema<S>;
	/** Resolvers */
	resolvers: Resolvers<S, Ctx>;
	/** Context factory */
	context?: (req?: unknown) => Ctx;
}

export interface LensServer<S extends SchemaDefinition, Ctx extends BaseContext> {
	/** Execution engine */
	engine: ExecutionEngine<S, Ctx>;

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
	select?: Record<string, unknown>;
}

interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
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

type ClientMessage = SubscribeMessage | UnsubscribeMessage | MutateMessage | QueryMessage;

// =============================================================================
// Server Implementation
// =============================================================================

class LensServerImpl<S extends SchemaDefinition, Ctx extends BaseContext>
	implements LensServer<S, Ctx>
{
	engine: ExecutionEngine<S, Ctx>;
	private subscriptions = new Map<string, { entityName: string; entityId: string; ws: WebSocketLike }>();
	private server: unknown = null;

	constructor(config: ServerConfig<S, Ctx>) {
		const contextFactory = config.context ?? (() => ({} as Ctx));
		this.engine = new ExecutionEngine(config.resolvers, contextFactory);
	}

	handleWebSocket(ws: WebSocketLike): void {
		const connectionSubs = new Set<string>();

		ws.onmessage = async (event) => {
			try {
				const message = JSON.parse(event.data) as ClientMessage;
				await this.handleMessage(ws, message, connectionSubs);
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
			// Clean up subscriptions
			for (const subId of connectionSubs) {
				this.subscriptions.delete(subId);
			}
		};
	}

	private async handleMessage(
		ws: WebSocketLike,
		message: ClientMessage,
		connectionSubs: Set<string>,
	): Promise<void> {
		switch (message.type) {
			case "subscribe":
				await this.handleSubscribe(ws, message, connectionSubs);
				break;
			case "unsubscribe":
				this.handleUnsubscribe(message, connectionSubs);
				break;
			case "query":
				await this.handleQuery(ws, message);
				break;
			case "mutate":
				await this.handleMutate(ws, message);
				break;
		}
	}

	private async handleSubscribe(
		ws: WebSocketLike,
		message: SubscribeMessage,
		connectionSubs: Set<string>,
	): Promise<void> {
		const { id, entity, entityId, select } = message;

		// Store subscription
		this.subscriptions.set(id, { entityName: entity, entityId, ws });
		connectionSubs.add(id);

		try {
			// Execute initial query
			const data = await this.engine.executeGet(entity as keyof S & string, entityId, select as Parameters<typeof this.engine.executeGet>[2]);

			// Send initial data
			ws.send(
				JSON.stringify({
					type: "data",
					subscriptionId: id,
					data,
				}),
			);

			// TODO: Set up streaming subscription if resolver supports it
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

	private handleUnsubscribe(message: UnsubscribeMessage, connectionSubs: Set<string>): void {
		const { id } = message;
		this.subscriptions.delete(id);
		connectionSubs.delete(id);
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
					subscriptionId: id,
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

			// Notify subscribers of affected entities
			this.notifySubscribers(entity, input);
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

	private notifySubscribers(entityName: string, data: unknown): void {
		// Notify all subscribers watching this entity
		for (const [subId, sub] of this.subscriptions) {
			if (sub.entityName === entityName) {
				// Send update notification
				sub.ws.send(
					JSON.stringify({
						type: "update",
						subscriptionId: subId,
						strategy: "value",
						data,
					}),
				);
			}
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
					const wsLike: WebSocketLike = {
						send: (data) => ws.send(data),
						close: () => ws.close(),
					};
					wsLike.onmessage?.({ data: message.toString() });
				},
				open: (ws) => {
					const wsLike: WebSocketLike = {
						send: (data) => ws.send(data),
						close: () => ws.close(),
					};
					this.handleWebSocket(wsLike);
				},
				close: (ws) => {
					// Handled in handleWebSocket
				},
			},
		});

		console.log(`Lens server listening on port ${port}`);
	}

	async close(): Promise<void> {
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
