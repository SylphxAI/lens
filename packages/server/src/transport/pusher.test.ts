/**
 * @sylphx/lens-server - Pusher Transport Tests
 */

import { describe, expect, it } from "bun:test";
import { createPusherSubscription, pusher, type PusherLike } from "./pusher.js";

// =============================================================================
// Tests
// =============================================================================

describe("pusher transport", () => {
	it("creates transport with correct name", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
		});

		expect(transport.name).toBe("pusher");
	});

	it("has required transport methods", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
		});

		expect(typeof transport.init).toBe("function");
		expect(typeof transport.publish).toBe("function");
		expect(typeof transport.subscribe).toBe("function");
		expect(typeof transport.close).toBe("function");
	});

	it("throws on publish before init", async () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
		});

		await expect(transport.publish("test-channel", { data: "test" })).rejects.toThrow(
			"Pusher transport not initialized",
		);
	});

	it("subscribe returns unsubscribe function", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
		});

		// Subscribe doesn't require init for Pusher (clients subscribe directly)
		const unsubscribe = transport.subscribe("client-1", "test-channel", () => {});

		expect(typeof unsubscribe).toBe("function");

		// Calling unsubscribe should not throw
		expect(() => unsubscribe()).not.toThrow();
	});

	it("close does not throw", async () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
		});

		await expect(transport.close?.()).resolves.toBeUndefined();
	});

	it("uses custom channel prefix", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
			channelPrefix: "custom-",
		});

		expect(transport.name).toBe("pusher");
		// Channel prefix is used internally - we verify it's accepted without error
	});

	it("accepts useTLS option", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
			useTLS: false,
		});

		expect(transport.name).toBe("pusher");
	});

	it("accepts debug option", () => {
		const transport = pusher({
			appId: "test-app-id",
			key: "test-key",
			secret: "test-secret",
			cluster: "us2",
			debug: true,
		});

		expect(transport.name).toBe("pusher");
	});
});

describe("createPusherSubscription", () => {
	it("subscribes to channel with prefix", () => {
		const subscribeChannels: string[] = [];
		const boundEvents: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(channelName: string) {
				subscribeChannels.push(channelName);
				return {
					bind(eventName: string, _callback: (data: unknown) => void) {
						boundEvents.push(eventName);
					},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", () => {});

		expect(subscribeChannels).toEqual(["lens-entity:User:123"]);
		expect(boundEvents).toEqual(["update"]);
	});

	it("uses custom channel prefix", () => {
		const subscribeChannels: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(channelName: string) {
				subscribeChannels.push(channelName);
				return {
					bind(_eventName: string, _callback: (data: unknown) => void) {},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", () => {}, "app-");

		expect(subscribeChannels).toEqual(["app-entity:User:123"]);
	});

	it("calls onMessage when update event fires", () => {
		const messages: unknown[] = [];
		let savedCallback: ((data: unknown) => void) | null = null;

		const mockPusher: PusherLike = {
			subscribe(_channelName: string) {
				return {
					bind(_eventName: string, callback: (data: unknown) => void) {
						savedCallback = callback;
					},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", (data) => {
			messages.push(data);
		});

		// Simulate Pusher sending an update
		savedCallback?.({ id: "123", name: "Test" });

		expect(messages).toEqual([{ id: "123", name: "Test" }]);
	});

	it("returns unsubscribe function", () => {
		const unboundEvents: string[] = [];
		const unsubscribedChannels: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(_channelName: string) {
				return {
					bind(_eventName: string, _callback: (data: unknown) => void) {},
					unbind(eventName: string, _callback: (data: unknown) => void) {
						unboundEvents.push(eventName);
					},
				};
			},
			unsubscribe(channelName: string) {
				unsubscribedChannels.push(channelName);
			},
		};

		const unsubscribe = createPusherSubscription(mockPusher, "entity:User:123", () => {});

		// Should return function
		expect(typeof unsubscribe).toBe("function");

		// Call unsubscribe
		unsubscribe();

		expect(unboundEvents).toEqual(["update"]);
		expect(unsubscribedChannels).toEqual(["lens-entity:User:123"]);
	});
});
