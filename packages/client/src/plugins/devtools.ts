/**
 * @lens/client - DevTools Plugin
 *
 * Development tools for debugging subscriptions and operations.
 * Plug and play - just add to your client.
 */

import { definePlugin } from "./manager";
import type { DevToolsPluginConfig, PluginContext } from "./types";

// =============================================================================
// DevTools Plugin
// =============================================================================

/** Log entry */
interface LogEntry {
	timestamp: number;
	type: "query" | "mutation" | "subscription" | "update" | "error";
	entity?: string;
	operation?: string;
	data?: unknown;
	duration?: number;
}

/**
 * DevTools plugin for debugging
 *
 * @example
 * ```typescript
 * import { createReactiveClient } from "@lens/client";
 * import { devToolsPlugin } from "@lens/client/plugins";
 *
 * const client = createReactiveClient({
 *   links: [...],
 *   plugins: [
 *     devToolsPlugin({ logLevel: "debug" }),
 *   ],
 * });
 *
 * // Access devtools
 * client.$plugins.devtools.getLogs();
 * client.$plugins.devtools.getStats();
 * ```
 */
export const devToolsPlugin = definePlugin<DevToolsPluginConfig>({
	name: "devtools",
	version: "1.0.0",

	defaultConfig: {
		enableInProduction: false,
		logLevel: "info",
	},

	create: (config) => {
		// Check if should be enabled
		const isProduction =
			typeof process !== "undefined" && process.env?.NODE_ENV === "production";
		const enabled = !isProduction || config?.enableInProduction;

		if (!enabled) {
			return {
				name: "devtools",
				api: {
					getLogs: () => [],
					getStats: () => ({}),
					clear: () => {},
					isEnabled: () => false,
				},
			};
		}

		const logs: LogEntry[] = [];
		const stats = {
			queries: 0,
			mutations: 0,
			subscriptions: 0,
			errors: 0,
		};
		const operationTimings = new Map<string, number>();
		const logLevel = config?.logLevel ?? "info";

		const shouldLog = (level: "debug" | "info" | "warn" | "error") => {
			const levels = ["debug", "info", "warn", "error"];
			return levels.indexOf(level) >= levels.indexOf(logLevel);
		};

		const log = (
			level: "debug" | "info" | "warn" | "error",
			message: string,
			data?: unknown,
		) => {
			if (!shouldLog(level)) return;

			const prefix = `[Lens DevTools]`;
			const style = {
				debug: "color: gray",
				info: "color: blue",
				warn: "color: orange",
				error: "color: red",
			}[level];

			if (typeof console !== "undefined") {
				console.log(`%c${prefix} ${message}`, style, data ?? "");
			}
		};

		const addLog = (entry: Omit<LogEntry, "timestamp">) => {
			logs.push({ ...entry, timestamp: Date.now() });
			// Keep last 1000 entries
			if (logs.length > 1000) {
				logs.shift();
			}
		};

		return {
			name: "devtools",

			onInit: (ctx: PluginContext) => {
				log("info", "DevTools initialized");
			},

			onBeforeQuery: (ctx, entity, id, options) => {
				const key = `query:${entity}:${id}`;
				operationTimings.set(key, Date.now());
				stats.queries++;

				log("debug", `Query: ${entity}.get(${id})`, options);
			},

			onAfterQuery: (ctx, entity, id, result) => {
				const key = `query:${entity}:${id}`;
				const startTime = operationTimings.get(key);
				const duration = startTime ? Date.now() - startTime : undefined;
				operationTimings.delete(key);

				addLog({
					type: "query",
					entity,
					operation: "get",
					data: { id, result },
					duration,
				});

				log("debug", `Query complete: ${entity}.get(${id}) [${duration}ms]`);
			},

			onBeforeMutation: (ctx, entity, op, input) => {
				const key = `mutation:${entity}:${op}:${Date.now()}`;
				operationTimings.set(key, Date.now());
				stats.mutations++;

				log("info", `Mutation: ${entity}.${op}()`, input);

				return { input, meta: { timingKey: key } };
			},

			onAfterMutation: (ctx, entity, op, result, meta) => {
				const key = meta?.timingKey as string;
				const startTime = key ? operationTimings.get(key) : undefined;
				const duration = startTime ? Date.now() - startTime : undefined;
				if (key) operationTimings.delete(key);

				addLog({
					type: "mutation",
					entity,
					operation: op,
					data: result.data,
					duration,
				});

				if (result.error) {
					log("error", `Mutation failed: ${entity}.${op}()`, result.error);
				} else {
					log("info", `Mutation complete: ${entity}.${op}() [${duration}ms]`);
				}
			},

			onMutationError: (ctx, entity, op, error) => {
				stats.errors++;
				addLog({
					type: "error",
					entity,
					operation: op,
					data: { message: error.message, stack: error.stack },
				});
				log("error", `Mutation error: ${entity}.${op}()`, error);
			},

			onConnect: (ctx) => {
				stats.subscriptions++;
				addLog({ type: "subscription", data: "connected" });
				log("info", "Subscription transport connected");
			},

			onDisconnect: (ctx) => {
				addLog({ type: "subscription", data: "disconnected" });
				log("warn", "Subscription transport disconnected");
			},

			onReconnect: (ctx) => {
				addLog({ type: "subscription", data: "reconnected" });
				log("info", "Subscription transport reconnected");
			},

			// Exposed API
			api: {
				/** Get all logs */
				getLogs: () => [...logs],

				/** Get logs filtered by type */
				getLogsByType: (type: LogEntry["type"]) =>
					logs.filter((l) => l.type === type),

				/** Get operation stats */
				getStats: () => ({ ...stats }),

				/** Clear logs */
				clear: () => {
					logs.length = 0;
				},

				/** Reset stats */
				resetStats: () => {
					stats.queries = 0;
					stats.mutations = 0;
					stats.subscriptions = 0;
					stats.errors = 0;
				},

				/** Check if enabled */
				isEnabled: () => enabled,

				/** Get current log level */
				getLogLevel: () => logLevel,

				/** Export logs as JSON */
				exportLogs: () => JSON.stringify(logs, null, 2),

				/** Get subscription count from manager */
				getSubscriptionCount: (ctx: PluginContext) => {
					// This would need access to subscription manager stats
					return 0;
				},
			},

			destroy: () => {
				logs.length = 0;
				operationTimings.clear();
				log("info", "DevTools destroyed");
			},
		};
	},
});

// Type for the plugin API
export type DevToolsPluginAPI = {
	getLogs: () => LogEntry[];
	getLogsByType: (type: LogEntry["type"]) => LogEntry[];
	getStats: () => { queries: number; mutations: number; subscriptions: number; errors: number };
	clear: () => void;
	resetStats: () => void;
	isEnabled: () => boolean;
	getLogLevel: () => string;
	exportLogs: () => string;
};
