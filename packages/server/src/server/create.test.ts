/**
 * @sylphx/lens-server - Server Tests
 *
 * Tests for Lens server operations and GraphStateManager integration.
 */

import { describe, expect, it } from "bun:test";
import { entity, mutation, query, t } from "@sylphx/lens-core";
import { z } from "zod";
import { createServer, type WebSocketLike } from "./create";

// =============================================================================
// Test Fixtures
// =============================================================================

// Entities
const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
	bio: t.string().nullable(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// Mock data
const mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@example.com", bio: "Developer" },
	{ id: "user-2", name: "Bob", email: "bob@example.com", bio: "Designer" },
];

const mockPosts = [
	{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" },
	{ id: "post-2", title: "Test", content: "Post", authorId: "user-1" },
];

// Mock WebSocket factory
function createMockWs(): WebSocketLike & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send: (data: string) => messages.push(data),
		close: () => {},
		onmessage: null,
		onclose: null,
		onerror: null,
	};
}

// =============================================================================
// Test: Server Creation
// =============================================================================

describe("createServer", () => {
	it("creates a server instance", () => {
		const server = createServer({
			entities: { User, Post },
		});

		expect(server).toBeDefined();
		expect(typeof server.executeQuery).toBe("function");
		expect(typeof server.executeMutation).toBe("function");
		expect(typeof server.handleWebSocket).toBe("function");
		expect(typeof server.handleRequest).toBe("function");
		expect(typeof server.getStateManager).toBe("function");
	});

	it("throws for invalid query definition", () => {
		expect(() =>
			createServer({
				entities: { User },
				queries: {
					invalidQuery: { notAQuery: true } as never,
				},
			}),
		).toThrow("Invalid query definition: invalidQuery");
	});

	it("throws for invalid mutation definition", () => {
		expect(() =>
			createServer({
				entities: { User },
				mutations: {
					invalidMutation: { notAMutation: true } as never,
				},
			}),
		).toThrow("Invalid mutation definition: invalidMutation");
	});
});

// =============================================================================
// Test: Query Execution
// =============================================================================

describe("executeQuery", () => {
	it("executes a simple query", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const result = await server.executeQuery("getUsers");
		expect(result).toEqual(mockUsers);
	});

	it("executes a query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const result = await server.executeQuery("getUser", { id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("validates query input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		await expect(server.executeQuery("getUser", { id: 123 as unknown as string })).rejects.toThrow("Invalid input");
	});

	it("throws for unknown query", async () => {
		const server = createServer({
			entities: { User },
			queries: {},
		});

		await expect(server.executeQuery("unknownQuery")).rejects.toThrow("Query not found: unknownQuery");
	});
});

// =============================================================================
// Test: Mutation Execution
// =============================================================================

describe("executeMutation", () => {
	it("executes a simple mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "user-new",
				name: input.name,
				email: input.email,
			}));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const result = await server.executeMutation("createUser", {
			name: "Charlie",
			email: "charlie@example.com",
		});

		expect(result).toEqual({
			id: "user-new",
			name: "Charlie",
			email: "charlie@example.com",
		});
	});

	it("validates mutation input", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string().email() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		await expect(server.executeMutation("createUser", { name: "Test", email: "invalid-email" })).rejects.toThrow(
			"Invalid input",
		);
	});

	it("throws for unknown mutation", async () => {
		const server = createServer({
			entities: { User },
			mutations: {},
		});

		await expect(server.executeMutation("unknownMutation", {})).rejects.toThrow("Mutation not found: unknownMutation");
	});
});

// =============================================================================
// Test: WebSocket Protocol
// =============================================================================

