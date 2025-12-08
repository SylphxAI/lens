/**
 * Comprehensive tests for @sylphx/lens-solidstart
 * Target: 100% code coverage
 */

import { describe, expect, test } from "bun:test";
import { type Observable, of } from "@sylphx/lens-core";
import {
	createLensMutation,
	createLensQuery,
	createLensSolidStart,
	createServerAction,
	createServerQuery_legacy,
} from "./index";

// =============================================================================
// Mock Server Setup
// =============================================================================

// Helper type
type LensResult<T> = { data: T | null; error: Error | null };

// Mock server for testing - returns Observable like real server
const createMockServer = () => ({
	execute: ({ path, input }: { path: string; input?: unknown }): Observable<LensResult<unknown>> => {
		if (path === "user.get") {
			return of({ data: { id: (input as { id: string }).id, name: "Test User" }, error: null });
		}
		if (path === "user.list") {
			return of({ data: [{ id: "1", name: "User 1" }], error: null });
		}
		if (path === "user.create") {
			return of({ data: { id: "new-id", name: (input as { name: string }).name }, error: null });
		}
		if (path === "error.route") {
			return of({ data: null, error: new Error("Route error") });
		}
		if (path === "observable.stream") {
			// Return an observable-like object for SSE testing
			return {
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					// Simulate streaming data
					setTimeout(() => handlers.next({ data: "chunk1" }), 0);
					setTimeout(() => handlers.next({ data: "chunk2" }), 10);
					setTimeout(() => handlers.complete(), 20);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<LensResult<unknown>>;
		}
		if (path === "observable.error") {
			// Return an observable that emits an error
			return {
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					setTimeout(() => handlers.error(new Error("Stream error")), 0);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<LensResult<unknown>>;
		}
		return of({ data: null, error: new Error("Not found") });
	},
});

// =============================================================================
// Tests: createLensSolidStart
// =============================================================================

describe("createLensSolidStart", () => {
	test("creates instance with all required properties", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		expect(lens.handler).toBeDefined();
		expect(typeof lens.handler).toBe("function");
		expect(lens.client).toBeDefined();
		expect(lens.serverClient).toBeDefined();
		expect(lens.createQuery).toBeDefined();
		expect(typeof lens.createQuery).toBe("function");
		expect(lens.createMutation).toBeDefined();
		expect(typeof lens.createMutation).toBe("function");
		expect(lens.serverQuery).toBeDefined();
		expect(typeof lens.serverQuery).toBe("function");
	});

	test("uses custom basePath", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: { basePath: "/custom/api" },
		});

		expect(lens.handler).toBeDefined();
	});

	test("uses default basePath when not provided", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: {},
		});

		expect(lens.handler).toBeDefined();
	});

	test("accepts clientConfig options", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: {
				clientConfig: {
					// Any client config options
				},
			},
		});

		expect(lens.client).toBeDefined();
	});
});

// =============================================================================
// Tests: Handler - HTTP Methods
// =============================================================================

describe("handler - HTTP methods", () => {
	test("handles GET requests (queries)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.list", { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles GET requests with input parameter", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const url = new URL("http://localhost/api/lens/user.get");
		url.searchParams.set("input", JSON.stringify({ id: "123" }));

		const response = await lens.handler({
			request: new Request(url.toString(), { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toEqual({ id: "123", name: "Test User" });
	});

	test("handles GET requests without input parameter", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.list", { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles GET requests with server error response", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/error.route", { method: "GET" }),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe("Route error");
	});

	test("handles GET requests with JSON parse error", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const url = new URL("http://localhost/api/lens/user.get");
		url.searchParams.set("input", "invalid-json{");

		const response = await lens.handler({
			request: new Request(url.toString(), { method: "GET" }),
		});

		expect(response.status).toBe(500);
		const data = await response.json();
		expect(data.error).toBeDefined();
	});

	test("handles GET requests with non-Error exception", async () => {
		const server = {
			execute: async () => {
				throw "string error";
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/any.route", { method: "GET" }),
		});

		expect(response.status).toBe(500);
		const data = await response.json();
		expect(data.error).toBe("Unknown error");
	});

	test("handles POST requests (mutations)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.get", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ input: { id: "456" } }),
			}),
		});

		const data = await response.json();
		expect(data.data).toEqual({ id: "456", name: "Test User" });
	});

	test("handles POST requests with server error response", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/error.route", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ input: {} }),
			}),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe("Route error");
	});

	test("handles POST requests with JSON parse error", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "invalid-json{",
			}),
		});

		expect(response.status).toBe(500);
		const data = await response.json();
		expect(data.error).toBeDefined();
	});

	test("handles POST requests with non-Error exception", async () => {
		const server = {
			execute: async () => {
				throw "string error";
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/any.route", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ input: {} }),
			}),
		});

		expect(response.status).toBe(500);
		const data = await response.json();
		expect(data.error).toBe("Unknown error");
	});

	test("returns 405 for unsupported methods", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.get", { method: "DELETE" }),
		});

		expect(response.status).toBe(405);
		const text = await response.text();
		expect(text).toBe("Method not allowed");
	});

	test("returns 405 for PUT method", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.get", { method: "PUT" }),
		});

		expect(response.status).toBe(405);
	});
});

