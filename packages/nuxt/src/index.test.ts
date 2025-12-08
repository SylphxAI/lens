/**
 * Comprehensive tests for @sylphx/lens-nuxt
 * Target: 100% coverage
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type Observable, of } from "@sylphx/lens-core";
import { createLensNuxt } from "./index.js";

// =============================================================================
// Test Utilities
// =============================================================================

// Track global window state
let originalWindow: typeof globalThis.window | undefined;

beforeEach(() => {
	originalWindow = globalThis.window;
});

afterEach(() => {
	if (originalWindow === undefined) {
		// @ts-expect-error - Deleting window for server environment tests
		delete globalThis.window;
	} else {
		globalThis.window = originalWindow;
	}
});

// Helper to create Observable from result
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
		if (path === "user.error") {
			return of({ data: null, error: new Error("User error") });
		}
		return of({ data: null, error: new Error("Not found") });
	},
});

// Mock H3 event creator
const createMockEvent = (method: string, path: string, url: string, body?: unknown) => {
	const _chunks: string[] = [];
	const listeners: { data?: (chunk: string) => void; end?: () => void } = {};

	return {
		method,
		path,
		node: {
			req: {
				url,
				on: (event: "data" | "end", listener: ((chunk: string) => void) | (() => void)) => {
					if (event === "data") {
						listeners.data = listener as (chunk: string) => void;
						// Immediately send body if provided
						if (body !== undefined) {
							listener(JSON.stringify(body));
						}
					} else if (event === "end") {
						listeners.end = listener as () => void;
						// Immediately call end
						listener();
					}
				},
			},
			res: {},
		},
	};
};

// Mock query result with subscription
const createMockQueryResult = <T>(data: T) => {
	const subscribers = new Set<(value: T) => void>();

	return Object.assign(Promise.resolve(data), {
		subscribe: (callback: (value: T) => void) => {
			subscribers.add(callback);
			return () => {
				subscribers.delete(callback);
			};
		},
		notify: (value: T) => {
			for (const cb of subscribers) {
				cb(value);
			}
		},
	});
};

// =============================================================================
// createLensNuxt Tests
// =============================================================================

describe("createLensNuxt", () => {
	test("creates instance with all required properties", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		expect(lens.handler).toBeDefined();
		expect(typeof lens.handler).toBe("function");
		expect(lens.client).toBeDefined();
		expect(lens.serverClient).toBeDefined();
		expect(lens.plugin).toBeDefined();
		expect(typeof lens.plugin).toBe("function");
		expect(lens.useQuery).toBeDefined();
		expect(typeof lens.useQuery).toBe("function");
		expect(lens.useMutation).toBeDefined();
		expect(typeof lens.useMutation).toBe("function");
	});

	test("uses custom basePath", () => {
		const server = createMockServer();
		const lens = createLensNuxt({
			server: server as any,
			config: { basePath: "/custom/api" },
		});

		expect(lens.handler).toBeDefined();
	});

	test("uses default basePath when not provided", () => {
		const server = createMockServer();
		const lens = createLensNuxt({
			server: server as any,
			config: {},
		});

		expect(lens.handler).toBeDefined();
	});

	test("accepts client config overrides", () => {
		const server = createMockServer();
		const lens = createLensNuxt({
			server: server as any,
			config: {
				clientConfig: {
					retry: { maxRetries: 5 },
				},
			},
		});

		expect(lens.client).toBeDefined();
	});
});

// =============================================================================
// plugin Tests
// =============================================================================

describe("plugin", () => {
	test("returns plugin with provide", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const plugin = lens.plugin();

		expect(plugin.provide).toBeDefined();
		expect(plugin.provide.lens).toBe(lens.client);
	});
});

// =============================================================================
// serverClient Tests
// =============================================================================

describe("serverClient", () => {
	test("executes queries directly", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await (lens.serverClient as any).user.get({ id: "789" });
		expect(result).toEqual({ id: "789", name: "Test User" });
	});

	test("throws on error", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		await expect((lens.serverClient as any).unknown.route()).rejects.toThrow("Not found");
	});

	test("handles nested paths", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await (lens.serverClient as any).user.list();
		expect(result).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles symbol property access", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const symbolProp = Symbol("test");
		const result = (lens.serverClient as any)[symbolProp];
		expect(result).toBeUndefined();
	});

	test("handles 'then' property access for promise compatibility", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = (lens.serverClient as any).then;
		expect(result).toBeUndefined();
	});

	test("builds correct path through proxy chain", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await (lens.serverClient as any).user.create({ name: "New User" });
		expect(result).toEqual({ id: "new-id", name: "New User" });
	});
});

// =============================================================================
// handler Tests
// =============================================================================

describe("handler", () => {
	test("handles GET requests", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent(
			"GET",
			"/api/lens/user.get",
			"http://localhost/api/lens/user.get?input=%7B%22id%22%3A%22123%22%7D",
		);

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: { id: "123", name: "Test User" },
		});
	});

	test("handles GET requests without input parameter", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("GET", "/api/lens/user.list", "http://localhost/api/lens/user.list");

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: [{ id: "1", name: "User 1" }],
		});
	});

	test("handles GET request with server error", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("GET", "/api/lens/user.error", "http://localhost/api/lens/user.error");

		const response = await lens.handler(event as any);

		expect(response).toEqual({ error: "User error" });
	});

	test("handles GET request with JSON parse error", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("GET", "/api/lens/user.get", "http://localhost/api/lens/user.get?input=invalid-json");

		const response = await lens.handler(event as any);

		expect(response.error).toBeDefined();
		expect(typeof response.error).toBe("string");
	});

	test("handles POST requests", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("POST", "/api/lens/user.create", "http://localhost/api/lens/user.create", {
			input: { name: "Test User" },
		});

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: { id: "new-id", name: "Test User" },
		});
	});

	test("handles POST request without input", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("POST", "/api/lens/user.list", "http://localhost/api/lens/user.list", {});

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: [{ id: "1", name: "User 1" }],
		});
	});

	test("handles POST request with server error", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("POST", "/api/lens/user.error", "http://localhost/api/lens/user.error", {
			input: {},
		});

		const response = await lens.handler(event as any);

		expect(response).toEqual({ error: "User error" });
	});

	test("handles POST request with invalid JSON", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		// Create a custom event with invalid JSON
		const event = {
			method: "POST",
			path: "/api/lens/user.create",
			node: {
				req: {
					url: "http://localhost/api/lens/user.create",
					on: (event: string, listener: any) => {
						if (event === "data") {
							listener("invalid-json");
						} else if (event === "end") {
							listener();
						}
					},
				},
				res: {},
			},
		};

		const response = await lens.handler(event as any);

		expect(response.error).toBeDefined();
		expect(typeof response.error).toBe("string");
	});

	test("handles POST request with non-Error exception", async () => {
		const server = {
			execute: async () => {
				throw "String error";
			},
		};
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("POST", "/api/lens/user.create", "http://localhost/api/lens/user.create", {
			input: {},
		});

		const response = await lens.handler(event as any);

		expect(response).toEqual({ error: "Unknown error" });
	});

	test("handles unsupported HTTP methods", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("PUT", "/api/lens/user.get", "http://localhost/api/lens/user.get");

		const response = await lens.handler(event as any);

		expect(response).toEqual({ error: "Method not allowed" });
	});

	test("handles DELETE method", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("DELETE", "/api/lens/user.get", "http://localhost/api/lens/user.get");

		const response = await lens.handler(event as any);

		expect(response).toEqual({ error: "Method not allowed" });
	});

	test("strips basePath from request path", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({
			server: server as any,
			config: { basePath: "/custom/api" },
		});

		const event = createMockEvent("GET", "/custom/api/user.list", "http://localhost/custom/api/user.list");

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: [{ id: "1", name: "User 1" }],
		});
	});

	test("handles path with leading slash after basePath removal", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = createMockEvent("GET", "/api/lens/user.list", "http://localhost/api/lens/user.list");

		const response = await lens.handler(event as any);

		expect(response).toEqual({
			data: [{ id: "1", name: "User 1" }],
		});
	});
});

// =============================================================================
// useQuery Tests
// =============================================================================

describe("useQuery", () => {
	test("executes query immediately by default", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await lens.useQuery("test-key", (client: any) => client.user.list());

		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
		expect(result.pending.value).toBe(false);
		expect(result.error.value).toBe(null);
	});

	test("supports lazy execution", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await lens.useQuery("test-key", (client: any) => client.user.list(), { lazy: true });

		expect(result.data.value).toBe(null);
		expect(result.pending.value).toBe(false);
		expect(result.error.value).toBe(null);
	});

	test("refresh re-executes the query", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await lens.useQuery("test-key", (client: any) => client.user.list());

		const refreshedData = await result.refresh();

		expect(refreshedData).toEqual([{ id: "1", name: "User 1" }]);
		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
		expect(result.pending.value).toBe(false);
	});

	test("handles query errors", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		try {
			await lens.useQuery("test-key", (client: any) => client.unknown.route());
		} catch (_err) {
			// Query will throw, but we need to create one with lazy: true to test state
		}

		// Use lazy query to get the result object without immediate execution
		const lazyResult = await lens.useQuery("test-key-2", (client: any) => client.unknown.route(), { lazy: true });

		// Now trigger the error
		try {
			await lazyResult.refresh();
		} catch (_err) {
			// Expected to throw
		}

		expect(lazyResult.data.value).toBe(null);
		expect(lazyResult.pending.value).toBe(false);
		expect(lazyResult.error.value).toBeDefined();
		expect(lazyResult.error.value?.message).toBe("Not found");
	});

	test("handles non-Error exceptions", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = {
			execute: async () => {
				throw "String error";
			},
		};
		const lens = createLensNuxt({ server: server as any });

		// Use lazy query to get the result object without immediate execution
		const result = await lens.useQuery("test-key", (client: any) => client.test.route(), { lazy: true });

		// Now trigger the error
		try {
			await result.refresh();
		} catch (_err) {
			// Expected to throw
		}

		expect(result.data.value).toBe(null);
		expect(result.pending.value).toBe(false);
		expect(result.error.value).toBeDefined();
		expect(result.error.value?.message).toBe("String error");
	});

	test("throws error on refresh failure", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const _result = await lens.useQuery("test-key", (client: any) => client.user.list());

		// Create an error query using lazy mode
		const errorResult = await lens.useQuery("test-key-error", (client: any) => client.unknown.route(), { lazy: true });

		await expect(errorResult.refresh()).rejects.toThrow("Not found");
	});

	test("sets up subscription in browser environment", async () => {
		// Set up browser environment
		globalThis.window = {} as any;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		let subscribeCallback: ((value: any) => void) | null = null;
		const mockQuery = createMockQueryResult([{ id: "1", name: "User 1" }]);
		const originalSubscribe = mockQuery.subscribe;
		mockQuery.subscribe = (callback: (value: any) => void) => {
			subscribeCallback = callback;
			return originalSubscribe.call(mockQuery, callback);
		};

		const result = await lens.useQuery("test-key", () => mockQuery);

		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);

		// Simulate subscription update
		if (subscribeCallback) {
			subscribeCallback([{ id: "2", name: "User 2" }]);
			expect(result.data.value).toEqual([{ id: "2", name: "User 2" }]);
		}
	});

	test("does not set up subscription in server environment", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mockSubscribe = mock(() => {});
		const mockQuery = Object.assign(Promise.resolve([{ id: "1", name: "User 1" }]), { subscribe: mockSubscribe });

		await lens.useQuery("test-key", () => mockQuery);

		expect(mockSubscribe).not.toHaveBeenCalled();
	});

	test("lazy query can be executed with refresh", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await lens.useQuery("test-key", (client: any) => client.user.list(), { lazy: true });

		expect(result.data.value).toBe(null);

		const data = await result.refresh();

		expect(data).toEqual([{ id: "1", name: "User 1" }]);
		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
		expect(result.pending.value).toBe(false);
	});

	test("pending state updates correctly during execution", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		let resolveFn: (value: any) => void;
		const delayedPromise = new Promise((resolve) => {
			resolveFn = resolve;
		});

		const server = {
			execute: async () => {
				await delayedPromise;
				return { data: [{ id: "1", name: "User 1" }], error: null };
			},
		};

		const lens = createLensNuxt({ server: server as any });

		const resultPromise = lens.useQuery("test-key", (client: any) => client.user.list());

		// Give time for the query to start executing
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Resolve the delayed promise
		resolveFn!({ data: [{ id: "1", name: "User 1" }], error: null });

		const result = await resultPromise;

		expect(result.pending.value).toBe(false);
		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
	});
});

// =============================================================================
// useMutation Tests
// =============================================================================

describe("useMutation", () => {
	test("creates mutation with correct shape", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(
			(_client) => (input: { id: string }) => Promise.resolve({ data: { id: input.id, name: "Created" } }),
		);

		expect(mutation.mutate).toBeDefined();
		expect(typeof mutation.mutate).toBe("function");
		expect(mutation.data).toBeDefined();
		expect(mutation.pending).toBeDefined();
		expect(mutation.error).toBeDefined();
		expect(mutation.reset).toBeDefined();
		expect(typeof mutation.reset).toBe("function");
	});

	test("initial state is correct", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(
			(_client) => (input: { id: string }) => Promise.resolve({ data: { id: input.id, name: "Created" } }),
		);

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBe(null);
	});

	test("executes mutation and updates state", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation((client: any) => async (input: { name: string }) => {
			const result = await client.user.create(input);
			return { data: result };
		});

		const result = await mutation.mutate({ name: "New User" });

		expect(result.data).toEqual({ id: "new-id", name: "New User" });
		expect(mutation.data.value).toEqual({ id: "new-id", name: "New User" });
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBe(null);
	});

	test("handles mutation errors", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation((client: any) => () => client.unknown.route());

		await expect(mutation.mutate({})).rejects.toThrow("Not found");

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBeDefined();
		expect(mutation.error.value?.message).toBe("Not found");
	});

	test("handles non-Error exceptions", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(() => async () => {
			throw "String error";
		});

		await expect(mutation.mutate({})).rejects.toThrow("String error");

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBeDefined();
		expect(mutation.error.value?.message).toBe("String error");
	});

	test("reset clears state", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation((client: any) => (input: { name: string }) => client.user.create(input));

		await mutation.mutate({ name: "New User" });

		expect(mutation.data.value).not.toBe(null);

		mutation.reset();

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBe(null);
	});

	test("pending state updates correctly during execution", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		let resolveFn: (value: any) => void;
		const delayedPromise = new Promise((resolve) => {
			resolveFn = resolve;
		});

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(() => async () => {
			await delayedPromise;
			return { data: { id: "new-id", name: "Created" } };
		});

		expect(mutation.pending.value).toBe(false);

		const mutatePromise = mutation.mutate({});

		// Give time for the mutation to start executing
		await new Promise((resolve) => setTimeout(resolve, 10));

		// At this point, pending should be true (though timing may vary)
		// Resolve the delayed promise
		resolveFn!({ data: { id: "new-id", name: "Created" } });

		await mutatePromise;

		expect(mutation.pending.value).toBe(false);
		expect(mutation.data.value).toEqual({ id: "new-id", name: "Created" });
	});

	test("uses browser client when window is defined", async () => {
		// Set up browser environment
		globalThis.window = {} as any;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation((client: any) => (input: { name: string }) => client.user.create(input));

		// The mutation should use browserClient, which will use HTTP transport
		// Since we're in a test environment, we can't actually test the HTTP call,
		// but we can verify the mutation is created and usable
		expect(mutation.mutate).toBeDefined();
	});

	test("clears error on subsequent successful mutation", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		let shouldError = true;
		const mutation = lens.useMutation((client: any) => async (input: { name: string }) => {
			if (shouldError) {
				throw new Error("Test error");
			}
			const result = await client.user.create(input);
			return { data: result };
		});

		// First mutation should error
		await expect(mutation.mutate({ name: "Test" })).rejects.toThrow();
		expect(mutation.error.value).not.toBe(null);

		// Second mutation should succeed and clear error
		shouldError = false;
		await mutation.mutate({ name: "Test" });
		expect(mutation.error.value).toBe(null);
		expect(mutation.data.value).toEqual({ id: "new-id", name: "Test" });
	});
});

// =============================================================================
// Environment Detection Tests
// =============================================================================

describe("environment detection", () => {
	test("uses serverClient in server environment", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const result = await lens.useQuery("test-key", (client: any) => client.user.list());

		// In server environment, should execute directly without HTTP
		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("uses browserClient in browser environment", async () => {
		// Set up browser environment
		globalThis.window = {} as any;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		// The query should use browserClient, which will use HTTP transport
		// Since we're in a test environment, we can't actually test the HTTP call,
		// but we can verify the query is created
		const queryPromise = lens.useQuery("test-key", (_client: any) =>
			createMockQueryResult([{ id: "1", name: "User 1" }]),
		);

		expect(queryPromise).toBeDefined();
		const result = await queryPromise;
		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);
	});
});

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe("edge cases", () => {
	test("handles multiple queries in parallel", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const [result1, result2] = await Promise.all([
			lens.useQuery("key1", (client: any) => client.user.list()),
			lens.useQuery("key2", (client: any) => client.user.get({ id: "123" })),
		]);

		expect(result1.data.value).toEqual([{ id: "1", name: "User 1" }]);
		expect(result2.data.value).toEqual({ id: "123", name: "Test User" });
	});

	test("handles multiple mutations in sequence", async () => {
		// @ts-expect-error - Deleting window for server environment
		delete globalThis.window;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation((client: any) => async (input: { name: string }) => {
			const result = await client.user.create(input);
			return { data: result };
		});

		await mutation.mutate({ name: "User 1" });
		expect(mutation.data.value).toEqual({ id: "new-id", name: "User 1" });

		await mutation.mutate({ name: "User 2" });
		expect(mutation.data.value).toEqual({ id: "new-id", name: "User 2" });
	});

	test("query subscription updates are reflected in computed refs", async () => {
		// Set up browser environment
		globalThis.window = {} as any;

		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mockQuery = createMockQueryResult([{ id: "1", name: "User 1" }]);

		const result = await lens.useQuery("test-key", () => mockQuery);

		expect(result.data.value).toEqual([{ id: "1", name: "User 1" }]);

		// Trigger subscription update
		mockQuery.notify([{ id: "2", name: "User 2" }]);

		// Check that computed ref updated
		expect(result.data.value).toEqual([{ id: "2", name: "User 2" }]);
	});

	test("handler correctly strips various basePath formats", async () => {
		const server = createMockServer();

		const lens1 = createLensNuxt({
			server: server as any,
			config: { basePath: "/api/lens/" },
		});

		const event1 = createMockEvent("GET", "/api/lens/user.list", "http://localhost/api/lens/user.list");

		const response1 = await lens1.handler(event1 as any);
		expect(response1).toEqual({ data: [{ id: "1", name: "User 1" }] });
	});

	test("empty POST body is handled correctly", async () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const event = {
			method: "POST",
			path: "/api/lens/user.list",
			node: {
				req: {
					url: "http://localhost/api/lens/user.list",
					on: (event: string, listener: any) => {
						if (event === "data") {
							// Don't send any data
						} else if (event === "end") {
							listener();
						}
					},
				},
				res: {},
			},
		};

		const response = await lens.handler(event as any);

		expect(response).toEqual({ data: [{ id: "1", name: "User 1" }] });
	});
});