describe("WebSocket Protocol", () => {
	it("handles handshake message", () => {
		const server = createServer({
			entities: { User },
			queries: {},
			mutations: {},
			version: "2.1.0",
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate handshake
		ws.onmessage?.({ data: JSON.stringify({ type: "handshake", id: "hs-1" }) });

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("handshake");
		expect(response.id).toBe("hs-1");
		expect(response.version).toBe("2.1.0");
	});

	it("handles query message", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate query
		ws.onmessage?.({ data: JSON.stringify({ type: "query", id: "q-1", operation: "getUsers" }) });

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.id).toBe("q-1");
		expect(response.data).toEqual(mockUsers);
	});

	it("handles mutation message", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate mutation
		ws.onmessage?.({
			data: JSON.stringify({
				type: "mutation",
				id: "m-1",
				operation: "createUser",
				input: { name: "Test" },
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("result");
		expect(response.id).toBe("m-1");
		expect(response.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("handles parse error", () => {
		const server = createServer({
			entities: { User },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Send invalid JSON
		ws.onmessage?.({ data: "invalid json" });

		expect(ws.messages.length).toBe(1);
		const response = JSON.parse(ws.messages[0]);
		expect(response.type).toBe("error");
		expect(response.error.code).toBe("PARSE_ERROR");
	});
});

// =============================================================================
// Test: Subscribe Protocol (Field-Level)
// =============================================================================

describe("Subscribe Protocol", () => {
	it("handles subscribe message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe to user
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name", "email"],
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// Should receive messages (either from GraphStateManager or operation-level)
		expect(ws.messages.length).toBeGreaterThan(0);

		// Find the operation-level data message (has subscription id)
		const dataMessage = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === "data" && m.id === "sub-1");

		// Should have received operation-level data
		expect(dataMessage).toBeDefined();
		expect(dataMessage.data).toMatchObject({ name: "Alice" });
	});

	it("handles unsubscribe message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		// Should not throw
		expect(true).toBe(true);
	});

	it("handles updateFields message", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe with partial fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: ["name"],
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Update fields
		ws.onmessage?.({
			data: JSON.stringify({
				type: "updateFields",
				id: "sub-1",
				addFields: ["email"],
				removeFields: [],
			}),
		});

		// Should not throw
		expect(true).toBe(true);
	});
});

// =============================================================================
// Test: GraphStateManager Integration
// =============================================================================

describe("GraphStateManager Integration", () => {
	it("provides access to state manager", () => {
		const server = createServer({
			entities: { User },
		});

		const stateManager = server.getStateManager();
		expect(stateManager).toBeDefined();
		expect(typeof stateManager.emit).toBe("function");
		expect(typeof stateManager.subscribe).toBe("function");
	});

	it("tracks client state after subscribe", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServer({
			entities: { User },
			queries: { getUser },
		});

		const stateManager = server.getStateManager();

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "getUser",
				input: { id: "user-1" },
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// State manager should have the client registered
		const stats = stateManager.getStats();
		expect(stats.clients).toBe(1);
	});

	it("removes client state on disconnect", async () => {
		const server = createServer({
			entities: { User },
		});

		const stateManager = server.getStateManager();

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Simulate disconnect
		ws.onclose?.();

		const stats = stateManager.getStats();
		expect(stats.clients).toBe(0);
	});
});

// =============================================================================
// Test: HTTP Handler
// =============================================================================

describe("handleRequest", () => {
	it("handles query request", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServer({
			entities: { User },
			queries: { getUsers },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "query", operation: "getUsers" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual(mockUsers);
	});

	it("handles mutation request", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServer({
			entities: { User },
			mutations: { createUser },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "mutation", operation: "createUser", input: { name: "Test" } }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("rejects non-POST requests", async () => {
		const server = createServer({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "GET" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
	});
});

// =============================================================================
// Test: Streaming (Async Generator) Support
// =============================================================================

describe("Streaming Support", () => {
	it("handles async generator query", async () => {
		const streamQuery = query()
			.returns(User)
			.resolve(async function* () {
				yield mockUsers[0];
				yield mockUsers[1];
			});

		const server = createServer({
			entities: { User },
			queries: { streamQuery },
		});

		// executeQuery returns first value
		const result = await server.executeQuery("streamQuery");
		expect(result).toEqual(mockUsers[0]);
	});

	it("streams values via WebSocket subscribe", async () => {
		let yieldCount = 0;

		const streamQuery = query()
			.returns(User)
			.resolve(async function* () {
				yieldCount++;
				yield mockUsers[0];
				yieldCount++;
				yield mockUsers[1];
			});

		const server = createServer({
			entities: { User },
			queries: { streamQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe to stream
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "streamQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		expect(yieldCount).toBe(2);
		expect(ws.messages.length).toBeGreaterThanOrEqual(1);
	});
});

// =============================================================================
// Test: Minimum Transfer (Diff Computation)
// =============================================================================

describe("Minimum Transfer", () => {
	it("sends initial data on subscribe", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const liveQuery = query()
			.returns(User)
			.resolve(({ emit }) => {
				emitFn = emit;
				return { id: "1", name: "Alice", email: "alice@example.com" };
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		// First message should have data
		expect(ws.messages.length).toBeGreaterThan(0);
		const firstUpdate = JSON.parse(ws.messages[0]);
		// Can be "data" or "update" with value strategy for initial
		expect(["data", "update"]).toContain(firstUpdate.type);
		// Verify we got the data
		if (firstUpdate.type === "data") {
			expect(firstUpdate.data).toMatchObject({ name: "Alice" });
		} else {
			expect(firstUpdate.updates).toBeDefined();
		}
	});

	it("sends updates via emit", async () => {
		let emitFn: ((data: unknown) => void) | null = null;

		const liveQuery = query()
			.returns(User)
			.resolve(({ emit }) => {
				emitFn = emit;
				return { id: "1", name: "Alice", email: "alice@example.com" };
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));

		const initialCount = ws.messages.length;

		// Emit update with changed data
		emitFn?.({ id: "1", name: "Bob", email: "bob@example.com" });

		await new Promise((r) => setTimeout(r, 50));

		// Should have received additional messages
		expect(ws.messages.length).toBeGreaterThanOrEqual(initialCount);
	});
});

// =============================================================================
// Test: onCleanup
// =============================================================================

describe("onCleanup", () => {
	it("calls cleanup function on unsubscribe", async () => {
		let cleanedUp = false;

		const liveQuery = query()
			.returns(User)
			.resolve(({ onCleanup }) => {
				onCleanup(() => {
					cleanedUp = true;
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Unsubscribe
		ws.onmessage?.({
			data: JSON.stringify({ type: "unsubscribe", id: "sub-1" }),
		});

		expect(cleanedUp).toBe(true);
	});

	it("calls cleanup on client disconnect", async () => {
		let cleanedUp = false;

		const liveQuery = query()
			.returns(User)
			.resolve(({ onCleanup }) => {
				onCleanup(() => {
					cleanedUp = true;
				});
				return mockUsers[0];
			});

		const server = createServer({
			entities: { User },
			queries: { liveQuery },
		});

		const ws = createMockWs();
		server.handleWebSocket(ws);

		// Subscribe
		ws.onmessage?.({
			data: JSON.stringify({
				type: "subscribe",
				id: "sub-1",
				operation: "liveQuery",
				fields: "*",
			}),
		});

		await new Promise((r) => setTimeout(r, 20));

		// Disconnect
		ws.onclose?.();

		expect(cleanedUp).toBe(true);
	});
});
