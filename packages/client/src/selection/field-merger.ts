/**
 * @sylphx/lens-client - Field Merger
 *
 * Efficient field selection merging for multi-component subscriptions.
 * Allows multiple components to subscribe to the same endpoint with different
 * field selections, automatically merging selections, making one network request,
 * and distributing filtered results back to each component.
 *
 * Algorithm Design:
 * 1. Track all active selections per endpoint via SelectionRegistry
 * 2. Merge selections to maximum coverage (union of all fields)
 * 3. Dynamically expand/shrink based on component mount/unmount
 * 4. Filter response data back to each component's specific selection
 *
 * Key Invariants:
 * - ONE network request per unique endpoint + merged selection
 * - Subscribers receive ONLY their requested fields
 * - Selection expands immediately on new subscriber
 * - Selection shrinks only when last subscriber for a field unmounts
 */

import type { SelectionObject } from "../client/types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Unique endpoint identifier.
 * Combines entity, entityId, and input hash for cache key.
 */
export type EndpointKey = string;

/**
 * Unique subscriber identifier.
 */
export type SubscriberId = string;

/**
 * Metadata about a single subscriber.
 */
export interface SubscriberMetadata {
	/** Unique subscriber ID */
	id: SubscriberId;
	/** The specific fields this subscriber wants */
	selection: SelectionObject;
	/** Callback to notify subscriber with filtered data */
	onData: (data: unknown) => void;
	/** Callback to notify subscriber of errors */
	onError?: (error: Error) => void;
	/** When this subscriber was created */
	createdAt: number;
}

/**
 * Tracked endpoint with all its subscribers.
 */
export interface TrackedEndpoint {
	/** Endpoint identifier (entity:entityId:inputHash) */
	key: EndpointKey;
	/** All active subscribers */
	subscribers: Map<SubscriberId, SubscriberMetadata>;
	/** Current merged selection (union of all subscriber selections) */
	mergedSelection: SelectionObject;
	/** Last received data from server (full merged dataset) */
	lastData: unknown;
	/** Is there an active subscription to the server? */
	isSubscribed: boolean;
	/** When this endpoint was first tracked */
	createdAt: number;
	/** When selection last changed (triggering re-subscription) */
	lastSelectionChangeAt: number | null;
}

/**
 * Result of analyzing a selection change.
 */
export interface SelectionChangeAnalysis {
	/** Did the merged selection change? */
	hasChanged: boolean;
	/** Previous merged selection */
	previousSelection: SelectionObject;
	/** New merged selection */
	newSelection: SelectionObject;
	/** New fields added (requires re-subscription with expanded selection) */
	addedFields: Set<string>;
	/** Fields removed (only if no other subscriber needs them) */
	removedFields: Set<string>;
	/** Was selection expanded (new fields added)? */
	isExpanded: boolean;
	/** Was selection shrunk (fields removed)? */
	isShrunk: boolean;
}

// =============================================================================
// Selection Registry
// =============================================================================

/**
 * Registry for tracking all active field selections per endpoint.
 *
 * Responsibilities:
 * - Track subscribers and their selections per endpoint
 * - Compute merged selection across all subscribers
 * - Detect when selection changes (expand/shrink)
 * - Distribute data to subscribers with field filtering
 *
 * @example
 * ```typescript
 * const registry = new SelectionRegistry();
 *
 * // Component A mounts: wants { user: { name: true } }
 * registry.addSubscriber({
 *   endpointKey: "user:123",
 *   subscriberId: "componentA",
 *   selection: { user: { name: true } },
 *   onData: (data) => setComponentAData(data),
 * });
 * // Result: merged = { user: { name: true } }, re-subscribe needed
 *
 * // Component B mounts: wants { user: { email: true, posts: { title: true } } }
 * registry.addSubscriber({
 *   endpointKey: "user:123",
 *   subscriberId: "componentB",
 *   selection: { user: { email: true, posts: { title: true } } },
 *   onData: (data) => setComponentBData(data),
 * });
 * // Result: merged = { user: { name: true, email: true, posts: { title: true } } }
 * // Selection expanded → re-subscribe with new selection
 *
 * // Server sends data
 * registry.distributeData("user:123", {
 *   user: { id: "123", name: "Alice", email: "alice@example.com", posts: [...] }
 * });
 * // Component A receives: { user: { id: "123", name: "Alice" } }
 * // Component B receives: { user: { id: "123", email: "alice@example.com", posts: [...] } }
 *
 * // Component A unmounts
 * registry.removeSubscriber("user:123", "componentA");
 * // Result: merged still = { user: { email: true, posts: { title: true } } }
 * // No re-subscription needed (B still needs these fields)
 * ```
 */
