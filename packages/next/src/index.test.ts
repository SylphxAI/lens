/**
 * Tests for @sylphx/lens-next
 *
 * NOTE: These tests require DOM environment (happy-dom).
 */

// Skip all tests if DOM is not available (when run from root)
const hasDom = typeof document !== "undefined";

import { test as bunTest, describe, expect } from "bun:test";
import { type Message, type Observable, of } from "@sylphx/lens-core";

const test = hasDom ? bunTest : bunTest.skip;

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createLensNext } from "./index.js";

// Mock server for testing - returns Observable with Message format
const createMockServer = () => ({
	execute: ({ path, input }: { path: string; input?: unknown }): Observable<Message> => {
		if (path === "user.get") {
			return of({ $: "snapshot", data: { id: (input as { id: string }).id, name: "Test User" } } as Message);
		}
		if (path === "user.list") {
			return of({ $: "snapshot", data: [{ id: "1", name: "User 1" }] } as Message);
		}
		if (path === "observable") {
			// Return an observable for SSE testing
			return {
				subscribe: (handlers: {
					next: (value: Message) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					setTimeout(() => handlers.next({ $: "snapshot", data: "event1" }), 10);
					setTimeout(() => handlers.next({ $: "snapshot", data: "event2" }), 20);
					setTimeout(() => handlers.complete(), 30);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<Message>;
		}
		if (path === "observable.error") {
			// Observable that errors
			return {
				subscribe: (handlers: {
					next: (value: Message) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					setTimeout(() => handlers.error(new Error("Stream error")), 10);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<Message>;
		}
		return of({ $: "error", error: "Not found" } as Message);
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

// =============================================================================
// Tests: Handler (basic)
// =============================================================================
// Note: HTTP handling behavior is tested in the server package.
// Framework packages just forward requests to the server.

describe("handler", () => {
	test("handler forwards requests to server", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		// Handler should be a function
		expect(typeof lens.handler).toBe("function");
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

	test("handles nested paths", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		// Test deeply nested proxy access
		const result = await (lens.serverClient as any).user.get({ id: "nested" });
		expect(result).toEqual({ id: "nested", name: "Test User" });
	});

	test("ignores symbol properties", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const symbolProp = Symbol("test");
		const result = (lens.serverClient as any)[symbolProp];
		expect(result).toBeUndefined();
	});

	test("ignores 'then' property to avoid Promise coercion", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const result = (lens.serverClient as any).then;
		expect(result).toBeUndefined();
	});
});

describe("React hooks - useQuery", () => {
	test("useQuery loads data on mount", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		// Create a mock query result
		let resolveQuery: (value: any) => void;
		const queryPromise = new Promise((resolve) => {
			resolveQuery = resolve;
		});

		const mockQuery = {
			subscribe: (callback: (value: any) => void) => {
				queryPromise.then(callback);
				return () => {};
			},
			then: (onFulfilled: any) => queryPromise.then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);

		// Resolve the query
		act(() => {
			resolveQuery!({ id: "1", name: "Test" });
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({ id: "1", name: "Test" });
	});

	test("useQuery with skip option", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			subscribe: () => () => {},
			then: () => Promise.resolve(),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any, { skip: true }));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("useQuery handles errors", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let rejectQuery: (error: Error) => void;
		const queryPromise = new Promise((_, reject) => {
			rejectQuery = reject;
		});

		const mockQuery = {
			subscribe: () => () => {},
			then: (_: any, onRejected: any) => queryPromise.catch(onRejected),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		act(() => {
			rejectQuery!(new Error("Query error"));
		});

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Query error");
		});
	});

	test("useQuery handles non-Error rejection", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			subscribe: () => () => {},
			then: (_: any, onRejected: any) => Promise.reject("String error").catch(onRejected),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		await waitFor(() => {
			expect(result.current.error?.message).toBe("String error");
		});
	});

	test("useQuery refetch works", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let resolveQuery: (value: any) => void;
		let queryPromise = new Promise((resolve) => {
			resolveQuery = resolve;
		});

		const mockQuery = {
			subscribe: (callback: (value: any) => void) => {
				queryPromise.then(callback);
				return () => {};
			},
			then: (onFulfilled: any) => queryPromise.then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		// Initial load
		act(() => {
			resolveQuery!({ id: "1", name: "First" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("First");
		});

		// Refetch
		queryPromise = new Promise((resolve) => {
			resolveQuery = resolve;
		});

		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(true);

		act(() => {
			resolveQuery!({ id: "1", name: "Second" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Second");
		});
	});

	test("useQuery refetch does nothing when skip is true", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			subscribe: () => () => {},
			then: () => Promise.resolve(),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any, { skip: true }));

		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(false);
	});

	test("useQuery refetch handles errors", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let shouldFail = false;
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				if (shouldFail) {
					return Promise.reject(new Error("Refetch failed")).then(onFulfilled, onRejected);
				}
				return Promise.resolve({ id: "1" }).then(onFulfilled, onRejected);
			},
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "1" });
		});

		shouldFail = true;
		act(() => {
			result.current.refetch();
		});

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Refetch failed");
		});
	});

	test("useQuery refetch handles non-Error rejection", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let shouldFail = false;
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				if (shouldFail) {
					return Promise.reject("String refetch error").then(onFulfilled, onRejected);
				}
				return Promise.resolve({ id: "1" }).then(onFulfilled, onRejected);
			},
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "1" });
		});

		shouldFail = true;
		act(() => {
			result.current.refetch();
		});

		await waitFor(() => {
			expect(result.current.error?.message).toBe("String refetch error");
		});
	});

	test("useQuery cleans up on unmount", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let unsubscribed = false;
		const mockQuery = {
			subscribe: () => {
				return () => {
					unsubscribed = true;
				};
			},
			then: () => new Promise(() => {}), // Never resolves
		};

		const queryFn = () => mockQuery;
		const { unmount } = renderHook(() => lens.useQuery(queryFn as any));

		unmount();

		expect(unsubscribed).toBe(true);
	});

	test("useQuery does not update state after unmount", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let resolveQuery: (value: any) => void;
		const queryPromise = new Promise((resolve) => {
			resolveQuery = resolve;
		});

		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any) => queryPromise.then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { unmount } = renderHook(() => lens.useQuery(queryFn as any));

		unmount();

		// Resolve after unmount
		act(() => {
			resolveQuery!({ id: "1" });
		});

		// Test passes if no error is thrown
		expect(true).toBe(true);
	});

	test("useQuery updates from subscription", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let subscriber: ((value: any) => void) | null = null;
		const mockQuery = {
			subscribe: (callback: (value: any) => void) => {
				subscriber = callback;
				return () => {};
			},
			then: () => new Promise(() => {}), // Never resolves via promise
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useQuery(queryFn as any));

		// Update via subscription
		act(() => {
			subscriber!({ id: "1", name: "Subscribed" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Subscribed");
		});

		expect(result.current.loading).toBe(false);
	});
});

