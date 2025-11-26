/**
 * Tests for Preact Signals
 *
 * Basic tests to verify exports and types.
 * Full integration tests require Preact test utilities.
 */

import { describe, expect, test } from "bun:test";
import {
	type LazyQuerySignal,
	type MutationFn,
	type MutationSignal,
	type QueryInput,
	type QuerySignal,
	type QuerySignalOptions,
	createLazyQuerySignal,
	createMutationSignal,
	createQuerySignal,
} from "./signals";

// =============================================================================
// Tests: Exports
// =============================================================================

describe("@sylphx/lens-preact/signals exports", () => {
	test("createQuerySignal is exported", () => {
		expect(typeof createQuerySignal).toBe("function");
	});

	test("createLazyQuerySignal is exported", () => {
		expect(typeof createLazyQuerySignal).toBe("function");
	});

	test("createMutationSignal is exported", () => {
		expect(typeof createMutationSignal).toBe("function");
	});
});

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("signal types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: QueryInput<string> = null;
		const _testUndefined: QueryInput<string> = undefined;
		const _testAccessor: QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("QuerySignal has correct shape", () => {
		// Type assertion test - signals have .value property
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			refetch: () => void;
			dispose: () => void;
		};

		// If this compiles, QuerySignal has the correct shape
		const _typeCheck: QuerySignal<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("LazyQuerySignal has correct shape", () => {
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			execute: () => Promise<{ id: string }>;
			reset: () => void;
		};

		const _typeCheck: LazyQuerySignal<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("MutationSignal has correct shape", () => {
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			mutate: (input: { name: string }) => Promise<{ data: { id: string } }>;
			reset: () => void;
		};

		const _typeCheck: MutationSignal<{ name: string }, { id: string }> extends ExpectedShape
			? true
			: false = true;
		expect(_typeCheck).toBe(true);
	});

	test("QuerySignalOptions has skip property", () => {
		const options: QuerySignalOptions = { skip: true };
		expect(options.skip).toBe(true);
	});

	test("MutationFn type is correct", () => {
		const fn: MutationFn<{ name: string }, { id: string }> = async (input) => ({
			data: { id: input.name },
		});

		expect(typeof fn).toBe("function");
	});
});

// =============================================================================
// Tests: Basic Functionality
// =============================================================================

describe("signal primitives", () => {
	test("createMutationSignal returns signals with initial state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBe(null);
		expect(mutation.data.value).toBe(null);
		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.reset).toBe("function");
	});

	test("createLazyQuerySignal returns signals with initial state", () => {
		const query = createLazyQuerySignal(null);

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
		expect(typeof query.execute).toBe("function");
		expect(typeof query.reset).toBe("function");
	});

	test("createQuerySignal returns signals with initial state for null input", () => {
		const query = createQuerySignal(null);

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
		expect(typeof query.refetch).toBe("function");
		expect(typeof query.dispose).toBe("function");
	});

	test("createMutationSignal reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		// Manually set some state
		mutation.data.value = { id: "test", name: "test" };
		mutation.error.value = new Error("test error");

		// Reset should clear
		mutation.reset();

		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBe(null);
		expect(mutation.data.value).toBe(null);
	});

	test("createLazyQuerySignal reset clears state", () => {
		const query = createLazyQuerySignal(null);

		// Manually set some state
		query.data.value = { id: "test" };
		query.error.value = new Error("test error");

		// Reset should clear
		query.reset();

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
	});
});
