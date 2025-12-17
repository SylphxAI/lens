/**
 * @sylphx/lens-server - WebSocket Handler Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mutation, query } from "@sylphx/lens-core";
import { z } from "zod";
import type { WebSocketLike } from "../server/create.js";
import { createApp } from "../server/create.js";
import { createWSHandler } from "./ws.js";

// =============================================================================
// Mock WebSocket
// =============================================================================

interface MockWebSocket extends WebSocketLike {
	sentMessages: unknown[];
	closeCode?: number;
	closeReason?: string;
	closed: boolean;
}

function createMockWebSocket(): MockWebSocket {
	const ws: MockWebSocket = {
		sentMessages: [],
		closed: false,
		send(data: string): void {
			ws.sentMessages.push(JSON.parse(data));
		},
		close(code?: number, reason?: string): void {
			ws.closeCode = code;
			ws.closeReason = reason;
			ws.closed = true;
		},
		onmessage: null,
		onclose: null,
	};
	return ws;
}

// Helper to simulate receiving a message
function simulateMessage(ws: MockWebSocket, message: unknown): void {
	if (ws.onmessage) {
		ws.onmessage({ data: JSON.stringify(message) } as MessageEvent);
	}
}

// Helper to wait for async operations
function wait(ms = 10): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Test Queries and Mutations
// =============================================================================

const getUser = query()
	.args(z.object({ id: z.string() }))
	.resolve(({ args }) => ({
		id: args.id,
		name: "Test User",
		__typename: "User",
	}));

const listUsers = query().resolve(() => [
	{ id: "1", name: "User 1", __typename: "User" },
	{ id: "2", name: "User 2", __typename: "User" },
]);

const createUser = mutation()
	.args(z.object({ name: z.string() }))
	.resolve(({ args }) => ({
		id: "new-id",
		name: args.name,
		__typename: "User",
	}));

const slowQuery = query()
	.args(z.object({ delay: z.number() }))
	.resolve(async ({ args }) => {
		await new Promise((r) => setTimeout(r, args.delay));
		return { done: true };
	});

// =============================================================================
// Tests
// =============================================================================

describe("createWSHandler", () => {
	let app: ReturnType<typeof createApp>;
	let wsHandler: ReturnType<typeof createWSHandler>;

	beforeEach(() => {
		app = createApp({
			queries: { getUser, listUsers, slowQuery },
			mutations: { createUser },
		});
		wsHandler = createWSHandler(app);
	});

	afterEach(async () => {
		await wsHandler.close();
	});

	describe("connection handling", () => {
		it("creates a WebSocket handler from app", () => {
			expect(wsHandler).toBeDefined();
			expect(typeof wsHandler.handleConnection).toBe("function");
			expect(typeof wsHandler.close).toBe("function");
			expect(wsHandler.handler).toBeDefined();
		});

		it("accepts new connections", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			expect(ws.closed).toBe(false);
			expect(ws.onmessage).not.toBeNull();
			expect(ws.onclose).not.toBeNull();
		});

		it("rejects connections when at capacity", async () => {
			const lowCapacityHandler = createWSHandler(app, { maxConnections: 2 });

			const ws1 = createMockWebSocket();
			const ws2 = createMockWebSocket();
			const ws3 = createMockWebSocket();

			lowCapacityHandler.handleConnection(ws1);
			await wait();
			lowCapacityHandler.handleConnection(ws2);
			await wait();
			lowCapacityHandler.handleConnection(ws3);
			await wait();

			expect(ws1.closed).toBe(false);
			expect(ws2.closed).toBe(false);
			expect(ws3.closed).toBe(true);
			expect(ws3.closeCode).toBe(1013);
			expect(ws3.closeReason).toBe("Server at capacity");

			await lowCapacityHandler.close();
		});

		it("cleans up on disconnect", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			// Simulate disconnect
			if (ws.onclose) {
				ws.onclose({} as CloseEvent);
			}
			await wait();

			// Connection should be cleaned up (no error on close)
			await wsHandler.close();
		});
	});

	describe("handshake", () => {
		it("responds to handshake with metadata", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "handshake",
				id: "hs-1",
			});
			await wait();

			expect(ws.sentMessages.length).toBe(1);
			const response = ws.sentMessages[0] as {
				type: string;
				id: string;
				version: string;
				operations: Record<string, unknown>;
			};
			expect(response.type).toBe("handshake");
			expect(response.id).toBe("hs-1");
			expect(response.version).toBeDefined();
			expect(response.operations).toBeDefined();
			expect(response.operations.getUser).toBeDefined();
			expect(response.operations.createUser).toBeDefined();
		});
	});

	describe("query", () => {
		it("executes query and returns result", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "123" },
			});
			await wait();

			expect(ws.sentMessages.length).toBe(1);
			const response = ws.sentMessages[0] as {
				type: string;
				id: string;
				data: { id: string; name: string };
			};
			expect(response.type).toBe("result");
			expect(response.id).toBe("q-1");
			expect(response.data.id).toBe("123");
			expect(response.data.name).toBe("Test User");
		});

		it("applies field selection to query result", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "123" },
				fields: ["name"], // Only request name field
			});
			await wait();

			const response = ws.sentMessages[0] as {
				type: string;
				data: { id: string; name: string };
			};
			expect(response.data.id).toBe("123"); // id always included
			expect(response.data.name).toBe("Test User");
			expect((response.data as { __typename?: string }).__typename).toBeUndefined();
		});

		it("returns error for unknown operation", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "query",
				id: "q-1",
				operation: "unknownOp",
				input: {},
			});
			await wait();

			const response = ws.sentMessages[0] as {
				type: string;
				id: string;
				error: { code: string; message: string };
			};
			expect(response.type).toBe("error");
			expect(response.id).toBe("q-1");
			expect(response.error.code).toBe("EXECUTION_ERROR");
		});
	});

	describe("mutation", () => {
		it("executes mutation and returns result", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "mutation",
				id: "m-1",
				operation: "createUser",
				input: { name: "New User" },
			});
			await wait();

			const response = ws.sentMessages[0] as {
				type: string;
				id: string;
				data: { id: string; name: string };
			};
			expect(response.type).toBe("result");
			expect(response.id).toBe("m-1");
			expect(response.data.id).toBe("new-id");
			expect(response.data.name).toBe("New User");
		});
	});

	describe("subscribe/unsubscribe", () => {
		it("creates subscription without error", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			simulateMessage(ws, {
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "123" },
				fields: "*",
			});
			await wait(50); // Give time for async subscription setup

			// Subscription should be established without errors
			// (No error message with id "sub-1")
			const errorMsg = ws.sentMessages.find(
				(msg) => (msg as { type?: string; id?: string }).type === "error" && (msg as { id?: string }).id === "sub-1",
			);
			expect(errorMsg).toBeUndefined();
			expect(ws.closed).toBe(false);
		});

		it("handles unsubscribe", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			// Subscribe first
			simulateMessage(ws, {
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "123" },
				fields: "*",
			});
			await wait(50);

			const _messagesBeforeUnsub = ws.sentMessages.length;

			// Unsubscribe
			simulateMessage(ws, {
				type: "unsubscribe",
				id: "sub-1",
			});
			await wait();

			// Should not receive any more messages (or just an ack)
			// Main thing is no error
			expect(ws.closed).toBe(false);
		});

		it("enforces subscription limit per client", async () => {
			const limitedHandler = createWSHandler(app, { maxSubscriptionsPerClient: 2 });

			const ws = createMockWebSocket();
			limitedHandler.handleConnection(ws);
			await wait();

			// Create subscriptions up to limit
			simulateMessage(ws, {
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "1" },
				fields: "*",
			});
			await wait(50);

			simulateMessage(ws, {
				type: "subscribe",
				id: "sub-2",
				operation: "getUser",
				input: { id: "2" },
				fields: "*",
			});
			await wait(50);

			// Try to exceed limit
			simulateMessage(ws, {
				type: "subscribe",
				id: "sub-3",
				operation: "getUser",
				input: { id: "3" },
				fields: "*",
			});
			await wait(50);

			// Find the error message for sub-3
			const errorMsg = ws.sentMessages.find(
				(msg) => (msg as { type?: string; id?: string }).type === "error" && (msg as { id?: string }).id === "sub-3",
			) as { error?: { code?: string } } | undefined;

			expect(errorMsg).toBeDefined();
			expect(errorMsg?.error?.code).toBe("SUBSCRIPTION_LIMIT");

			await limitedHandler.close();
		});
	});

	describe("message size limits", () => {
		it("rejects messages exceeding size limit", async () => {
			const limitedHandler = createWSHandler(app, { maxMessageSize: 100 });

			const ws = createMockWebSocket();
			limitedHandler.handleConnection(ws);
			await wait();

			// Create a large message
			const largeMessage = JSON.stringify({
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "x".repeat(200) },
			});

			// Simulate receiving large message directly
			if (ws.onmessage) {
				ws.onmessage({ data: largeMessage } as MessageEvent);
			}
			await wait();

			const errorMsg = ws.sentMessages.find((msg) => (msg as { type?: string }).type === "error") as
				| { error?: { code?: string } }
				| undefined;

			expect(errorMsg).toBeDefined();
			expect(errorMsg?.error?.code).toBe("MESSAGE_TOO_LARGE");

			await limitedHandler.close();
		});
	});

	describe("rate limiting", () => {
		it("enforces rate limit on messages", async () => {
			const limitedHandler = createWSHandler(app, {
				rateLimit: { maxMessages: 3, windowMs: 1000 },
			});

			const ws = createMockWebSocket();
			limitedHandler.handleConnection(ws);
			await wait();

			// Send messages rapidly
			for (let i = 0; i < 5; i++) {
				simulateMessage(ws, {
					type: "query",
					id: `q-${i}`,
					operation: "getUser",
					input: { id: String(i) },
				});
			}
			await wait();

			// Should have some rate limited errors
			const rateLimitErrors = ws.sentMessages.filter(
				(msg) =>
					(msg as { type?: string }).type === "error" &&
					(msg as { error?: { code?: string } }).error?.code === "RATE_LIMITED",
			);

			expect(rateLimitErrors.length).toBeGreaterThan(0);

			await limitedHandler.close();
		});
	});

	describe("error handling", () => {
		it("handles JSON parse errors", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			// Send invalid JSON directly
			if (ws.onmessage) {
				ws.onmessage({ data: "not valid json {" } as MessageEvent);
			}
			await wait();

			const errorMsg = ws.sentMessages[0] as { type?: string; error?: { code?: string } };
			expect(errorMsg.type).toBe("error");
			expect(errorMsg.error?.code).toBe("PARSE_ERROR");
		});

		it("handles validation errors gracefully", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			// Send query with invalid input (missing required field)
			simulateMessage(ws, {
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: {}, // Missing required 'id' field
			});
			await wait();

			const errorMsg = ws.sentMessages[0] as {
				type?: string;
				id?: string;
				error?: { code?: string };
			};
			expect(errorMsg.type).toBe("error");
			expect(errorMsg.id).toBe("q-1");
			expect(errorMsg.error?.code).toBe("EXECUTION_ERROR");
		});
	});

	describe("Bun handler interface", () => {
		it("provides Bun-compatible handler object", () => {
			expect(wsHandler.handler).toBeDefined();
			expect(typeof wsHandler.handler.message).toBe("function");
			expect(typeof wsHandler.handler.close).toBe("function");
			expect(typeof wsHandler.handler.open).toBe("function");
		});

		it("handler.message routes to correct connection", async () => {
			const ws = createMockWebSocket();

			// First establish connection via open
			wsHandler.handler.open?.(ws);
			await wait();

			// Send message via handler.message
			const messageData = JSON.stringify({
				type: "query",
				id: "q-1",
				operation: "getUser",
				input: { id: "123" },
			});

			wsHandler.handler.message(ws, messageData);
			await wait();

			const response = ws.sentMessages[0] as { type?: string; id?: string };
			expect(response.type).toBe("result");
			expect(response.id).toBe("q-1");
		});

		it("handler.close triggers disconnect", async () => {
			const ws = createMockWebSocket();
			wsHandler.handleConnection(ws);
			await wait();

			// Close via handler
			wsHandler.handler.close(ws);
			await wait();

			// Should have cleaned up without error
			await wsHandler.close();
		});
	});

	describe("close", () => {
		it("closes all connections on handler close", async () => {
			const ws1 = createMockWebSocket();
			const ws2 = createMockWebSocket();

			wsHandler.handleConnection(ws1);
			wsHandler.handleConnection(ws2);
			await wait();

			await wsHandler.close();

			expect(ws1.closed).toBe(true);
			expect(ws2.closed).toBe(true);
		});
	});
});
