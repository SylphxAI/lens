/**
 * @sylphx/lens-client - Lens Client Tests
 *
 * Tests for Lens client.
 */

import { describe, expect, it } from "bun:test";
import { type Update, entity, mutation, query, t } from "@sylphx/lens-core";
import { z } from "zod";
import { type Transport, createClient } from "./create";

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

const mockPosts = [{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" }];

// =============================================================================
// Mock Transport
// =============================================================================

interface MockSubscription {
	operation: string;
	input: unknown;
	fields: string[] | "*";
	callbacks: {
		onData: (data: unknown) => void;
		onUpdate: (updates: Record<string, Update>) => void;
		onError: (error: Error) => void;
		onComplete: () => void;
	};
	active: boolean;
}

function createMockTransport(handlers: {
	query?: Record<string, (input: unknown) => Promise<unknown>>;
	mutation?: Record<string, (input: unknown) => Promise<unknown>>;
}): Transport & {
	subscriptions: MockSubscription[];
	emit: (index: number, data: unknown) => void;
} {
	const subscriptions: MockSubscription[] = [];

	return {
		subscriptions,
		emit: (index: number, data: unknown) => {
			const sub = subscriptions[index];
			if (sub?.active) {
				sub.callbacks.onData(data);
			}
		},

		subscribe: (operation, input, fields, callbacks) => {
			const sub: MockSubscription = {
				operation,
				input,
				fields,
				callbacks,
				active: true,
			};
			subscriptions.push(sub);

			// Execute query and send initial data
			const handler = handlers.query?.[operation];
			if (handler) {
				handler(input)
					.then((data) => {
						if (sub.active) {
							callbacks.onData(data);
						}
					})
					.catch((err) => {
						callbacks.onError(err);
					});
			}

			return {
				unsubscribe: () => {
					sub.active = false;
					callbacks.onComplete();
				},
				updateFields: (add, remove) => {
					if (sub.fields === "*") return;
					const fieldsSet = new Set(sub.fields);
					add?.forEach((f) => fieldsSet.add(f));
					remove?.forEach((f) => fieldsSet.delete(f));
					sub.fields = Array.from(fieldsSet);
				},
			};
		},

		query: async (operation, input) => {
			const handler = handlers.query?.[operation];
			if (!handler) throw new Error(`Unknown operation: ${operation}`);
			return handler(input);
		},

		mutate: async (operation, input) => {
			const handler = handlers.mutation?.[operation];
			if (!handler) throw new Error(`Unknown operation: ${operation}`);
			return handler(input);
		},

		connect: async () => {},
		disconnect: () => {},
	};
}

// Default mock handlers
const createDefaultHandlers = () => ({
	query: {
		getUsers: async () => mockUsers,
		getUser: async (input: unknown) => {
			const { id } = input as { id: string };
			return mockUsers.find((u) => u.id === id) ?? null;
		},
		whoami: async () => mockUsers[0],
		searchUsers: async (input: unknown) => {
			const { query } = input as { query: string };
			return mockUsers.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()));
		},
	},
	mutation: {
		createUser: async (input: unknown) => {
			const { name, email } = input as { name: string; email: string };
			return { id: `user-${Date.now()}`, name, email };
		},
		updateUser: async (input: unknown) => {
			const { id, ...rest } = input as { id: string; name?: string; email?: string };
			const user = mockUsers.find((u) => u.id === id);
			if (!user) throw new Error("User not found");
			return { ...user, ...rest };
		},
	},
});

// =============================================================================
// Test: Client Creation
// =============================================================================

describe("createClient", () => {
	it("creates a client instance", () => {
		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: {},
			mutations: {},
			transport,
		});

		expect(client).toBeDefined();
		expect(client.$store).toBeDefined();
		expect(typeof client.$queryNames).toBe("function");
		expect(typeof client.$mutationNames).toBe("function");
	});

	it("exposes query names", () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUsers },
			transport,
		});

		expect(client.$queryNames()).toEqual(["getUsers"]);
	});

	it("exposes mutation names", () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			mutations: { createUser },
			transport,
		});

		expect(client.$mutationNames()).toEqual(["createUser"]);
	});
});

// =============================================================================
// Test: Flat Namespace
// =============================================================================

describe("Flat Namespace", () => {
	it("queries are directly accessible on client", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUsers },
			transport,
		});

		// Flat namespace: client.getUsers() instead of client.query.getUsers()
		const result = await client.getUsers();
		expect(result).toEqual(mockUsers);
	});

	it("queries with input work with flat namespace", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// Flat namespace with input
		const result = await client.getUser({ id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("mutations are directly accessible on client", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: input.email }));

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			mutations: { createUser },
			transport,
		});

		// Flat namespace: client.createUser() instead of client.mutation.createUser()
		const result = await client.createUser({ name: "Test", email: "test@example.com" });
		expect(result.data).toMatchObject({ name: "Test", email: "test@example.com" });
	});
});

// =============================================================================
// Test: Query Execution
// =============================================================================

