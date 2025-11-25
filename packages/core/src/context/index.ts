/**
 * @sylphx/core - Context System
 *
 * AsyncLocalStorage-based context for implicit dependency injection.
 * Provides Vue-like composables pattern for accessing context.
 *
 * @example
 * ```typescript
 * import { createContext, useContext, runWithContext } from '@sylphx/core';
 *
 * // Define context type
 * interface AppContext {
 *   db: Database;
 *   currentUser: User | null;
 * }
 *
 * // Create context
 * const ctx = createContext<AppContext>();
 *
 * // Run code with context
 * await runWithContext(ctx, { db: prisma, currentUser }, async () => {
 *   // Inside here, useContext() works
 *   const db = useContext().db;
 * });
 *
 * // Create composables
 * const useDB = () => useContext<AppContext>().db;
 * const useCurrentUser = () => useContext<AppContext>().currentUser;
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";

// =============================================================================
// Type Definitions
// =============================================================================

/** Context store type */
export type ContextStore<T> = AsyncLocalStorage<T>;

/** Context value - can be any object */
export type ContextValue = Record<string, unknown>;

// =============================================================================
// Global Context Store
// =============================================================================

/** Global context store - single AsyncLocalStorage instance */
const globalContextStore = new AsyncLocalStorage<ContextValue>();

// =============================================================================
// Context Functions
// =============================================================================

/**
 * Create a typed context reference.
 * This doesn't create a new AsyncLocalStorage, but provides type information.
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   db: Database;
 *   currentUser: User;
 * }
 *
 * const ctx = createContext<AppContext>();
 * ```
 */
export function createContext<T extends ContextValue>(): ContextStore<T> {
	// Return the global store with type cast
	// All contexts share the same AsyncLocalStorage for simplicity
	return globalContextStore as ContextStore<T>;
}

/**
 * Get the current context value.
 * Throws if called outside of runWithContext.
 *
 * @example
 * ```typescript
 * const ctx = useContext<AppContext>();
 * const db = ctx.db;
 * ```
 */
export function useContext<T extends ContextValue = ContextValue>(): T {
	const ctx = globalContextStore.getStore();
	if (!ctx) {
		throw new Error(
			"useContext() called outside of context. " +
				"Make sure to wrap your code with runWithContext() or use explicit ctx parameter.",
		);
	}
	return ctx as T;
}

/**
 * Try to get the current context value.
 * Returns undefined if called outside of runWithContext (doesn't throw).
 *
 * @example
 * ```typescript
 * const ctx = tryUseContext<AppContext>();
 * if (ctx) {
 *   // Context available
 * }
 * ```
 */
export function tryUseContext<T extends ContextValue = ContextValue>(): T | undefined {
	return globalContextStore.getStore() as T | undefined;
}

/**
 * Run a function with the given context.
 * The context is available via useContext() within the function.
 *
 * @param context - Context store (from createContext)
 * @param value - Context value to use
 * @param fn - Function to run
 *
 * @example
 * ```typescript
 * await runWithContext(ctx, { db: prisma, currentUser }, async () => {
 *   // useContext() works here
 *   const user = useContext().currentUser;
 * });
 * ```
 */
export function runWithContext<T extends ContextValue, R>(
	_context: ContextStore<T>,
	value: T,
	fn: () => R,
): R {
	// Use the global store regardless of which context was passed
	// This simplifies the implementation while maintaining type safety
	return globalContextStore.run(value, fn);
}

/**
 * Run an async function with the given context.
 * Alias for runWithContext that makes async intent clear.
 */
export async function runWithContextAsync<T extends ContextValue, R>(
	context: ContextStore<T>,
	value: T,
	fn: () => Promise<R>,
): Promise<R> {
	return runWithContext(context, value, fn);
}

// =============================================================================
// Composable Helpers
// =============================================================================

/**
 * Create a typed composable for accessing a specific context property.
 *
 * @param key - Property key to access
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   db: Database;
 *   currentUser: User;
 * }
 *
 * const useDB = createComposable<AppContext, 'db'>('db');
 * const useCurrentUser = createComposable<AppContext, 'currentUser'>('currentUser');
 *
 * // Usage
 * const db = useDB();
 * const user = useCurrentUser();
 * ```
 */
export function createComposable<T extends ContextValue, K extends keyof T>(key: K): () => T[K] {
	return () => {
		const ctx = useContext<T>();
		return ctx[key];
	};
}

/**
 * Create multiple composables from context type.
 *
 * @param keys - Array of property keys
 *
 * @example
 * ```typescript
 * const { useDB, useCurrentUser } = createComposables<AppContext>(['db', 'currentUser']);
 * ```
 */
export function createComposables<T extends ContextValue, K extends keyof T>(
	keys: K[],
): { [P in K as `use${Capitalize<string & P>}`]: () => T[P] } {
	const result: Record<string, () => unknown> = {};
	for (const key of keys) {
		const capitalizedKey = String(key).charAt(0).toUpperCase() + String(key).slice(1);
		result[`use${capitalizedKey}`] = createComposable<T, K>(key);
	}
	return result as { [P in K as `use${Capitalize<string & P>}`]: () => T[P] };
}

// =============================================================================
// Context Utilities
// =============================================================================

/**
 * Check if currently running within a context.
 */
export function hasContext(): boolean {
	return globalContextStore.getStore() !== undefined;
}

/**
 * Get the raw context store (for advanced use cases).
 */
export function getContextStore(): ContextStore<ContextValue> {
	return globalContextStore;
}

/**
 * Extend the current context with additional values.
 * Returns a new context value (doesn't mutate).
 *
 * @example
 * ```typescript
 * const extendedCtx = extendContext(useContext(), { requestId: '123' });
 * await runWithContext(ctx, extendedCtx, async () => { ... });
 * ```
 */
export function extendContext<T extends ContextValue, E extends ContextValue>(
	current: T,
	extension: E,
): T & E {
	return { ...current, ...extension };
}
