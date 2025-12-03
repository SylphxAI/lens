/**
 * @sylphx/lens-client - Signal Implementation
 *
 * Re-exports Preact Signals with Lens-specific types and utilities.
 * @see https://preactjs.com/guide/v10/signals/
 */

import {
	batch as preactBatch,
	computed as preactComputed,
	effect as preactEffect,
	signal as preactSignal,
} from "@preact/signals-core";

// =============================================================================
// Types
// =============================================================================

/** Subscription callback */
export type Subscriber<T> = (value: T) => void;

/** Unsubscribe function */
export type Unsubscribe = () => void;

/** Read-only signal interface */
export interface Signal<T> {
	/** Current value (read-only) */
	readonly value: T;

	/** Subscribe to value changes */
	subscribe(fn: Subscriber<T>): Unsubscribe;

	/** Get value without tracking */
	peek(): T;
}

/** Writable signal interface */
export interface WritableSignal<T> extends Signal<T> {
	/** Current value (read-write) */
	value: T;
}

// =============================================================================
// Factory Functions (Re-exports with our types)
// =============================================================================

/**
 * Create a writable signal
 *
 * @example
 * ```typescript
 * const count = signal(0);
 * console.log(count.value); // 0
 *
 * count.value = 1;
 * console.log(count.value); // 1
 * ```
 */
export function signal<T>(initial: T): WritableSignal<T> {
	return preactSignal(initial) as WritableSignal<T>;
}

/**
 * Create a computed signal
 *
 * @example
 * ```typescript
 * const count = signal(0);
 * const doubled = computed(() => count.value * 2);
 *
 * console.log(doubled.value); // 0
 *
 * count.value = 5;
 * console.log(doubled.value); // 10
 * ```
 */
export function computed<T>(compute: () => T): Signal<T> {
	return preactComputed(compute) as Signal<T>;
}

/**
 * Run a function whenever dependencies change
 *
 * @example
 * ```typescript
 * const count = signal(0);
 * const dispose = effect(() => {
 *   console.log('Count:', count.value);
 * });
 *
 * count.value = 1; // Logs: "Count: 1"
 * dispose(); // Stop watching
 * ```
 */
export function effect(fn: () => void | (() => void)): Unsubscribe {
	return preactEffect(fn);
}

/**
 * Batch multiple signal updates
 *
 * @example
 * ```typescript
 * const a = signal(1);
 * const b = signal(2);
 *
 * batch(() => {
 *   a.value = 10;
 *   b.value = 20;
 * });
 * // Subscribers notified only once
 * ```
 */
export function batch<T>(fn: () => T): T {
	return preactBatch(fn);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Check if a value is a signal
 */
export function isSignal(value: unknown): value is Signal<unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		"value" in value &&
		"peek" in value &&
		"subscribe" in value
	);
}

/**
 * Convert a signal to a promise that resolves when the signal changes
 */
export function toPromise<T>(sig: Signal<T>): Promise<T> {
	return new Promise((resolve) => {
		let isFirst = true;
		let unsub: Unsubscribe;
		unsub = sig.subscribe((value) => {
			// Skip the initial value (subscribe fires immediately)
			if (isFirst) {
				isFirst = false;
				return;
			}
			unsub();
			resolve(value);
		});
	});
}

/**
 * Create a signal that derives from multiple signals
 */
export function derive<T, U>(signals: Signal<T>[], fn: (values: T[]) => U): Signal<U> {
	return computed(() => fn(signals.map((s) => s.value)));
}