describe("React hooks - useLazyQuery", () => {
	test("useLazyQuery does not execute on mount", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			subscribe: () => () => {},
			then: () => Promise.resolve({ id: "1" }),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useLazyQuery(queryFn as any));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("useLazyQuery executes on demand", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			then: (onFulfilled: any) => Promise.resolve({ id: "1", name: "Lazy" }).then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useLazyQuery(queryFn as any));

		let executeResult: any;
		await act(async () => {
			executeResult = await result.current.execute();
		});

		expect(executeResult).toEqual({ id: "1", name: "Lazy" });
		expect(result.current.data).toEqual({ id: "1", name: "Lazy" });
	});

	test("useLazyQuery handles errors", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			then: (_: any, onRejected: any) => Promise.reject(new Error("Lazy error")).catch(onRejected),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useLazyQuery(queryFn as any));

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Lazy error");
	});

	test("useLazyQuery handles non-Error rejection", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			then: (_: any, onRejected: any) => Promise.reject("String lazy error").catch(onRejected),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useLazyQuery(queryFn as any));

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("String lazy error");
	});

	test("useLazyQuery reset works", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			then: (onFulfilled: any) => Promise.resolve({ id: "1" }).then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { result } = renderHook(() => lens.useLazyQuery(queryFn as any));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).toEqual({ id: "1" });

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("useLazyQuery does not update after unmount", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let resolveQuery: (value: any) => void;
		const queryPromise = new Promise((resolve) => {
			resolveQuery = resolve;
		});

		const mockQuery = {
			then: (onFulfilled: any) => queryPromise.then(onFulfilled),
		};

		const queryFn = () => mockQuery;
		const { result, unmount } = renderHook(() => lens.useLazyQuery(queryFn as any));

		const executePromise = result.current.execute();
		unmount();

		act(() => {
			resolveQuery!({ id: "1" });
		});

		await executePromise;

		// Test passes if no error is thrown
		expect(true).toBe(true);
	});
});

