/**
 * @sylphx/lens-core - Reconnection Metrics Tests
 */

import { describe, expect, it } from "bun:test";
import {
	createMetricsTracker,
	DEFAULT_METRICS_CONFIG,
	type MetricsEvent,
	ReconnectionMetricsTracker,
} from "./metrics.js";
import type { ReconnectResult, ReconnectStatus } from "./types.js";

// =============================================================================
// Tests
// =============================================================================

describe("ReconnectionMetricsTracker", () => {
	describe("basic tracking", () => {
		it("tracks successful reconnection", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 3);
			tracker.completeReconnection("rc_1", [
				createResult("sub-1", "current"),
				createResult("sub-2", "patched"),
				createResult("sub-3", "snapshot"),
			]);

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(1);
			expect(metrics.successfulReconnects).toBe(1);
			expect(metrics.failedReconnects).toBe(0);
			expect(metrics.successRate).toBe(1);
			expect(metrics.totalSubscriptionsProcessed).toBe(3);
		});

		it("tracks failed reconnection", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 5);
			tracker.failReconnection("rc_1", new Error("Connection failed"));

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(1);
			expect(metrics.successfulReconnects).toBe(0);
			expect(metrics.failedReconnects).toBe(1);
			expect(metrics.successRate).toBe(0);
		});

		it("calculates success rate correctly", () => {
			const tracker = new ReconnectionMetricsTracker();

			// 3 successes
			for (let i = 0; i < 3; i++) {
				tracker.startReconnection(`rc_s${i}`, 1);
				tracker.completeReconnection(`rc_s${i}`, [createResult("sub", "current")]);
			}

			// 2 failures
			for (let i = 0; i < 2; i++) {
				tracker.startReconnection(`rc_f${i}`, 1);
				tracker.failReconnection(`rc_f${i}`, new Error("Failed"));
			}

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(5);
			expect(metrics.successfulReconnects).toBe(3);
			expect(metrics.failedReconnects).toBe(2);
			expect(metrics.successRate).toBe(0.6);
		});
	});

	describe("status breakdown", () => {
		it("counts subscription statuses", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 5);
			tracker.completeReconnection("rc_1", [
				createResult("sub-1", "current"),
				createResult("sub-2", "current"),
				createResult("sub-3", "patched"),
				createResult("sub-4", "snapshot"),
				createResult("sub-5", "deleted"),
			]);

			const metrics = tracker.getMetrics();

			expect(metrics.statusBreakdown.current).toBe(2);
			expect(metrics.statusBreakdown.patched).toBe(1);
			expect(metrics.statusBreakdown.snapshot).toBe(1);
			expect(metrics.statusBreakdown.deleted).toBe(1);
			expect(metrics.statusBreakdown.error).toBe(0);
		});

		it("accumulates across multiple reconnections", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 2);
			tracker.completeReconnection("rc_1", [createResult("sub-1", "current"), createResult("sub-2", "patched")]);

			tracker.startReconnection("rc_2", 3);
			tracker.completeReconnection("rc_2", [
				createResult("sub-3", "current"),
				createResult("sub-4", "snapshot"),
				createResult("sub-5", "snapshot"),
			]);

			const metrics = tracker.getMetrics();

			expect(metrics.statusBreakdown.current).toBe(2);
			expect(metrics.statusBreakdown.patched).toBe(1);
			expect(metrics.statusBreakdown.snapshot).toBe(2);
		});
	});

	describe("latency tracking", () => {
		it("calculates average latency", async () => {
			const tracker = new ReconnectionMetricsTracker();

			// Reconnection 1: ~10ms
			tracker.startReconnection("rc_1", 1);
			await sleep(10);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			const metrics = tracker.getMetrics();

			expect(metrics.averageLatency).toBeGreaterThanOrEqual(5);
			expect(metrics.averageLatency).toBeLessThan(100);
		});

		it("calculates percentiles", async () => {
			const tracker = new ReconnectionMetricsTracker();

			// Create multiple reconnections with varying latencies
			for (let i = 0; i < 10; i++) {
				tracker.startReconnection(`rc_${i}`, 1);
				await sleep(i * 2); // 0, 2, 4, 6, 8, 10, 12, 14, 16, 18ms
				tracker.completeReconnection(`rc_${i}`, [createResult("sub", "current")]);
			}

			const metrics = tracker.getMetrics();

			// p50 should be around the median
			expect(metrics.p50Latency).toBeGreaterThanOrEqual(0);
			// p95 should be higher
			expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
			// p99 should be highest
			expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);
		});
	});

	describe("health status", () => {
		it("reports healthy when all reconnects succeed", () => {
			const tracker = new ReconnectionMetricsTracker();

			for (let i = 0; i < 5; i++) {
				tracker.startReconnection(`rc_${i}`, 1);
				tracker.completeReconnection(`rc_${i}`, [createResult("sub", "current")]);
			}

			const health = tracker.getHealth();

			expect(health.status).toBe("healthy");
			expect(health.issues).toHaveLength(0);
		});

		it("reports degraded when success rate is between 50-90%", () => {
			const tracker = new ReconnectionMetricsTracker();

			// 7 successes, 3 failures = 70% success rate
			for (let i = 0; i < 7; i++) {
				tracker.startReconnection(`rc_s${i}`, 1);
				tracker.completeReconnection(`rc_s${i}`, [createResult("sub", "current")]);
			}
			for (let i = 0; i < 3; i++) {
				tracker.startReconnection(`rc_f${i}`, 1);
				tracker.failReconnection(`rc_f${i}`, new Error("Failed"));
			}

			const health = tracker.getHealth();

			expect(health.status).toBe("degraded");
			expect(health.issues.length).toBeGreaterThan(0);
		});

		it("reports unhealthy when success rate is below 50%", () => {
			const tracker = new ReconnectionMetricsTracker();

			// 2 successes, 8 failures = 20% success rate
			for (let i = 0; i < 2; i++) {
				tracker.startReconnection(`rc_s${i}`, 1);
				tracker.completeReconnection(`rc_s${i}`, [createResult("sub", "current")]);
			}
			for (let i = 0; i < 8; i++) {
				tracker.startReconnection(`rc_f${i}`, 1);
				tracker.failReconnection(`rc_f${i}`, new Error("Failed"));
			}

			const health = tracker.getHealth();

			expect(health.status).toBe("unhealthy");
		});

		it("tracks pending reconnects", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 5);
			tracker.startReconnection("rc_2", 3);

			const health = tracker.getHealth();

			expect(health.pendingReconnects).toBe(2);
		});
	});

	describe("history", () => {
		it("keeps history of reconnections", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 2);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			tracker.startReconnection("rc_2", 3);
			tracker.failReconnection("rc_2", new Error("Failed"));

			const history = tracker.getHistory();

			expect(history).toHaveLength(2);
			expect(history[0].reconnectId).toBe("rc_1");
			expect(history[0].success).toBe(true);
			expect(history[1].reconnectId).toBe("rc_2");
			expect(history[1].success).toBe(false);
			expect(history[1].error).toBe("Failed");
		});

		it("limits history size", () => {
			const tracker = new ReconnectionMetricsTracker({ maxHistory: 5 });

			for (let i = 0; i < 10; i++) {
				tracker.startReconnection(`rc_${i}`, 1);
				tracker.completeReconnection(`rc_${i}`, [createResult("sub", "current")]);
			}

			const history = tracker.getHistory();

			expect(history).toHaveLength(5);
			expect(history[0].reconnectId).toBe("rc_5");
			expect(history[4].reconnectId).toBe("rc_9");
		});
	});

	describe("event collection", () => {
		it("emits events to collector", () => {
			const events: MetricsEvent[] = [];
			const tracker = new ReconnectionMetricsTracker({
				collector: (event) => events.push(event),
			});

			tracker.startReconnection("rc_1", 2);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("reconnect_start");
			expect(events[1].type).toBe("reconnect_complete");
		});

		it("emits error events", () => {
			const events: MetricsEvent[] = [];
			const tracker = new ReconnectionMetricsTracker({
				collector: (event) => events.push(event),
			});

			tracker.startReconnection("rc_1", 1);
			tracker.failReconnection("rc_1", new Error("Test error"));

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("reconnect_start");
			expect(events[1].type).toBe("reconnect_error");
			expect(events[1].data.error).toBe("Test error");
		});
	});

	describe("sampling", () => {
		it("respects sample rate", () => {
			const tracker = new ReconnectionMetricsTracker({ sampleRate: 0 });

			// With 0% sample rate, nothing should be tracked
			tracker.startReconnection("rc_1", 5);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(0);
		});

		it("tracks everything with 100% sample rate", () => {
			const tracker = new ReconnectionMetricsTracker({ sampleRate: 1.0 });

			tracker.startReconnection("rc_1", 5);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(1);
		});

		it("can be disabled", () => {
			const tracker = new ReconnectionMetricsTracker({ enabled: false });

			tracker.startReconnection("rc_1", 5);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(0);
		});
	});

	describe("reset", () => {
		it("clears all metrics", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 2);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			tracker.reset();

			const metrics = tracker.getMetrics();

			expect(metrics.totalAttempts).toBe(0);
			expect(metrics.successfulReconnects).toBe(0);
			expect(metrics.totalSubscriptionsProcessed).toBe(0);
		});
	});

	describe("toJSON", () => {
		it("exports complete metrics state", () => {
			const tracker = new ReconnectionMetricsTracker();

			tracker.startReconnection("rc_1", 2);
			tracker.completeReconnection("rc_1", [createResult("sub", "current")]);

			const json = tracker.toJSON();

			expect(json.metrics).toBeDefined();
			expect(json.health).toBeDefined();
			expect(json.history).toBeDefined();
		});
	});

	describe("factory function", () => {
		it("creates tracker with default config", () => {
			const tracker = createMetricsTracker();
			expect(tracker).toBeInstanceOf(ReconnectionMetricsTracker);
		});

		it("creates tracker with custom config", () => {
			const tracker = createMetricsTracker({ maxHistory: 50 });
			expect(tracker).toBeInstanceOf(ReconnectionMetricsTracker);
		});
	});

	describe("DEFAULT_METRICS_CONFIG", () => {
		it("has expected defaults", () => {
			expect(DEFAULT_METRICS_CONFIG.enabled).toBe(true);
			expect(DEFAULT_METRICS_CONFIG.sampleRate).toBe(1.0);
			expect(DEFAULT_METRICS_CONFIG.maxHistory).toBe(1000);
		});
	});
});

// =============================================================================
// Helpers
// =============================================================================

function createResult(id: string, status: ReconnectStatus): ReconnectResult {
	return {
		id,
		entity: "test",
		entityId: "123",
		status,
		version: 1,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