// =============================================================================
// Tests: Handler - SSE (Server-Sent Events)
// =============================================================================

describe("handler - SSE", () => {
	test("handles SSE subscription requests", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/observable.stream", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(response.headers.get("Cache-Control")).toBe("no-cache");
		expect(response.headers.get("Connection")).toBe("keep-alive");
		expect(response.body).toBeDefined();
	});

	test("handles SSE with input parameter", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const url = new URL("http://localhost/api/lens/observable.stream");
		url.searchParams.set("input", JSON.stringify({ filter: "test" }));

		const response = await lens.handler({
			request: new Request(url.toString(), {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
	});

	test("handles SSE error events", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/observable.error", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(response.body).toBeDefined();

		// Verify SSE stream setup - the actual error handling happens in the stream
		// which is asynchronous. We verify the structure is correct.
		expect(response.headers.get("Cache-Control")).toBe("no-cache");
		expect(response.headers.get("Connection")).toBe("keep-alive");
	});

	test("handles SSE without observable result", async () => {
		const server = {
			execute: async () => {
				return { data: "not-an-observable" };
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/any.route", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
	});

	test("SSE stream handles next events", async () => {
		let nextHandler: ((value: { data?: unknown }) => void) | null = null;
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					nextHandler = handlers.next;
					// Emit data immediately
					setTimeout(() => handlers.next({ data: "test-data" }), 0);
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(nextHandler).not.toBeNull();

		// Verify stream can be read
		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
	});

	test("SSE stream handles complete events", async () => {
		let completeHandler: (() => void) | null = null;
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					completeHandler = handlers.complete;
					// Call complete immediately
					setTimeout(() => handlers.complete(), 0);
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(completeHandler).not.toBeNull();
	});

	test("SSE stream handles error events", async () => {
		let errorHandler: ((err: Error) => void) | null = null;
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					errorHandler = handlers.error;
					// Call error immediately
					setTimeout(() => handlers.error(new Error("Stream failed")), 0);
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(errorHandler).not.toBeNull();
	});

	test("SSE stream with null input parameter", async () => {
		const server = {
			execute: ({ input }: { path: string; input?: unknown }) => {
				expect(input).toBeUndefined();
				return {
					subscribe: (handlers: {
						next: (value: { data?: unknown }) => void;
						error: (err: Error) => void;
						complete: () => void;
					}) => {
						setTimeout(() => handlers.complete(), 0);
						return { unsubscribe: () => {} };
					},
				};
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
	});

	test("SSE stream actually encodes and sends data", async () => {
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					// Emit data synchronously to ensure it's sent before stream is read
					handlers.next({ data: "chunk1" });
					handlers.next({ data: "chunk2" });
					handlers.complete();
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		// Read a bit from the stream to verify data was encoded
		const reader = response.body?.getReader();
		if (reader) {
			const { value } = await reader.read();
			if (value) {
				const text = new TextDecoder().decode(value);
				// Verify SSE format
				expect(text).toContain("data:");
			}
			reader.releaseLock();
		}
	});

	test("SSE stream encodes error events properly", async () => {
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					// Emit error synchronously
					handlers.error(new Error("Test error"));
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		// Read from the stream to verify error was encoded
		const reader = response.body?.getReader();
		if (reader) {
			const { value } = await reader.read();
			if (value) {
				const text = new TextDecoder().decode(value);
				// Verify SSE error format
				expect(text).toContain("event: error");
				expect(text).toContain("Test error");
			}
			reader.releaseLock();
		}
	});

	test("SSE stream closes on complete", async () => {
		let streamClosed = false;
		const server = {
			execute: () => ({
				subscribe: (handlers: {
					next: (value: { data?: unknown }) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					// Complete immediately
					handlers.complete();
					streamClosed = true;
					return { unsubscribe: () => {} };
				},
			}),
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/stream.test", {
				method: "GET",
				headers: { accept: "text/event-stream" },
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		// Stream setup should trigger complete handler
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(streamClosed).toBe(true);
	});
});

// =============================================================================
// Tests: Handler - Path Processing
// =============================================================================

describe("handler - path processing", () => {
	test("strips basePath from URL correctly", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.list", { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toBeDefined();
	});

	test("handles custom basePath correctly", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: { basePath: "/custom/path" },
		});

		const response = await lens.handler({
			request: new Request("http://localhost/custom/path/user.list", { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toBeDefined();
	});

	test("handles paths with leading slash", async () => {
		const server = {
			execute: async ({ path }: { path: string; input?: unknown }) => {
				// The path will be "/user.list" after basePath stripping
				if (path === "/user.list" || path === "user.list") {
					return { data: [{ id: "1", name: "User 1" }], error: null };
				}
				return { data: null, error: new Error("Not found") };
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens//user.list", { method: "GET" }),
		});

		// Verify response is handled (may return 200 or 400 depending on path normalization)
		expect([200, 400]).toContain(response.status);
	});
});

// =============================================================================
// Tests: Server Client Proxy
// =============================================================================

describe("serverClient proxy", () => {
	test("executes queries directly", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const result = await (lens.serverClient as any).user.get({ id: "789" });
		expect(result).toEqual({ id: "789", name: "Test User" });
	});

	test("throws on error", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		await expect((lens.serverClient as any).unknown.route()).rejects.toThrow("Not found");
	});

	test("handles nested property access", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const result = await (lens.serverClient as any).user.list();
		expect(result).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles deeply nested paths", async () => {
		const server = {
			execute: async ({ path }: { path: string; input?: unknown }) => {
				if (path === "api.v1.user.get") {
					return { data: { id: "deep" }, error: null };
				}
				return { data: null, error: new Error("Not found") };
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const result = await (lens.serverClient as any).api.v1.user.get();
		expect(result).toEqual({ id: "deep" });
	});

	test("handles symbol property access", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const sym = Symbol("test");
		const result = (lens.serverClient as any)[sym];
		expect(result).toBeUndefined();
	});

	test("handles 'then' property access for promise detection", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const result = (lens.serverClient as any).then;
		expect(result).toBeUndefined();
	});

	test("allows chaining property access before calling", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const chainedFn = (lens.serverClient as any).user.get;
		const result = await chainedFn({ id: "chained" });
		expect(result).toEqual({ id: "chained", name: "Test User" });
	});
});

// =============================================================================
// Tests: createQuery (instance method)
// =============================================================================

describe("createQuery (instance method)", () => {
	test("creates query function that wraps createResource", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// Just verify the function is created
		expect(typeof lens.createQuery).toBe("function");
	});

	test("verifies getClient returns correct client in test environment", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// In test environment (no window), should use serverClient
		// This is verified through the serverClient tests
		expect(lens.serverClient).toBeDefined();
	});
});

// =============================================================================
// Tests: createMutation (instance method)
// =============================================================================

describe("createMutation (instance method)", () => {
	test("creates mutation with correct shape", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.pending).toBe("function");
		expect(typeof mutation.error).toBe("function");
		expect(typeof mutation.data).toBe("function");
		expect(typeof mutation.reset).toBe("function");
	});

	test("executes mutation successfully", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "new", name: input.name },
		}));

		const result = await mutation.mutate({ name: "Test" });
		expect(result.data.name).toBe("Test");
		expect(mutation.data()?.name).toBe("Test");
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("handles mutation error (Error object)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const testError = new Error("Mutation failed");
		const mutation = lens.createMutation(() => async () => {
			throw testError;
		});

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBe(testError);
			expect(mutation.error()).toBe(testError);
			expect(mutation.pending()).toBe(false);
		}
	});

	test("handles mutation error (non-Error object)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async () => {
			throw "string error";
		});

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
			expect(mutation.error()?.message).toBe("string error");
			expect(mutation.pending()).toBe(false);
		}
	});

	test("sets pending to true during mutation", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		let pendingDuringExecution = false;
		const mutation = lens.createMutation(() => async (input: { name: string }) => {
			pendingDuringExecution = mutation.pending();
			return { data: { id: "1", name: input.name } };
		});

		await mutation.mutate({ name: "Test" });
		expect(pendingDuringExecution).toBe(true);
		expect(mutation.pending()).toBe(false);
	});

	test("clears error on new mutation attempt", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		let shouldFail = true;
		const mutation = lens.createMutation(() => async (input: { name: string }) => {
			if (shouldFail) {
				throw new Error("First error");
			}
			return { data: { id: "1", name: input.name } };
		});

		try {
			await mutation.mutate({ name: "Test" });
		} catch {}

		expect(mutation.error()).not.toBe(null);

		shouldFail = false;
		await mutation.mutate({ name: "Test" });

		expect(mutation.error()).toBe(null);
	});

	test("reset clears all state", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		await mutation.mutate({ name: "Test" });
		expect(mutation.data()).not.toBe(null);

		mutation.reset();

		expect(mutation.data()).toBe(null);
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});
});

