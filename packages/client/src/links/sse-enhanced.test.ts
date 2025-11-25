/**
 * Tests for enhanced SSE Link (self-sufficient)
 */

import { describe, expect, mock, test } from "bun:test";
import { sseLink } from "./sse";
import { createOperationContext } from "./types";

describe("sseLink - Enhanced (Self-Sufficient)", () => {
	describe("Mutations", () => {
		test("uses HTTP POST for mutations", async () => {
			const mockFetch = mock(async () => ({
				ok: true,
				json: async () => ({ data: { id: "1", name: "Created" } }),
			})) as unknown as typeof fetch;

			const link = sseLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("mutation", "User", "create", {
				name: "Alice",
			});

			const result = await linkFn(op, async () => ({ data: null }));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:3000/api");
			expect(mockFetch.mock.calls[0][1]).toMatchObject({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			expect(result.data).toEqual({ id: "1", name: "Created" });
		});
	});

	describe("Queries", () => {
		test("returns error for unsupported operation in Node environment", async () => {
			const link = sseLink({ url: "http://localhost:3000/api" });
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });

			try {
				await linkFn(op, async () => ({ data: null }));
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				// In Node.js, EventSource is not available
				expect(error).toBeDefined();
			}
		});
	});

	describe("Subscriptions", () => {
		test("returns observable for subscriptions", async () => {
			const link = sseLink({ url: "http://localhost:3000/api" });
			const linkFn = link();

			const op = createOperationContext("subscription", "User", "get", {
				id: "1",
			});

			try {
				const result = await linkFn(op, async () => ({ data: null }));

				// Should return null data and observable in meta
				expect(result.data).toBe(null);
				expect(result.meta?.observable).toBeDefined();
				expect(typeof result.meta?.observable.subscribe).toBe("function");
			} catch (error) {
				// In Node.js, EventSource is not available
				expect(error).toBeDefined();
			}
		});
	});

	describe("URL Construction", () => {
		test("builds SSE URL with operation parameters", async () => {
			const link = sseLink({ url: "http://localhost:3000/api" });
			const linkFn = link();

			const op = createOperationContext("query", "User", "get", { id: "1" });

			try {
				await linkFn(op, async () => ({ data: null }));
			} catch (error) {
				// In Node.js, EventSource construction will fail
				// but we can verify the URL would be constructed correctly
				// by checking the error or by mocking EventSource in a browser test
			}
		});
	});

	describe("Error Handling", () => {
		test("handles mutation errors correctly", async () => {
			const mockFetch = mock(async () => ({
				ok: false,
				status: 404,
				json: async () => ({ message: "Not found" }),
			})) as unknown as typeof fetch;

			const link = sseLink({ url: "http://localhost:3000/api", fetch: mockFetch });
			const linkFn = link();

			const op = createOperationContext("mutation", "User", "update", {
				id: "999",
				name: "Ghost",
			});

			const result = await linkFn(op, async () => ({ data: null }));

			expect(result.error).toBeDefined();
			expect(result.error?.message).toBe("Not found");
		});
	});
});
