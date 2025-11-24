/**
 * Tests for React Hooks
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { signal } from "@lens/client";
import { LensProvider } from "./context";
import { useEntity, useList, useMutation, useSignalValue } from "./hooks";

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
			get: mock((_id: string, _options?: unknown) => {
				return entitySignal;
			}),
			list: mock(() => listSignal),
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
		$transport: {},
		connect: mock(async () => {}),
		disconnect: mock(() => {}),
		// Helper to simulate data loading
		_setUserData: (data: { id: string; name: string; email: string } | null) => {
			entitySignal.value = {
				...entitySignal.value,
				data,
				loading: false,
			};
		},
		_setUserError: (error: Error) => {
			entitySignal.value = {
				...entitySignal.value,
				error,
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
		_entitySignal: entitySignal,
		_listSignal: listSignal,
	};
}

// =============================================================================
// Test Wrapper
// =============================================================================

function createWrapper(client: ReturnType<typeof createMockClient>) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(LensProvider, { client: client as unknown as Parameters<typeof LensProvider>[0]["client"] }, children);
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("useEntity", () => {
	test("returns loading state initially", () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useEntity("User", { id: "123" }), {
			wrapper,
		});

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("returns data when loaded", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useEntity("User", { id: "123" }), {
			wrapper,
		});

		// Simulate data loading
		act(() => {
			client._setUserData({ id: "123", name: "John", email: "john@test.com" });
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({
			id: "123",
			name: "John",
			email: "john@test.com",
		});
	});

	test("returns error when failed", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useEntity("User", { id: "123" }), {
			wrapper,
		});

		// Simulate error
		act(() => {
			client._setUserError(new Error("Not found"));
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("Not found");
		expect(result.current.data).toBe(null);
	});

	test("calls client.get with correct parameters", () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		renderHook(() => useEntity("User", { id: "123" }, { select: { name: true } }), {
			wrapper,
		});

		expect(client.User.get).toHaveBeenCalledWith(
			"123",
			{ select: { name: true } },
		);
	});
});

describe("useList", () => {
	test("returns loading state initially", () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useList("User"), {
			wrapper,
		});

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toEqual([]);
	});

	test("returns data when loaded", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useList("User"), {
			wrapper,
		});

		// Simulate data loading
		act(() => {
			client._setListData([
				{ id: "1", name: "John", email: "john@test.com" },
				{ id: "2", name: "Jane", email: "jane@test.com" },
			]);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toHaveLength(2);
		expect(result.current.data[0].name).toBe("John");
	});
});

describe("useMutation", () => {
	test("create mutation executes correctly", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("User", "create"), {
			wrapper,
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		let createResult: unknown;
		await act(async () => {
			createResult = await result.current.mutate({ name: "New User", email: "new@test.com" });
		});

		expect(client.User.create).toHaveBeenCalledWith({
			name: "New User",
			email: "new@test.com",
		});
		expect(createResult).toEqual({ id: "new-id", name: "New User", email: "new@test.com" });
	});

	test("update mutation executes correctly", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("User", "update"), {
			wrapper,
		});

		await act(async () => {
			await result.current.mutate({ id: "123", data: { name: "Updated Name" } });
		});

		expect(client.User.update).toHaveBeenCalledWith(
			"123",
			{ name: "Updated Name" },
		);
	});

	test("delete mutation executes correctly", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("User", "delete"), {
			wrapper,
		});

		await act(async () => {
			await result.current.mutate({ id: "123" });
		});

		expect(client.User.delete).toHaveBeenCalledWith("123");
	});

	test("handles mutation error", async () => {
		const client = createMockClient();
		client.User.create = mock(async () => {
			throw new Error("Creation failed");
		});
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("User", "create"), {
			wrapper,
		});

		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Creation failed");
		expect(result.current.loading).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const client = createMockClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("User", "create"), {
			wrapper,
		});

		await act(async () => {
			await result.current.mutate({ name: "New User", email: "new@test.com" });
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});
});

describe("useSignalValue", () => {
	test("returns initial signal value", () => {
		const testSignal = signal(42);
		const wrapper = createWrapper(createMockClient());

		const { result } = renderHook(() => useSignalValue(testSignal), {
			wrapper,
		});

		expect(result.current).toBe(42);
	});

	test("updates when signal changes", async () => {
		const testSignal = signal(42);
		const wrapper = createWrapper(createMockClient());

		const { result } = renderHook(() => useSignalValue(testSignal), {
			wrapper,
		});

		act(() => {
			testSignal.value = 100;
		});

		await waitFor(() => {
			expect(result.current).toBe(100);
		});
	});
});