describe("Query Execution", () => {
	it("executes query without input", async () => {
		const whoami = query()
			.returns(User)
			.resolve(() => mockUsers[0]);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { whoami },
			transport,
		});

		const result = await client.whoami();
		expect(result).toEqual(mockUsers[0]);
	});

	it("executes query with search", async () => {
		const searchUsers = query()
			.input(z.object({ query: z.string() }))
			.returns([User])
			.resolve(({ input }) =>
				mockUsers.filter((u) => u.name.toLowerCase().includes(input.query.toLowerCase())),
			);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { searchUsers },
			transport,
		});

		const result = await client.searchUsers({ query: "alice" });
		expect(result).toEqual([mockUsers[0]]);
	});
});

// =============================================================================
// Test: Select API
// =============================================================================

describe("Select API", () => {
	it("select method exists on query result", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		expect(typeof result.select).toBe("function");
	});

	it("select returns new QueryResult", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		const withSelect = result.select({ id: true, name: true });

		expect(typeof withSelect.then).toBe("function");
		expect(typeof withSelect.select).toBe("function");
		expect(typeof withSelect.subscribe).toBe("function");
	});
});

// =============================================================================
// Test: Subscribe API
// =============================================================================

describe("Subscribe API", () => {
	it("subscribe method exists on query result", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		expect(typeof result.subscribe).toBe("function");
	});

	it("subscribe calls callback with data", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const received: unknown[] = [];

		client.getUser({ id: "user-1" }).subscribe((data) => {
			received.push(data);
		});

		await new Promise((r) => setTimeout(r, 50));

		expect(received.length).toBe(1);
		expect(received[0]).toEqual(mockUsers[0]);
	});

	it("unsubscribe stops receiving updates", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const received: unknown[] = [];

		const unsubscribe = client.getUser({ id: "user-1" }).subscribe((data) => {
			received.push(data);
		});

		await new Promise((r) => setTimeout(r, 50));

		unsubscribe();

		// Emit another update after unsubscribe
		transport.emit(0, { id: "user-1", name: "Updated", email: "updated@example.com" });

		await new Promise((r) => setTimeout(r, 20));

		// Should only have the first data
		expect(received.length).toBe(1);
	});
});

// =============================================================================
// Test: canDerive (Query Deduplication)
// =============================================================================

describe("Query Deduplication (canDerive)", () => {
	it("shares subscription for same query", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// Subscribe twice to same query
		client.getUser({ id: "user-1" }).subscribe(() => {});
		client.getUser({ id: "user-1" }).subscribe(() => {});

		await new Promise((r) => setTimeout(r, 50));

		// Should only create one transport subscription
		expect(transport.subscriptions.length).toBe(1);
	});

	it("derives from full subscription for partial field request", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// First subscription with all fields
		client.getUser({ id: "user-1" }).subscribe(() => {});

		await new Promise((r) => setTimeout(r, 50));

		// Second query with field selection should derive
		const partialResult = await client.getUser({ id: "user-1" }).select({ name: true });

		// Should only have one transport subscription (derived from existing)
		expect(transport.subscriptions.length).toBe(1);
		// Should still get data
		expect(partialResult).toMatchObject({ name: "Alice" });
	});
});

// =============================================================================
// Test: Reference Counting
// =============================================================================

describe("Reference Counting", () => {
	it("unsubscribes from transport when all refs removed", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// Subscribe twice
		const unsub1 = client.getUser({ id: "user-1" }).subscribe(() => {});
		const unsub2 = client.getUser({ id: "user-1" }).subscribe(() => {});

		await new Promise((r) => setTimeout(r, 50));

		// Unsubscribe first - should still be active
		unsub1();
		expect(transport.subscriptions[0].active).toBe(true);

		// Unsubscribe second - should deactivate
		unsub2();
		expect(transport.subscriptions[0].active).toBe(false);
	});

	it("maintains subscription while at least one subscriber exists", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// Subscribe three times
		const unsub1 = client.getUser({ id: "user-1" }).subscribe(() => {});
		const unsub2 = client.getUser({ id: "user-1" }).subscribe(() => {});
		const unsub3 = client.getUser({ id: "user-1" }).subscribe(() => {});

		await new Promise((r) => setTimeout(r, 50));

		// Unsubscribe two - should still be active
		unsub1();
		unsub2();
		expect(transport.subscriptions[0].active).toBe(true);

		// Unsubscribe third - should deactivate
		unsub3();
		expect(transport.subscriptions[0].active).toBe(false);
	});
});

// =============================================================================
// Test: Signals
// =============================================================================

describe("Signal Integration", () => {
	it("exposes signal on query result", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		expect(result.signal).toBeDefined();
	});

	it("exposes loading signal", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		expect(result.loading).toBeDefined();
	});

	it("exposes error signal", () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const result = client.getUser({ id: "user-1" });
		expect(result.error).toBeDefined();
	});
});

// =============================================================================
// Test: Mutation Execution
// =============================================================================

