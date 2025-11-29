/**
 * Tests for SolidJS Primitives
 *
 * Basic tests to verify exports and types.
 * Tests createQuery, createMutation, createLazyQuery exports.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type CreateQueryResult,
	createLazyQuery,
	createMutation,
	createQuery,
	type MutationFn,
	type QueryInput,
} from "./primitives";

// =============================================================================
// Tests: Exports
// =============================================================================

describe("@sylphx/lens-solid primitives exports", () => {
	test("createQuery is exported", () => {
		expect(typeof createQuery).toBe("function");
	});

	test("createLazyQuery is exported", () => {
		expect(typeof createLazyQuery).toBe("function");
	});

	test("createMutation is exported", () => {
		expect(typeof createMutation).toBe("function");
	});
});

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("primitives types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: QueryInput<string> = null;
		const _testUndefined: QueryInput<string> = undefined;
		const _testAccessor: QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("CreateQueryResult has correct shape", () => {
		// Type assertion test - SolidJS uses Accessor functions
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			refetch: () => void;
		};

		// If this compiles, CreateQueryResult has the correct shape
		const _typeCheck: CreateQueryResult<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateLazyQueryResult has correct shape", () => {
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			execute: () => Promise<{ id: string }>;
			reset: () => void;
		};

		const _typeCheck: CreateLazyQueryResult<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateMutationResult has correct shape", () => {
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			mutate: (input: { name: string }) => Promise<{ data: { id: string } }>;
			reset: () => void;
		};

		const _typeCheck: CreateMutationResult<{ name: string }, { id: string }> extends ExpectedShape ? true : false =
			true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateQueryOptions has skip property", () => {
		const options: CreateQueryOptions = { skip: true };
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

describe("primitive functions", () => {
	test("createMutation returns object with correct methods", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		// Verify structure
		expect(typeof mutation.data).toBe("function");
		expect(typeof mutation.loading).toBe("function");
		expect(typeof mutation.error).toBe("function");
		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.reset).toBe("function");

		// Check initial state
		expect(mutation.data()).toBe(null);
		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("createLazyQuery returns object with correct methods for null input", () => {
		const query = createLazyQuery(null);

		// Verify structure
		expect(typeof query.data).toBe("function");
		expect(typeof query.loading).toBe("function");
		expect(typeof query.error).toBe("function");
		expect(typeof query.execute).toBe("function");
		expect(typeof query.reset).toBe("function");

		// Check initial state
		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createMutation reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		// Reset should maintain initial cleared state
		mutation.reset();

		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
		expect(mutation.data()).toBe(null);
	});

	test("createLazyQuery reset clears state", () => {
		const query = createLazyQuery(null);

		// Reset should maintain initial cleared state
		query.reset();

		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
		expect(query.data()).toBe(null);
	});

	test("createLazyQuery execute returns null for null input", async () => {
		const query = createLazyQuery(null);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
	});
});
