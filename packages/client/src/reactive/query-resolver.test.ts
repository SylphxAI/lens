/**
 * @sylphx/lens-client - QueryResolver Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { type QueryResolver, type QueryTransport, createQueryResolver } from "./query-resolver";
import { type SubscriptionManager, createSubscriptionManager } from "./subscription-manager";

describe("QueryResolver", () => {
	let subscriptionManager: SubscriptionManager;
	let resolver: QueryResolver;
	let transport: QueryTransport;
	let fetchCalls: Array<{ entityName: string; entityId: string; fields?: string[] }>;
	let listCalls: Array<{ entityName: string; options?: unknown }>;

	beforeEach(() => {
		subscriptionManager = createSubscriptionManager();
		resolver = createQueryResolver(subscriptionManager);
		fetchCalls = [];
		listCalls = [];

		transport = {
			fetch: async (entityName, entityId, fields) => {
				fetchCalls.push({ entityName, entityId, fields });
				return { id: entityId, name: `User ${entityId}`, bio: "Hello" };
			},
			fetchList: async (entityName, options) => {
				listCalls.push({ entityName, options });
				return [
					{ id: "1", name: "User 1" },
					{ id: "2", name: "User 2" },
				];
			},
		};

		resolver.setTransport(transport);
	});

	describe("resolveEntity", () => {
		it("fetches entity when not in cache", async () => {
			const result = await resolver.resolveEntity<{ id: string; name: string; bio: string }>(
				"User",
				"123",
			);

			expect(result.derived).toBe(false);
			expect(result.signal.$.id.value).toBe("123");
			expect(result.signal.$.name.value).toBe("User 123");
			expect(fetchCalls.length).toBe(1);
		});

		it("reuses existing subscription for same entity", async () => {
			// First fetch
			const result1 = await resolver.resolveEntity<{ id: string; name: string }>("User", "123");

			// Second fetch - should reuse
			const result2 = await resolver.resolveEntity<{ id: string; name: string }>("User", "123");

			expect(result1.signal).toBe(result2.signal);
			expect(fetchCalls.length).toBe(1); // Only one fetch
		});

		it("derives partial query from full subscription", async () => {
			// First fetch full entity
			await resolver.resolveEntity<{ id: string; name: string; bio: string }>("User", "123");

			// Now request partial - should derive
			const result = await resolver.resolveEntity<{ name: string }>("User", "123", ["name"]);

			expect(result.derived).toBe(true);
			expect(result.signal.$.name.value).toBe("User 123");
			expect(fetchCalls.length).toBe(1); // No additional fetch
		});

		it("deduplicates in-flight requests", async () => {
			// Make concurrent requests
			const [result1, result2, result3] = await Promise.all([
				resolver.resolveEntity<{ id: string }>("User", "123"),
				resolver.resolveEntity<{ id: string }>("User", "123"),
				resolver.resolveEntity<{ id: string }>("User", "123"),
			]);

			expect(result1.signal).toBe(result2.signal);
			expect(result2.signal).toBe(result3.signal);
			expect(fetchCalls.length).toBe(1); // Only one fetch despite 3 requests
		});
	});

	describe("resolveList", () => {
		it("fetches list and creates signals", async () => {
			const result = await resolver.resolveList<{ id: string; name: string }>("User");

			expect(result.signals.length).toBe(2);
			expect(result.signals[0].$.name.value).toBe("User 1");
			expect(result.signals[1].$.name.value).toBe("User 2");
			expect(listCalls.length).toBe(1);
		});

		it("creates combined list signal", async () => {
			const result = await resolver.resolveList<{ id: string; name: string }>("User");

			const list = result.list.value;
			expect(list.length).toBe(2);
			expect(list[0].name).toBe("User 1");
		});

		it("passes options to transport", async () => {
			await resolver.resolveList<{ id: string; name: string }>("User", {
				where: { isActive: true },
				orderBy: { name: "asc" },
				take: 10,
			});

			expect(listCalls[0].options).toEqual({
				where: { isActive: true },
				orderBy: { name: "asc" },
				take: 10,
			});
		});
	});

	describe("releaseQuery", () => {
		it("unsubscribes fields when released", async () => {
			const result = await resolver.resolveEntity<{ id: string; name: string }>("User", "123", [
				"name",
			]);

			// Release
			resolver.releaseQuery(result.key);

			// Should have unsubscribed
			const fields = subscriptionManager.getSubscribedFields("User", "123");
			expect(fields).not.toContain("name");
		});

		it("decrements refCount before unsubscribing", async () => {
			// Create two queries for same data
			const result1 = await resolver.resolveEntity<{ id: string; name: string }>("User", "123", [
				"name",
			]);

			// Manually increment ref (simulating second subscriber)
			// In real usage, the second resolveEntity would do this
			await resolver.resolveEntity<{ id: string; name: string }>("User", "123", ["name"]);

			// Release first
			resolver.releaseQuery(result1.key);

			// Should still be subscribed
			const fields = subscriptionManager.getSubscribedFields("User", "123");
			expect(fields).toContain("name");
		});
	});

	describe("queueFetch (batching)", () => {
		it("batches multiple queries", async () => {
			const batchCalls: Array<Array<{ entityName: string; entityId: string }>> = [];

			const batchTransport: QueryTransport = {
				fetch: transport.fetch,
				fetchList: transport.fetchList,
				batchFetch: async (requests) => {
					batchCalls.push(requests);
					return requests.map((r) => ({ id: r.entityId, name: `User ${r.entityId}` }));
				},
			};

			resolver.setTransport(batchTransport);

			// Queue multiple fetches
			const promises = [
				resolver.queueFetch("User", "1"),
				resolver.queueFetch("User", "2"),
				resolver.queueFetch("User", "3"),
			];

			const results = await Promise.all(promises);

			expect(batchCalls.length).toBe(1); // Single batch call
			expect(batchCalls[0].length).toBe(3); // All three in batch
			expect(results[0]).toEqual({ id: "1", name: "User 1" });
		});

		it("falls back to individual fetch without batchFetch support", async () => {
			// Queue multiple fetches (transport without batchFetch)
			const promises = [resolver.queueFetch("User", "1"), resolver.queueFetch("User", "2")];

			const results = await Promise.all(promises);

			expect(fetchCalls.length).toBe(2); // Individual fetches
			expect(results[0]).toEqual({ id: "1", name: "User 1", bio: "Hello" });
		});
	});

	describe("getStats", () => {
		it("returns resolver statistics", async () => {
			// Create some queries
			await resolver.resolveEntity("User", "123");

			const stats = resolver.getStats();
			expect(stats.inFlightQueries).toBe(0); // Completed
			expect(stats.pendingBatch).toBe(0);
		});
	});

	describe("clear", () => {
		it("clears all state", async () => {
			await resolver.resolveEntity("User", "123");

			resolver.clear();

			const stats = resolver.getStats();
			expect(stats.trackedQueries).toBe(0);
		});
	});

	describe("error handling", () => {
		it("throws when no transport configured", async () => {
			const noTransportResolver = createQueryResolver(subscriptionManager);

			await expect(noTransportResolver.resolveEntity("User", "123")).rejects.toThrow(
				"No transport configured",
			);
		});

		it("propagates fetch errors", async () => {
			const errorTransport: QueryTransport = {
				fetch: async () => {
					throw new Error("Network error");
				},
				fetchList: transport.fetchList,
			};

			resolver.setTransport(errorTransport);

			await expect(resolver.resolveEntity("User", "123")).rejects.toThrow("Network error");
		});
	});
});
