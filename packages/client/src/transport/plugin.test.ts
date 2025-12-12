/**
 * @sylphx/lens-client - Plugin Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { auth, cache, logger, type Plugin, retry, timeout } from "./plugin.js";
import type { Operation, Result } from "./types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createOperation(overrides: Partial<Operation> = {}): Operation {
	return {
		id: "test-1",
		path: "user.get",
		type: "query",
		input: { id: "123" },
		...overrides,
	};
}

// =============================================================================
// Tests: logger plugin
// =============================================================================

describe("logger plugin", () => {
	it("has correct name", () => {
		const plugin = logger();
		expect(plugin.name).toBe("logger");
	});

	it("logs before request", () => {
		const logFn = mock(() => {});
		const plugin = logger({ logger: logFn });
		const op = createOperation();

		plugin.beforeRequest!(op);

		expect(logFn).toHaveBeenCalledWith("info", "→ [query] user.get", { id: "123" });
	});

	it("logs after successful response", () => {
		const logFn = mock(() => {});
		const plugin = logger({ logger: logFn });
		const op = createOperation();
		const result: Result = { $: "snapshot", data: { name: "John" } };

		plugin.afterResponse!(result, op);

		expect(logFn).toHaveBeenCalledWith("info", "← [query] user.get", { name: "John" });
	});

	it("logs errors at error level", () => {
		const logFn = mock(() => {});
		const plugin = logger({ logger: logFn });
		const op = createOperation();
		const result: Result = { $: "error", error: "Not found" };

		plugin.afterResponse!(result, op);

		expect(logFn).toHaveBeenCalledWith("error", "← [query] user.get ERROR:", "Not found");
	});

	it("respects level option", () => {
		const logFn = mock(() => {});
		const plugin = logger({ level: "debug", logger: logFn });
		const op = createOperation();

		plugin.beforeRequest!(op);

		expect(logFn).toHaveBeenCalledWith("debug", expect.any(String), expect.anything());
	});

	it("can be disabled", () => {
		const logFn = mock(() => {});
		const plugin = logger({ enabled: false, logger: logFn });
		const op = createOperation();

		plugin.beforeRequest!(op);
		plugin.afterResponse!({ $: "snapshot", data: {} }, op);

		expect(logFn).not.toHaveBeenCalled();
	});

	it("returns operation unchanged from beforeRequest", () => {
		const plugin = logger();
		const op = createOperation();

		const result = plugin.beforeRequest!(op);

		expect(result).toBe(op);
	});

	it("returns result unchanged from afterResponse", () => {
		const plugin = logger();
		const op = createOperation();
		const result: Result = { $: "snapshot", data: { test: true } };

		const returned = plugin.afterResponse!(result, op);

		expect(returned).toBe(result);
	});
});

// =============================================================================
// Tests: auth plugin
// =============================================================================

describe("auth plugin", () => {
	it("has correct name", () => {
		const plugin = auth({ getToken: () => "token" });
		expect(plugin.name).toBe("auth");
	});

	it("adds authorization header", async () => {
		const plugin = auth({ getToken: () => "my-token" });
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			Authorization: "Bearer my-token",
		});
	});

	it("supports async getToken", async () => {
		const plugin = auth({ getToken: async () => "async-token" });
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			Authorization: "Bearer async-token",
		});
	});

	it("supports custom header name", async () => {
		const plugin = auth({
			getToken: () => "token",
			headerName: "X-API-Key",
		});
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			"X-API-Key": "Bearer token",
		});
	});

	it("supports custom prefix", async () => {
		const plugin = auth({
			getToken: () => "token",
			prefix: "Token",
		});
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			Authorization: "Token token",
		});
	});

	it("supports no prefix", async () => {
		const plugin = auth({
			getToken: () => "api-key-123",
			prefix: "",
		});
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			Authorization: "api-key-123",
		});
	});

	it("does not add header if token is empty", async () => {
		const plugin = auth({ getToken: () => "" });
		const op = createOperation();

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toBeUndefined();
	});

	it("preserves existing headers", async () => {
		const plugin = auth({ getToken: () => "token" });
		const op = createOperation({
			meta: { headers: { "X-Custom": "value" } },
		});

		const result = await plugin.beforeRequest!(op);

		expect(result.meta?.headers).toEqual({
			"X-Custom": "value",
			Authorization: "Bearer token",
		});
	});
});

// =============================================================================
// Tests: retry plugin
// =============================================================================

describe("retry plugin", () => {
	it("has correct name", () => {
		const plugin = retry();
		expect(plugin.name).toBe("retry");
	});

	it("retries on error", async () => {
		const plugin = retry({ attempts: 3, delay: 10 });
		const op = createOperation();
		const retryFn = mock(async () => ({ data: { success: true } }));

		const result = await plugin.onError!(new Error("First fail"), op, retryFn);

		expect(retryFn).toHaveBeenCalledTimes(1);
		expect(result.data).toEqual({ success: true });
	});

	it("tracks retry count in meta", async () => {
		const plugin = retry({ attempts: 3, delay: 10 });
		const op = createOperation();
		const retryFn = mock(async () => ({ data: {} }));

		await plugin.onError!(new Error("Fail"), op, retryFn);

		expect(op.meta?.retryCount).toBe(1);
	});

	it("throws after max attempts", async () => {
		const plugin = retry({ attempts: 2, delay: 10 });
		const op = createOperation({ meta: { retryCount: 2 } }); // Already retried twice
		const retryFn = mock(async () => ({ data: {} }));

		await expect(plugin.onError!(new Error("Still failing"), op, retryFn)).rejects.toThrow("Still failing");
		expect(retryFn).not.toHaveBeenCalled();
	});

	it("respects shouldRetry function", async () => {
		const plugin = retry({
			attempts: 3,
			delay: 10,
			shouldRetry: (error) => error.message !== "Fatal",
		});
		const op = createOperation();
		const retryFn = mock(async () => ({ data: {} }));

		// Should retry for normal errors
		await plugin.onError!(new Error("Temporary"), op, retryFn);
		expect(retryFn).toHaveBeenCalledTimes(1);

		// Should not retry for "Fatal" errors
		const op2 = createOperation();
		await expect(plugin.onError!(new Error("Fatal"), op2, retryFn)).rejects.toThrow("Fatal");
	});

	it("uses exponential backoff by default", async () => {
		const plugin = retry({ attempts: 3, delay: 100, exponential: true });
		const op = createOperation();
		const retryFn = mock(async () => ({ data: {} }));

		const start = Date.now();
		await plugin.onError!(new Error("Fail"), op, retryFn);
		const elapsed = Date.now() - start;

		// First retry should wait ~100ms (delay * 2^0)
		expect(elapsed).toBeGreaterThanOrEqual(90);
		expect(elapsed).toBeLessThan(200);
	});

	it("uses linear delay when exponential is false", async () => {
		const plugin = retry({ attempts: 3, delay: 50, exponential: false });
		const op = createOperation({ meta: { retryCount: 1 } }); // Second retry
		const retryFn = mock(async () => ({ data: {} }));

		const start = Date.now();
		await plugin.onError!(new Error("Fail"), op, retryFn);
		const elapsed = Date.now() - start;

		// Should wait exactly ~50ms regardless of attempt
		expect(elapsed).toBeGreaterThanOrEqual(40);
		expect(elapsed).toBeLessThan(100);
	});
});

// =============================================================================
// Tests: cache plugin
// =============================================================================

describe("cache plugin", () => {
	it("has correct name", () => {
		const plugin = cache();
		expect(plugin.name).toBe("cache");
	});

	it("caches query responses", () => {
		const plugin = cache({ ttl: 60000 });
		const op = createOperation();
		const result: Result = { $: "snapshot", data: { name: "John" } };

		// First request - no cache
		const before1 = plugin.beforeRequest!(op) as Operation;
		expect(before1.meta?.cachedResult).toBeUndefined();

		// Store in cache
		plugin.afterResponse!(result, op);

		// Second request - should have cached result
		const before2 = plugin.beforeRequest!(op) as Operation;
		expect(before2.meta?.cachedResult).toEqual(result);
	});

	it("respects TTL", async () => {
		const plugin = cache({ ttl: 30 }); // 30ms TTL
		const op = createOperation();
		const result: Result = { $: "snapshot", data: { cached: true } };

		plugin.afterResponse!(result, op);

		// Immediate - should be cached
		const before1 = plugin.beforeRequest!(op) as Operation;
		expect(before1.meta?.cachedResult).toBeDefined();

		// Wait for TTL to expire
		await new Promise((r) => setTimeout(r, 50));

		// Create a fresh operation (same key but no cached meta)
		const freshOp = createOperation();
		const before2 = plugin.beforeRequest!(freshOp) as Operation;
		expect(before2.meta?.cachedResult).toBeUndefined();
	});

	it("does not cache mutations by default", () => {
		const plugin = cache();
		const op = createOperation({ type: "mutation" });
		const result: Result = { $: "snapshot", data: { id: "new" } };

		plugin.afterResponse!(result, op);

		const before = plugin.beforeRequest!(op) as Operation;
		expect(before.meta?.cachedResult).toBeUndefined();
	});

	it("can cache mutations when queriesOnly is false", () => {
		const plugin = cache({ queriesOnly: false });
		const op = createOperation({ type: "mutation" });
		const result: Result = { $: "snapshot", data: { id: "new" } };

		plugin.afterResponse!(result, op);

		const before = plugin.beforeRequest!(op) as Operation;
		expect(before.meta?.cachedResult).toEqual(result);
	});

	it("does not cache errors", () => {
		const plugin = cache();
		const op = createOperation();
		const result: Result = { $: "error", error: "Failed" };

		plugin.afterResponse!(result, op);

		const before = plugin.beforeRequest!(op) as Operation;
		expect(before.meta?.cachedResult).toBeUndefined();
	});

	it("uses custom key function", () => {
		const plugin = cache({
			key: (op) => op.path, // Only use path, ignore input
		});
		const op1 = createOperation({ input: { id: "1" } });
		const op2 = createOperation({ input: { id: "2" } }); // Different input, same path
		const result: Result = { $: "snapshot", data: { shared: true } };

		plugin.afterResponse!(result, op1);

		// op2 should hit cache because key only uses path
		const before = plugin.beforeRequest!(op2) as Operation;
		expect(before.meta?.cachedResult).toEqual(result);
	});

	it("different inputs have different cache keys by default", () => {
		const plugin = cache();
		const op1 = createOperation({ input: { id: "1" } });
		const op2 = createOperation({ input: { id: "2" } });
		const result: Result = { $: "snapshot", data: { id: "1" } };

		plugin.afterResponse!(result, op1);

		// op2 should not hit cache
		const before = plugin.beforeRequest!(op2) as Operation;
		expect(before.meta?.cachedResult).toBeUndefined();
	});
});

// =============================================================================
// Tests: timeout plugin
// =============================================================================

describe("timeout plugin", () => {
	it("has correct name", () => {
		const plugin = timeout({ ms: 5000 });
		expect(plugin.name).toBe("timeout");
	});

	it("sets timeout in operation meta", () => {
		const plugin = timeout({ ms: 3000 });
		const op = createOperation();

		const result = plugin.beforeRequest!(op) as Operation;

		expect(result.meta?.timeout).toBe(3000);
	});

	it("preserves existing meta", () => {
		const plugin = timeout({ ms: 5000 });
		const op = createOperation({
			meta: { custom: "value" },
		});

		const result = plugin.beforeRequest!(op) as Operation;

		expect(result.meta).toEqual({
			custom: "value",
			timeout: 5000,
		});
	});
});

// =============================================================================
// Tests: Plugin Composition
// =============================================================================

describe("Plugin composition", () => {
	it("plugins can be chained", async () => {
		const plugins: Plugin[] = [auth({ getToken: () => "token" }), timeout({ ms: 5000 }), logger({ enabled: false })];

		let op = createOperation();

		for (const plugin of plugins) {
			if (plugin.beforeRequest) {
				op = await plugin.beforeRequest(op);
			}
		}

		expect(op.meta?.headers).toEqual({ Authorization: "Bearer token" });
		expect(op.meta?.timeout).toBe(5000);
	});

	it("plugins modify operation in order", async () => {
		const order: string[] = [];

		const plugin1: Plugin = {
			name: "first",
			beforeRequest: (op) => {
				order.push("first");
				return op;
			},
		};

		const plugin2: Plugin = {
			name: "second",
			beforeRequest: (op) => {
				order.push("second");
				return op;
			},
		};

		let op = createOperation();
		op = await plugin1.beforeRequest!(op);
		op = await plugin2.beforeRequest!(op);

		expect(order).toEqual(["first", "second"]);
	});
});
