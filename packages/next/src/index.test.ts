/**
 * Tests for @sylphx/lens-next
 */

import { describe, expect, test } from "bun:test";
import {
	fetchQuery,
	prefetchQuery,
	dehydrate,
	type DehydratedState,
} from "./index";

describe("@sylphx/lens-next exports", () => {
	test("fetchQuery is exported", () => {
		expect(typeof fetchQuery).toBe("function");
	});

	test("prefetchQuery is exported", () => {
		expect(typeof prefetchQuery).toBe("function");
	});

	test("dehydrate is exported", () => {
		expect(typeof dehydrate).toBe("function");
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

describe("prefetchQuery", () => {
	test("returns async function", () => {
		const queryFn = () => ({
			then: (resolve: (value: string) => void) => {
				resolve("test");
				return Promise.resolve("test");
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const prefetched = prefetchQuery(queryFn as any);
		expect(typeof prefetched).toBe("function");
	});

	test("prefetched function executes query", async () => {
		const queryFn = () => ({
			then: <T>(resolve: (value: string) => T) => {
				const result = resolve("prefetched-data");
				return Promise.resolve(result);
			},
			subscribe: () => () => {},
			value: null,
			select: function () {
				return this;
			},
		});

		const prefetched = prefetchQuery(queryFn as any);
		const result = await prefetched();
		expect(result).toBe("prefetched-data");
	});
});
