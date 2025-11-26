/**
 * Tests for @sylphx/lens-solidstart
 */

import { describe, expect, test } from "bun:test";
import {
	createLensMutation,
	createLensSolidStart,
	createServerAction,
	createServerQuery_legacy,
} from "./index";

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
});

describe("handler", () => {
	test("handles GET requests (queries)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.list", { method: "GET" }),
		});

		const data = await response.json();
		expect(data.data).toEqual([{ id: "1", name: "User 1" }]);
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

	test("returns 405 for unsupported methods", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const response = await lens.handler({
			request: new Request("http://localhost/api/lens/user.get", { method: "DELETE" }),
		});

		expect(response.status).toBe(405);
	});
});

describe("serverClient", () => {
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
});

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
});

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
});

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
});
