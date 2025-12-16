/**
 * @sylphx/lens-client - Field Merger Tests
 *
 * Comprehensive tests demonstrating the field merging algorithm.
 */

import { describe, expect, it } from "bun:test";
import {
	filterToSelection,
	getEndpointKey,
	mergeSelections,
	type SelectionObject,
	SelectionRegistry,
	shouldResubscribe,
} from "./field-merger.js";

// =============================================================================
// mergeSelections() Tests
// =============================================================================

describe("mergeSelections", () => {
	it("merges simple selections to maximum coverage", () => {
		const selectionA: SelectionObject = { name: true };
		const selectionB: SelectionObject = { email: true };

		const merged = mergeSelections([selectionA, selectionB]);

		expect(merged).toEqual({
			name: true,
			email: true,
		});
	});

	it("merges nested selections recursively", () => {
		const selectionA: SelectionObject = {
			user: { name: true },
		};
		const selectionB: SelectionObject = {
			user: { email: true },
		};

		const merged = mergeSelections([selectionA, selectionB]);

		expect(merged).toEqual({
			user: {
				name: true,
				email: true,
			},
		});
	});

	it("merges deeply nested selections", () => {
		const selectionA: SelectionObject = {
			user: { name: true },
		};
		const selectionB: SelectionObject = {
			user: { email: true, posts: { title: true } },
		};
		const selectionC: SelectionObject = {
			user: { posts: { body: true, tags: { name: true } } },
		};

		const merged = mergeSelections([selectionA, selectionB, selectionC]);

		expect(merged).toEqual({
			user: {
				name: true,
				email: true,
				posts: {
					title: true,
					body: true,
					tags: {
						name: true,
					},
				},
			},
		});
	});

	it("handles selections with input parameters", () => {
		const selectionA: SelectionObject = {
			posts: {
				input: { limit: 10 },
				select: { title: true },
			},
		};
		const selectionB: SelectionObject = {
			posts: {
				input: { limit: 20 },
				select: { body: true },
			},
		};

		const merged = mergeSelections([selectionA, selectionB]);

		// Last input wins (implementation choice)
		expect(merged).toEqual({
			posts: {
				input: { limit: 20 },
				select: {
					title: true,
					body: true,
				},
			},
		});
	});

	it("handles empty selection list", () => {
		const merged = mergeSelections([]);
		expect(merged).toEqual({});
	});

	it("handles single selection", () => {
		const selection: SelectionObject = { name: true, email: true };
		const merged = mergeSelections([selection]);
		expect(merged).toEqual(selection);
	});

	it("handles mixed true and nested selections", () => {
		const selectionA: SelectionObject = {
			user: true, // Select whole user
		};
		const selectionB: SelectionObject = {
			user: { name: true }, // Select only name
		};

		const merged = mergeSelections([selectionA, selectionB]);

		// true wins (selects everything)
		expect(merged).toEqual({
			user: true,
		});
	});
});

// =============================================================================
// filterToSelection() Tests
// =============================================================================

