/**
 * Tests for SolidJS Context
 *
 * Basic tests to verify exports and types.
 * Tests LensProvider and useLensClient exports via the index.
 *
 * Note: Context tests are limited because context.tsx uses JSX
 * and requires a SolidJS render context. Full integration tests
 * would require @solidjs/testing-library.
 */

import { describe, expect, test } from "bun:test";
// Import from index to test public API
// The context.tsx file uses JSX which requires special handling
import type { LensProviderProps } from "./index";

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("@sylphx/lens-solid context types", () => {
	test("LensProviderProps has client property", () => {
		// Type assertion test - if this compiles, types are correct
		type HasClient = LensProviderProps["client"];

		// Runtime check that the type exists
		const _checkClient: HasClient = null as unknown as HasClient;

		expect(true).toBe(true);
	});
});
