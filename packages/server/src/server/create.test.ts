/**
 * @sylphx/lens-server - Server Tests
 *
 * Tests for the pure executor server.
 * Server only does: getMetadata() and execute()
 */

import { describe, expect, it } from "bun:test";
import { entity, firstValueFrom, mutation, query, router } from "@sylphx/lens-core";
import { z } from "zod";
import { optimisticPlugin } from "../plugin/optimistic.js";
import { createApp } from "./create.js";

// =============================================================================
// Test Entities
// =============================================================================

const User = entity("User", {
	id: z.string(),
	name: z.string(),
	email: z.string().optional(),
});

// =============================================================================
// Test Queries and Mutations
// =============================================================================

const getUser = query()
	.input(z.object({ id: z.string() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: input.id,
		name: "Test User",
		email: "test@example.com",
	}));

const getUsers = query().resolve(() => [
	{ id: "1", name: "User 1" },
	{ id: "2", name: "User 2" },
]);

const createUser = mutation()
	.input(z.object({ name: z.string(), email: z.string().optional() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: "new-id",
		name: input.name,
		email: input.email,
	}));

const updateUser = mutation()
	.input(z.object({ id: z.string(), name: z.string().optional() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: input.id,
		name: input.name ?? "Updated",
	}));

const deleteUser = mutation()
	.input(z.object({ id: z.string() }))
	.resolve(() => ({ success: true }));

// =============================================================================
// createApp Tests
// =============================================================================

describe("createApp", () => {
	it("creates a server instance", () => {
		const server = createApp({
			entities: { User },
			queries: { getUser },
			mutations: { createUser },
		});

		expect(server).toBeDefined();
		expect(typeof server.getMetadata).toBe("function");
		expect(typeof server.execute).toBe("function");
	});

	it("creates server with router", () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
			},
		});

		const server = createApp({ router: appRouter });

		expect(server).toBeDefined();
		const metadata = server.getMetadata();
		expect(metadata.operations.user).toBeDefined();
	});

	it("creates server with custom version", () => {
		const server = createApp({
			queries: { getUser },
			version: "2.0.0",
		});

		const metadata = server.getMetadata();
		expect(metadata.version).toBe("2.0.0");
	});

	it("creates server with empty config", () => {
		const server = createApp({});

		expect(server).toBeDefined();
		const metadata = server.getMetadata();
		expect(metadata.version).toBe("1.0.0");
		expect(metadata.operations).toEqual({});
	});
});

// =============================================================================
// getMetadata Tests
// =============================================================================

describe("getMetadata", () => {
	it("returns correct metadata structure", () => {
		const server = createApp({
			queries: { getUser, getUsers },
			mutations: { createUser, updateUser },
			version: "1.2.3",
		});

		const metadata = server.getMetadata();

		expect(metadata.version).toBe("1.2.3");
		expect(metadata.operations.getUser).toEqual({ type: "query" });
		expect(metadata.operations.getUsers).toEqual({ type: "query" });
		expect(metadata.operations.createUser.type).toBe("mutation");
		expect(metadata.operations.updateUser.type).toBe("mutation");
	});

	it("includes optimistic hints for mutations with optimisticPlugin", () => {
		const server = createApp({
			mutations: { createUser, updateUser, deleteUser },
			plugins: [optimisticPlugin()],
		});

		const metadata = server.getMetadata();

		// Auto-derived from naming convention when using optimisticPlugin
		expect(metadata.operations.createUser.optimistic).toBeDefined();
		expect(metadata.operations.updateUser.optimistic).toBeDefined();
		expect(metadata.operations.deleteUser.optimistic).toBeDefined();
	});

	it("does not include optimistic hints without optimisticPlugin", () => {
		const server = createApp({
			mutations: { createUser, updateUser, deleteUser },
		});

		const metadata = server.getMetadata();

		// Without plugin, no optimistic hints
		expect(metadata.operations.createUser.optimistic).toBeUndefined();
		expect(metadata.operations.updateUser.optimistic).toBeUndefined();
		expect(metadata.operations.deleteUser.optimistic).toBeUndefined();
	});

	it("handles nested router paths", () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
				profile: {
					update: updateUser,
				},
			},
		});

		const server = createApp({ router: appRouter });
		const metadata = server.getMetadata();

		expect(metadata.operations.user).toBeDefined();
		expect((metadata.operations.user as Record<string, unknown>).get).toEqual({ type: "query" });
		expect((metadata.operations.user as Record<string, unknown>).create).toBeDefined();
	});
});

