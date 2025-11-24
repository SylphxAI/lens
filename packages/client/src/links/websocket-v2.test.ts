/**
 * @lens/client - WebSocket Link V2 Tests
 *
 * Tests for operations-based WebSocket transport.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
	websocketLinkV2,
	createWebSocketTransportV2,
	WebSocketTransportV2,
	type WebSocketLinkV2Options,
} from "./websocket-v2";
import { createOperationContext } from "./types";

// =============================================================================
// Mock WebSocket
// =============================================================================

class MockWebSocket {
	static instances: MockWebSocket[] = [];

	url: string;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;

	readyState = 0; // CONNECTING
	sentMessages: string[] = [];

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);

		// Simulate async connection
		setTimeout(() => {
			this.readyState = 1; // OPEN
			this.onopen?.();
		}, 10);
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(): void {
		this.readyState = 3; // CLOSED
		this.onclose?.();
	}

	// Test helper: simulate server message
	simulateMessage(data: unknown): void {
		this.onmessage?.({ data: JSON.stringify(data) });
	}

	// Test helper: simulate connection error
	simulateError(): void {
		this.onerror?.({});
	}

	static clear(): void {
		MockWebSocket.instances = [];
	}

	static getLastInstance(): MockWebSocket | undefined {
		return MockWebSocket.instances[MockWebSocket.instances.length - 1];
	}
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
	MockWebSocket.clear();
	// @ts-expect-error - mock WebSocket
	globalThis.WebSocket = MockWebSocket;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
});

// =============================================================================
// Tests: WebSocketTransportV2
// =============================================================================

describe("WebSocketTransportV2", () => {
	it("connects to WebSocket server", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });

		await transport.connect();

		expect(transport.getState()).toBe("connected");
		expect(MockWebSocket.getLastInstance()?.url).toBe("ws://localhost:3000");
	});

	it("disconnects from WebSocket server", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });

		await transport.connect();
		transport.disconnect();

		expect(transport.getState()).toBe("disconnected");
	});

	it("sends query message", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });
		await transport.connect();

		const ws = MockWebSocket.getLastInstance()!;

		// Start query (don't await - we need to respond first)
		const queryPromise = transport.query("getUsers", { limit: 10 });

		// Wait for message to be sent
		await new Promise((r) => setTimeout(r, 20));

		// Check sent message
		expect(ws.sentMessages.length).toBe(1);
		const sentMessage = JSON.parse(ws.sentMessages[0]);
		expect(sentMessage.type).toBe("query");
		expect(sentMessage.name).toBe("getUsers");
		expect(sentMessage.input).toEqual({ limit: 10 });

		// Simulate server response
		ws.simulateMessage({
			type: "data",
			id: sentMessage.id,
			data: [{ id: "user-1", name: "Alice" }],
		});

		const result = await queryPromise;
		expect(result).toEqual({ data: [{ id: "user-1", name: "Alice" }] });
	});

	it("sends mutation message", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });
		await transport.connect();

		const ws = MockWebSocket.getLastInstance()!;

		// Start mutation
		const mutationPromise = transport.mutate("createUser", {
			name: "Bob",
			email: "bob@example.com",
		});

		await new Promise((r) => setTimeout(r, 20));

		// Check sent message
		const sentMessage = JSON.parse(ws.sentMessages[0]);
		expect(sentMessage.type).toBe("mutation");
		expect(sentMessage.name).toBe("createUser");
		expect(sentMessage.input).toEqual({ name: "Bob", email: "bob@example.com" });

		// Simulate server response
		ws.simulateMessage({
			type: "result",
			id: sentMessage.id,
			data: { id: "user-new", name: "Bob", email: "bob@example.com" },
		});

		const result = await mutationPromise;
		expect(result).toEqual({
			data: { id: "user-new", name: "Bob", email: "bob@example.com" },
		});
	});

	it("handles error response", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });
		await transport.connect();

		const ws = MockWebSocket.getLastInstance()!;

		const queryPromise = transport.query("failingQuery", undefined);

		await new Promise((r) => setTimeout(r, 20));

		const sentMessage = JSON.parse(ws.sentMessages[0]);

		// Simulate error response
		ws.simulateMessage({
			type: "error",
			id: sentMessage.id,
			error: { code: "QUERY_ERROR", message: "Query failed" },
		});

		await expect(queryPromise).rejects.toThrow("Query failed");
	});

	it("performs handshake", async () => {
		const transport = createWebSocketTransportV2({ url: "ws://localhost:3000" });
		await transport.connect();

		const ws = MockWebSocket.getLastInstance()!;

		const handshakePromise = transport.handshake();

		await new Promise((r) => setTimeout(r, 20));

		const sentMessage = JSON.parse(ws.sentMessages[0]);
		expect(sentMessage.type).toBe("handshake");

		// Simulate handshake response
		ws.simulateMessage({
			type: "handshake",
			id: sentMessage.id,
			version: "2.0.0",
			queries: ["getUsers", "getUser"],
			mutations: ["createUser"],
		});

		const result = await handshakePromise;
		expect((result as { data: unknown }).data).toEqual({
			type: "handshake",
			id: sentMessage.id,
			version: "2.0.0",
			queries: ["getUsers", "getUser"],
			mutations: ["createUser"],
		});
	});

	it("calls onConnect callback", async () => {
		const onConnect = mock(() => {});

		const transport = createWebSocketTransportV2({
			url: "ws://localhost:3000",
			onConnect,
		});

		await transport.connect();

		expect(onConnect).toHaveBeenCalled();
	});

	it("calls onDisconnect callback", async () => {
		const onDisconnect = mock(() => {});

		const transport = createWebSocketTransportV2({
			url: "ws://localhost:3000",
			onDisconnect,
		});

		await transport.connect();

		const ws = MockWebSocket.getLastInstance()!;
		ws.onclose?.();

		expect(onDisconnect).toHaveBeenCalled();
	});
});

// =============================================================================
// Tests: websocketLinkV2
// =============================================================================

describe("websocketLinkV2", () => {
	it("creates a link function", () => {
		const link = websocketLinkV2({ url: "ws://localhost:3000" });
		const linkFn = link();

		expect(typeof linkFn).toBe("function");
	});

	it("executes query through link", async () => {
		const link = websocketLinkV2({ url: "ws://localhost:3000" });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUsers", { limit: 10 });

		// Start execution
		const resultPromise = linkFn(op, async () => ({ error: new Error("No next") }));

		// Wait for connection and message
		await new Promise((r) => setTimeout(r, 30));

		const ws = MockWebSocket.getLastInstance()!;
		const sentMessage = JSON.parse(ws.sentMessages[0]);

		// Simulate response
		ws.simulateMessage({
			type: "data",
			id: sentMessage.id,
			data: [{ id: "user-1" }],
		});

		const result = await resultPromise;
		expect(result.data).toEqual([{ id: "user-1" }]);
	});

	it("executes mutation through link", async () => {
		const link = websocketLinkV2({ url: "ws://localhost:3000" });
		const linkFn = link();

		const op = createOperationContext("mutation", "operation", "createUser", {
			name: "Test",
		});

		const resultPromise = linkFn(op, async () => ({ error: new Error("No next") }));

		await new Promise((r) => setTimeout(r, 30));

		const ws = MockWebSocket.getLastInstance()!;
		const sentMessage = JSON.parse(ws.sentMessages[0]);

		ws.simulateMessage({
			type: "result",
			id: sentMessage.id,
			data: { id: "user-new", name: "Test" },
		});

		const result = await resultPromise;
		expect(result.data).toEqual({ id: "user-new", name: "Test" });
	});

	it("returns error for unknown operation type", async () => {
		const link = websocketLinkV2({ url: "ws://localhost:3000" });
		const linkFn = link();

		const op = createOperationContext("subscription" as "query", "operation", "test", {});

		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain("Unknown operation type");
	});
});
