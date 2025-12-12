/**
 * @sylphx/lens-core - Emit API
 *
 * Type-safe API for emitting state changes from resolvers.
 * Different emit interfaces based on output type:
 * - EmitObject<T>: For single entity (.returns(User)) or multi-entity objects
 * - EmitArray<T>: For array outputs (.returns([User]))
 *
 * @example
 * ```typescript
 * // Object output - field-level operations
 * .returns(User)
 * .resolve(({ emit }) => {
 *   emit.set("name", "Alice")
 *   emit.delta("bio", [{ position: 0, insert: "Hello" }])
 * })
 *
 * // Array output - array operations
 * .returns([User])
 * .resolve(({ emit }) => {
 *   emit.push(newUser)
 *   emit.remove(0)
 *   emit.update(1, updatedUser)
 * })
 * ```
 */

import type { DeltaOperation, PatchOperation, Update } from "../updates/strategies.js";

// =============================================================================
// Type Utilities
// =============================================================================

/** Extract string keys from object type */
type StringKeyOf<T> = Extract<keyof T, string>;

/** Get array element type */
type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

// =============================================================================
// EmitObject Interface (for object outputs)
// =============================================================================

/**
 * Emit API for object outputs (single entity or multi-entity).
 * Provides field-level operations.
 *
 * @typeParam T - Object type
 *
 * @example
 * ```typescript
 * // Single entity: .returns(User)
 * emit({ name: "Alice", email: "alice@example.com" })
 * emit.merge({ name: "Bob" })
 * emit.set("name", "Charlie")
 * emit.delta("bio", [{ position: 0, insert: "Hello " }])
 *
 * // Multi-entity: .returns({ user: User, posts: [Post] })
 * emit.set("user", newUser)
 * emit.set("posts", newPosts)
 * ```
 */
export interface EmitObject<T extends object> {
	/**
	 * Emit full data (merge mode)
	 */
	(data: T): void;

	/**
	 * Merge partial data into current state
	 */
	merge(partial: Partial<T>): void;

	/**
	 * Replace entire state (clears fields not in data)
	 */
	replace(data: T): void;

	/**
	 * Set a single field value
	 */
	set<K extends StringKeyOf<T>>(field: K, value: T[K]): void;

	/**
	 * Apply delta operations to a string field.
	 * Only valid for string fields.
	 *
	 * @example
	 * ```typescript
	 * emit.delta("content", [{ position: Infinity, insert: "appended text" }])
	 * ```
	 */
	delta<K extends StringKeyOf<T>>(field: K, operations: DeltaOperation[]): void;

	/**
	 * Apply JSON Patch (RFC 6902) operations to an object field.
	 * Only valid for object fields.
	 *
	 * @example
	 * ```typescript
	 * emit.patch("metadata", [{ op: "add", path: "/views", value: 100 }])
	 * ```
	 */
	patch<K extends StringKeyOf<T>>(field: K, operations: PatchOperation[]): void;

	/**
	 * Batch multiple field updates
	 */
	batch(updates: FieldUpdate<T>[]): void;
}

// =============================================================================
// EmitArray Interface (for array outputs)
// =============================================================================

/**
 * Emit API for array outputs.
 * Provides array-level operations.
 *
 * @typeParam T - Array type (e.g., User[])
 *
 * @example
 * ```typescript
 * // .returns([User])
 * emit([user1, user2])           // Replace entire array
 * emit.push(newUser)             // Append item
 * emit.unshift(newUser)          // Prepend item
 * emit.insert(1, newUser)        // Insert at index
 * emit.remove(0)                 // Remove by index
 * emit.removeById("user-123")    // Remove by id
 * emit.update(1, updatedUser)    // Update item at index
 * emit.updateById("user-123", u) // Update by id
 * ```
 */
export interface EmitArray<T extends readonly unknown[]> {
	/**
	 * Replace entire array
	 */
	(items: T): void;

	/**
	 * Replace entire array (alias)
	 */
	replace(items: T): void;

