/**
 * Tests for @sylphx/lens-nuxt
 */

import { describe, expect, test } from "bun:test";
import {
	useLensQuery,
	useLensMutation,
	createLensPlugin,
} from "./index";

describe("@sylphx/lens-nuxt exports", () => {
	test("useLensQuery is exported", () => {
		expect(typeof useLensQuery).toBe("function");
	});

	test("useLensMutation is exported", () => {
		expect(typeof useLensMutation).toBe("function");
	});

	test("createLensPlugin is exported", () => {
		expect(typeof createLensPlugin).toBe("function");
	});
});

describe("useLensMutation", () => {
	test("returns correct shape", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = useLensMutation(mockMutation);

		expect(typeof result.mutate).toBe("function");
		expect(result.data).toBeDefined();
		expect(result.pending).toBeDefined();
		expect(result.error).toBeDefined();
		expect(typeof result.reset).toBe("function");
	});

	test("initial state is correct", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = useLensMutation(mockMutation);

		expect(result.data.value).toBe(null);
		expect(result.pending.value).toBe(false);
		expect(result.error.value).toBe(null);
	});

	test("reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		});

		const result = useLensMutation(mockMutation);
		result.reset();

		expect(result.data.value).toBe(null);
		expect(result.pending.value).toBe(false);
		expect(result.error.value).toBe(null);
	});
});

describe("createLensPlugin", () => {
	test("returns plugin factory", () => {
		const clientFactory = () => ({ test: true });
		const plugin = createLensPlugin(clientFactory as any);

		expect(typeof plugin).toBe("function");
	});

	test("plugin provides client", () => {
		const mockClient = { user: { get: () => {} } };
		const clientFactory = () => mockClient;
		const plugin = createLensPlugin(clientFactory as any);

		const result = plugin();

		expect(result.provide).toBeDefined();
		expect(result.provide.lensClient).toBe(mockClient);
	});
});