describe("filterToSelection", () => {
	it("filters simple fields", () => {
		const data = {
			id: "1",
			name: "Alice",
			email: "alice@example.com",
			phone: "555-1234",
		};
		const selection: SelectionObject = {
			name: true,
			email: true,
		};

		const filtered = filterToSelection(data, selection);

		expect(filtered).toEqual({
			id: "1", // Always included
			name: "Alice",
			email: "alice@example.com",
			// phone excluded
		});
	});

	it("filters nested objects", () => {
		const data = {
			user: {
				id: "123",
				name: "Alice",
				email: "alice@example.com",
				phone: "555-1234",
			},
		};
		const selection: SelectionObject = {
			user: {
				name: true,
				email: true,
			},
		};

		const filtered = filterToSelection(data, selection);

		expect(filtered).toEqual({
			user: {
				id: "123", // Always included
				name: "Alice",
				email: "alice@example.com",
				// phone excluded
			},
		});
	});

	it("filters arrays of objects", () => {
		const data = {
			users: [
				{ id: "1", name: "Alice", email: "alice@example.com" },
				{ id: "2", name: "Bob", email: "bob@example.com" },
			],
		};
		const selection: SelectionObject = {
			users: {
				name: true,
			},
		};

		const filtered = filterToSelection(data, selection);

		expect(filtered).toEqual({
			users: [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			],
		});
	});

	it("filters deeply nested structures", () => {
		const data = {
			user: {
				id: "123",
				name: "Alice",
				posts: [
					{
						id: "1",
						title: "Hello",
						body: "World",
						tags: [
							{ id: "t1", name: "tech", color: "blue" },
							{ id: "t2", name: "news", color: "red" },
						],
					},
					{
						id: "2",
						title: "Goodbye",
						body: "Moon",
						tags: [{ id: "t3", name: "space", color: "black" }],
					},
				],
			},
		};
		const selection: SelectionObject = {
			user: {
				name: true,
				posts: {
					title: true,
					tags: {
						name: true,
					},
				},
			},
		};

		const filtered = filterToSelection(data, selection);

		expect(filtered).toEqual({
			user: {
				id: "123",
				name: "Alice",
				posts: [
					{
						id: "1",
						title: "Hello",
						tags: [
							{ id: "t1", name: "tech" },
							{ id: "t2", name: "news" },
						],
					},
					{
						id: "2",
						title: "Goodbye",
						tags: [{ id: "t3", name: "space" }],
					},
				],
			},
		});
	});

	it("handles null and undefined gracefully", () => {
		const selection: SelectionObject = { name: true };

		expect(filterToSelection(null, selection)).toBeNull();
		expect(filterToSelection(undefined, selection)).toBeUndefined();
	});

	it("handles primitives", () => {
		const selection: SelectionObject = { name: true };

		expect(filterToSelection(42, selection)).toBe(42);
		expect(filterToSelection("hello", selection)).toBe("hello");
		expect(filterToSelection(true, selection)).toBe(true);
	});

	it("handles selections with input parameters", () => {
		const data = {
			posts: [
				{ id: "1", title: "Hello", body: "World" },
				{ id: "2", title: "Goodbye", body: "Moon" },
			],
		};
		const selection: SelectionObject = {
			posts: {
				input: { limit: 10 },
				select: { title: true },
			},
		};

		const filtered = filterToSelection(data, selection);

		expect(filtered).toEqual({
			posts: [
				{ id: "1", title: "Hello" },
				{ id: "2", title: "Goodbye" },
			],
		});
	});
});

// =============================================================================
// SelectionRegistry Tests
// =============================================================================

describe("SelectionRegistry", () => {
	it("tracks single subscriber", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";
		const receivedData: unknown[] = [];

		const analysis = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true, email: true },
			onData: (data) => receivedData.push(data),
		});

		expect(analysis.hasChanged).toBe(true);
		expect(analysis.isExpanded).toBe(true);
		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			email: true,
		});
		expect(registry.getSubscriberCount(endpointKey)).toBe(1);
	});

	it("merges selections from multiple subscribers", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		// Component A subscribes
		const analysisA = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
		});

		expect(analysisA.hasChanged).toBe(true);
		expect(registry.getMergedSelection(endpointKey)).toEqual({ name: true });

		// Component B subscribes with different fields
		const analysisB = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { email: true, posts: { title: true } },
			onData: () => {},
		});

		expect(analysisB.hasChanged).toBe(true);
		expect(analysisB.isExpanded).toBe(true);
		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			email: true,
			posts: { title: true },
		});
		expect(registry.getSubscriberCount(endpointKey)).toBe(2);
	});

	it("distributes data to subscribers with field filtering", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		const dataA: unknown[] = [];
		const dataB: unknown[] = [];

		// Component A wants { name: true }
		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: (data) => dataA.push(data),
		});

		// Component B wants { email: true, posts: { title: true } }
		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { email: true, posts: { title: true } },
			onData: (data) => dataB.push(data),
		});

		// Server sends full data
		const fullData = {
			id: "123",
			name: "Alice",
			email: "alice@example.com",
			phone: "555-1234",
			posts: [
				{ id: "1", title: "Hello", body: "World" },
				{ id: "2", title: "Goodbye", body: "Moon" },
			],
		};

		registry.distributeData(endpointKey, fullData);

		// Component A receives only name
		expect(dataA).toHaveLength(1);
		expect(dataA[0]).toEqual({
			id: "123",
			name: "Alice",
		});

		// Component B receives email and posts with only title
		expect(dataB).toHaveLength(1);
		expect(dataB[0]).toEqual({
			id: "123",
			email: "alice@example.com",
			posts: [
				{ id: "1", title: "Hello" },
				{ id: "2", title: "Goodbye" },
			],
		});
	});

	it("shrinks selection when subscriber is removed", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		// Add two subscribers
		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
		});

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { email: true, posts: { title: true } },
			onData: () => {},
		});

		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			email: true,
			posts: { title: true },
		});

		// Remove component A
		const analysis = registry.removeSubscriber(endpointKey, "componentA");

		expect(analysis.hasChanged).toBe(true);
		expect(analysis.isShrunk).toBe(true);
		expect(analysis.removedFields).toContain("name");
		expect(registry.getMergedSelection(endpointKey)).toEqual({
			email: true,
			posts: { title: true },
		});
		expect(registry.getSubscriberCount(endpointKey)).toBe(1);
	});

	it("does not shrink if another subscriber needs the field", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		// Both components want name
		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true, email: true },
			onData: () => {},
		});

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { name: true, posts: { title: true } },
			onData: () => {},
		});

		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			email: true,
			posts: { title: true },
		});

		// Remove component A
		const analysis = registry.removeSubscriber(endpointKey, "componentA");

		expect(analysis.hasChanged).toBe(true);
		expect(analysis.isShrunk).toBe(true);
		// name should still be present (componentB needs it)
		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			posts: { title: true },
		});
	});

	it("removes endpoint when last subscriber is removed", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
		});

		expect(registry.hasSubscribers(endpointKey)).toBe(true);

		const analysis = registry.removeSubscriber(endpointKey, "componentA");

		expect(analysis.hasChanged).toBe(true);
		expect(registry.hasSubscribers(endpointKey)).toBe(false);
		expect(registry.getMergedSelection(endpointKey)).toBeNull();
	});

	it("distributes errors to all subscribers", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		const errorsA: Error[] = [];
		const errorsB: Error[] = [];

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
			onError: (error) => errorsA.push(error),
		});

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { email: true },
			onData: () => {},
			onError: (error) => errorsB.push(error),
		});

		const error = new Error("Connection lost");
		registry.distributeError(endpointKey, error);

		expect(errorsA).toHaveLength(1);
		expect(errorsA[0]).toBe(error);
		expect(errorsB).toHaveLength(1);
		expect(errorsB[0]).toBe(error);
	});

	it("tracks subscription state", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
		});

		expect(registry.isSubscribed(endpointKey)).toBe(false);

		registry.markSubscribed(endpointKey);
		expect(registry.isSubscribed(endpointKey)).toBe(true);

		registry.markUnsubscribed(endpointKey);
		expect(registry.isSubscribed(endpointKey)).toBe(false);
	});

	it("provides statistics", () => {
		const registry = new SelectionRegistry();

		registry.addSubscriber({
			endpointKey: "user:123",
			subscriberId: "componentA",
			selection: { name: true },
			onData: () => {},
		});

		registry.addSubscriber({
			endpointKey: "user:123",
			subscriberId: "componentB",
			selection: { email: true },
			onData: () => {},
		});

		registry.addSubscriber({
			endpointKey: "user:456",
			subscriberId: "componentC",
			selection: { name: true },
			onData: () => {},
		});

		const stats = registry.getStats();

		expect(stats.endpointCount).toBe(2);
		expect(stats.totalSubscribers).toBe(3);
		expect(stats.avgSubscribersPerEndpoint).toBe(1.5);
	});
});