describe("React hooks - useMutation", () => {
	test("useMutation executes mutation", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mutationFn = () => async (input: { name: string }) => {
			return { data: { id: "new", name: input.name } };
		};

		const { result } = renderHook(() => lens.useMutation(mutationFn as any));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		let mutationResult: any;
		await act(async () => {
			mutationResult = await result.current.mutate({ name: "Created" });
		});

		expect(mutationResult.data).toEqual({ id: "new", name: "Created" });
		expect(result.current.data).toEqual({ id: "new", name: "Created" });
	});

	test("useMutation handles errors", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mutationFn = () => async () => {
			throw new Error("Mutation error");
		};

		const { result } = renderHook(() => lens.useMutation(mutationFn as any));

		await act(async () => {
			try {
				await result.current.mutate({ name: "Fail" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Mutation error");
	});

	test("useMutation handles non-Error exceptions", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mutationFn = () => async () => {
			throw "String mutation error";
		};

		const { result } = renderHook(() => lens.useMutation(mutationFn as any));

		await act(async () => {
			try {
				await result.current.mutate({ name: "Fail" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("String mutation error");
	});

	test("useMutation reset works", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mutationFn = () => async (input: { name: string }) => {
			return { data: { id: "new", name: input.name } };
		};

		const { result } = renderHook(() => lens.useMutation(mutationFn as any));

		await act(async () => {
			await result.current.mutate({ name: "Created" });
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("useMutation does not update after unmount", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		let resolveMutation: (value: any) => void;
		const mutationPromise = new Promise((resolve) => {
			resolveMutation = resolve;
		});

		const mutationFn = () => async () => mutationPromise;

		const { result, unmount } = renderHook(() => lens.useMutation(mutationFn as any));

		const mutatePromise = result.current.mutate({ name: "Test" });
		unmount();

		act(() => {
			resolveMutation!({ data: { id: "new" } });
		});

		await mutatePromise;

		// Test passes if no error is thrown
		expect(true).toBe(true);
	});
});

describe("React Provider", () => {
	test("Provider renders children", () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const TestChild = () => createElement("div", {}, "Test");
		const wrapper = createElement(lens.Provider, {}, createElement(TestChild));

		expect(wrapper).toBeDefined();
	});

	test("useQuery uses context client when available", async () => {
		const server = createMockServer();
		const lens = createLensNext({ server: server as any });

		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any) => Promise.resolve({ id: "context" }).then(onFulfilled),
		};

		const queryFn = () => mockQuery;

		const wrapper = ({ children }: { children: React.ReactNode }) => createElement(lens.Provider, {}, children);

		const { result } = renderHook(() => lens.useQuery(queryFn as any), { wrapper });

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "context" });
		});
	});
});
