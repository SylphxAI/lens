/**
 * Tests for @sylphx/lens-nuxt
 */

import { describe, expect, test } from "bun:test";
import { createLensNuxt } from "./index";

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
});

describe("plugin", () => {
	test("returns plugin with provide", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const plugin = lens.plugin();

		expect(plugin.provide).toBeDefined();
		expect(plugin.provide.lens).toBe(lens.client);
	});
});

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
});

describe("useMutation composable factory", () => {
	test("creates mutation with correct shape", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(
			(client) => (input: { id: string }) =>
				Promise.resolve({ data: { id: input.id, name: "Created" } }),
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
			(client) => (input: { id: string }) =>
				Promise.resolve({ data: { id: input.id, name: "Created" } }),
		);

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBe(null);
	});

	test("reset clears state", () => {
		const server = createMockServer();
		const lens = createLensNuxt({ server: server as any });

		const mutation = lens.useMutation(
			(client) => (input: { id: string }) =>
				Promise.resolve({ data: { id: input.id, name: "Created" } }),
		);

		mutation.reset();

		expect(mutation.data.value).toBe(null);
		expect(mutation.pending.value).toBe(false);
		expect(mutation.error.value).toBe(null);
	});
});