export class SelectionRegistry {
	/** All tracked endpoints */
	private endpoints = new Map<EndpointKey, TrackedEndpoint>();

	// ===========================================================================
	// Subscriber Management
	// ===========================================================================

	/**
	 * Add new subscriber to an endpoint.
	 *
	 * @returns Analysis of selection change (determines if re-subscription needed)
	 */
	addSubscriber(params: {
		endpointKey: EndpointKey;
		subscriberId: SubscriberId;
		selection: SelectionObject;
		onData: (data: unknown) => void;
		onError?: (error: Error) => void;
	}): SelectionChangeAnalysis {
		const { endpointKey, subscriberId, selection, onData, onError } = params;

		// Get or create endpoint
		let endpoint = this.endpoints.get(endpointKey);
		const previousSelection = endpoint ? { ...endpoint.mergedSelection } : {};

		if (!endpoint) {
			endpoint = {
				key: endpointKey,
				subscribers: new Map(),
				mergedSelection: {},
				lastData: null,
				isSubscribed: false,
				createdAt: Date.now(),
				lastSelectionChangeAt: null,
			};
			this.endpoints.set(endpointKey, endpoint);
		}

		// Add subscriber
		const subscriberMeta: SubscriberMetadata = {
			id: subscriberId,
			selection,
			onData,
			createdAt: Date.now(),
		};
		if (onError) {
			subscriberMeta.onError = onError;
		}
		endpoint.subscribers.set(subscriberId, subscriberMeta);

		// Recompute merged selection
		const newSelection = this.computeMergedSelection(endpoint);
		const analysis = this.analyzeSelectionChange(previousSelection, newSelection);

		if (analysis.hasChanged) {
			endpoint.mergedSelection = newSelection;
			endpoint.lastSelectionChangeAt = Date.now();
		}

		return analysis;
	}

	/**
	 * Remove subscriber from an endpoint.
	 *
	 * @returns Analysis of selection change (determines if re-subscription needed)
	 */
	removeSubscriber(endpointKey: EndpointKey, subscriberId: SubscriberId): SelectionChangeAnalysis {
		const endpoint = this.endpoints.get(endpointKey);
		if (!endpoint) {
			return this.noChangeAnalysis();
		}

		const previousSelection = { ...endpoint.mergedSelection };

		// Remove subscriber
		endpoint.subscribers.delete(subscriberId);

		// If no more subscribers, remove endpoint entirely
		if (endpoint.subscribers.size === 0) {
			this.endpoints.delete(endpointKey);
			return this.analyzeSelectionChange(previousSelection, {});
		}

		// Recompute merged selection (may shrink if this was last subscriber for some fields)
		const newSelection = this.computeMergedSelection(endpoint);
		const analysis = this.analyzeSelectionChange(previousSelection, newSelection);

		if (analysis.hasChanged) {
			endpoint.mergedSelection = newSelection;
			endpoint.lastSelectionChangeAt = Date.now();
		}

		return analysis;
	}

	/**
	 * Get current merged selection for an endpoint.
	 */
	getMergedSelection(endpointKey: EndpointKey): SelectionObject | null {
		return this.endpoints.get(endpointKey)?.mergedSelection ?? null;
	}

