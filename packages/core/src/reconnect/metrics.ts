/**
 * @sylphx/lens-core - Reconnection Metrics
 *
 * Metrics and observability for the reconnection system.
 * Tracks reconnection attempts, latency, and data transfer statistics.
 */

import type {
	ReconnectionHealth,
	ReconnectionMetrics,
	ReconnectResult,
	ReconnectStatus,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Metrics event emitted during reconnection operations.
 */
export interface MetricsEvent {
	type: "reconnect_start" | "reconnect_complete" | "reconnect_error" | "subscription_result";
	timestamp: number;
	data: Record<string, unknown>;
}

/**
 * Metrics collector callback.
 */
export type MetricsCollector = (event: MetricsEvent) => void;

/**
 * Reconnection metrics configuration.
 */
export interface MetricsConfig {
	/** Enable metrics collection (default: true) */
	enabled: boolean;
	/** Sample rate for metrics (0.0 - 1.0, default: 1.0) */
	sampleRate: number;
	/** Maximum history entries to keep (default: 1000) */
	maxHistory: number;
	/** Custom metrics collector */
	collector?: MetricsCollector;
}

/**
 * Default metrics configuration.
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
	enabled: true,
	sampleRate: 1.0,
	maxHistory: 1000,
};

// =============================================================================
// Reconnection Metrics Tracker
// =============================================================================

/**
 * Tracks and aggregates reconnection metrics.
 *
 * @example
 * ```typescript
 * const metrics = new ReconnectionMetricsTracker();
 *
 * // Track reconnection
 * metrics.startReconnection("rc_123", 5);
 * // ... perform reconnection ...
 * metrics.completeReconnection("rc_123", results);
 *
 * // Get statistics
 * const stats = metrics.getMetrics();
 * console.log(stats.successRate, stats.averageLatency);
 * ```
 */
export class ReconnectionMetricsTracker {
	private config: MetricsConfig;
	private history: ReconnectionRecord[] = [];
	private pending = new Map<string, PendingReconnection>();

	// Aggregate counters
	private totalAttempts = 0;
	private totalSuccesses = 0;
	private totalFailures = 0;
	private totalSubscriptionsProcessed = 0;
	private totalBytesTransferred = 0;

	// Status counters
	private statusCounts: Record<ReconnectStatus, number> = {
		current: 0,
		patched: 0,
		snapshot: 0,
		deleted: 0,
		error: 0,
	};

	// Latency tracking
	private latencies: number[] = [];

	constructor(config: Partial<MetricsConfig> = {}) {
		this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
	}

	// ===========================================================================
	// Reconnection Lifecycle
	// ===========================================================================

	/**
	 * Record start of a reconnection attempt.
	 */
	startReconnection(reconnectId: string, subscriptionCount: number): void {
		if (!this.shouldSample()) return;

		const record: PendingReconnection = {
			reconnectId,
			startTime: Date.now(),
			subscriptionCount,
		};

		this.pending.set(reconnectId, record);
		this.totalAttempts++;

		this.emit({
			type: "reconnect_start",
			timestamp: record.startTime,
			data: {
				reconnectId,
				subscriptionCount,
			},
		});
	}

	/**
	 * Record successful completion of a reconnection.
	 */
	completeReconnection(reconnectId: string, results: ReconnectResult[]): void {
		const pending = this.pending.get(reconnectId);
		if (!pending) return;

		this.pending.delete(reconnectId);

		const endTime = Date.now();
		const latency = endTime - pending.startTime;

		// Update counters
		this.totalSuccesses++;
		this.totalSubscriptionsProcessed += results.length;
		this.latencies.push(latency);

		// Count by status
		for (const result of results) {
			this.statusCounts[result.status]++;

			// Track data transfer
			if (result.data) {
				const size = JSON.stringify(result.data).length;
				this.totalBytesTransferred += size;
			}
			if (result.patches) {
				const size = JSON.stringify(result.patches).length;
				this.totalBytesTransferred += size;
			}
		}

		// Create history record
		const record: ReconnectionRecord = {
			reconnectId,
			startTime: pending.startTime,
			endTime,
			latency,
			subscriptionCount: pending.subscriptionCount,
			resultCount: results.length,
			statusBreakdown: this.countStatuses(results),
			success: true,
		};

		this.addToHistory(record);

		this.emit({
			type: "reconnect_complete",
			timestamp: endTime,
			data: {
				reconnectId,
				latency,
				resultCount: results.length,
				statusBreakdown: record.statusBreakdown,
			},
		});
	}

	/**
	 * Record reconnection failure.
	 */
	failReconnection(reconnectId: string, error: Error): void {
		const pending = this.pending.get(reconnectId);
		if (!pending) return;

		this.pending.delete(reconnectId);

		const endTime = Date.now();
		const latency = endTime - pending.startTime;

		this.totalFailures++;
		this.latencies.push(latency);

		const record: ReconnectionRecord = {
			reconnectId,
			startTime: pending.startTime,
			endTime,
			latency,
			subscriptionCount: pending.subscriptionCount,
			resultCount: 0,
			statusBreakdown: {},
			success: false,
			error: error.message,
		};

		this.addToHistory(record);

		this.emit({
			type: "reconnect_error",
			timestamp: endTime,
			data: {
				reconnectId,
				latency,
				error: error.message,
			},
		});
	}

	// ===========================================================================
	// Metrics Retrieval
	// ===========================================================================

	/**
	 * Get current reconnection metrics.
	 */
	getMetrics(): ReconnectionMetrics {
		const avgLatency =
			this.latencies.length > 0
				? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
				: 0;

		const p50 = this.percentile(50);
		const p95 = this.percentile(95);
		const p99 = this.percentile(99);

		return {
			totalAttempts: this.totalAttempts,
			successfulReconnects: this.totalSuccesses,
			failedReconnects: this.totalFailures,
			successRate: this.totalAttempts > 0 ? this.totalSuccesses / this.totalAttempts : 1,
			averageLatency: avgLatency,
			p50Latency: p50,
			p95Latency: p95,
			p99Latency: p99,
			totalSubscriptionsProcessed: this.totalSubscriptionsProcessed,
			statusBreakdown: { ...this.statusCounts },
			bytesTransferred: this.totalBytesTransferred,
		};
	}

	/**
	 * Get reconnection health status.
	 */
	getHealth(): ReconnectionHealth {
		const metrics = this.getMetrics();
		const recentHistory = this.history.slice(-10);

		// Determine health based on recent performance
		let status: "healthy" | "degraded" | "unhealthy" = "healthy";
		const issues: string[] = [];

		// Check success rate
		if (metrics.successRate < 0.5) {
			status = "unhealthy";
			issues.push(`Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
		} else if (metrics.successRate < 0.9) {
			status = "degraded";
			issues.push(`Degraded success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
		}

		// Check latency
		if (metrics.p95Latency > 5000) {
			status = status === "healthy" ? "degraded" : status;
			issues.push(`High p95 latency: ${metrics.p95Latency}ms`);
		}

		// Check recent failures
		const recentFailures = recentHistory.filter((r) => !r.success).length;
		if (recentFailures > 5) {
			status = "unhealthy";
			issues.push(`${recentFailures} failures in last 10 reconnections`);
		}

		return {
			status,
			metrics,
			issues,
			lastReconnect: this.history[this.history.length - 1]?.endTime ?? null,
			pendingReconnects: this.pending.size,
		};
	}

	/**
	 * Get recent reconnection history.
	 */
	getHistory(limit = 100): ReconnectionRecord[] {
		return this.history.slice(-limit);
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Reset all metrics.
	 */
	reset(): void {
		this.history = [];
		this.pending.clear();
		this.totalAttempts = 0;
		this.totalSuccesses = 0;
		this.totalFailures = 0;
		this.totalSubscriptionsProcessed = 0;
		this.totalBytesTransferred = 0;
		this.statusCounts = { current: 0, patched: 0, snapshot: 0, deleted: 0, error: 0 };
		this.latencies = [];
	}

	/**
	 * Export metrics as JSON.
	 */
	toJSON(): Record<string, unknown> {
		return {
			metrics: this.getMetrics(),
			health: this.getHealth(),
			history: this.history.slice(-100),
		};
	}

	// ===========================================================================
	// Private Helpers
	// ===========================================================================

	private shouldSample(): boolean {
		if (!this.config.enabled) return false;
		if (this.config.sampleRate >= 1.0) return true;
		return Math.random() < this.config.sampleRate;
	}

	private emit(event: MetricsEvent): void {
		this.config.collector?.(event);
	}

	private addToHistory(record: ReconnectionRecord): void {
		this.history.push(record);
		if (this.history.length > this.config.maxHistory) {
			this.history.shift();
		}
	}

	private countStatuses(results: ReconnectResult[]): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const result of results) {
			counts[result.status] = (counts[result.status] ?? 0) + 1;
		}
		return counts;
	}

	private percentile(p: number): number {
		if (this.latencies.length === 0) return 0;

		const sorted = [...this.latencies].sort((a, b) => a - b);
		const index = Math.ceil((p / 100) * sorted.length) - 1;
		return sorted[Math.max(0, index)];
	}
}

// =============================================================================
// Supporting Types
// =============================================================================

interface PendingReconnection {
	reconnectId: string;
	startTime: number;
	subscriptionCount: number;
}

/**
 * Record of a single reconnection attempt.
 */
export interface ReconnectionRecord {
	reconnectId: string;
	startTime: number;
	endTime: number;
	latency: number;
	subscriptionCount: number;
	resultCount: number;
	statusBreakdown: Record<string, number>;
	success: boolean;
	error?: string;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new metrics tracker.
 */
export function createMetricsTracker(config?: Partial<MetricsConfig>): ReconnectionMetricsTracker {
	return new ReconnectionMetricsTracker(config);
}
