/**
 * Field-Level Subscriptions Tests
 *
 * Tests the framework-agnostic field-level subscription API.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { z } from "zod";
import {
	defineResource,
	createEventStream,
	type FieldUpdateEvent,
	type DeltaOperation,
	applyDelta,
	FieldSubscriptionManager,
	getFieldSubscriptionManager,
	setFieldSubscriptionManager,
} from "../index.js";

// Test resource
const Session = defineResource({
	name: "session",
	fields: z.object({
		id: z.string(),
		title: z.string(),
		status: z.enum(["active", "completed", "archived"]),
		messageCount: z.number(),
		metadata: z.object({
			theme: z.string(),
			language: z.string(),
		}),
	}),
	updateStrategy: {
		mode: "auto",
		streamingFields: ["title"],
	},
});

// Mock database
const mockDb = {
	sessions: new Map<string, any>([
		[
			"1",
			{
				id: "1",
				title: "Hello",
				status: "active",
				messageCount: 5,
				metadata: { theme: "dark", language: "en" },
			},
		],
	]),

	async findById(tableName: string, id: string) {
		return this.sessions.get(id) || null;
	},

	async findMany() {
		return Array.from(this.sessions.values());
	},

	async create(tableName: string, data: any) {
		this.sessions.set(data.id, data);
		return data;
	},

	async update(tableName: string, id: string, data: any) {
		const existing = this.sessions.get(id);
		if (!existing) throw new Error("Not found");
		const updated = { ...existing, ...data };
		this.sessions.set(id, updated);
		return updated;
	},

	async delete(tableName: string, id: string) {
		this.sessions.delete(id);
	},

	async batchLoadByIds(tableName: string, ids: readonly string[]) {
		return ids.map((id) => this.sessions.get(id)).filter(Boolean);
	},

	async batchLoadRelated() {
		return [];
	},
};

describe("Field-Level Subscriptions", () => {
	let eventStream: ReturnType<typeof createEventStream>;
	let manager: FieldSubscriptionManager;

	beforeEach(() => {
		eventStream = createEventStream();
		manager = new FieldSubscriptionManager();
		setFieldSubscriptionManager(manager);
	});

	describe("applyDelta utility", () => {
		test("insert operation", () => {
			const result = applyDelta("Hello", {
				op: "insert",
				pos: 5,
				text: " World",
			});
			expect(result).toBe("Hello World");
		});

		test("delete operation", () => {
			const result = applyDelta("Hello World", {
				op: "delete",
				pos: 5,
				deleteCount: 6,
			});
			expect(result).toBe("Hello");
		});

		test("replace operation", () => {
			const result = applyDelta("Hello", {
				op: "replace",
				text: "Goodbye",
			});
			expect(result).toBe("Goodbye");
		});

		test("insert at beginning", () => {
			const result = applyDelta("World", {
				op: "insert",
				pos: 0,
				text: "Hello ",
			});
			expect(result).toBe("Hello World");
		});

		test("insert at middle", () => {
			const result = applyDelta("Helo", {
				op: "insert",
				pos: 2,
				text: "l",
			});
			expect(result).toBe("Hello");
		});

		test("delete at beginning", () => {
			const result = applyDelta("Hello World", {
				op: "delete",
				pos: 0,
				deleteCount: 6,
			});
			expect(result).toBe("World");
		});

		test("throws on invalid insert (missing pos)", () => {
			expect(() =>
				applyDelta("Hello", { op: "insert", text: "x" } as DeltaOperation),
			).toThrow("Insert operation requires pos and text");
		});

		test("throws on invalid delete (missing deleteCount)", () => {
			expect(() =>
				applyDelta("Hello", { op: "delete", pos: 0 } as DeltaOperation),
			).toThrow("Delete operation requires pos and deleteCount");
		});

		test("throws on invalid replace (missing text)", () => {
			expect(() =>
				applyDelta("Hello", { op: "replace" } as DeltaOperation),
			).toThrow("Replace operation requires text");
		});
	});

	describe("FieldSubscriptionManager", () => {
		test("subscribes to field updates", () => {
			const events: any[] = [];

			manager.subscribe("1", {
				title: {
					onChange: (value) => events.push({ field: "title", value }),
				},
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "New Title",
			});

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({ field: "title", value: "New Title" });
		});

		test("subscribes to streaming field updates", () => {
			const events: any[] = [];

			manager.subscribe("1", {
				title: {
					onStart: (value) => events.push({ type: "start", value }),
					onDelta: (delta) => events.push({ type: "delta", delta }),
					onEnd: (value) => events.push({ type: "end", value }),
				},
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "start",
				value: "",
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 0, text: "Hello" },
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "end",
				value: "Hello",
			});

			expect(events).toHaveLength(3);
			expect(events[0]).toEqual({ type: "start", value: "" });
			expect(events[1]).toEqual({
				type: "delta",
				delta: { op: "insert", pos: 0, text: "Hello" },
			});
			expect(events[2]).toEqual({ type: "end", value: "Hello" });
		});

		test("handles errors in streaming fields", () => {
			const errors: any[] = [];

			manager.subscribe("1", {
				title: {
					onStart: () => {},
					onError: (error) => errors.push(error),
				},
			});

			const testError = new Error("Test error");
			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "error",
				error: testError,
			});

			expect(errors).toHaveLength(1);
			expect(errors[0]).toBe(testError);
		});

		test("handles errors in regular fields", () => {
			const errors: any[] = [];

			manager.subscribe("1", {
				status: {
					onChange: () => {},
					onError: (error) => errors.push(error),
				},
			});

			const testError = new Error("Test error");
			manager.dispatch({
				entityId: "1",
				fieldName: "status",
				type: "error",
				error: testError,
			});

			expect(errors).toHaveLength(1);
			expect(errors[0]).toBe(testError);
		});

		test("unsubscribes correctly", () => {
			const events: any[] = [];

			const unsubscribe = manager.subscribe("1", {
				title: {
					onChange: (value) => events.push(value),
				},
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "First",
			});

			unsubscribe();

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "Second",
			});

			expect(events).toHaveLength(1);
			expect(events[0]).toBe("First");
		});

		test("isolates subscriber errors", () => {
			const events: any[] = [];

			manager.subscribe("1", {
				title: {
					onChange: () => {
						throw new Error("Subscriber error");
					},
				},
				status: {
					onChange: (value) => events.push(value),
				},
			});

			// First dispatch throws error but doesn't break manager
			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "Title",
			});

			// Second dispatch should still work
			manager.dispatch({
				entityId: "1",
				fieldName: "status",
				type: "change",
				value: "completed",
			});

			expect(events).toHaveLength(1);
			expect(events[0]).toBe("completed");
		});

		test("handles multiple subscribers to same entity", () => {
			const events1: any[] = [];
			const events2: any[] = [];

			manager.subscribe("1", {
				title: {
					onChange: (value) => events1.push(value),
				},
			});

			// Second subscription to same entity (replaces first)
			manager.subscribe("1", {
				title: {
					onChange: (value) => events2.push(value),
				},
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "New Title",
			});

			// Only second subscription receives events (it replaced first)
			expect(events1).toHaveLength(0);
			expect(events2).toHaveLength(1);
		});

		test("handles onChange with oldValue", () => {
			const events: any[] = [];

			manager.subscribe("1", {
				title: {
					onChange: (value, oldValue) => events.push({ value, oldValue }),
				},
			});

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "New Title",
				oldValue: "Old Title",
			});

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({ value: "New Title", oldValue: "Old Title" });
		});

		test("clears all subscriptions", () => {
			const events: any[] = [];

			manager.subscribe("1", {
				title: {
					onChange: (value) => events.push(value),
				},
			});

			manager.clear();

			manager.dispatch({
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "Title",
			});

			expect(events).toHaveLength(0);
		});
	});

	describe("Resource API Integration", () => {
		test("subscribes to fields with streaming support", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			const events: any[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						title: {
							onStart: (value) => events.push({ type: "start", value }),
							onDelta: (delta) => events.push({ type: "delta", delta }),
							onEnd: (value) => events.push({ type: "end", value }),
						},
					},
				},
				undefined,
				ctx,
			);

			// Simulate streaming events from server
			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "start",
				value: "",
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 0, text: "H" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 1, text: "ello" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "end",
				value: "Hello",
			});

			// Allow time for async event propagation
			return new Promise((resolve) => {
				setTimeout(() => {
					expect(events.length).toBeGreaterThanOrEqual(4);
					expect(events[0]).toEqual({ type: "start", value: "" });
					expect(events[1].type).toBe("delta");
					expect(events[1].delta.op).toBe("insert");

					subscription.unsubscribe();
					resolve(undefined);
				}, 50);
			});
		});

		test("subscribes to regular field changes", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			const events: any[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						status: {
							onChange: (value, oldValue) =>
								events.push({ value, oldValue }),
						},
					},
				},
				undefined,
				ctx,
			);

			// Simulate field change event from server
			eventStream.publish<FieldUpdateEvent>("session:1:field:status", {
				entityId: "1",
				fieldName: "status",
				type: "change",
				value: "completed",
				oldValue: "active",
			});

			return new Promise((resolve) => {
				setTimeout(() => {
					expect(events).toHaveLength(1);
					expect(events[0]).toEqual({ value: "completed", oldValue: "active" });

					subscription.unsubscribe();
					resolve(undefined);
				}, 50);
			});
		});

		test("subscribes to multiple fields simultaneously", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			const titleEvents: any[] = [];
			const statusEvents: any[] = [];
			const countEvents: any[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						title: {
							onDelta: (delta) => titleEvents.push(delta),
						},
						status: {
							onChange: (value) => statusEvents.push(value),
						},
						messageCount: {
							onChange: (value) => countEvents.push(value),
						},
					},
				},
				undefined,
				ctx,
			);

			// Simulate multiple field updates
			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 0, text: "Hello" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:status", {
				entityId: "1",
				fieldName: "status",
				type: "change",
				value: "completed",
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:messageCount", {
				entityId: "1",
				fieldName: "messageCount",
				type: "change",
				value: 10,
			});

			return new Promise((resolve) => {
				setTimeout(() => {
					expect(titleEvents).toHaveLength(1);
					expect(statusEvents).toHaveLength(1);
					expect(countEvents).toHaveLength(1);

					expect(titleEvents[0]).toEqual({
						op: "insert",
						pos: 0,
						text: "Hello",
					});
					expect(statusEvents[0]).toBe("completed");
					expect(countEvents[0]).toBe(10);

					subscription.unsubscribe();
					resolve(undefined);
				}, 50);
			});
		});

		test("pattern matching works correctly", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			const events: any[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						title: {
							onChange: (value) => events.push(value),
						},
					},
				},
				undefined,
				ctx,
			);

			// Should match
			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "Match",
			});

			// Should NOT match (different entity)
			eventStream.publish<FieldUpdateEvent>("session:2:field:title", {
				entityId: "2",
				fieldName: "title",
				type: "change",
				value: "No Match",
			});

			// Should NOT match (different resource)
			eventStream.publish<FieldUpdateEvent>("message:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "No Match",
			});

			return new Promise((resolve) => {
				setTimeout(() => {
					expect(events).toHaveLength(1);
					expect(events[0]).toBe("Match");

					subscription.unsubscribe();
					resolve(undefined);
				}, 50);
			});
		});

		test("unsubscribe stops receiving events", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			const events: any[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						title: {
							onChange: (value) => events.push(value),
						},
					},
				},
				undefined,
				ctx,
			);

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "change",
				value: "Before Unsubscribe",
			});

			return new Promise((resolve) => {
				setTimeout(() => {
					subscription.unsubscribe();

					eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
						entityId: "1",
						fieldName: "title",
						type: "change",
						value: "After Unsubscribe",
					});

					setTimeout(() => {
						expect(events).toHaveLength(1);
						expect(events[0]).toBe("Before Unsubscribe");
						resolve(undefined);
					}, 50);
				}, 50);
			});
		});
	});

	describe("Real-world Streaming Scenario", () => {
		test("simulates AI-generated title streaming", () => {
			const ctx = {
				db: mockDb,
				eventStream,
			};

			let currentTitle = "";
			const phases: string[] = [];

			const subscription = Session.api.get.subscribe(
				{ id: "1" },
				{
					fields: {
						title: {
							onStart: (value) => {
								currentTitle = value;
								phases.push("start");
							},
							onDelta: (delta) => {
								currentTitle = applyDelta(currentTitle, delta);
								phases.push("delta");
							},
							onEnd: (value) => {
								currentTitle = value;
								phases.push("end");
							},
						},
					},
				},
				undefined,
				ctx,
			);

			// Simulate AI streaming: "Lens Framework Discussion"
			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "start",
				value: "",
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 0, text: "Lens" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 4, text: " Framework" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "delta",
				delta: { op: "insert", pos: 14, text: " Discussion" },
			});

			eventStream.publish<FieldUpdateEvent>("session:1:field:title", {
				entityId: "1",
				fieldName: "title",
				type: "end",
				value: "Lens Framework Discussion",
			});

			return new Promise((resolve) => {
				setTimeout(() => {
					expect(phases).toEqual(["start", "delta", "delta", "delta", "end"]);
					expect(currentTitle).toBe("Lens Framework Discussion");

					subscription.unsubscribe();
					resolve(undefined);
				}, 100);
			});
		});
	});

	describe("Global Manager", () => {
		test("getFieldSubscriptionManager returns singleton", () => {
			const manager1 = getFieldSubscriptionManager();
			const manager2 = getFieldSubscriptionManager();
			expect(manager1).toBe(manager2);
		});

		test("setFieldSubscriptionManager replaces global instance", () => {
			const customManager = new FieldSubscriptionManager();
			setFieldSubscriptionManager(customManager);
			const retrieved = getFieldSubscriptionManager();
			expect(retrieved).toBe(customManager);
		});
	});
});