	/**
	 * Get all subscriber IDs for an endpoint.
	 */
	getSubscriberIds(endpointKey: EndpointKey): SubscriberId[] {
		const endpoint = this.endpoints.get(endpointKey);
		return endpoint ? Array.from(endpoint.subscribers.keys()) : [];
	}

	/**
	 * Get subscriber count for an endpoint.
	 */
	getSubscriberCount(endpointKey: EndpointKey): number {
		return this.endpoints.get(endpointKey)?.subscribers.size ?? 0;
	}

	/**
	 * Check if endpoint has any subscribers.
	 */
	hasSubscribers(endpointKey: EndpointKey): boolean {
		return (this.endpoints.get(endpointKey)?.subscribers.size ?? 0) > 0;
	}

	// ===========================================================================
	// Data Distribution
	// ===========================================================================

	/**
	 * Distribute received data to all subscribers.
	 * Each subscriber receives data filtered to their specific selection.
	 *
	 * @param endpointKey - The endpoint that received data
	 * @param data - Full data matching the merged selection
	 */
	distributeData(endpointKey: EndpointKey, data: unknown): void {
		const endpoint = this.endpoints.get(endpointKey);
		if (!endpoint) return;

		// Cache the data
		endpoint.lastData = data;

		// Distribute to each subscriber with field filtering
		for (const subscriber of endpoint.subscribers.values()) {
			try {
				const filteredData = filterToSelection(data, subscriber.selection);
				subscriber.onData(filteredData);
			} catch (error) {
				if (subscriber.onError) {
					subscriber.onError(error instanceof Error ? error : new Error(String(error)));
				}
			}
		}
	}

	/**
	 * Distribute error to all subscribers.
	 */
	distributeError(endpointKey: EndpointKey, error: Error): void {
		const endpoint = this.endpoints.get(endpointKey);
		if (!endpoint) return;

		for (const subscriber of endpoint.subscribers.values()) {
			subscriber.onError?.(error);
		}
	}

	/**
	 * Get last data for an endpoint (useful for immediate synchronous access).
	 */
	getLastData(endpointKey: EndpointKey): unknown {
		return this.endpoints.get(endpointKey)?.lastData ?? null;
	}

	// ===========================================================================
	// Subscription State
	// ===========================================================================

	/**
	 * Mark endpoint as subscribed to server.
	 */
	markSubscribed(endpointKey: EndpointKey): void {
		const endpoint = this.endpoints.get(endpointKey);
		if (endpoint) {
			endpoint.isSubscribed = true;
		}
	}

	/**
	 * Mark endpoint as unsubscribed from server.
	 */
	markUnsubscribed(endpointKey: EndpointKey): void {
		const endpoint = this.endpoints.get(endpointKey);
		if (endpoint) {
			endpoint.isSubscribed = false;
		}
	}