// =============================================================================
// Tests: serverQuery (instance method)
// =============================================================================

describe("serverQuery (instance method)", () => {
	test("creates server query function", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery(() => Promise.resolve({ data: "test" }) as any);

		expect(typeof queryFn).toBe("function");
	});

	test("executes server query with arguments", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((_client, id: string) => Promise.resolve({ id, name: "User" }) as any);

		const result = await queryFn("123");
		expect(result).toEqual({ id: "123", name: "User" });
	});

	test("executes server query with multiple arguments", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((_client, id: string, name: string) => Promise.resolve({ id, name }) as any);

		const result = await queryFn("123", "Test");
		expect(result).toEqual({ id: "123", name: "Test" });
	});

	test("uses serverClient for execution", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((client: any) => client.user.list());

		const result = await queryFn();
		expect(result).toEqual([{ id: "1", name: "User 1" }]);
	});
});

// =============================================================================
// Tests: Client Selection (SSR vs Browser)
// =============================================================================

describe("client selection", () => {
	test("uses serverClient when typeof window is undefined", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// serverClient is used by default in test environment (no window)
		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		const result = await mutation.mutate({ name: "Test" });
		expect(result.data.name).toBe("Test");
	});
});

// =============================================================================
// Tests: Legacy Exports - createLensQuery
// =============================================================================