// =============================================================================
// shouldResubscribe() Tests
// =============================================================================

describe("shouldResubscribe", () => {
	it("subscribes for first subscriber", () => {
		const analysis = {
			hasChanged: true,
			previousSelection: {},
			newSelection: { name: true },
			addedFields: new Set(["name"]),
			removedFields: new Set(),
			isExpanded: true,
			isShrunk: false,
		};

		const action = shouldResubscribe(analysis, false, true);
		expect(action).toBe("subscribe");
	});

	it("resubscribes when selection expands", () => {
		const analysis = {
			hasChanged: true,
			previousSelection: { name: true },
			newSelection: { name: true, email: true },
			addedFields: new Set(["email"]),
			removedFields: new Set(),
			isExpanded: true,
			isShrunk: false,
		};

		const action = shouldResubscribe(analysis, true, true);
		expect(action).toBe("resubscribe");
	});

	it("resubscribes when selection shrinks significantly", () => {
		const analysis = {
			hasChanged: true,
			previousSelection: { name: true, email: true, phone: true, address: true },
			newSelection: { name: true },
			addedFields: new Set(),
			removedFields: new Set(["email", "phone", "address", "city"]),
			isExpanded: false,
			isShrunk: true,
		};

		const action = shouldResubscribe(analysis, true, true);
		expect(action).toBe("resubscribe");
	});

	it("does not resubscribe for minor shrink", () => {
		const analysis = {
			hasChanged: true,
			previousSelection: { name: true, email: true },
			newSelection: { name: true },
			addedFields: new Set(),
			removedFields: new Set(["email"]),
			isExpanded: false,
			isShrunk: true,
		};

		const action = shouldResubscribe(analysis, true, true);
		expect(action).toBe("none");
	});

	it("unsubscribes when no subscribers left", () => {
		const analysis = {
			hasChanged: true,
			previousSelection: { name: true },
			newSelection: {},
			addedFields: new Set(),
			removedFields: new Set(["name"]),
			isExpanded: false,
			isShrunk: true,
		};

		const action = shouldResubscribe(analysis, true, false);
		expect(action).toBe("unsubscribe");
	});

	it("does nothing when selection unchanged", () => {
		const analysis = {
			hasChanged: false,
			previousSelection: { name: true },
			newSelection: { name: true },
			addedFields: new Set(),
			removedFields: new Set(),
			isExpanded: false,
			isShrunk: false,
		};

		const action = shouldResubscribe(analysis, true, true);
		expect(action).toBe("none");
	});
});