	/**
	 * Check if endpoint is subscribed to server.
	 */
	isSubscribed(endpointKey: EndpointKey): boolean {
		return this.endpoints.get(endpointKey)?.isSubscribed ?? false;
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Get all tracked endpoint keys.
	 */
	getEndpointKeys(): EndpointKey[] {
		return Array.from(this.endpoints.keys());
	}

	/**
	 * Clear all endpoints and subscribers.
	 */
	clear(): void {
		this.endpoints.clear();
	}

	/**
	 * Get statistics about the registry.
	 */
	getStats(): {
		endpointCount: number;
		totalSubscribers: number;
		avgSubscribersPerEndpoint: number;
	} {
		let totalSubscribers = 0;
		for (const endpoint of this.endpoints.values()) {
			totalSubscribers += endpoint.subscribers.size;
		}

		return {
			endpointCount: this.endpoints.size,
			totalSubscribers,
			avgSubscribersPerEndpoint:
				this.endpoints.size > 0 ? totalSubscribers / this.endpoints.size : 0,
		};
	}

	// ===========================================================================
	// Private Helpers
	// ===========================================================================

	/**
	 * Compute merged selection from all subscribers.
	 * Merges all selections to maximum coverage (union).
	 */
	private computeMergedSelection(endpoint: TrackedEndpoint): SelectionObject {
		const selections = Array.from(endpoint.subscribers.values()).map((s) => s.selection);
		return mergeSelections(selections);
	}

	/**
	 * Analyze what changed between two selections.
	 */
	private analyzeSelectionChange(
		previous: SelectionObject,
		next: SelectionObject,
	): SelectionChangeAnalysis {
		const previousFields = this.flattenSelectionKeys(previous);
		const nextFields = this.flattenSelectionKeys(next);

		const addedFields = new Set<string>();
		const removedFields = new Set<string>();

		// Find added fields
		for (const field of nextFields) {
			if (!previousFields.has(field)) {
				addedFields.add(field);
			}
		}

		// Find removed fields
		for (const field of previousFields) {
			if (!nextFields.has(field)) {
				removedFields.add(field);
			}
		}

		const hasChanged = addedFields.size > 0 || removedFields.size > 0;

		return {
			hasChanged,
			previousSelection: previous,
			newSelection: next,
			addedFields,
			removedFields,
			isExpanded: addedFields.size > 0,
			isShrunk: removedFields.size > 0,
		};
	}

	/**
	 * Flatten selection to set of field paths (for change detection).
	 * Examples:
	 * - { name: true } → Set(["name"])
	 * - { user: { name: true } } → Set(["user", "user.name"])
	 * - { user: { posts: { title: true } } } → Set(["user", "user.posts", "user.posts.title"])
	 */
	private flattenSelectionKeys(selection: SelectionObject, prefix = ""): Set<string> {
		const keys = new Set<string>();

		for (const [key, value] of Object.entries(selection)) {
			const path = prefix ? `${prefix}.${key}` : key;
			keys.add(path);

			// Skip boolean values (true means select field, no nesting)
			if (typeof value === "boolean") {
				continue;
			}

			if (typeof value === "object" && value !== null) {
				// Handle nested selections
				let nestedSelection: SelectionObject | undefined;

				if ("select" in value && typeof value.select === "object") {
					nestedSelection = value.select as SelectionObject;
				} else if (!("input" in value)) {
					// Direct SelectionObject
					nestedSelection = value as SelectionObject;
				}

				if (nestedSelection) {
					const nestedKeys = this.flattenSelectionKeys(nestedSelection, path);
					for (const nestedKey of nestedKeys) {
						keys.add(nestedKey);
					}
				}
			}
		}

		return keys;
	}

	/**
	 * Create a "no change" analysis.
	 */
	private noChangeAnalysis(): SelectionChangeAnalysis {
		return {
			hasChanged: false,
			previousSelection: {},
			newSelection: {},
			addedFields: new Set(),
			removedFields: new Set(),
			isExpanded: false,
			isShrunk: false,
		};
	}
}

// =============================================================================
// Core Algorithms
// =============================================================================

/**
 * Merge multiple selections into one maximum selection (union).
 *
 * Algorithm:
 * 1. For each field across all selections:
 *    - If any selection includes it, include in merged
 *    - If field is nested, recursively merge nested selections
 * 2. Result is maximum coverage across all selections
 *
 * @example
 * ```typescript
 * const selectionA = { user: { name: true } };
 * const selectionB = { user: { email: true, posts: { title: true } } };
 * const merged = mergeSelections([selectionA, selectionB]);
 * // Result: { user: { name: true, email: true, posts: { title: true } } }
 * ```
 *
 * @example Nested selections
 * ```typescript
 * const selectionA = { user: { name: true } };
 * const selectionB = { user: { name: true, email: true } };
 * const selectionC = { user: { posts: { title: true } } };
 * const merged = mergeSelections([selectionA, selectionB, selectionC]);
 * // Result: { user: { name: true, email: true, posts: { title: true } } }
 * ```
 *
 * @example With input parameters
 * ```typescript
 * const selectionA = { posts: { input: { limit: 10 }, select: { title: true } } };
 * const selectionB = { posts: { input: { limit: 20 }, select: { body: true } } };
 * const merged = mergeSelections([selectionA, selectionB]);
 * // Result: { posts: { input: { limit: 20 }, select: { title: true, body: true } } }
 * // Note: Input params from last selection win (implementation choice)
 * ```
 */
export function mergeSelections(selections: SelectionObject[]): SelectionObject {
	if (selections.length === 0) return {};
	if (selections.length === 1) return selections[0];

	const merged: SelectionObject = {};

	// Collect all unique keys across all selections
	const allKeys = new Set<string>();
	for (const selection of selections) {
		for (const key of Object.keys(selection)) {
			allKeys.add(key);
		}
	}

	// For each key, merge values from all selections
	for (const key of allKeys) {
		const values = selections.map((s) => s[key]).filter((v) => v !== undefined && v !== null);

		if (values.length === 0) continue;

		// If any value is `true`, field is fully selected
		if (values.some((v) => v === true)) {
			merged[key] = true;
			continue;
		}

		// All values are objects - need to merge nested selections
		const nestedSelections: SelectionObject[] = [];
		let lastInput: Record<string, unknown> | undefined;

		for (const value of values) {
			if (typeof value === "object" && value !== null) {
				// Extract nested selection
				if ("select" in value && typeof value.select === "object") {
					nestedSelections.push(value.select as SelectionObject);
					// Track input if present
					if ("input" in value) {
						lastInput = value.input as Record<string, unknown>;
					}
				} else if ("input" in value) {
					// { input } without explicit select means select everything
					lastInput = value.input as Record<string, unknown>;
					// Treat as selecting the whole field
					merged[key] = { input: lastInput };
				} else {
					// Direct SelectionObject
					nestedSelections.push(value as SelectionObject);
				}
			}
		}

		if (nestedSelections.length > 0) {
			const mergedNested = mergeSelections(nestedSelections);
			if (lastInput !== undefined) {
				merged[key] = { input: lastInput, select: mergedNested };
			} else {
				merged[key] = mergedNested;
			}
		}
	}

	return merged;
}

/**
 * Filter data to match a specific selection.
 * Returns only the fields requested in the selection.
 *
 * This is the inverse of merging: while merge expands selections,
 * filter contracts data to match a specific selection.
 *
 * Algorithm:
 * 1. If data is primitive, return as-is
 * 2. If data is array, apply filter to each element
 * 3. If data is object:
 *    - Always include `id` field if present
 *    - For each selected field:
 *      - If selection is `true`, include field value as-is
 *      - If selection is nested object, recursively filter
 *
 * @example
 * ```typescript
 * const data = {
 *   user: {
 *     id: "123",
 *     name: "Alice",
 *     email: "alice@example.com",
 *     posts: [
 *       { id: "1", title: "Hello", body: "World" },
 *       { id: "2", title: "Goodbye", body: "Moon" },
 *     ]
 *   }
 * };
 *
 * const selection = { user: { name: true, posts: { title: true } } };
 * const filtered = filterToSelection(data, selection);
 * // Result: {
 * //   user: {
 * //     id: "123",
 * //     name: "Alice",
 * //     posts: [
 * //       { id: "1", title: "Hello" },
 * //       { id: "2", title: "Goodbye" },
 * //     ]
 * //   }
 * // }
 * ```
 *
 * @example Arrays
 * ```typescript
 * const data = [
 *   { id: "1", name: "Alice", email: "alice@example.com" },
 *   { id: "2", name: "Bob", email: "bob@example.com" },
 * ];
 * const selection = { name: true };
 * const filtered = filterToSelection(data, selection);
 * // Result: [
 * //   { id: "1", name: "Alice" },
 * //   { id: "2", name: "Bob" },
 * // ]
 * ```
 */
export function filterToSelection(data: unknown, selection: SelectionObject): unknown {
	// Null/undefined pass through
	if (data == null) return data;

	// Arrays: apply filter to each element
	if (Array.isArray(data)) {
		return data.map((item) => filterToSelection(item, selection));
	}

	// Primitives pass through
	if (typeof data !== "object") return data;

	const obj = data as Record<string, unknown>;
	const result: Record<string, unknown> = {};

	// Always include id if present
	if ("id" in obj) {
		result.id = obj.id;
	}

	// Apply selection
	for (const [key, value] of Object.entries(selection)) {
		// Skip if field not in data
		if (!(key in obj)) continue;

		if (value === true) {
			// Include field as-is
			result[key] = obj[key];
		} else if (typeof value === "object" && value !== null) {
			// Extract nested selection
			let nestedSelection: SelectionObject | null = null;

			if ("select" in value && typeof value.select === "object") {
				nestedSelection = value.select as SelectionObject;
			} else if (!("input" in value)) {
				// Direct SelectionObject
				nestedSelection = value as SelectionObject;
			}

			if (nestedSelection) {
				// Recursively filter nested data
				result[key] = filterToSelection(obj[key], nestedSelection);
			} else {
				// No nested select means include the whole field
				result[key] = obj[key];
			}
		}
	}

	return result;
}

/**
 * Generate endpoint key from entity, entityId, and input.
 * Used to uniquely identify endpoints for caching/deduplication.
 *
 * Format: `entity:entityId[:inputHash]`
 *
 * @example
 * ```typescript
 * getEndpointKey("user", "123", { includeDeleted: true })
 * // → "user:123:abc123def456" (where abc123def456 is hash of input)
 * ```
 */
export function getEndpointKey(
	entity: string,
	entityId: string,
	input?: Record<string, unknown>,
): EndpointKey {
	if (!input || Object.keys(input).length === 0) {
		return `${entity}:${entityId}`;
	}

	// Simple hash for input (in production, use better hash function)
	const inputHash = simpleHash(JSON.stringify(input));
	return `${entity}:${entityId}:${inputHash}`;
}

/**
 * Simple hash function for input params.
 * In production, consider using a proper hash library.
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}

// =============================================================================
// Re-subscription Trigger Logic
// =============================================================================

/**
 * Determine if re-subscription is needed based on selection change.
 *
 * Re-subscription triggers:
 * 1. Selection expanded (new fields added)
 *    → Must re-subscribe with expanded selection to get new fields
 *
 * 2. Selection shrunk significantly (removed fields)
 *    → MAY re-subscribe with smaller selection to reduce bandwidth
 *    → This is optional - implementation can choose to keep fetching extra fields
 *
 * 3. First subscriber (new endpoint)
 *    → Must create initial subscription
 *
 * 4. Last subscriber removed (no more subscribers)
 *    → Must unsubscribe from server
 *
 * @param analysis - Result of analyzeSelectionChange
 * @param wasSubscribed - Was endpoint previously subscribed?
 * @param hasSubscribers - Does endpoint still have subscribers?
 * @returns Action to take
 */
export function shouldResubscribe(
	analysis: SelectionChangeAnalysis,
	wasSubscribed: boolean,
	hasSubscribers: boolean,
): "subscribe" | "resubscribe" | "unsubscribe" | "none" {
	// No subscribers left → unsubscribe
	if (!hasSubscribers) {
		return wasSubscribed ? "unsubscribe" : "none";
	}

	// First subscriber → subscribe
	if (!wasSubscribed) {
		return "subscribe";
	}

	// Selection expanded → re-subscribe to get new fields
	if (analysis.isExpanded) {
		return "resubscribe";
	}

	// Selection shrunk → optional re-subscribe
	// For efficiency, only re-subscribe if significantly shrunk
	if (analysis.isShrunk && analysis.removedFields.size > 3) {
		return "resubscribe";
	}

	// No change or minor shrink → keep existing subscription
	return "none";
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new selection registry.
 */
export function createSelectionRegistry(): SelectionRegistry {
	return new SelectionRegistry();
}
