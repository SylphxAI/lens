/**
 * Tests for httpLink with polling support
 */

import { describe, expect, mock, test } from "bun:test";
import { httpLink } from "./http";
import { createOperationContext } from "./types";

describe("httpLink - Polling Support", () => {
	describe("Queries and Mutations", () => {
		test("queries use single HTTP POST", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1", name: "Alice" } }),
			})) as unknown as typeof fetch;

			const link = httpLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });
			const result = await linkFn(op, async () => ({ data: null }));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(result.data).toEqual({ id: "1", name: "Alice" });
		});

		test("mutations use single HTTP POST", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1", name: "Created" } }),
			})) as unknown as typeof fetch;

			const link = httpLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("mutation", "User", "create", {
				name: "Bob",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(result.data).toEqual({ id: "1", name: "Created" });
		});
	});

	describe("Subscriptions without polling", () => {
		test("returns error when polling disabled", async () => {
			const link = httpLink({ url: "http://localhost:3000/api" });
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			expect(result.error).toBeDefined();
			expect(result.error?.message).toContain("Subscriptions not supported");
			expect(result.error?.message).toContain("Enable polling");
		});
	});

	describe("Subscriptions with polling", () => {
		test("returns observable when polling enabled", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1", value: 1 } }),
			})) as unknown as typeof fetch;

			const link = httpLink({
				url: "http://localhost:3000/api",
				fetch: mockFetch,
				polling: { enabled: true, interval: 100 },
			});
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			// Should return observable in meta
			expect(result.data).toBe(null);
			expect(result.meta?.observable).toBeDefined();
			expect(typeof result.meta?.observable.subscribe).toBe("function");
		});

		test("polling observable emits values at interval", async () => {
			let callCount = 0;
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1", value: ++callCount } }),
			})) as unknown as typeof fetch;

			const link = httpLink({
				url: "http://localhost:3000/api",
				fetch: mockFetch,
				polling: { enabled: true, interval: 50 },
			});
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			const observable = result.meta?.observable as {
				subscribe: (obs: { next: (v: unknown) => void }) => { unsubscribe: () => void };
			};

			const values: unknown[] = [];
			const subscription = observable.subscribe({
				next: (value) => values.push(value),
				error: () => {},
				complete: () => {},
			});

			// Wait for multiple polls
			await new Promise((resolve) => setTimeout(resolve, 200));

			subscription.unsubscribe();

			// Should have polled multiple times
			expect(values.length).toBeGreaterThan(2);
			expect(mockFetch).toHaveBeenCalledTimes(values.length);
		});

		test("unsubscribe stops polling", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1" } }),
			})) as unknown as typeof fetch;

			const link = httpLink({
				url: "http://localhost:3000/api",
				fetch: mockFetch,
				polling: { enabled: true, interval: 50 },
			});
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			const observable = result.meta?.observable as {
				subscribe: (obs: { next: (v: unknown) => void }) => { unsubscribe: () => void };
			};

			const subscription = observable.subscribe({
				next: () => {},
				error: () => {},
				complete: () => {},
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			const callCountBeforeUnsubscribe = mockFetch.mock.calls.length;
			subscription.unsubscribe();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// No new calls after unsubscribe
			expect(mockFetch.mock.calls.length).toBe(callCountBeforeUnsubscribe);
		});

		test("converts subscription type to query for HTTP request", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1" } }),
			})) as unknown as typeof fetch;

			const link = httpLink({
				url: "http://localhost:3000/api",
				fetch: mockFetch,
				polling: { enabled: true, interval: 1000 },
			});
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});
			const result = await linkFn(op, async () => ({ data: null }));

			// Subscribe to trigger the initial fetch
			const observable = result.meta?.observable as {
				subscribe: (obs: { next: (v: unknown) => void }) => { unsubscribe: () => void };
			};

			const subscription = observable.subscribe({
				next: () => {},
				error: () => {},
				complete: () => {},
			});

			// Wait for initial fetch
			await new Promise((resolve) => setTimeout(resolve, 50));

			subscription.unsubscribe();

			// Check that subscription was converted to query in request body
			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.type).toBe("query");
		});
	});

	describe("Error Handling", () => {
		test("handles HTTP errors", async () => {
			const mockFetch = mock(async () => ({
				ok: false,
				status: 500,
				json: async () => ({ message: "Server error" }),
			})) as unknown as typeof fetch;

			const link = httpLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });
			const result = await linkFn(op, async () => ({ data: null }));

			expect(result.error).toBeDefined();
			expect(result.error?.message).toBe("Server error");
		});

		test("handles network errors", async () => {
			const mockFetch = mock(async () => {
				throw new Error("Network error");
			}) as unknown as typeof fetch;

			const link = httpLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });
			const result = await linkFn(op, async () => ({ data: null }));

			expect(result.error).toBeDefined();
			expect(result.error?.message).toBe("Network error");
		});
	});
});
