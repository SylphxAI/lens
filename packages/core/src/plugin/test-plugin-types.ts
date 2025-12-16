/**
 * Type test: Verify plugin system works correctly
 *
 * Run: bun tsc --noEmit packages/core/src/plugin/test-plugin-types.ts
 *
 * Expected:
 * - WITHOUT plugin: @ts-expect-error should catch the error (optimistic doesn't exist)
 * - WITH plugin: no error (optimistic exists)
 */
import { z } from "zod";
import type { LensMutationBuilderWithReturnsAndOptimistic } from "../lens.js";
import { lens } from "../lens.js";
import type { OptimisticPluginExtension, OptimisticPluginMarker } from "./optimistic-extension.js";
import type { HasPlugin } from "./types.js";

// Test entity
const TestEntity = { _name: "Test", fields: {} } as any;

// =============================================================================
// Test 1: Verify HasPlugin works correctly
// =============================================================================

type HasOpt1 = HasPlugin<[OptimisticPluginExtension], "optimistic">; // Should be true
const _test1: HasOpt1 = true;

// =============================================================================
// Test 2: WITHOUT plugin - .optimistic() should NOT be available
// =============================================================================

const withoutPlugin = lens<{ db: any }>();

const m1 = withoutPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

// @ts-expect-error - optimistic should not exist without plugin
m1.optimistic;

// But .resolve() should work
m1.resolve(({ input, ctx: _ctx }) => ({ id: input.id }) as any);

// =============================================================================
// Test 3: WITH plugin - .optimistic() SHOULD be available
// =============================================================================

// Mock optimistic plugin (actual implementation is in server package)
declare const mockOptimisticPlugin: () => OptimisticPluginMarker;

type MyContext = { db: any };
const withPlugin = lens<MyContext>().withPlugins([mockOptimisticPlugin()] as const);

// Test DSL form
const m2 = withPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

m2.optimistic("merge"); // Should work

// =============================================================================
// Test 4: Direct interface test - LensMutationBuilderWithReturnsAndOptimistic
// =============================================================================

type ExpectedInput = { id: string; name: string; age: number };

// Create a value typed as the interface directly
declare const directBuilder: LensMutationBuilderWithReturnsAndOptimistic<
	ExpectedInput,
	unknown,
	MyContext
>;

// Test DSL form
directBuilder.optimistic("merge");

// Test callback form WITHOUT destructuring first
directBuilder.optimistic((ctx) => {
	// TypeScript should know ctx.input is ExpectedInput
	const id: string = ctx.input.id;
	const name: string = ctx.input.name;
	const age: number = ctx.input.age;
	void id;
	void name;
	void age;
	return [];
});

// Test callback form WITH destructuring
directBuilder.optimistic(({ input }) => {
	// TypeScript should know input.id is string
	const id: string = input.id;
	const name: string = input.name;
	const age: number = input.age;
	void id;
	void name;
	void age;
	return [];
});

// =============================================================================
// Test 5: Chain test - through withPlugin
// =============================================================================

const m3Builder = withPlugin
	.mutation()
	.input(z.object({ id: z.string(), name: z.string(), age: z.number() }))
	.returns(TestEntity);

// Test DSL form
m3Builder.optimistic("merge");

// Test callback with destructuring
m3Builder.optimistic(({ input }) => {
	// If this compiles, the callback inference works!
	const id: string = input.id;
	const name: string = input.name;
	const age: number = input.age;
	void id;
	void name;
	void age;
	return [];
});

console.log("Type test file - if this compiles, types are correct!");
