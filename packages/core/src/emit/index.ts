/**
 * @sylphx/lens-core - Emit API
 *
 * Type-safe API for emitting state changes from resolvers.
 * Supports multiple strategies for patching server state.
 *
 * @example
 * ```typescript
 * resolve(({ input, ctx, emit, onCleanup }) => {
 *   // Full value update
 *   emit({ title: "Hello", content: "World" })
 *
 *   // Merge partial update
 *   emit.merge({ title: "Updated" })
 *
 *   // Set single field
 *   emit.set("title", "New Title")
 *
 *   // Delta for string fields (e.g., LLM streaming)
 *   emit.delta("content", [{ position: 0, insert: "Hello " }])
 *
 *   // JSON Patch for object fields
 *   emit.patch("metadata", [{ op: "add", path: "/views", value: 100 }])
 *
 *   return initialData
 * })
 * ```
 */

import type { DeltaOperation, PatchOperation, Update } from "../updates/strategies";

// =============================================================================
// Emit Interface
// =============================================================================

/**
 * Emit API for pushing state updates from resolvers.
 *
 * The emit function and its methods describe HOW the business state changed.
 * The framework independently decides the optimal transfer strategy per-client.
 *
 * @typeParam T - The output type of the resolver
 */
export interface Emit<T = unknown> {
	/**
	 * Emit full data (merge mode by default)
	 *
	 * @example
	 * ```typescript
	 * emit({ title: "Hello", content: "World" })
	 * ```
	 */
	(data: T): void;

	/**
	 * Merge partial data into current state
	 *
	 * @example
	 * ```typescript
	 * emit.merge({ title: "Updated" })  // Only updates title
	 * ```
	 */
	merge(partial: Partial<T>): void;

	/**
	 * Replace entire state (clears fields not in data)
	 *
	 * @example
	 * ```typescript
	 * emit.replace({ title: "New", content: "Fresh" })
	 * ```
	 */
	replace(data: T): void;

	/**
	 * Set a single field value
	 *
	 * @example
	 * ```typescript
	 * emit.set("title", "New Title")
	 * ```
	 */
	set<K extends keyof T>(field: K, value: T[K]): void;

	/**
	 * Apply delta operations to a string field.
	 * Use for streaming text (LLM responses, real-time typing).
	 *
	 * @example
	 * ```typescript
	 * // Append text
	 * emit.delta("content", [{ position: Infinity, insert: "new text" }])
	 *
	 * // Insert at position
	 * emit.delta("content", [{ position: 10, insert: "inserted" }])
	 *
	 * // Delete and insert
	 * emit.delta("content", [{ position: 5, delete: 3, insert: "new" }])
	 * ```
	 */
	delta<K extends keyof T>(field: K, operations: DeltaOperation[]): void;

	/**
	 * Apply JSON Patch (RFC 6902) operations to an object field.
	 * Use for complex nested updates.
	 *
	 * @example
	 * ```typescript
	 * emit.patch("metadata", [
	 *   { op: "add", path: "/views", value: 100 },
	 *   { op: "replace", path: "/status", value: "published" },
	 * ])
	 * ```
	 */
	patch<K extends keyof T>(field: K, operations: PatchOperation[]): void;

	/**
	 * Batch multiple field updates in a single emission.
	 * More efficient than multiple separate emit calls.
	 *
	 * @example
	 * ```typescript
	 * emit.batch([
	 *   { field: "title", strategy: "value", data: "New Title" },
	 *   { field: "content", strategy: "delta", data: [{ position: 0, insert: "!" }] },
	 * ])
	 * ```
	 */
	batch(updates: FieldUpdate<T>[]): void;
}

/**
 * Field update specification for batch operations
 */
export interface FieldUpdate<T = unknown> {
	/** Field name to update */
	field: keyof T;
	/** Update strategy */
	strategy: "value" | "delta" | "patch";
	/** Update data (type depends on strategy) */
	data: unknown;
}

// =============================================================================
// Internal Types for GraphStateManager
// =============================================================================

/**
 * Internal field update representation
 * Used by GraphStateManager to apply updates to canonical state
 */
export interface InternalFieldUpdate {
	field: string;
	update: Update;
}

/**
 * Emit command - internal representation of emit calls
 */
export type EmitCommand =
	| { type: "full"; data: unknown; replace: boolean }
	| { type: "field"; field: string; update: Update }
	| { type: "batch"; updates: InternalFieldUpdate[] };

// =============================================================================
// Emit Factory
// =============================================================================

/**
 * Create an Emit instance for a resolver.
 *
 * @param handler - Function to handle emit commands
 * @returns Emit instance
 */
export function createEmit<T>(handler: (command: EmitCommand) => void): Emit<T> {
	const emit = ((data: T) => {
		handler({ type: "full", data, replace: false });
	}) as Emit<T>;

	emit.merge = (partial: Partial<T>) => {
		handler({ type: "full", data: partial, replace: false });
	};

	emit.replace = (data: T) => {
		handler({ type: "full", data, replace: true });
	};

	emit.set = <K extends keyof T>(field: K, value: T[K]) => {
		handler({
			type: "field",
			field: field as string,
			update: { strategy: "value", data: value },
		});
	};

	emit.delta = <K extends keyof T>(field: K, operations: DeltaOperation[]) => {
		handler({
			type: "field",
			field: field as string,
			update: { strategy: "delta", data: operations },
		});
	};

	emit.patch = <K extends keyof T>(field: K, operations: PatchOperation[]) => {
		handler({
			type: "field",
			field: field as string,
			update: { strategy: "patch", data: operations },
		});
	};

	emit.batch = (updates: FieldUpdate<T>[]) => {
		handler({
			type: "batch",
			updates: updates.map((u) => ({
				field: u.field as string,
				update: { strategy: u.strategy, data: u.data } as Update,
			})),
		});
	};

	return emit;
}
