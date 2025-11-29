/**
 * @sylphx/lens-client - In-Process Transport Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { inProcess, type LensServerInterface } from "./in-process";
import type { Observable, Result } from "./types";

// =============================================================================
// Mock Server
// =============================================================================

function createMockServer(overrides: Partial<LensServerInterface> = {}): LensServerInterface {
	return {
		getMetadata: () => ({
			version: "1.0.0",
			operations: {
				user: { get: { type: "query" } },
				post: { create: { type: "mutation" } },
			},
		}),
		execute: async (op) => ({ data: { id: "1", path: op.path } }),
		...overrides,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("inProcess transport", () => {
	describe("connect()", () => {
		it("returns metadata from server", async () => {
			const server = createMockServer();
			const transport = inProcess({ server });

			const metadata = await transport.connect();

			expect(metadata.version).toBe("1.0.0");
			expect(metadata.operations.user).toBeDefined();
		});

		it("returns server metadata directly without network call", async () => {
			const getMetadata = mock(() => ({
				version: "2.0.0",
				operations: {},
			}));
			const server = createMockServer({ getMetadata });
			const transport = inProcess({ server });

			await transport.connect();

			expect(getMetadata).toHaveBeenCalledTimes(1);
		});
	});

	describe("execute()", () => {
		it("executes query operation", async () => {
			const server = createMockServer();
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "1",
				path: "user.get",
				type: "query",
				input: { id: "123" },
			})) as Result;

			expect(result.data).toEqual({ id: "1", path: "user.get" });
		});

		it("executes mutation operation", async () => {
			const execute = mock(async () => ({ data: { id: "new-1" } }));
			const server = createMockServer({ execute });
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "2",
				path: "post.create",
				type: "mutation",
				input: { title: "Hello" },
			})) as Result;

			expect(result.data).toEqual({ id: "new-1" });
			expect(execute).toHaveBeenCalledWith({
				id: "2",
				path: "post.create",
				type: "mutation",
				input: { title: "Hello" },
			});
		});

		it("handles subscription operation", async () => {
			const mockObservable: Observable<Result> = {
				subscribe: (observer) => {
					observer.next?.({ data: { count: 1 } });
					observer.next?.({ data: { count: 2 } });
					return { unsubscribe: () => {} };
				},
			};

			const server = createMockServer({
				execute: () => mockObservable,
			});
			const transport = inProcess({ server });

			const result = transport.execute({
				id: "3",
				path: "counter.watch",
				type: "subscription",
			});

			// Should return observable
			expect(result).toHaveProperty("subscribe");

			const values: unknown[] = [];
			const observable = result as Observable<Result>;
			observable.subscribe({
				next: (r) => values.push(r.data),
			});

			expect(values).toEqual([{ count: 1 }, { count: 2 }]);
		});

		it("passes operation input correctly", async () => {
			const execute = mock(async (op) => ({ data: op.input }));
			const server = createMockServer({ execute });
			const transport = inProcess({ server });

			const input = { userId: "123", options: { includeDeleted: true } };
			const result = (await transport.execute({
				id: "4",
				path: "user.get",
				type: "query",
				input,
			})) as Result;

			expect(result.data).toEqual(input);
		});

		it("handles server errors", async () => {
			const server = createMockServer({
				execute: async () => ({ error: new Error("Database error") }),
			});
			const transport = inProcess({ server });

			const result = (await transport.execute({
				id: "5",
				path: "user.get",
				type: "query",
			})) as Result;

			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe("Database error");
		});

		it("handles server throwing", async () => {
			const server = createMockServer({
				execute: async () => {
					throw new Error("Unexpected error");
				},
			});
			const transport = inProcess({ server });

			await expect(
				transport.execute({
					id: "6",
					path: "user.get",
					type: "query",
				}),
			).rejects.toThrow("Unexpected error");
		});
	});

	describe("integration", () => {
		it("works with multiple operations", async () => {
			const server = createMockServer({
				execute: async (op) => {
					if (op.path === "user.get") return { data: { name: "John" } };
					if (op.path === "post.create") return { data: { id: "post-1" } };
					return { error: new Error("Unknown path") };
				},
			});
			const transport = inProcess({ server });

			const [user, post] = await Promise.all([
				transport.execute({ id: "1", path: "user.get", type: "query" }),
				transport.execute({ id: "2", path: "post.create", type: "mutation", input: {} }),
			]);

			expect((user as Result).data).toEqual({ name: "John" });
			expect((post as Result).data).toEqual({ id: "post-1" });
		});
	});
});
