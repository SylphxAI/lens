/**
 * @sylphx/lens-client - HTTP Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { http } from "./http";
import type { Observable, Result } from "./types";

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

	describe("execute() - queries/mutations", () => {
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

			await transport.execute({
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

			const result = (await transport.execute({
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

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toContain("500");
		});

		it("returns error on network failure", async () => {
			const mockFetch = mock(async () => {
				throw new Error("Network error");
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe("Network error");
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

			await transport.execute({
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

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
				meta: { timeout: 50 }, // 50ms timeout
			})) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe("Request timeout");
		});
	});

	describe("execute() - subscriptions (polling)", () => {
		it("returns observable for subscription", () => {
			const mockFetch = createMockFetch(new Map([["*", Response.json({ data: {} })]]));

			const transport = http({
				url: "/api",
				fetch: mockFetch,
			});

			const result = transport.execute({
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
				return Response.json({ data: { count: callCount } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 50 },
			});

			const observable = transport.execute({
				id: "1",
				path: "counter.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: number[] = [];
			const sub = observable.subscribe({
				next: (r) => values.push((r.data as { count: number }).count),
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
				return Response.json({ data: { value: callCount > 2 ? "changed" : "same" } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 30 },
			});

			const observable = transport.execute({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: string[] = [];
			const sub = observable.subscribe({
				next: (r) => values.push((r.data as { value: string }).value),
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
				return Response.json({ data: { count: callCount } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20 },
			});

			const observable = transport.execute({
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
				return Response.json({ data: { success: true } });
			}) as unknown as typeof fetch;

			const transport = http({
				url: "/api",
				fetch: mockFetch,
				polling: { interval: 20, maxRetries: 3 },
			});

			const observable = transport.execute({
				id: "1",
				path: "data.watch",
				type: "subscription",
			}) as Observable<Result>;

			const values: unknown[] = [];
			const errors: Error[] = [];

			observable.subscribe({
				next: (r) => values.push(r.data),
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

			const observable = transport.execute({
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
	});
});
