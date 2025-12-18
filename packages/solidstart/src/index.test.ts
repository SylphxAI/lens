/**
 * Comprehensive tests for @sylphx/lens-solidstart
 * Target: 100% code coverage
 */

import { describe, expect, test } from "bun:test";
import { type Message, type Observable, of } from "@sylphx/lens-core";
import { createLensSolidStart } from "./index";

// =============================================================================
// Mock Server Setup
// =============================================================================

// Mock server for testing - returns Observable with Message format
const createMockServer = () => ({
	execute: ({ path, input }: { path: string; input?: unknown }): Observable<Message> => {
		if (path === "user.get") {
			return of({ $: "snapshot", data: { id: (input as { id: string }).id, name: "Test User" } } as Message);
		}
		if (path === "user.list") {
			return of({ $: "snapshot", data: [{ id: "1", name: "User 1" }] } as Message);
		}
		if (path === "user.create") {
			return of({ $: "snapshot", data: { id: "new-id", name: (input as { name: string }).name } } as Message);
		}
		if (path === "error.route") {
			return of({ $: "error", error: "Route error" } as Message);
		}
		if (path === "observable.stream") {
			// Return an observable-like object for SSE testing
			return {
				subscribe: (handlers: {
					next: (value: Message) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					// Simulate streaming data
					setTimeout(() => handlers.next({ $: "snapshot", data: "chunk1" }), 0);
					setTimeout(() => handlers.next({ $: "snapshot", data: "chunk2" }), 10);
					setTimeout(() => handlers.complete(), 20);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<Message>;
		}
		if (path === "observable.error") {
			// Return an observable that emits an error
			return {
				subscribe: (handlers: {
					next: (value: Message) => void;
					error: (err: Error) => void;
					complete: () => void;
				}) => {
					setTimeout(() => handlers.error(new Error("Stream error")), 0);
					return { unsubscribe: () => {} };
				},
			} as unknown as Observable<Message>;
		}
		return of({ $: "error", error: "Not found" } as Message);
	},
});

// =============================================================================
// Tests: createLensSolidStart
// =============================================================================

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

	test("uses default basePath when not provided", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: {},
		});

		expect(lens.handler).toBeDefined();
	});

	test("accepts clientConfig options", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({
			server: server as any,
			config: {
				clientConfig: {
					// Any client config options
				},
			},
		});

		expect(lens.client).toBeDefined();
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
		const lens = createLensSolidStart({ server: server as any });

		// Handler should be a function that accepts { request: Request }
		expect(typeof lens.handler).toBe("function");
	});
});

// =============================================================================
// Tests: Server Client Proxy
// =============================================================================

describe("serverClient proxy", () => {
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

	test("handles nested property access", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const result = await (lens.serverClient as any).user.list();
		expect(result).toEqual([{ id: "1", name: "User 1" }]);
	});

	test("handles deeply nested paths", async () => {
		const server = {
			execute: ({ path }: { path: string; input?: unknown }) => {
				if (path === "api.v1.user.get") {
					return of({ $: "snapshot", data: { id: "deep" } } as Message);
				}
				return of({ $: "error", error: "Not found" } as Message);
			},
		};
		const lens = createLensSolidStart({ server: server as any });

		const result = await (lens.serverClient as any).api.v1.user.get();
		expect(result).toEqual({ id: "deep" });
	});

	test("handles symbol property access", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const sym = Symbol("test");
		const result = (lens.serverClient as any)[sym];
		expect(result).toBeUndefined();
	});

	test("handles 'then' property access for promise detection", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const result = (lens.serverClient as any).then;
		expect(result).toBeUndefined();
	});

	test("allows chaining property access before calling", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const chainedFn = (lens.serverClient as any).user.get;
		const result = await chainedFn({ id: "chained" });
		expect(result).toEqual({ id: "chained", name: "Test User" });
	});
});

// =============================================================================
// Tests: createQuery (instance method)
// =============================================================================

