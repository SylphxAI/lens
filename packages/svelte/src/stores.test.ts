/**
 * Tests for Svelte Stores
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { get } from "svelte/store";
import { signal } from "@lens/client";
import { entity, list } from "./stores";

// No context mocking needed - we pass client directly to store functions

// =============================================================================
// Mock Client
// =============================================================================

function createMockClient() {
	const entitySignal = signal({
		data: null as { id: string; name: string; email: string } | null,
		loading: true,
		error: null as Error | null,
		stale: false,
		refCount: 0,
	});

	const listSignal = signal({
		data: null as { id: string; name: string; email: string }[] | null,
		loading: true,
		error: null as Error | null,
		stale: false,
		refCount: 0,
	});

	return {
		User: {
			get: mock((_id: string, _options?: unknown) => entitySignal),
			list: mock((_options?: unknown) => listSignal),
		},
		$store: {
			release: mock(() => {}),
		},
		// Test helpers
		_entitySignal: entitySignal,
		_listSignal: listSignal,
		_setUserData: (data: { id: string; name: string; email: string } | null) => {
			entitySignal.value = {
				...entitySignal.value,
				data,
				loading: false,
			};
		},
		_setListData: (data: { id: string; name: string; email: string }[]) => {
			listSignal.value = {
				...listSignal.value,
				data,
				loading: false,
			};
		},
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("entity()", () => {
	test("creates a readable store with initial loading state", () => {
		const client = createMockClient();

		const userStore = entity("User", "123", undefined, client as never);
		const value = get(userStore);

		expect(value.loading).toBe(true);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("updates store when signal changes", () => {
		const client = createMockClient();

		const userStore = entity("User", "123", undefined, client as never);

		// Simulate data loaded
		client._setUserData({ id: "123", name: "John", email: "john@test.com" });

		const value = get(userStore);
		expect(value.loading).toBe(false);
		expect(value.data).toEqual({ id: "123", name: "John", email: "john@test.com" });
	});

	test("calls client.get with correct parameters", () => {
		const client = createMockClient();

		const userStore = entity("User", "123", { select: { name: true } }, client as never);
		// Must subscribe for the store to start
		const unsubscribe = userStore.subscribe(() => {});

		expect(client.User.get).toHaveBeenCalledWith("123", { select: { name: true } });

		unsubscribe();
	});

	test("subscribes to signal changes", () => {
		const client = createMockClient();

		const userStore = entity("User", "123", undefined, client as never);
		const values: Array<{ loading: boolean; data: unknown }> = [];

		// Subscribe to store
		const unsubscribe = userStore.subscribe((value) => {
			values.push({ loading: value.loading, data: value.data });
		});

		// Initial state
		expect(values[0].loading).toBe(true);

		// Simulate data loaded
		client._setUserData({ id: "123", name: "John", email: "john@test.com" });

		expect(values[1].loading).toBe(false);
		expect(values[1].data).toEqual({ id: "123", name: "John", email: "john@test.com" });

		unsubscribe();
	});

	test("releases store on unsubscribe", () => {
		const client = createMockClient();

		const userStore = entity("User", "123", undefined, client as never);
		const unsubscribe = userStore.subscribe(() => {});

		unsubscribe();

		expect(client.$store.release).toHaveBeenCalledWith("User", "123");
	});
});

describe("list()", () => {
	test("creates a readable store with initial loading state", () => {
		const client = createMockClient();

		const usersStore = list("User", undefined, client as never);
		const value = get(usersStore);

		expect(value.loading).toBe(true);
		expect(value.data).toEqual([]);
		expect(value.error).toBe(null);
	});

	test("updates store when signal changes", () => {
		const client = createMockClient();

		const usersStore = list("User", undefined, client as never);

		// Simulate data loaded
		client._setListData([
			{ id: "1", name: "John", email: "john@test.com" },
			{ id: "2", name: "Jane", email: "jane@test.com" },
		]);

		const value = get(usersStore);
		expect(value.loading).toBe(false);
		expect(value.data).toHaveLength(2);
		expect(value.data[0].name).toBe("John");
	});

	test("calls client.list with options", () => {
		const client = createMockClient();

		const usersStore = list(
			"User",
			{
				where: { isActive: true },
				take: 10,
			},
			client as never,
		);
		// Must subscribe for the store to start
		const unsubscribe = usersStore.subscribe(() => {});

		expect(client.User.list).toHaveBeenCalledWith({
			where: { isActive: true },
			take: 10,
		});

		unsubscribe();
	});

	test("subscribes to signal changes", () => {
		const client = createMockClient();

		const usersStore = list("User", undefined, client as never);
		const values: Array<{ loading: boolean; data: unknown[] }> = [];

		// Subscribe to store
		const unsubscribe = usersStore.subscribe((value) => {
			values.push({ loading: value.loading, data: value.data });
		});

		// Initial state
		expect(values[0].loading).toBe(true);
		expect(values[0].data).toEqual([]);

		// Simulate data loaded
		client._setListData([{ id: "1", name: "John", email: "john@test.com" }]);

		expect(values[1].loading).toBe(false);
		expect(values[1].data).toHaveLength(1);

		unsubscribe();
	});
});