// =============================================================================
// execute Tests
// =============================================================================

describe("execute", () => {
	it("executes query successfully", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { id: "123" },
			}),
		);

		expect(result.data).toEqual({
			id: "123",
			name: "Test User",
			email: "test@example.com",
		});
		expect(result.error).toBeUndefined();
	});

	it("executes mutation successfully", async () => {
		const server = createApp({
			mutations: { createUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "createUser",
				input: { name: "New User", email: "new@example.com" },
			}),
		);

		expect(result.data).toEqual({
			id: "new-id",
			name: "New User",
			email: "new@example.com",
		});
		expect(result.error).toBeUndefined();
	});

	it("returns error for unknown operation", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "unknownOperation",
				input: {},
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain("not found");
	});

	it("returns error for invalid input", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: { invalid: true }, // Missing required 'id'
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
	});

	it("executes router operations with dot notation", async () => {
		const appRouter = router({
			user: {
				get: getUser,
				create: createUser,
			},
		});

		const server = createApp({ router: appRouter });

		const queryResult = await firstValueFrom(
			server.execute({
				path: "user.get",
				input: { id: "456" },
			}),
		);

		expect(queryResult.data).toEqual({
			id: "456",
			name: "Test User",
			email: "test@example.com",
		});

		const mutationResult = await firstValueFrom(
			server.execute({
				path: "user.create",
				input: { name: "Router User" },
			}),
		);

		expect(mutationResult.data).toEqual({
			id: "new-id",
			name: "Router User",
			email: undefined,
		});
	});

	it("handles resolver errors gracefully", async () => {
		const errorQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(() => {
				throw new Error("Resolver error");
			});

		const server = createApp({
			queries: { errorQuery },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "errorQuery",
				input: { id: "1" },
			}),
		);

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Resolver error");
	});

	it("executes query without input", async () => {
		const server = createApp({
			queries: { getUsers },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUsers",
			}),
		);

		expect(result.data).toHaveLength(2);
	});
});

// =============================================================================
// Context Tests
// =============================================================================

describe("context", () => {
	it("passes context to resolvers", async () => {
		let capturedContext: unknown = null;

		const contextQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return { id: "1", name: "test" };
			});

		const server = createApp({
			queries: { contextQuery },
			context: () => ({ userId: "user-123", role: "admin" }),
		});

		await firstValueFrom(
			server.execute({
				path: "contextQuery",
				input: { id: "1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "user-123",
			role: "admin",
		});
	});

	it("supports async context factory", async () => {
		let capturedContext: unknown = null;

		const contextQuery = query()
			.input(z.object({ id: z.string() }))
			.resolve(({ ctx }) => {
				capturedContext = ctx;
				return { id: "1", name: "test" };
			});

		const server = createApp({
			queries: { contextQuery },
			context: async () => {
				await new Promise((r) => setTimeout(r, 10));
				return { userId: "async-user" };
			},
		});

		await firstValueFrom(
			server.execute({
				path: "contextQuery",
				input: { id: "1" },
			}),
		);

		expect(capturedContext).toMatchObject({
			userId: "async-user",
		});
	});
});

// =============================================================================
// Selection Tests
// =============================================================================

describe("selection", () => {
	it("supports $select in input", async () => {
		const server = createApp({
			queries: { getUser },
		});

		const result = await firstValueFrom(
			server.execute({
				path: "getUser",
				input: {
					id: "123",
					$select: { name: true },
				},
			}),
		);

		expect(result.data).toEqual({
			id: "123", // id always included
			name: "Test User",
		});
		expect((result.data as Record<string, unknown>).email).toBeUndefined();
	});
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("type inference", () => {
	it("infers types correctly", () => {
		const server = createApp({
			queries: { getUser },
			mutations: { createUser },
		});

		// Type check - if this compiles, types are working
		const metadata = server.getMetadata();
		expect(metadata.version).toBeDefined();

		// The _types property exists for type inference
		expect((server as { _types?: unknown })._types).toBeUndefined(); // Runtime undefined, compile-time exists
	});
});
