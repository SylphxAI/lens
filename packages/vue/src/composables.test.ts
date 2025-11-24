/**
 * Tests for Vue Composables
 */

import { describe, expect, test, mock } from "bun:test";
import { ref, nextTick } from "vue";
import { signal } from "@lens/client";
import { useEntity, useList, useMutation } from "./composables";

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
			create: mock(async (input: unknown) => ({
				data: { id: "new-id", ...(input as object) },
			})),
			update: mock(async (id: string, _data?: unknown) => ({
				data: { id, name: "Updated", email: "updated@test.com" },
			})),
			delete: mock(async (_id: string) => {}),
		},
		$store: {
			release: mock(() => {}),
			setEntityLoading: mock(() => {}),
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

describe("useEntity()", () => {
	test("returns loading state initially", () => {
		const client = createMockClient();

		const result = useEntity("User", { id: "123" }, undefined, client as never);

		expect(result.loading.value).toBe(true);
		expect(result.data.value).toBe(null);
		expect(result.error.value).toBe(null);
	});

	test("updates when signal changes", async () => {
		const client = createMockClient();

		const result = useEntity("User", { id: "123" }, undefined, client as never);

		// Simulate data loaded
		client._setUserData({ id: "123", name: "John", email: "john@test.com" });

		await nextTick();

		expect(result.loading.value).toBe(false);
		expect(result.data.value).toEqual({ id: "123", name: "John", email: "john@test.com" });
	});

	test("calls client.get with correct parameters", () => {
		const client = createMockClient();

		useEntity("User", { id: "123" }, { select: { name: true } }, client as never);

		expect(client.User.get).toHaveBeenCalledWith("123", { select: { name: true } });
	});

	test("works with reactive ID", async () => {
		const client = createMockClient();
		const input = ref({ id: "123" });

		const result = useEntity("User", input, undefined, client as never);

		expect(client.User.get).toHaveBeenCalledWith("123", undefined);

		// Change ID
		input.value = { id: "456" };
		await nextTick();

		// Should call with new ID
		expect(client.User.get).toHaveBeenCalledWith("456", undefined);
	});
});

describe("useList()", () => {
	test("returns loading state initially", () => {
		const client = createMockClient();

		const result = useList("User", undefined, client as never);

		expect(result.loading.value).toBe(true);
		expect(result.data.value).toEqual([]);
	});

	test("updates when signal changes", async () => {
		const client = createMockClient();

		const result = useList("User", undefined, client as never);

		// Simulate data loaded
		client._setListData([
			{ id: "1", name: "John", email: "john@test.com" },
			{ id: "2", name: "Jane", email: "jane@test.com" },
		]);

		await nextTick();

		expect(result.loading.value).toBe(false);
		expect(result.data.value).toHaveLength(2);
		expect(result.data.value[0].name).toBe("John");
	});

	test("calls client.list with options", () => {
		const client = createMockClient();

		useList(
			"User",
			{
				where: { isActive: true },
				take: 10,
			},
			client as never,
		);

		expect(client.User.list).toHaveBeenCalledWith({
			where: { isActive: true },
			take: 10,
		});
	});
});

describe("useMutation()", () => {
	test("create mutation executes correctly", async () => {
		const client = createMockClient();

		const result = useMutation("User", "create", client as never);

		expect(result.loading.value).toBe(false);
		expect(result.data.value).toBe(null);

		const createResult = await result.mutate({ name: "New User", email: "new@test.com" });

		expect(client.User.create).toHaveBeenCalledWith({
			name: "New User",
			email: "new@test.com",
		});
		expect(createResult).toEqual({ id: "new-id", name: "New User", email: "new@test.com" });
	});

	test("update mutation executes correctly", async () => {
		const client = createMockClient();

		const result = useMutation("User", "update", client as never);

		await result.mutate({ id: "123", data: { name: "Updated Name" } });

		expect(client.User.update).toHaveBeenCalledWith("123", { name: "Updated Name" });
	});

	test("delete mutation executes correctly", async () => {
		const client = createMockClient();

		const result = useMutation("User", "delete", client as never);

		await result.mutate({ id: "123" });

		expect(client.User.delete).toHaveBeenCalledWith("123");
	});

	test("handles mutation error", async () => {
		const client = createMockClient();
		client.User.create = mock(async () => {
			throw new Error("Creation failed");
		});

		const result = useMutation("User", "create", client as never);

		try {
			await result.mutate({ name: "New User" });
		} catch {
			// Expected
		}

		expect(result.error.value?.message).toBe("Creation failed");
		expect(result.loading.value).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const client = createMockClient();

		const result = useMutation("User", "create", client as never);

		await result.mutate({ name: "New User", email: "new@test.com" });

		expect(result.data.value).not.toBe(null);

		result.reset();

		expect(result.data.value).toBe(null);
		expect(result.error.value).toBe(null);
		expect(result.loading.value).toBe(false);
	});
});
