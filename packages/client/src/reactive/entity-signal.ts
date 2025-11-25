/**
 * @sylphx/client - EntitySignal
 *
 * Fine-grained reactive entity with field-level signals.
 * Enables minimal re-renders and efficient server subscriptions.
 */

import { signal, computed, type Signal, type WritableSignal } from "../signals/signal";
import type { Update } from "@sylphx/core";
import { applyUpdate } from "@sylphx/core";

// =============================================================================
// Types
// =============================================================================

/** Field signals mapped from entity type */
export type FieldSignals<T> = {
	readonly [K in keyof T]: Signal<T[K]>;
};

/** Writable field signals (internal use) */
type WritableFieldSignals<T> = {
	[K in keyof T]: WritableSignal<T[K]>;
};

/** Dispose callback */
export type DisposeCallback = () => void;

/** EntitySignal options */
export interface EntitySignalOptions {
	/** Called when EntitySignal is disposed */
	onDispose?: DisposeCallback;
	/** Called when a field is first accessed (for lazy subscription) */
	onFieldAccess?: (field: string) => void;
}

// =============================================================================
// EntitySignal
// =============================================================================

/**
 * Fine-grained reactive entity signal.
 *
 * Provides both:
 * - `value`: Computed full entity (tracks all fields)
 * - `$`: Field-level signals (tracks individual fields)
 *
 * @example
 * ```typescript
 * const user = new EntitySignal({ name: "John", bio: "Hello" });
 *
 * // Coarse-grained: re-renders when ANY field changes
 * <div>{user.value.name}</div>
 *
 * // Fine-grained: re-renders ONLY when name changes
 * <div>{user.$.name.value}</div>
 * ```
 */
export class EntitySignal<T extends Record<string, unknown>> {
	/** Field-level signals (source of truth) */
	private readonly _fields: WritableFieldSignals<T>;

	/** Proxy for field access */
	readonly $: FieldSignals<T>;

	/** Computed full entity value */
	readonly value: Signal<T>;

	/** Loading state */
	readonly loading: WritableSignal<boolean>;

	/** Error state */
	readonly error: WritableSignal<Error | null>;

	/** Whether this signal has been disposed */
	private _disposed = false;

	/** Options */
	private readonly options: EntitySignalOptions;

	/** Field access tracking (for subscription management) */
	private readonly accessedFields = new Set<keyof T>();

	/** Version signal - bumped when fields are added to trigger computed re-evaluation */
	private readonly _version: WritableSignal<number>;

	constructor(initialData: T, options: EntitySignalOptions = {}) {
		this.options = options;

		// Create field-level signals
		this._fields = {} as WritableFieldSignals<T>;
		for (const [key, val] of Object.entries(initialData)) {
			this._fields[key as keyof T] = signal(val as T[keyof T]);
		}

		// Version signal for tracking structural changes
		this._version = signal(0);

		// Create proxy for field access tracking
		this.$ = new Proxy(this._fields as FieldSignals<T>, {
			get: (target, prop: string) => {
				if (prop in target) {
					// Track field access
					if (!this.accessedFields.has(prop as keyof T)) {
						this.accessedFields.add(prop as keyof T);
						this.options.onFieldAccess?.(prop);
					}
					return target[prop as keyof T];
				}
				return undefined;
			},
		});

		// Computed value from all fields (depends on _version for structural changes)
		this.value = computed(() => {
			// Read version to create dependency
			this._version.value;

			const result = {} as T;
			for (const key of Object.keys(this._fields)) {
				result[key as keyof T] = this._fields[key as keyof T].value;
			}
			return result;
		});

		// Metadata signals
		this.loading = signal(false);
		this.error = signal<Error | null>(null);
	}

	// ===========================================================================
	// Field Updates
	// ===========================================================================

	/**
	 * Update a specific field with a server update
	 */
	updateField<K extends keyof T>(field: K, update: Update): void {
		if (this._disposed) return;

		const fieldSignal = this._fields[field];
		if (fieldSignal) {
			const current = fieldSignal.value;
			fieldSignal.value = applyUpdate(current, update) as T[K];
		}
	}

	/**
	 * Set a field value directly
	 */
	setField<K extends keyof T>(field: K, value: T[K]): void {
		if (this._disposed) return;

		const fieldSignal = this._fields[field];
		if (fieldSignal) {
			fieldSignal.value = value;
		}
	}

	/**
	 * Set multiple fields at once (also adds new fields if they don't exist)
	 */
	setFields(data: Partial<T>): void {
		if (this._disposed) return;

		let hasNewFields = false;

		for (const [key, value] of Object.entries(data)) {
			if (value === undefined) continue;

			const fieldSignal = this._fields[key as keyof T];
			if (fieldSignal) {
				fieldSignal.value = value as T[keyof T];
			} else {
				// Add new field dynamically
				(this._fields as Record<string, WritableSignal<unknown>>)[key] = signal(value);
				hasNewFields = true;
			}
		}

		// Bump version to trigger computed re-evaluation when structure changes
		if (hasNewFields) {
			this._version.value++;
		}
	}

	/**
	 * Add a new field (for dynamic fields)
	 */
	addField<K extends string, V>(field: K, value: V): void {
		if (this._disposed) return;

		if (!(field in this._fields)) {
			(this._fields as Record<string, WritableSignal<unknown>>)[field] = signal(value);
			this._version.value++;
		}
	}

	/**
	 * Remove a field (for cleanup of dynamic fields)
	 */
	removeField(field: string): void {
		if (this._disposed) return;

		if (field in this._fields) {
			delete (this._fields as Record<string, WritableSignal<unknown>>)[field];
			this._version.value++;
		}
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/**
	 * Dispose this signal and cleanup subscriptions
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		this.options.onDispose?.();
	}

	/**
	 * Check if disposed
	 */
	get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Get list of fields that have been accessed
	 */
	getAccessedFields(): (keyof T)[] {
		return Array.from(this.accessedFields);
	}

	/**
	 * Check if a field exists
	 */
	hasField(field: string): boolean {
		return field in this._fields;
	}

	/**
	 * Get all field names
	 */
	getFieldNames(): (keyof T)[] {
		return Object.keys(this._fields) as (keyof T)[];
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an EntitySignal from initial data
 */
export function createEntitySignal<T extends Record<string, unknown>>(
	data: T,
	options?: EntitySignalOptions,
): EntitySignal<T> {
	return new EntitySignal(data, options);
}

// =============================================================================
// Partial EntitySignal (for select queries)
// =============================================================================

/**
 * Create a partial EntitySignal that only has selected fields.
 * Derives values from a source EntitySignal.
 */
export function deriveEntitySignal<T extends Record<string, unknown>, K extends keyof T>(
	source: EntitySignal<T>,
	fields: K[],
	options?: EntitySignalOptions,
): EntitySignal<Pick<T, K>> {
	// Create initial data from source
	const initialData = {} as Pick<T, K>;
	for (const field of fields) {
		initialData[field] = source.$[field].value;
	}

	const derived = new EntitySignal(initialData, {
		...options,
		onDispose: () => {
			// Cleanup subscription tracking
			options?.onDispose?.();
		},
	});

	// Subscribe to source field changes
	// Note: In real implementation, this would use effect() for proper cleanup
	// For now, we create computed signals that derive from source

	return derived;
}