// =============================================================================
// getEndpointKey() Tests
// =============================================================================

describe("getEndpointKey", () => {
	it("generates key without input", () => {
		const key = getEndpointKey("user", "123");
		expect(key).toBe("user:123");
	});

	it("generates key with input", () => {
		const key = getEndpointKey("user", "123", { includeDeleted: true });
		// Hash value depends on implementation, just verify format
		expect(key).toMatch(/^user:123:[a-z0-9]+$/);
	});

	it("generates same key for same input", () => {
		const key1 = getEndpointKey("user", "123", { limit: 10 });
		const key2 = getEndpointKey("user", "123", { limit: 10 });
		expect(key1).toBe(key2);
	});

	it("generates different keys for different inputs", () => {
		const key1 = getEndpointKey("user", "123", { limit: 10 });
		const key2 = getEndpointKey("user", "123", { limit: 20 });
		expect(key1).not.toBe(key2);
	});

	it("handles empty input object", () => {
		const key = getEndpointKey("user", "123", {});
		expect(key).toBe("user:123");
	});
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Integration: Multi-Component Subscription Flow", () => {
	it("handles complete component lifecycle", () => {
		const registry = new SelectionRegistry();
		const endpointKey = "user:123";

		// Track received data per component
		const componentAData: unknown[] = [];
		const componentBData: unknown[] = [];
		const componentCData: unknown[] = [];

		// STEP 1: Component A mounts
		let analysis = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentA",
			selection: { name: true },
			onData: (data) => componentAData.push(data),
		});

		expect(shouldResubscribe(analysis, false, true)).toBe("subscribe");
		expect(registry.getMergedSelection(endpointKey)).toEqual({ name: true });

		registry.markSubscribed(endpointKey);

		// Server sends data
		registry.distributeData(endpointKey, {
			id: "123",
			name: "Alice",
			email: "alice@example.com",
		});

		expect(componentAData).toHaveLength(1);
		expect(componentAData[0]).toEqual({ id: "123", name: "Alice" });

		// STEP 2: Component B mounts (needs additional fields)
		analysis = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentB",
			selection: { email: true, posts: { title: true } },
			onData: (data) => componentBData.push(data),
		});

		expect(shouldResubscribe(analysis, true, true)).toBe("resubscribe");
		expect(registry.getMergedSelection(endpointKey)).toEqual({
			name: true,
			email: true,
			posts: { title: true },
		});

		// Server sends expanded data
		registry.distributeData(endpointKey, {
			id: "123",
			name: "Alice",
			email: "alice@example.com",
			posts: [
				{ id: "1", title: "Hello", body: "World" },
				{ id: "2", title: "Goodbye", body: "Moon" },
			],
		});

		expect(componentAData).toHaveLength(2);
		expect(componentAData[1]).toEqual({ id: "123", name: "Alice" });

		expect(componentBData).toHaveLength(1);
		expect(componentBData[0]).toEqual({
			id: "123",
			email: "alice@example.com",
			posts: [
				{ id: "1", title: "Hello" },
				{ id: "2", title: "Goodbye" },
			],
		});

		// STEP 3: Component C mounts (overlapping fields)
		analysis = registry.addSubscriber({
			endpointKey,
			subscriberId: "componentC",
			selection: { name: true, email: true },
			onData: (data) => componentCData.push(data),
		});

		// No new fields needed, so no re-subscription
		expect(shouldResubscribe(analysis, true, true)).toBe("none");

		// STEP 4: Component A unmounts
		analysis = registry.removeSubscriber(endpointKey, "componentA");

		// Name still needed by C, so no change
		expect(shouldResubscribe(analysis, true, true)).toBe("none");

		// STEP 5: Component C unmounts
		analysis = registry.removeSubscriber(endpointKey, "componentC");

		// Selection shrinks but not significantly (only name and email removed)
		expect(shouldResubscribe(analysis, true, true)).toBe("none");

		// STEP 6: Component B unmounts (last subscriber)
		analysis = registry.removeSubscriber(endpointKey, "componentB");

		expect(shouldResubscribe(analysis, true, false)).toBe("unsubscribe");
		expect(registry.hasSubscribers(endpointKey)).toBe(false);
	});
});