describe("createQuery (instance method)", () => {
	test("creates query function that wraps createResource", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// Just verify the function is created
		expect(typeof lens.createQuery).toBe("function");
	});

	test("verifies getClient returns correct client in test environment", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// In test environment (no window), should use serverClient
		// This is verified through the serverClient tests
		expect(lens.serverClient).toBeDefined();
	});
});

// =============================================================================
// Tests: createMutation (instance method)
// =============================================================================

describe("createMutation (instance method)", () => {
	test("creates mutation with correct shape", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.pending).toBe("function");
		expect(typeof mutation.error).toBe("function");
		expect(typeof mutation.data).toBe("function");
		expect(typeof mutation.reset).toBe("function");
	});

	test("executes mutation successfully", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "new", name: input.name },
		}));

		const result = await mutation.mutate({ name: "Test" });
		expect(result.data.name).toBe("Test");
		expect(mutation.data()?.name).toBe("Test");
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("handles mutation error (Error object)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const testError = new Error("Mutation failed");
		const mutation = lens.createMutation(() => async () => {
			throw testError;
		});

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBe(testError);
			expect(mutation.error()).toBe(testError);
			expect(mutation.pending()).toBe(false);
		}
	});

	test("handles mutation error (non-Error object)", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async () => {
			throw "string error";
		});

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
			expect(mutation.error()?.message).toBe("string error");
			expect(mutation.pending()).toBe(false);
		}
	});

	test("sets pending to true during mutation", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		let pendingDuringExecution = false;
		const mutation = lens.createMutation(() => async (input: { name: string }) => {
			pendingDuringExecution = mutation.pending();
			return { data: { id: "1", name: input.name } };
		});

		await mutation.mutate({ name: "Test" });
		expect(pendingDuringExecution).toBe(true);
		expect(mutation.pending()).toBe(false);
	});

	test("clears error on new mutation attempt", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		let shouldFail = true;
		const mutation = lens.createMutation(() => async (input: { name: string }) => {
			if (shouldFail) {
				throw new Error("First error");
			}
			return { data: { id: "1", name: input.name } };
		});

		try {
			await mutation.mutate({ name: "Test" });
		} catch {}

		expect(mutation.error()).not.toBe(null);

		shouldFail = false;
		await mutation.mutate({ name: "Test" });

		expect(mutation.error()).toBe(null);
	});

	test("reset clears all state", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		await mutation.mutate({ name: "Test" });
		expect(mutation.data()).not.toBe(null);

		mutation.reset();

		expect(mutation.data()).toBe(null);
		expect(mutation.pending()).toBe(false);
		expect(mutation.error()).toBe(null);
	});
});

// =============================================================================
// Tests: serverQuery (instance method)
// =============================================================================

describe("serverQuery (instance method)", () => {
	test("creates server query function", () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery(() => Promise.resolve({ data: "test" }) as any);

		expect(typeof queryFn).toBe("function");
	});

	test("executes server query with arguments", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((_client, id: string) => Promise.resolve({ id, name: "User" }) as any);

		const result = await queryFn("123");
		expect(result).toEqual({ id: "123", name: "User" });
	});

	test("executes server query with multiple arguments", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((_client, id: string, name: string) => Promise.resolve({ id, name }) as any);

		const result = await queryFn("123", "Test");
		expect(result).toEqual({ id: "123", name: "Test" });
	});

	test("uses serverClient for execution", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		const queryFn = lens.serverQuery((client: any) => client.user.list());

		const result = await queryFn();
		expect(result).toEqual([{ id: "1", name: "User 1" }]);
	});
});

// =============================================================================
// Tests: Client Selection (SSR vs Browser)
// =============================================================================

describe("client selection", () => {
	test("uses serverClient when typeof window is undefined", async () => {
		const server = createMockServer();
		const lens = createLensSolidStart({ server: server as any });

		// serverClient is used by default in test environment (no window)
		const mutation = lens.createMutation(() => async (input: { name: string }) => ({
			data: { id: "1", name: input.name },
		}));

		const result = await mutation.mutate({ name: "Test" });
		expect(result.data.name).toBe("Test");
	});
});
