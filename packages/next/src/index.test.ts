/**
 * Tests for @sylphx/lens-next
 */

import { describe, expect, test } from "bun:test";
import { createLensNext, type DehydratedState, dehydrate, fetchQuery } from "./index";

// Mock server for testing
const createMockServer = () => ({
	execute: async ({ path, input }: { path: string; input?: unknown }) => {
		if (path === "user.get") {
			return { data: { id: (input as { id: string }).id, name: "Test User" }, error: null };
		}
		if (path === "user.list") {
			return { data: [{ id: "1", name: "User 1" }], error: null };
		}
		return { data: null, error: new Error("Not found") };
	},
});

describe("createLensNext", () => {
	test("creates instance with all required properties", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		expect(lens.handler).toBeDefined();
		expect(typeof lens.handler).toBe("function");
		expect(lens.client).toBeDefined();
		expect(lens.serverClient).toBeDefined();
		expect(lens.Provider).toBeDefined();
		expect(typeof lens.Provider).toBe("function");
		expect(lens.useQuery).toBeDefined();
		expect(typeof lens.useQuery).toBe("function");
		expect(lens.useLazyQuery).toBeDefined();
		expect(typeof lens.useLazyQuery).toBe("function");
		expect(lens.useMutation).toBeDefined();
		expect(typeof lens.useMutation).toBe("function");
	});

	test("uses custom basePath", () => {
		const server = createMockServer();
		const lens = createLensNext({
			server: server as any,
			config: { basePath: "/custom/api" },
		});

		expect(lens.handler).toBeDefined();
	});
});

describe("handler", () => {
	test("handles GET requests (queries)", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const request = new Request("http://localhost/api/lens/user.list", {
			method: "GET",
		});

		const response = await lens.handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.data).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles GET requests with input", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const request = new Request(
			`http://localhost/api/lens/user.get?input=${encodeURIComponent(JSON.stringify({ id: "123" }))}`,
			{ method: "GET" },
		);

		const response = await lens.handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.data).toEqual({ id: "123", name: "Test User" });
	});

	test("handles POST requests (mutations)", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const request = new Request("http://localhost/api/lens/user.get", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ input: { id: "456" } }),
		});

		const response = await lens.handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.data).toEqual({ id: "456", name: "Test User" });
	});

	test("returns 405 for unsupported methods", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const request = new Request("http://localhost/api/lens/user.get", {
			method: "DELETE",
		});

		const response = await lens.handler(request);
		expect(response.status).toBe(405);
	});
});

describe("dehydrate", () => {
	test("creates DehydratedState with correct shape", () => {
		const data = { user: { id: "1", name: "Test" } };
		const state = dehydrate(data);

		expect(state.queries).toEqual(data);
		expect(typeof state.timestamp).toBe("number");
		expect(state.timestamp).toBeGreaterThan(0);
	});

	test("DehydratedState type is correct", () => {
		const state: DehydratedState = {
			queries: { key: "value" },
			timestamp: Date.now(),
		};

		expect(state.queries).toBeDefined();
		expect(state.timestamp).toBeDefined();
	});
});

describe("fetchQuery", () => {
	test("resolves query promise", async () => {
		const mockQuery = {
			then: (resolve: (value: string) => void) => {
				resolve("test-data");
				return Promise.resolve("test-data");
			},
			subscribe: () => () => {},
			value: null,
			select: () => mockQuery,
		};

		const result = await fetchQuery(mockQuery as any);
		expect(result).toBe("test-data");
	});
});

describe("serverClient", () => {
	test("executes queries directly", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		// The serverClient is a proxy that executes directly
		const result = await (lens.serverClient as any).user.get({ id: "789" });
		expect(result).toEqual({ id: "789", name: "Test User" });
	});

	test("throws on error", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		await expect((lens.serverClient as any).unknown.route()).rejects.toThrow("Not found");
	});
});