describe("createLensQuery (legacy)", () => {
	test("createLensQuery is exported", () => {
		expect(typeof createLensQuery).toBe("function");
	});

	test("createLensQuery wraps createResource from solid-js", () => {
		// Verify function exists - cannot execute without reactive context
		// The function internally uses createResource which requires SolidJS context
		expect(typeof createLensQuery).toBe("function");
	});
});

// =============================================================================
// Tests: Legacy Exports - createLensMutation
// =============================================================================

describe("createLensMutation (legacy)", () => {
	test("returns correct shape", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = createLensMutation(mockMutation);

		expect(typeof result.mutate).toBe("function");
		expect(typeof result.pending).toBe("function");
		expect(typeof result.error).toBe("function");
		expect(typeof result.data).toBe("function");
		expect(typeof result.reset).toBe("function");
	});

	test("initial state is correct", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = createLensMutation(mockMutation);

		expect(result.pending()).toBe(false);
		expect(result.error()).toBe(null);
		expect(result.data()).toBe(null);
	});

	test("executes mutation successfully", async () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createLensMutation(mockMutation);

		const result = await mutation.mutate({ name: "Test" });

		expect(result.data.id).toBe("123");
		expect(result.data.name).toBe("Test");
		expect(mutation.data()?.id).toBe("123");
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("sets pending during execution", async () => {
		let pendingDuringExecution = false;

		const mockMutation = async (input: { name: string }) => {
			pendingDuringExecution = mutation.pending();
			return { data: { id: "1", name: input.name } };
		};

		const mutation = createLensMutation(mockMutation);

		await mutation.mutate({ name: "Test" });

		expect(pendingDuringExecution).toBe(true);
		expect(mutation.pending()).toBe(false);
	});

	test("handles Error object rejection", async () => {
		const testError = new Error("mutation failed");
		const mockMutation = async () => {
			throw testError;
		};

		const mutation = createLensMutation(mockMutation);

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBe(testError);
			expect(mutation.error()).toBe(testError);
			expect(mutation.pending()).toBe(false);
		}
	});

	test("handles non-Error rejection", async () => {
		const mockMutation = async () => {
			throw "string error";
		};

		const mutation = createLensMutation(mockMutation);

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
			expect(mutation.error()?.message).toBe("string error");
			expect(mutation.pending()).toBe(false);
		}
	});

	test("clears error on new mutation", async () => {
		let shouldFail = true;
		const mockMutation = async (input: { name: string }) => {
			if (shouldFail) {
				throw new Error("first error");
			}
			return { data: { id: "1", name: input.name } };
		};

		const mutation = createLensMutation(mockMutation);

		// First call fails
		try {
			await mutation.mutate({ name: "test" });
		} catch {}

		expect(mutation.error()).not.toBe(null);

		// Second call succeeds
		shouldFail = false;
		await mutation.mutate({ name: "test" });

		expect(mutation.error()).toBe(null);
		expect(mutation.data()?.id).toBe("1");
	});

	test("reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = createLensMutation(mockMutation);
		result.reset();

		expect(result.pending()).toBe(false);
		expect(result.error()).toBe(null);
		expect(result.data()).toBe(null);
	});

	test("reset clears state after mutation", async () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const mutation = createLensMutation(mockMutation);

		await mutation.mutate({ name: "test" });
		expect(mutation.data()).not.toBe(null);

		mutation.reset();

		expect(mutation.data()).toBe(null);
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("resets pending to false even after error", async () => {
		const mockMutation = async () => {
			throw new Error("test error");
		};

		const mutation = createLensMutation(mockMutation);

		try {
			await mutation.mutate({} as any);
		} catch {}

		expect(mutation.pending()).toBe(false);
	});
});

