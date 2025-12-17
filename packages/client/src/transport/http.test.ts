/**
 * @sylphx/lens-client - HTTP Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { isSnapshot } from "@sylphx/lens-core";
import type { LensServerInterface } from "./http.js";
import { http } from "./http.js";
import type { Metadata, Observable, Operation, Result } from "./types.js";

// =============================================================================
// Mock Fetch
// =============================================================================

function createMockFetch(responses: Map<string, Response | (() => Response | Promise<Response>)>) {
	return mock(async (url: string, _init?: RequestInit) => {
		const handler = responses.get(url) ?? responses.get("*");
		if (!handler) {
			return new Response("Not Found", { status: 404 });
		}
		return typeof handler === "function" ? handler() : handler;
	}) as unknown as typeof fetch;
}

// =============================================================================
// Tests: http() transport
// =============================================================================

describe("http transport", () => {
	describe("connect()", () => {
		it("fetches metadata from /__lens/metadata", async () => {
			const mockFetch = createMockFetch(
				new Map([
					[
						"/api/__lens/metadata",
						Response.json({
							version: "1.0.0",
							operations: { "user.get": { type: "query" } },
						}),
					],
				]),
			);

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const metadata = await transport.connect();

			expect(mockFetch).toHaveBeenCalledWith("/api/__lens/metadata", expect.anything());
			expect(metadata.version).toBe("1.0.0");
			expect(metadata.operations["user.get"]).toBeDefined();
		});

		it("normalizes trailing slash in URL", async () => {
			const mockFetch = createMockFetch(
				new Map([["/api/__lens/metadata", Response.json({ version: "1.0.0", operations: {} })]]),
			);

			const transport = http({
				url: "/api/",
				fetch: mockFetch,
			});

			await transport.connect();

			expect(mockFetch).toHaveBeenCalledWith("/api/__lens/metadata", expect.anything());
		});

		it("includes default headers", async () => {
			let capturedHeaders: Headers | undefined;
			const mockFetch = mock(async (_url: string, init?: RequestInit) => {
				capturedHeaders = new Headers(init?.headers);
				return Response.json({ version: "1.0.0", operations: {} });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				headers: { "X-Custom": "value" },
				fetch: mockFetch,
			});

			await transport.connect();

			expect(capturedHeaders?.get("X-Custom")).toBe("value");
			expect(capturedHeaders?.get("Accept")).toBe("application/json");
		});

		it("throws on non-ok response", async () => {
			const mockFetch = createMockFetch(
				new Map([["/api/__lens/metadata", new Response("Forbidden", { status: 403 })]]),
			);

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			await expect(transport.connect()).rejects.toThrow("Failed to connect: 403");
		});
	});

	describe("query() - queries", () => {
		it("sends POST request with operation data", async () => {
			let capturedBody: unknown;
			const mockFetch = mock(async (_url: string, init?: RequestInit) => {
				capturedBody = JSON.parse(init?.body as string);
				return Response.json({ data: { id: "1", name: "John" } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			await transport.query({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			});

			expect(capturedBody).toEqual({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			});
		});

		it("returns data on success", async () => {
			const mockFetch = createMockFetch(new Map([["*", Response.json({ data: { name: "John" } })]]));

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = (await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.data).toEqual({ name: "John" });
		});

		it("returns error on non-ok response", async () => {
			const mockFetch = createMockFetch(new Map([["*", new Response("Internal Error", { status: 500 })]]));

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = (await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.$).toBe("error");
			expect((result as { $: "error"; error: string }).error).toContain("500");
		});

		it("returns error on network failure", async () => {
			const mockFetch = mock(async () => {
				throw new Error("Network error");
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = (await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.$).toBe("error");
			expect((result as { $: "error"; error: string }).error).toBe("Network error");
		});

		it("includes operation meta headers", async () => {
			let capturedHeaders: Headers | undefined;
			const mockFetch = mock(async (_url: string, init?: RequestInit) => {
				capturedHeaders = new Headers(init?.headers);
				return Response.json({ data: {} });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
				meta: { headers: { Authorization: "Bearer token" } },
			});

			expect(capturedHeaders?.get("Authorization")).toBe("Bearer token");
		});

		it("supports timeout via meta", async () => {
			const mockFetch = mock(async (_url: string, init?: RequestInit) => {
				// Simulate slow response - check if abort signal fires
				const abortSignal = init?.signal;
				return new Promise<Response>((resolve, reject) => {
					const timeoutId = setTimeout(() => {
						resolve(Response.json({ data: {} }));
					}, 200);

					if (abortSignal) {
						abortSignal.addEventListener("abort", () => {
							clearTimeout(timeoutId);
							const error = new Error("Aborted");
							error.name = "AbortError";
							reject(error);
						});
					}
				});
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = (await transport.query({
				id: "1",
				path: "user.get",
				type: "query",
				meta: { timeout: 50 }, // 50ms timeout
			})) as Result;

			expect(result.$).toBe("error");
			expect((result as { $: "error"; error: string }).error).toBe("Request timeout");
		});

		it("clears timeout when request completes successfully before timeout", async () => {
			let timeoutCleared = false;
			const mockFetch = mock(async (_url: string, _init?: RequestInit) => {
				// Fast response that completes before timeout
				return Response.json({ data: { success: true } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			// Spy on clearTimeout to verify it's called
			const originalClearTimeout = globalThis.clearTimeout;
			globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
				timeoutCleared = true;
				return originalClearTimeout(id);
			}) as typeof clearTimeout;

			try {
				const result = (await transport.query({
					id: "1",
					path: "user.get",
					type: "query",
					meta: { timeout: 5000 }, // Long timeout - request completes first
				})) as Result;

				expect(result.data).toEqual({ success: true });
				expect(timeoutCleared).toBe(true);
			} finally {
				globalThis.clearTimeout = originalClearTimeout;
			}
		});
	});

	describe("subscription() - subscriptions (polling)", () => {
		it("returns observable for subscription", () => {
			const mockFetch = createMockFetch(new Map([["*", Response.json({ data: {} })]]));

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = transport.subscription({
				id: "1",
				path: "counter.watch",
				type: "subscription",
			});

			expect(result).toHaveProperty("subscribe");
		});

		it("polls at configured interval", async () => {
			let callCount = 0;
			const mockFetch = mock(async () => {
				callCount++;
				// Use new Message format
				return Response.json({ $: "snapshot", data: { count: callCount } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 50 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: number[] = [];
			const sub = observable.subscribe({
				next: (r) => {
					if (isSnapshot(r)) {
						values.push((r.data as { count: number }).count);
					}
				},
			});

			// Wait for a few polls
			await new Promise((r) => setTimeout(r, 130));
			sub.unsubscribe();

			expect(values.length).toBeGreaterThanOrEqual(2);
		});

		it("only emits on value change", async () => {
			let callCount = 0;
			const mockFetch = mock(async () => {
				callCount++;
				// Return same value for first 2 calls, then different
				// Use new Message format with $ discriminator
				return Response.json({ $: "snapshot", data: { value: callCount > 2 ? "changed" : "same" } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 30 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: string[] = [];
			const sub = observable.subscribe({
				next: (r) => {
					if (isSnapshot(r)) {
						values.push((r.data as { value: string }).value);
					}
				},
			});

			await new Promise((r) => setTimeout(r, 150));
			sub.unsubscribe();

			// Should only emit when value changes: "same", then "changed"
			expect(values).toEqual(["same", "changed"]);
		});

		it("stops polling on unsubscribe", async () => {
			let callCount = 0;
			const mockFetch = mock(async () => {
				callCount++;
				// Use new Message format
				return Response.json({ $: "snapshot", data: { count: callCount } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const sub = observable.subscribe({});

			await new Promise((r) => setTimeout(r, 60));
			const countAtUnsubscribe = callCount;
			sub.unsubscribe();

			await new Promise((r) => setTimeout(r, 60));

			// Should not have increased significantly after unsubscribe
			expect(callCount).toBeLessThanOrEqual(countAtUnsubscribe + 1);
		});

		it("retries on error up to maxRetries", async () => {
			let callCount = 0;
			const mockFetch = mock(async () => {
				callCount++;
				if (callCount <= 3) {
					return new Response("Error", { status: 500 });
				}
				// Use new Message format
				return Response.json({ $: "snapshot", data: { success: true } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20, maxRetries: 3 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: unknown[] = [];
			const errors: Error[] = [];

			observable.subscribe({
				next: (r) => {
					if (isSnapshot(r)) {
						values.push(r.data);
					}
				},
				error: (e) => errors.push(e),
			});

			await new Promise((r) => setTimeout(r, 150));

			// Should recover after retries and emit success
			expect(values).toContainEqual({ success: true });
		});

		it("calls error observer after max retries", async () => {
			const mockFetch = mock(async () => {
				return new Response("Error", { status: 500 });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20, maxRetries: 2 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];

			observable.subscribe({
				error: (e) => errors.push(e),
			});

			await new Promise((r) => setTimeout(r, 150));

			expect(errors.length).toBe(1);
			expect(errors[0].message).toContain("500");
		});

		it("handles exception thrown during polling", async () => {
			const mockFetch = mock(async () => {
				throw new Error("Unexpected polling error");
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20, maxRetries: 3 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];

			observable.subscribe({
				error: (e) => errors.push(e),
			});

			await new Promise((r) => setTimeout(r, 100));

			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].message).toBe("Unexpected polling error");
		});

		it("does not call error observer after unsubscribe", async () => {
			const mockFetch = mock(async () => {
				throw new Error("Polling error");
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];
			const sub = observable.subscribe({
				error: (e) => errors.push(e),
			});

			// Unsubscribe immediately
			sub.unsubscribe();

			await new Promise((r) => setTimeout(r, 100));

			// Error observer should not be called after unsubscribe
			expect(errors.length).toBe(0);
		});

		it("handles non-serializable data in polling", async () => {
			// Create a mock response that returns data with circular reference
			// We need to bypass Response.json() and return the circular data directly
			const circularData: Record<string, unknown> = { name: "test" };
			circularData.self = circularData;

			const mockFetch = mock(async () => {
				return {
					ok: true,
					// Use new Message format with $ discriminator
					json: async () => ({ $: "snapshot", data: circularData }),
				} as Response;
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20 },
			});

			const observable = transport.subscription({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const errors: Error[] = [];

			observable.subscribe({
				error: (e) => errors.push(e),
			});

			await new Promise((r) => setTimeout(r, 100));

			// Should have caught the JSON.stringify error
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].message).toContain("cyclic");
		});
	});
});

// =============================================================================
// Tests: http.server() transport
// =============================================================================

describe("http.server transport", () => {
	/**
	 * Create a mock Observable that emits a single value and completes.
	 */
	const createMockObservable = <T>(getValue: () => T): Observable<Result> => ({
		subscribe: (observer) => {
			try {
				const value = getValue();
				observer.next?.({ $: "snapshot", data: value } as Result);
				observer.complete?.();
			} catch (error) {
				observer.error?.(error instanceof Error ? error : new Error(String(error)));
			}
			return { unsubscribe: () => {} };
		},
	});

	const createErrorObservable = (error: string): Observable<Result> => ({
		subscribe: (observer) => {
			observer.next?.({ $: "error", error } as Result);
			observer.complete?.();
			return { unsubscribe: () => {} };
		},
	});

	const createThrowingObservable = (error: Error): Observable<Result> => ({
		subscribe: (observer) => {
			observer.error?.(error);
			return { unsubscribe: () => {} };
		},
	});

	const createMockServer = (): LensServerInterface => ({
		getMetadata: () => ({
			version: "1.0.0",
			operations: {
				"user.get": { type: "query" },
				"user.update": { type: "mutation" },
			},
		}),
		execute: (op: Operation) => {
			if (op.path === "user.get") {
				return createMockObservable(() => ({ id: "123", name: "John" }));
			}
			if (op.path === "user.update") {
				return createMockObservable(() => ({ id: "123", name: "Updated" }));
			}
			if (op.path === "error.test") {
				return createThrowingObservable(new Error("Test server error"));
			}
			return createErrorObservable("Unknown operation");
		},
	});

	it("serves metadata at /__lens/metadata endpoint", async () => {
		const serverTransport = http.server({ port: 3456 });
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://localhost:3456/__lens/metadata");
		const metadata = (await response.json()) as Metadata;

		expect(response.status).toBe(200);
		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations["user.get"]).toBeDefined();
	});

	it("handles POST requests to operation endpoint with path prefix", async () => {
		const serverTransport = http.server({ port: 3457, path: "/api" });
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://localhost:3457/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: "op-1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			}),
		});

		expect(response.status).toBe(200);
		const result = (await response.json()) as Result;
		expect(result.data).toEqual({ id: "123", name: "John" });
	});

	it("handles path prefix configuration", async () => {
		const serverTransport = http.server({
			port: 3458,
			path: "/api",
		});
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const metadataResponse = await fetch("http://localhost:3458/api/__lens/metadata");
		expect(metadataResponse.status).toBe(200);

		const opResponse = await fetch("http://localhost:3458/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: "op-1",
				path: "user.get",
				type: "query",
			}),
		});
		expect(opResponse.status).toBe(200);
		const result = (await opResponse.json()) as Result;
		expect(result.data).toEqual({ id: "123", name: "John" });
	});

	it("handles trailing slash in path prefix", async () => {
		const serverTransport = http.server({
			port: 3459,
			path: "/api/",
		});
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://localhost:3459/api/__lens/metadata");
		expect(response.status).toBe(200);
	});

	it("uses custom hostname when provided", async () => {
		const serverTransport = http.server({
			port: 3460,
			hostname: "127.0.0.1",
		});
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://127.0.0.1:3460/__lens/metadata");
		expect(response.status).toBe(200);
	});

	it("returns 404 for unknown endpoints", async () => {
		const serverTransport = http.server({ port: 3461 });
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://localhost:3461/unknown");
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not Found");
	});

	it("handles server execution errors with 500 status", async () => {
		const serverTransport = http.server({ port: 3462, path: "/api" });
		const mockServer = createMockServer();

		serverTransport.listen(mockServer);
		await new Promise((r) => setTimeout(r, 100));

		const response = await fetch("http://localhost:3462/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: "op-1",
				path: "error.test",
				type: "query",
			}),
		});

		expect(response.status).toBe(500);
		const result = await response.json();
		expect(result.error).toBeDefined();
		expect(result.error.message).toBe("Test server error");
	});
});
