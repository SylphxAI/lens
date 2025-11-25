/**
 * @sylphx/client - WebSocket Transport Tests
 *
 * Tests for connection recovery and subscription resync.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { WebSocketSubscriptionTransport } from "./websocket";

// Mock WebSocket for testing
class MockWebSocket {
	static OPEN = 1;
	static CLOSED = 3;

	url: string;
	readyState = MockWebSocket.OPEN;
	onopen: (() => void) | null = null;
	onclose: ((event: { wasClean: boolean }) => void) | null = null;
	onerror: ((error: Error) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;

	sentMessages: string[] = [];

	constructor(url: string) {
		this.url = url;
		// Simulate async connection
		setTimeout(() => this.onopen?.(), 0);
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(): void {
		this.readyState = MockWebSocket.CLOSED;
	}

	// Test helpers
	simulateMessage(data: unknown): void {
		this.onmessage?.({ data: JSON.stringify(data) });
	}

	simulateClose(wasClean = false): void {
		this.onclose?.({ wasClean });
	}
}

// Inject mock WebSocket
(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

describe("WebSocketSubscriptionTransport", () => {
	describe("Subscription Tracking", () => {
		it("tracks subscriptions for recovery", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			// Send subscribe message
			transport.send({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "email"],
			});

			expect(transport.getSubscriptionCount()).toBe(1);

			// Send another subscription
			transport.send({
				type: "subscribe",
				entity: "Post",
				id: "456",
				fields: "*",
			});

			expect(transport.getSubscriptionCount()).toBe(2);
		});

		it("removes tracking on full unsubscribe", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			transport.send({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			expect(transport.getSubscriptionCount()).toBe(1);

			transport.send({
				type: "unsubscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			expect(transport.getSubscriptionCount()).toBe(0);
		});

		it("keeps tracking on partial unsubscribe", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			transport.send({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "email"],
			});

			expect(transport.getSubscriptionCount()).toBe(1);

			// Partial unsubscribe
			transport.send({
				type: "unsubscribe",
				entity: "User",
				id: "123",
				fields: ["email"],
			});

			// Still tracked (server handles field-level)
			expect(transport.getSubscriptionCount()).toBe(1);
		});
	});

	describe("Connection State", () => {
		it("starts disconnected", () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			expect(transport.getState()).toBe("disconnected");
		});

		it("transitions to connected", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			expect(transport.getState()).toBe("connected");
		});

		it("notifies state change listeners", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			const states: string[] = [];
			transport.onStateChange((state) => states.push(state));

			await transport.connect();

			expect(states).toContain("connecting");
			expect(states).toContain("connected");
		});

		it("can unsubscribe from state changes", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			const states: string[] = [];
			const unsubscribe = transport.onStateChange((state) => states.push(state));

			unsubscribe();

			await transport.connect();

			expect(states).toEqual([]);
		});
	});

	describe("Disconnect Handling", () => {
		it("calls onDisconnect callback", async () => {
			let disconnectCalled = false;

			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
				onDisconnect: () => {
					disconnectCalled = true;
				},
			});

			await transport.connect();

			// Access the internal ws to simulate close
			const ws = (transport as unknown as { ws: MockWebSocket }).ws;
			ws.simulateClose(true);

			expect(disconnectCalled).toBe(true);
		});
	});

	describe("Message Handling", () => {
		it("handles update messages", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			let receivedUpdate: unknown = null;
			transport.onUpdate((msg) => {
				receivedUpdate = msg;
			});

			const ws = (transport as unknown as { ws: MockWebSocket }).ws;
			ws.simulateMessage({
				type: "update",
				entity: "User",
				id: "123",
				field: "name",
				update: { strategy: "value", data: "New Name" },
			});

			expect(receivedUpdate).toEqual({
				type: "update",
				entity: "User",
				id: "123",
				field: "name",
				update: { strategy: "value", data: "New Name" },
			});
		});

		it("handles connected message", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			expect(transport.getClientId()).toBe(null);

			const ws = (transport as unknown as { ws: MockWebSocket }).ws;
			ws.simulateMessage({
				type: "connected",
				clientId: "client-abc-123",
			});

			expect(transport.getClientId()).toBe("client-abc-123");
		});
	});

	describe("Pending Messages", () => {
		it("queues messages when disconnected", () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			// Send before connecting
			transport.send({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			// Should be tracked even when disconnected
			expect(transport.getSubscriptionCount()).toBe(1);
		});

		it("flushes pending messages on connect", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			// Send before connecting
			transport.send({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			await transport.connect();

			// Check that message was sent
			const ws = (transport as unknown as { ws: MockWebSocket }).ws;
			expect(ws.sentMessages.length).toBe(1);
			expect(JSON.parse(ws.sentMessages[0])).toEqual({
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});
		});
	});

	describe("Clear Subscriptions", () => {
		it("clears all tracked subscriptions", async () => {
			const transport = new WebSocketSubscriptionTransport({
				url: "ws://test",
			});

			await transport.connect();

			transport.send({ type: "subscribe", entity: "User", id: "1", fields: "*" });
			transport.send({ type: "subscribe", entity: "User", id: "2", fields: "*" });
			transport.send({ type: "subscribe", entity: "User", id: "3", fields: "*" });

			expect(transport.getSubscriptionCount()).toBe(3);

			transport.clearSubscriptions();

			expect(transport.getSubscriptionCount()).toBe(0);
		});
	});
});
