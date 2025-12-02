/**
 * Type test: Verify .optimistic() is conditionally available
 *
 * Run: bun tsc --noEmit packages/core/src/plugin/test-plugin-types.ts
 *
 * Expected:
 * - WITHOUT plugin: @ts-expect-error should catch the error (optimistic doesn't exist)
 * - WITH plugin: no error (optimistic exists)
 */
import { z } from "zod";
import { lens } from "../lens.js";
import type { OptimisticPluginExtension, OptimisticPluginMarker } from "./optimistic-extension.js";
import type { ExtractPluginExtensions, HasPlugin } from "./types.js";

// Test entity
const TestEntity = { _name: "Test", fields: {} } as any;

// =============================================================================
// Type Utilities Verification
// =============================================================================

// Verify ExtractPluginExtensions works correctly
type Plugins = readonly [OptimisticPluginMarker];
type ExtractedPlugins = ExtractPluginExtensions<Plugins>;
// Should be [OptimisticPluginExtension]

// Verify HasPlugin works correctly
type HasOpt1 = HasPlugin<[OptimisticPluginExtension], "optimistic">; // Should be true
type HasOpt2 = HasPlugin<ExtractedPlugins, "optimistic">; // Should be true

// Type assertions (these should compile without error)
const _test1: HasOpt1 = true;
const _test2: HasOpt2 = true;

// =============================================================================
// WITHOUT plugin - .optimistic() should NOT be available
// =============================================================================

const withoutPlugin = lens<{ db: any }>();

const m1 = withoutPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

// @ts-expect-error - optimistic should not exist without plugin
m1.optimistic;

// =============================================================================
// WITH plugin - .optimistic() SHOULD be available
// =============================================================================

// Mock optimistic plugin (actual implementation is in server package)
declare const mockOptimisticPlugin: () => OptimisticPluginMarker;

// Use 'as const' to preserve tuple type for proper type inference
const withPlugin = lens<{ db: any }>({
	plugins: [mockOptimisticPlugin()] as const,
});

const m2 = withPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

// This should work - optimistic should exist with plugin
m2.optimistic;

console.log("Type test file - if this compiles, types are correct!");
