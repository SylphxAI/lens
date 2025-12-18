/**
 * @sylphx/lens-client - HTTP + SSE Transport Tests
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { isError } from "@sylphx/lens-core";
import { httpSse, type SseConnectionState } from "./http-sse.js";

// =============================================================================
// Mock EventSource
// =============================================================================

class MockEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;

	url: string;
	readyState: number = MockEventSource.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	private listeners = new Map<string, Set<EventListener>>();
	private static instances: MockEventSource[] = [];

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);

		// Simulate async connection
		setTimeout(() => {
			if (this.readyState !== MockEventSource.CLOSED) {
				this.readyState = MockEventSource.OPEN;
				this.onopen?.(new Event("open"));
			}
		}, 0);
	}

	addEventListener(type: string, listener: EventListener) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)!.add(listener);
	}

	removeEventListener(type: string, listener: EventListener) {
		this.listeners.get(type)?.delete(listener);
	}

	dispatchEvent(event: Event): boolean {
		const listeners = this.listeners.get(event.type);
		if (listeners) {
			for (const listener of listeners) {
				(listener as (e: Event) => void)(event);
			}
		}
		return true;
	}

	close() {
		this.readyState = MockEventSource.CLOSED;
	}

	// Test helpers
	simulateMessage(data: unknown) {
		const event = new MessageEvent("message", { data: JSON.stringify(data) });
		this.onmessage?.(event);
	}

	simulateError() {
		this.readyState = MockEventSource.CLOSED;
		const listeners = this.listeners.get("error");
		if (listeners) {
			for (const listener of listeners) {
				(listener as (e: Event) => void)(new Event("error"));
			}
		}
	}

	simulateComplete() {
		const event = new MessageEvent("complete", { data: "" });
		this.dispatchEvent(event);
	}

	static getLastInstance(): MockEventSource | undefined {
		return MockEventSource.instances[MockEventSource.instances.length - 1];
	}

	static clearInstances() {
		MockEventSource.instances = [];
	}
}

// =============================================================================
// Tests
// =============================================================================

describe("HTTP + SSE Transport", () => {
	let mockFetch: ReturnType<typeof mock>;

	beforeEach(() => {
		MockEventSource.clearInstances();
		mockFetch = mock(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ version: "1.0.0", operations: {} }),
			}),
		);
	});

	afterEach(() => {
		MockEventSource.clearInstances();
	});

	describe("httpSse (new name)", () => {
		it("works with httpSse function name", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const metadata = await transport.connect();
			expect(metadata.version).toBe("1.0.0");
		});
	});

	describe("connect", () => {
		it("fetches metadata from server", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const metadata = await transport.connect();

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:3000/api/__lens/metadata");
			expect(metadata.version).toBe("1.0.0");
		});

		it("throws on connection failure", async () => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
				}),
			);

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			await expect(transport.connect()).rejects.toThrow("Failed to connect: 500");
		});

		it("normalizes URL by removing trailing slash", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api/",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			await transport.connect();

			expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:3000/api/__lens/metadata");
		});
	});

	describe("query/mutation", () => {
		it("executes query via HTTP POST", async () => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { id: "123", name: "Alice" } }),
				}),
			);

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = await transport.query({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			});

			expect(result).toEqual({ data: { id: "123", name: "Alice" } });
			expect(mockFetch).toHaveBeenCalledTimes(1);

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe("http://localhost:3000/api");
			expect(options.method).toBe("POST");
			expect(JSON.parse(options.body)).toEqual({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			});
		});

		it("executes mutation via HTTP POST", async () => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { success: true } }),
				}),
			);

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = await transport.mutation({
				id: "op-2",
				path: "user.update",
				type: "mutation",
				input: { id: "123", name: "Bob" },
			});

			expect(result).toEqual({ data: { success: true } });
		});

		it("returns error on HTTP failure", async () => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: false,
					status: 404,
					statusText: "Not Found",
				}),
			);

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = await transport.query({
				id: "op-3",
				path: "user.get",
				type: "query",
				input: { id: "999" },
			});

			expect(isError(result)).toBe(true);
			if (isError(result)) {
				expect(result.error).toBe("HTTP 404: Not Found");
			}
		});

		it("includes custom headers from options", async () => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: {} }),
				}),
			);

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				headers: { Authorization: "Bearer token123" },
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			await transport.query({
				id: "op-4",
				path: "user.get",
				type: "query",
			});

			const options = mockFetch.mock.calls[0][1];
			expect(options.headers.Authorization).toBe("Bearer token123");
		});
	});

	describe("subscription", () => {
		it("creates EventSource for subscription", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = transport.subscription({
				id: "sub-1",
				path: "user.watch",
				type: "subscription",
				input: { id: "123" },
			});

			// Should return observable
			expect(result).toHaveProperty("subscribe");

			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };
			const next = mock(() => {});

			observable.subscribe({ next });

			// Wait for EventSource to be created
			await new Promise((r) => setTimeout(r, 10));

			const es = MockEventSource.getLastInstance();
			expect(es).toBeDefined();
			// New format: GET /__lens/sse?path={path}&input={...}
			expect(es!.url).toContain("/__lens/sse");
			expect(es!.url).toContain("path=user.watch");
			expect(es!.url).toContain("input=");
		});

		it("receives messages from EventSource", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = transport.subscription({
				id: "sub-2",
				path: "user.watch",
				type: "subscription",
			});

			const messages: unknown[] = [];
			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };

			observable.subscribe({
				next: (r: { data: unknown }) => messages.push(r.data),
			});

			await new Promise((r) => setTimeout(r, 10));

			const es = MockEventSource.getLastInstance()!;
			// Server sends { data } wrapped results for stateless architecture
			es.simulateMessage({ data: { id: "123", name: "Alice" } });
			es.simulateMessage({ data: { id: "123", name: "Bob" } });

			expect(messages).toEqual([
				{ id: "123", name: "Alice" },
				{ id: "123", name: "Bob" },
			]);
		});

		it("handles unsubscribe", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = transport.subscription({
				id: "sub-3",
				path: "user.watch",
				type: "subscription",
			});

			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };
			const subscription = observable.subscribe({ next: () => {} });

			await new Promise((r) => setTimeout(r, 10));

			const es = MockEventSource.getLastInstance()!;
			expect(es.readyState).not.toBe(MockEventSource.CLOSED);

			subscription.unsubscribe();

			expect(es.readyState).toBe(MockEventSource.CLOSED);
			expect(transport.getSubscriptionCount()).toBe(0);
		});

		it("handles complete event", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = transport.subscription({
				id: "sub-4",
				path: "user.watch",
				type: "subscription",
			});

			const complete = mock(() => {});
			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };

			observable.subscribe({ complete });

			await new Promise((r) => setTimeout(r, 10));

			const es = MockEventSource.getLastInstance()!;
			es.simulateComplete();

			expect(complete).toHaveBeenCalled();
		});
	});

	describe("connection state", () => {
		it("tracks connection state changes", async () => {
			const states: SseConnectionState[] = [];

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
				onConnectionStateChange: (state) => states.push(state),
			});

			expect(transport.getConnectionState()).toBe("disconnected");

			const result = transport.subscription({
				id: "sub-5",
				path: "user.watch",
				type: "subscription",
			});

			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };
			observable.subscribe({ next: () => {} });

			// Wait for connection
			await new Promise((r) => setTimeout(r, 20));

			expect(states).toContain("connecting");
			expect(states).toContain("connected");
		});

		it("returns to disconnected when all subscriptions end", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			const result = transport.subscription({
				id: "sub-6",
				path: "user.watch",
				type: "subscription",
			});

			const observable = result as { subscribe: (observer: unknown) => { unsubscribe: () => void } };
			const sub = observable.subscribe({ next: () => {} });

			await new Promise((r) => setTimeout(r, 20));
			expect(transport.getConnectionState()).toBe("connected");

			sub.unsubscribe();
			expect(transport.getConnectionState()).toBe("disconnected");
		});
	});

	describe("close", () => {
		it("closes all subscriptions", async () => {
			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
			});

			// Create multiple subscriptions
			const result1 = transport.subscription({
				id: "sub-7",
				path: "user.watch",
				type: "subscription",
			}) as { subscribe: (observer: unknown) => { unsubscribe: () => void } };

			const result2 = transport.subscription({
				id: "sub-8",
				path: "post.watch",
				type: "subscription",
			}) as { subscribe: (observer: unknown) => { unsubscribe: () => void } };

			result1.subscribe({ next: () => {} });
			result2.subscribe({ next: () => {} });

			await new Promise((r) => setTimeout(r, 10));
			expect(transport.getSubscriptionCount()).toBe(2);

			transport.close();

			expect(transport.getSubscriptionCount()).toBe(0);
			expect(transport.getConnectionState()).toBe("disconnected");
		});
	});

	describe("retry", () => {
		it("can disable retry", async () => {
			const errors: Error[] = [];

			const transport = httpSse({
				url: "http://localhost:3000/api",
				fetch: mockFetch as typeof fetch,
				EventSource: MockEventSource as unknown as typeof EventSource,
				retry: { enabled: false },
			});

			const result = transport.subscription({
				id: "sub-9",
				path: "user.watch",
				type: "subscription",
			}) as { subscribe: (observer: unknown) => { unsubscribe: () => void } };

			result.subscribe({
				error: (err: Error) => errors.push(err),
			});

			await new Promise((r) => setTimeout(r, 10));

			const es = MockEventSource.getLastInstance()!;
			es.simulateError();

			await new Promise((r) => setTimeout(r, 10));

			expect(errors.length).toBe(1);
			expect(errors[0].message).toBe("SSE connection failed");
		});
	});
});