	/**
	 * Append item to end of array
	 */
	push(item: ArrayElement<T>): void;

	/**
	 * Prepend item to start of array
	 */
	unshift(item: ArrayElement<T>): void;

	/**
	 * Insert item at specific index
	 */
	insert(index: number, item: ArrayElement<T>): void;

	/**
	 * Remove item at index
	 */
	remove(index: number): void;

	/**
	 * Remove item by id field
	 * Assumes items have an 'id' field
	 */
	removeById(id: string): void;

	/**
	 * Update item at index
	 */
	update(index: number, item: ArrayElement<T>): void;

	/**
	 * Update item by id field
	 * Assumes items have an 'id' field
	 */
	updateById(id: string, item: ArrayElement<T>): void;

	/**
	 * Merge partial data into item at index
	 */
	merge(index: number, partial: Partial<ArrayElement<T>>): void;

	/**
	 * Merge partial data into item by id
	 */
	mergeById(id: string, partial: Partial<ArrayElement<T>>): void;
}

// =============================================================================
// EmitScalar Interface (for scalar outputs like string, number)
// =============================================================================

/**
 * Emit API for scalar outputs (string, number, boolean, etc).
 * Provides value replacement and delta operations for strings.
 *
 * @typeParam T - Scalar type
 *
 * @example
 * ```typescript
 * // String field with delta support
 * .subscribe({
 *   content: ({ source }) => ({ emit }) => {
 *     emit("full replacement")
 *     emit.delta([{ position: Infinity, insert: " appended" }])
 *   }
 * })
 *
 * // Number field
 * .subscribe({
 *   count: ({ source }) => ({ emit }) => {
 *     emit(42)
 *   }
 * })
 * ```
 */
export interface EmitScalar<T> {
	/**
	 * Replace entire value
	 */
	(value: T): void;

	/**
	 * Apply delta operations (only for string values).
	 * @example
	 * emit.delta([{ position: 0, insert: "Hello " }])
	 * emit.delta([{ position: Infinity, insert: " World" }])
	 */
	delta: T extends string ? (operations: DeltaOperation[]) => void : never;
}

// =============================================================================
// Unified Emit Type
// =============================================================================

/**
 * Type-safe Emit API that varies based on output type.
 *
 * - If T is an array → EmitArray<T>
 * - If T is an object → EmitObject<T>
 * - If T is a scalar → EmitScalar<T>
 */
export type Emit<T> = T extends readonly unknown[]
	? EmitArray<T>
	: T extends object
		? EmitObject<T>
		: EmitScalar<T>;

// =============================================================================
// Field Update Types
// =============================================================================

/**
 * Field update specification for batch operations
 */
export interface FieldUpdate<T = unknown> {
	field: StringKeyOf<T>;
	strategy: "value" | "delta" | "patch";
	data: unknown;
}

// =============================================================================
// Internal Types for GraphStateManager
// =============================================================================

/**
 * Internal field update representation
 */
export interface InternalFieldUpdate {
	field: string;
	update: Update;
}

/**
 * Array operation types
 */
export type ArrayOperation =
	| { op: "push"; item: unknown }
	| { op: "unshift"; item: unknown }
	| { op: "insert"; index: number; item: unknown }
	| { op: "remove"; index: number }
	| { op: "removeById"; id: string }
	| { op: "update"; index: number; item: unknown }
	| { op: "updateById"; id: string; item: unknown }
	| { op: "merge"; index: number; partial: unknown }
	| { op: "mergeById"; id: string; partial: unknown };

/**
 * Emit command - internal representation of emit calls
 */
export type EmitCommand =
	| { type: "full"; data: unknown; replace: boolean }
	| { type: "field"; field: string; update: Update }
	| { type: "batch"; updates: InternalFieldUpdate[] }
	| { type: "array"; operation: ArrayOperation; field?: string };

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an EmitObject instance for object outputs.
 */