describe("Mutation Execution", () => {
	it("executes mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: input.email }));

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			mutations: { createUser },
			transport,
		});

		const result = await client.createUser({ name: "Test", email: "test@example.com" });
		expect(result.data).toMatchObject({ name: "Test" });
	});
});

// =============================================================================
// Test: In-Flight Deduplication
// =============================================================================

describe("In-Flight Deduplication", () => {
	it("deduplicates concurrent requests", async () => {
		let callCount = 0;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const slowTransport = createMockTransport({
			query: {
				getUser: async (input) => {
					callCount++;
					await new Promise((r) => setTimeout(r, 50));
					const { id } = input as { id: string };
					return mockUsers.find((u) => u.id === id) ?? null;
				},
			},
		});

		const client = createClient({
			queries: { getUser },
			transport: slowTransport,
		});

		// Make concurrent requests
		const [result1, result2, result3] = await Promise.all([
			client.getUser({ id: "user-1" }),
			client.getUser({ id: "user-1" }),
			client.getUser({ id: "user-1" }),
		]);

		// Should only call transport once
		expect(callCount).toBe(1);

		// All should get same result
		expect(result1).toEqual(result2);
		expect(result2).toEqual(result3);
	});

	it("makes separate requests for different inputs", async () => {
		let callCount = 0;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const countingTransport = createMockTransport({
			query: {
				getUser: async (input) => {
					callCount++;
					const { id } = input as { id: string };
					return mockUsers.find((u) => u.id === id) ?? null;
				},
			},
		});

		const client = createClient({
			queries: { getUser },
			transport: countingTransport,
		});

		// Make requests for different users
		await Promise.all([client.getUser({ id: "user-1" }), client.getUser({ id: "user-2" })]);

		// Should call transport twice (different inputs)
		expect(callCount).toBe(2);
	});
});

// =============================================================================
// Test: 最大原則 (Maximum Principle) - Subscription Sharing & Promotion
// =============================================================================

describe("Maximum Principle (最大原則)", () => {
	it("shares transport subscription between full and field subscriptions", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		// Subscribe to full entity first
		const fullResult = client.getUser({ id: "user-1" });
		const unsub1 = fullResult.subscribe();

		// Wait for transport subscription
		await new Promise((r) => setTimeout(r, 10));

		// Only one transport subscription should exist
		expect(transport.subscriptions.length).toBe(1);
		expect(transport.subscriptions[0].fields).toBe("*");

		// Subscribe to specific fields (should share existing subscription)
		const fieldResult = client.getUser({ id: "user-1" }).select({ name: true });
		const unsub2 = fieldResult.subscribe();

		// Wait a bit
		await new Promise((r) => setTimeout(r, 10));

		// Still only one transport subscription (shared)
		expect(transport.subscriptions.length).toBe(1);

		// Cleanup
		unsub1();
		unsub2();
	});

	it("derives data from full subscription without new fetch", async () => {
		let fetchCount = 0;

		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const countingTransport = createMockTransport({
			query: {
				getUser: async (input) => {
					fetchCount++;
					const { id } = input as { id: string };
					return mockUsers.find((u) => u.id === id) ?? null;
				},
			},
		});

		const client = createClient({
			queries: { getUser },
			transport: countingTransport,
		});

		// Fetch full entity
		const fullResult = await client.getUser({ id: "user-1" });
		expect(fetchCount).toBe(1);

		// Subscribe to full entity
		const sub = client.getUser({ id: "user-1" });
		const unsub = sub.subscribe();

		// Wait for subscription
		await new Promise((r) => setTimeout(r, 20));

		// Now request just the name field - should derive from existing data
		const nameResult = await client.getUser({ id: "user-1" }).select({ name: true });

		// Should derive from existing subscription, not make new request
		// Note: This depends on canDerive checking fullRefs > 0
		// When selecting specific fields, only those fields are returned (plus id)
		expect(nameResult).toMatchObject({ id: "user-1", name: "Alice" });

		unsub();
	});

	it("both subscriptions receive updates", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const transport = createMockTransport(createDefaultHandlers());
		const client = createClient({
			queries: { getUser },
			transport,
		});

		const updates: unknown[] = [];

		// Subscribe to full entity
		const fullResult = client.getUser({ id: "user-1" });
		const unsub1 = fullResult.subscribe((data) => {
			updates.push({ type: "full", data });
		});

		// Subscribe to specific fields
		const fieldResult = client.getUser({ id: "user-1" }).select({ name: true });
		const unsub2 = fieldResult.subscribe((data) => {
			updates.push({ type: "field", data });
		});

		// Wait for initial data
		await new Promise((r) => setTimeout(r, 20));

		// Both should have received initial data
		expect(updates.filter((u) => (u as { type: string }).type === "full").length).toBeGreaterThan(
			0,
		);
		expect(updates.filter((u) => (u as { type: string }).type === "field").length).toBeGreaterThan(
			0,
		);

		unsub1();
		unsub2();
	});
});