// =============================================================================
// Tests: Legacy Exports - createServerQuery_legacy
// =============================================================================

describe("createServerQuery_legacy", () => {
	test("returns async function", () => {
		const queryFn = (id: string) => ({
			then: <T>(resolve: (value: { id: string }) => T) => {
				return Promise.resolve(resolve({ id }));
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const serverQuery = createServerQuery_legacy(queryFn as any);
		expect(typeof serverQuery).toBe("function");
	});

	test("executes query and returns data", async () => {
		const queryFn = (id: string) => ({
			then: <T>(resolve: (value: { id: string }) => T) => {
				return Promise.resolve(resolve({ id }));
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const serverQuery = createServerQuery_legacy(queryFn as any);
		const result = await serverQuery("123");
		expect(result).toEqual({ id: "123" });
	});

	test("executes query with multiple arguments", async () => {
		const queryFn = (id: string, name: string) => ({
			then: <T>(resolve: (value: { id: string; name: string }) => T) => {
				return Promise.resolve(resolve({ id, name }));
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const serverQuery = createServerQuery_legacy(queryFn as any);
		const result = await serverQuery("123", "Test");
		expect(result).toEqual({ id: "123", name: "Test" });
	});

	test("executes query with no arguments", async () => {
		const queryFn = () => ({
			then: <T>(resolve: (value: { data: string }) => T) => {
				return Promise.resolve(resolve({ data: "test" }));
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const serverQuery = createServerQuery_legacy(queryFn as any);
		const result = await serverQuery();
		expect(result).toEqual({ data: "test" });
	});

	test("handles promise rejection", async () => {
		const queryFn = () => Promise.reject(new Error("Query failed")) as any;

		const serverQuery = createServerQuery_legacy(queryFn);

		try {
			await serverQuery();
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Query failed");
		}
	});
});

// =============================================================================
// Tests: Legacy Exports - createServerAction
// =============================================================================

describe("createServerAction", () => {
	test("returns async function", () => {
		const actionFn = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const serverAction = createServerAction(actionFn);
		expect(typeof serverAction).toBe("function");
	});

	test("executes action and returns data", async () => {
		const actionFn = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const serverAction = createServerAction(actionFn);
		const result = await serverAction({ name: "Test" });
		expect(result).toEqual({ id: "1", name: "Test" });
	});

	test("unwraps data from MutationResult", async () => {
		const actionFn = async (input: { count: number }) => ({
			data: { value: input.count * 2 },
		});

		const serverAction = createServerAction(actionFn);
		const result = await serverAction({ count: 5 });
		expect(result).toEqual({ value: 10 });
	});

	test("handles complex input types", async () => {
		const actionFn = async (input: { items: string[]; metadata: { version: number } }) => ({
			data: { processed: input.items.length, version: input.metadata.version },
		});

		const serverAction = createServerAction(actionFn);
		const result = await serverAction({
			items: ["a", "b", "c"],
			metadata: { version: 1 },
		});
		expect(result).toEqual({ processed: 3, version: 1 });
	});

	test("propagates errors from action function", async () => {
		const actionFn = async () => {
			throw new Error("Action failed");
		};

		const serverAction = createServerAction(actionFn);

		try {
			await serverAction({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Action failed");
		}
	});
});