export function createEmitObject<T extends object>(
	handler: (command: EmitCommand) => void,
): EmitObject<T> {
	const emit = ((data: T) => {
		handler({ type: "full", data, replace: false });
	}) as EmitObject<T>;

	emit.merge = (partial: Partial<T>) => {
		handler({ type: "full", data: partial, replace: false });
	};

	emit.replace = (data: T) => {
		handler({ type: "full", data, replace: true });
	};

	emit.set = <K extends StringKeyOf<T>>(field: K, value: T[K]) => {
		handler({
			type: "field",
			field: field,
			update: { strategy: "value", data: value },
		});
	};

	emit.delta = <K extends StringKeyOf<T>>(field: K, operations: DeltaOperation[]) => {
		handler({
			type: "field",
			field: field,
			update: { strategy: "delta", data: operations },
		});
	};

	emit.patch = <K extends StringKeyOf<T>>(field: K, operations: PatchOperation[]) => {
		handler({
			type: "field",
			field: field,
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

/**
 * Create an EmitArray instance for array outputs.
 */
export function createEmitArray<T extends readonly unknown[]>(
	handler: (command: EmitCommand) => void,
): EmitArray<T> {
	const emit = ((items: T) => {
		handler({ type: "full", data: items, replace: true });
	}) as EmitArray<T>;

	emit.replace = (items: T) => {
		handler({ type: "full", data: items, replace: true });
	};

	emit.push = (item: ArrayElement<T>) => {
		handler({ type: "array", operation: { op: "push", item } });
	};

	emit.unshift = (item: ArrayElement<T>) => {
		handler({ type: "array", operation: { op: "unshift", item } });
	};

	emit.insert = (index: number, item: ArrayElement<T>) => {
		handler({ type: "array", operation: { op: "insert", index, item } });
	};

	emit.remove = (index: number) => {
		handler({ type: "array", operation: { op: "remove", index } });
	};

	emit.removeById = (id: string) => {
		handler({ type: "array", operation: { op: "removeById", id } });
	};

	emit.update = (index: number, item: ArrayElement<T>) => {
		handler({ type: "array", operation: { op: "update", index, item } });
	};

	emit.updateById = (id: string, item: ArrayElement<T>) => {
		handler({ type: "array", operation: { op: "updateById", id, item } });
	};

	emit.merge = (index: number, partial: Partial<ArrayElement<T>>) => {
		handler({ type: "array", operation: { op: "merge", index, partial } });
	};

	emit.mergeById = (id: string, partial: Partial<ArrayElement<T>>) => {
		handler({ type: "array", operation: { op: "mergeById", id, partial } });
	};

	return emit;
}

/**
 * Create an EmitScalar instance for scalar outputs (string, number, etc).
 */
export function createEmitScalar<T>(handler: (command: EmitCommand) => void): EmitScalar<T> {
	const emit = ((value: T) => {
		handler({ type: "full", data: value, replace: true });
	}) as EmitScalar<T>;

	// Add delta method for string types
	(emit as any).delta = (operations: DeltaOperation[]) => {
		handler({
			type: "field",
			field: "", // Empty field = root value
			update: { strategy: "delta", data: operations },
		});
	};

	return emit;
}

/**
 * Create appropriate Emit instance based on output type.
 *
 * @param handler - Function to handle emit commands
 * @param outputType - "array" | "object" | "scalar" or boolean (true = array, false = object) for backwards compatibility
 * @returns Emit instance (EmitArray, EmitObject, or EmitScalar)
 */
export function createEmit<T>(
	handler: (command: EmitCommand) => void,
	outputType: "array" | "object" | "scalar" | boolean = "object",
): Emit<T> {
	// Backwards compatibility: boolean true = array, false = object
	const type = typeof outputType === "boolean" ? (outputType ? "array" : "object") : outputType;

	if (type === "array") {
		return createEmitArray<T & readonly unknown[]>(handler) as Emit<T>;
	}
	if (type === "scalar") {
		return createEmitScalar<T>(handler) as Emit<T>;
	}
	return createEmitObject<T & object>(handler) as Emit<T>;
}
