/**
 * @sylphx/lens-client - WebSocket Transport Tests
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Observable, Result } from "./types.js";
import { ws } from "./ws.js";

// =============================================================================
// Mock WebSocket
// =============================================================================

interface MockWebSocketInstance {
	url: string;
	readyState: number;
	onopen: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	send: ReturnType<typeof mock>;
	close: ReturnType<typeof mock>;
	addEventListener: (eventType: string, handler: EventListener) => void;
	removeEventListener: (eventType: string, handler: EventListener) => void;
	// Test helpers
	simulateOpen: () => void;
	simulateMessage: (data: unknown) => void;
	simulateClose: () => void;
	simulateError: () => void;
}

// Store instances globally for test access
let mockInstances: MockWebSocketInstance[] = [];

class MockWebSocket implements MockWebSocketInstance {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	readyState = MockWebSocket.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;

	// Track addEventListener handlers
	private messageListeners = new Set<EventListener>();
	private closeListeners = new Set<EventListener>();
	private errorListeners = new Set<EventListener>();

	send = mock(() => {});
	close = mock(() => {
		this.readyState = MockWebSocket.CLOSED;
		const event = { code: 1000 } as CloseEvent;
		this.onclose?.(event);
		this.closeListeners.forEach((handler) => {
			handler(event as unknown as Event);
		});
	});

	addEventListener(eventType: string, handler: EventListener) {
		if (eventType === "message") this.messageListeners.add(handler);
		else if (eventType === "close") this.closeListeners.add(handler);
		else if (eventType === "error") this.errorListeners.add(handler);
	}

	removeEventListener(eventType: string, handler: EventListener) {
		if (eventType === "message") this.messageListeners.delete(handler);
		else if (eventType === "close") this.closeListeners.delete(handler);
		else if (eventType === "error") this.errorListeners.delete(handler);
	}

	constructor(url: string) {
		this.url = url;
		mockInstances.push(this);
	}

	simulateOpen() {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.({} as Event);
	}

	simulateMessage(data: unknown) {
		const event = { data: JSON.stringify(data) } as MessageEvent;
		this.onmessage?.(event);
		// Cast handler to accept MessageEvent since that's what ws.ts expects
		this.messageListeners.forEach((handler) => {
			(handler as (event: MessageEvent) => void)(event);
		});
	}

	simulateClose() {
		this.readyState = MockWebSocket.CLOSED;
		const event = { code: 1000 } as CloseEvent;
		this.onclose?.(event);
		this.closeListeners.forEach((handler) => {
			handler(event as unknown as Event);
		});
	}

	simulateError() {
		const event = {} as Event;
		this.onerror?.(event);
		this.errorListeners.forEach((handler) => {
			handler(event);
		});
	}
}

// =============================================================================
// Tests: ws() transport
// =============================================================================

describe("ws transport", () => {
	let originalWebSocket: typeof WebSocket;

	beforeEach(() => {
		mockInstances = [];
		originalWebSocket = globalThis.WebSocket;
		// Mock WebSocket with static constants
		const MockWSClass = MockWebSocket as unknown as typeof WebSocket;
		(MockWSClass as any).CONNECTING = 0;
		(MockWSClass as any).OPEN = 1;
		(MockWSClass as any).CLOSING = 2;
		(MockWSClass as any).CLOSED = 3;
		globalThis.WebSocket = MockWSClass;
	});

	afterEach(() => {
		globalThis.WebSocket = originalWebSocket;
	});

	describe("connect()", () => {
		it("creates WebSocket connection with provided URL", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			const connectPromise = transport.connect();

			// Wait for WebSocket to be created
			await new Promise((r) => setTimeout(r, 10));

			const instance = mockInstances[0];
			expect(instance).toBeDefined();
			instance.simulateOpen();

			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			// Simulate handshake response
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});

			const metadata = await connectPromise;

			expect(instance.url).toBe("ws://localhost:3000");
			expect(metadata.version).toBe("1.0.0");
		});

		it("sends handshake message on connect", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			const connectPromise = transport.connect();

			await new Promise((r) => setTimeout(r, 10));

			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});

			await connectPromise;

			expect(instance.send).toHaveBeenCalledWith(JSON.stringify({ type: "handshake" }));
		});

		it("returns metadata from handshake", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			const connectPromise = transport.connect();

			await new Promise((r) => setTimeout(r, 10));

			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: {
					version: "2.0.0",
					operations: {
						"user.get": { type: "query" },
						"user.create": { type: "mutation" },
					},
				},
			});

			const metadata = await connectPromise;

			expect(metadata.version).toBe("2.0.0");
			expect(metadata.operations["user.get"]).toEqual({ type: "query" });
			expect(metadata.operations["user.create"]).toEqual({ type: "mutation" });
		});

		it("times out if connection takes too long", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 50 });

			const connectPromise = transport.connect();

			// Don't simulate open - let it timeout
			await expect(connectPromise).rejects.toThrow("WebSocket connection timeout");
		});

		it("times out if handshake takes too long", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 50 });

			const connectPromise = transport.connect();

			await new Promise((r) => setTimeout(r, 10));

			const instance = mockInstances[0];
			instance.simulateOpen();
			// Don't send handshake response

			await expect(connectPromise).rejects.toThrow("Handshake timeout");
		});

		it("rejects on connection error", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			const connectPromise = transport.connect();

			await new Promise((r) => setTimeout(r, 10));

			const instance = mockInstances[0];
			instance.simulateError();

			await expect(connectPromise).rejects.toThrow("WebSocket connection error");
		});
	});

	describe("execute() - queries/mutations", () => {
		async function setupConnection(transport: ReturnType<typeof ws>) {
			const connectPromise = transport.connect();
			await new Promise((r) => setTimeout(r, 10));
			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});
			await connectPromise;
			return instance;
		}

		it("sends operation message for query", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const resultPromise = transport.execute({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			});

			// Wait for execute() to set up the pending operation
			await Promise.resolve();
			await Promise.resolve();

			// Simulate response
			instance.simulateMessage({
				type: "response",
				id: "op-1",
				data: { id: "123", name: "John" },
			});

			const result = (await resultPromise) as Result;

			expect(instance.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "operation",
					id: "op-1",
					path: "user.get",
					opType: "query",
					input: { id: "123" },
				}),
			);
			expect(result.data).toEqual({ id: "123", name: "John" });
		});

		it("sends operation message for mutation", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const resultPromise = transport.execute({
				id: "op-2",
				path: "user.create",
				type: "mutation",
				input: { name: "Jane" },
			});

			// Wait for execute() to set up the pending operation
			await Promise.resolve();
			await Promise.resolve();

			instance.simulateMessage({
				type: "response",
				id: "op-2",
				data: { id: "new-1", name: "Jane" },
			});

			const result = (await resultPromise) as Result;

			expect(instance.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "operation",
					id: "op-2",
					path: "user.create",
					opType: "mutation",
					input: { name: "Jane" },
				}),
			);
			expect(result.data).toEqual({ id: "new-1", name: "Jane" });
		});

		it("returns error from server response", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const resultPromise = transport.execute({
				id: "op-3",
				path: "user.get",
				type: "query",
				input: { id: "not-found" },
			});

			// Wait for execute() to set up the pending operation
			await Promise.resolve();
			await Promise.resolve();

			instance.simulateMessage({
				type: "response",
				id: "op-3",
				error: { message: "User not found" },
			});

			const result = (await resultPromise) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe("User not found");
		});

		it("handles error message type", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const resultPromise = transport.execute({
				id: "op-4",
				path: "user.get",
				type: "query",
			});

			// Wait for execute() to set up the pending operation
			await Promise.resolve();
			await Promise.resolve();

			instance.simulateMessage({
				type: "error",
				id: "op-4",
				error: { message: "Internal server error" },
			});

			const result = (await resultPromise) as Result;

			expect(result.error?.message).toBe("Internal server error");
		});

		it("times out if no response received", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 50 });
			await setupConnection(transport);

			const resultPromise = transport.execute({
				id: "op-5",
				path: "user.get",
				type: "query",
			});

			// Don't send response - let it timeout
			const result = (await resultPromise) as Result;

			expect(result.error?.message).toBe("Operation timeout");
		});
	});

	describe("execute() - subscriptions", () => {
		async function setupConnection(transport: ReturnType<typeof ws>) {
			const connectPromise = transport.connect();
			await new Promise((r) => setTimeout(r, 10));
			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});
			await connectPromise;
			return instance;
		}

		it("returns observable for subscription", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			await setupConnection(transport);

			const result = transport.execute({
				id: "sub-1",
				path: "counter.watch",
				type: "subscription",
			});

			expect(result).toHaveProperty("subscribe");
		});

		it("sends subscription message on subscribe", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const observable = transport.execute({
				id: "sub-2",
				path: "counter.watch",
				type: "subscription",
				input: { counterId: "abc" },
			}) as Observable<Result>;

			observable.subscribe({});

			// Wait for async send
			await new Promise((r) => setTimeout(r, 20));

			expect(instance.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "subscription",
					id: "sub-2",
					path: "counter.watch",
					input: { counterId: "abc" },
				}),
			);
		});

		it("receives subscription updates", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const observable = transport.execute({
				id: "sub-3",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: unknown[] = [];
			observable.subscribe({
				next: (result) => values.push(result.data),
			});

			await new Promise((r) => setTimeout(r, 20));

			// Simulate subscription updates
			instance.simulateMessage({
				type: "subscription",
				id: "sub-3",
				data: { count: 1 },
			});

			instance.simulateMessage({
				type: "subscription",
				id: "sub-3",
				data: { count: 2 },
			});

			instance.simulateMessage({
				type: "subscription",
				id: "sub-3",
				data: { count: 3 },
			});

			expect(values).toEqual([{ count: 1 }, { count: 2 }, { count: 3 }]);
		});

		it("handles subscription errors", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const observable = transport.execute({
				id: "sub-4",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];
			observable.subscribe({
				error: (err) => errors.push(err),
			});

			await new Promise((r) => setTimeout(r, 20));

			instance.simulateMessage({
				type: "subscription",
				id: "sub-4",
				error: { message: "Subscription failed" },
			});

			expect(errors.length).toBe(1);
			expect(errors[0].message).toBe("Subscription failed");
		});

		it("sends unsubscribe message on unsubscribe", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const observable = transport.execute({
				id: "sub-5",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const subscription = observable.subscribe({});

			await new Promise((r) => setTimeout(r, 20));

			subscription.unsubscribe();

			expect(instance.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "unsubscribe",
					id: "sub-5",
				}),
			);
		});
	});

	describe("disconnection handling", () => {
		async function setupConnection(transport: ReturnType<typeof ws>) {
			const connectPromise = transport.connect();
			await new Promise((r) => setTimeout(r, 10));
			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});
			await connectPromise;
			return instance;
		}

		it("rejects pending operations on disconnect", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 5000 });
			const instance = await setupConnection(transport);

			// Start an operation but don't resolve it
			const resultPromise = transport.execute({
				id: "op-disconnect",
				path: "user.get",
				type: "query",
			});

			// Give time for the operation to be sent
			await new Promise((r) => setTimeout(r, 10));

			// Simulate disconnect
			instance.simulateClose();

			await expect(resultPromise).rejects.toThrow("WebSocket disconnected");
		});

		it("notifies subscriptions on disconnect", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });
			const instance = await setupConnection(transport);

			const observable = transport.execute({
				id: "sub-disconnect",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];
			observable.subscribe({
				error: (err) => errors.push(err),
			});

			await new Promise((r) => setTimeout(r, 20));

			// Simulate disconnect
			instance.simulateClose();

			expect(errors.length).toBe(1);
			expect(errors[0].message).toBe("WebSocket disconnected");
		});
	});

	describe("reconnection", () => {
		async function setupConnection(transport: ReturnType<typeof ws>) {
			const connectPromise = transport.connect();
			await new Promise((r) => setTimeout(r, 10));
			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});
			await connectPromise;
			return instance;
		}

		it("attempts reconnect after disconnect", async () => {
			const transport = ws({
				url: "ws://localhost:3000",
				timeout: 500,
				reconnect: { enabled: true, delay: 20, maxAttempts: 3 },
			});
			const instance = await setupConnection(transport);

			// Simulate disconnect
			instance.simulateClose();

			// Wait for reconnect attempt
			await new Promise((r) => setTimeout(r, 50));

			// Should have created a new WebSocket instance
			expect(mockInstances.length).toBeGreaterThan(1);
		});

		it("does not reconnect when disabled", async () => {
			const transport = ws({
				url: "ws://localhost:3000",
				timeout: 500,
				reconnect: { enabled: false },
			});
			const instance = await setupConnection(transport);

			// Simulate disconnect
			instance.simulateClose();

			// Wait to ensure no reconnect
			await new Promise((r) => setTimeout(r, 100));

			// Should only have the original instance
			expect(mockInstances.length).toBe(1);
		});
	});

	describe("connection reuse", () => {
		it("reuses existing connection for multiple operations", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			const connectPromise = transport.connect();
			await new Promise((r) => setTimeout(r, 10));
			const instance = mockInstances[0];
			instance.simulateOpen();
			// Wait for connect() to set up addEventListener after ensureConnection resolves
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			instance.simulateMessage({
				type: "handshake",
				data: { version: "1.0.0", operations: {} },
			});
			await connectPromise;

			// Execute multiple operations
			const op1 = transport.execute({ id: "op-a", path: "a", type: "query" });
			const op2 = transport.execute({ id: "op-b", path: "b", type: "query" });
			const op3 = transport.execute({ id: "op-c", path: "c", type: "query" });

			// Wait for execute() to set up pending operations
			await Promise.resolve();
			await Promise.resolve();

			instance.simulateMessage({ type: "response", id: "op-a", data: "a" });
			instance.simulateMessage({ type: "response", id: "op-b", data: "b" });
			instance.simulateMessage({ type: "response", id: "op-c", data: "c" });

			await Promise.all([op1, op2, op3]);

			// Should still only have one WebSocket instance
			expect(mockInstances.length).toBe(1);
		});
	});

	describe("concurrent connection handling", () => {
		it("waits for ongoing connection attempt when multiple operations start simultaneously", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			// Start multiple operations simultaneously before connection is established
			const op1Promise = transport.execute({ id: "op-1", path: "a", type: "query" });
			const op2Promise = transport.execute({ id: "op-2", path: "b", type: "query" });

			// Give operations time to trigger ensureConnection
			await new Promise((r) => setTimeout(r, 10));

			// Only one WebSocket should be created despite multiple operations
			expect(mockInstances.length).toBe(1);

			const instance = mockInstances[0];
			instance.simulateOpen();

			// Wait for connection to be established
			await new Promise((r) => setTimeout(r, 150));

			// Now resolve the operations
			instance.simulateMessage({ type: "response", id: "op-1", data: "result-a" });
			instance.simulateMessage({ type: "response", id: "op-2", data: "result-b" });

			const [result1, result2] = await Promise.all([op1Promise, op2Promise]);

			expect((result1 as Result).data).toBe("result-a");
			expect((result2 as Result).data).toBe("result-b");
			// Still only one WebSocket instance
			expect(mockInstances.length).toBe(1);
		});

		it("resolves waiting operations when connection succeeds", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			// Start first operation (triggers connection)
			const op1Promise = transport.execute({ id: "op-1", path: "a", type: "query" });

			// Give it time to start connecting
			await new Promise((r) => setTimeout(r, 10));

			// Start second operation while first is still connecting
			const op2Promise = transport.execute({ id: "op-2", path: "b", type: "query" });

			// Give time for second operation to wait
			await new Promise((r) => setTimeout(r, 50));

			const instance = mockInstances[0];
			instance.simulateOpen();

			// Wait for connection to be detected by polling
			await new Promise((r) => setTimeout(r, 150));

			// Resolve both operations
			instance.simulateMessage({ type: "response", id: "op-1", data: "result-a" });
			instance.simulateMessage({ type: "response", id: "op-2", data: "result-b" });

			const [result1, result2] = await Promise.all([op1Promise, op2Promise]);

			expect((result1 as Result).data).toBe("result-a");
			expect((result2 as Result).data).toBe("result-b");
		});

		it("rejects waiting operations when connection fails", async () => {
			const transport = ws({ url: "ws://localhost:3000", timeout: 500 });

			// Capture promise rejection errors instead of letting them throw
			const errors: Error[] = [];

			// Start first operation (triggers connection)
			const op1 = transport.execute({ id: "op-1", path: "a", type: "query" });
			if ("then" in op1) {
				(op1 as Promise<unknown>).catch((e: Error) => errors.push(e));
			}

			// Give it time to start connecting
			await new Promise((r) => setTimeout(r, 10));

			// Start second operation while first is still connecting
			const op2 = transport.execute({ id: "op-2", path: "b", type: "query" });
			if ("then" in op2) {
				(op2 as Promise<unknown>).catch((e: Error) => errors.push(e));
			}

			// Give time for second operation to start waiting and enter the polling loop
			await new Promise((r) => setTimeout(r, 50));

			const instance = mockInstances[0];
			// Simulate connection error - this will set isConnecting to false
			instance.simulateError();

			// Wait for polling to detect that isConnecting is false (check interval is 100ms)
			await new Promise((r) => setTimeout(r, 150));

			// Both operations should have rejected
			expect(errors.length).toBe(2);
			// Second operation should reject with "Connection failed" from the polling logic
			expect(errors.some((e) => e.message === "Connection failed")).toBe(true);
		});
	});
});
