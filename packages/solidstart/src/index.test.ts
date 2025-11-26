/**
 * Tests for @sylphx/lens-solidstart
 */

import { describe, expect, test } from "bun:test";
import {
	createLensQuery,
	createLensMutation,
	createServerQuery,
	createServerAction,
} from "./index";

describe("@sylphx/lens-solidstart exports", () => {
	test("createLensQuery is exported", () => {
		expect(typeof createLensQuery).toBe("function");
	});

	test("createLensMutation is exported", () => {
		expect(typeof createLensMutation).toBe("function");
	});

	test("createServerQuery is exported", () => {
		expect(typeof createServerQuery).toBe("function");
	});

	test("createServerAction is exported", () => {
		expect(typeof createServerAction).toBe("function");
	});
});

describe("createLensMutation", () => {
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

describe("createServerQuery", () => {
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

		const serverQuery = createServerQuery(queryFn as any);
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

		const serverQuery = createServerQuery(queryFn as any);
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
