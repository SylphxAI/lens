/**
 * @sylphx/lens-client - Plugin System
 *
 * Plugins extend client functionality with lifecycle hooks.
 * Unlike middleware chains, plugin order doesn't matter (mostly).
 */

import type { Operation, Result } from "./types.js";

// =============================================================================
// Plugin Interface
// =============================================================================

/**
 * Plugin extends client with lifecycle hooks.
 *
 * Plugins are called at specific points in the request lifecycle:
 * 1. beforeRequest - Before sending to transport
 * 2. afterResponse - After receiving from transport (success)
 * 3. onError - On error (can retry)
 *
 * @example
 * ```typescript
 * const myPlugin: Plugin = {
 *   name: 'my-plugin',
 *   beforeRequest: (op) => {
 *     op.meta = { ...op.meta, timestamp: Date.now() }
 *     return op
 *   },
 *   afterResponse: (result) => {
 *     console.log('Response:', result)
 *     return result
 *   },
 * }
 * ```
 */
export interface Plugin {
	/** Plugin name for debugging */
	name: string;

	/**
	 * Called before sending request to transport.
	 * Can modify operation or return new one.
	 *
	 * @param op - Operation to be executed
	 * @returns Modified operation (or same if no changes)
	 */
	beforeRequest?(op: Operation): Operation | Promise<Operation>;

	/**
	 * Called after receiving successful response.
	 * Can modify result or return new one.
	 *
	 * @param result - Result from transport
	 * @param op - Original operation
	 * @returns Modified result (or same if no changes)
	 */
	afterResponse?(result: Result, op: Operation): Result | Promise<Result>;

	/**
	 * Called on error.
	 * Can retry, transform error, or re-throw.
	 *
	 * @param error - Error that occurred
	 * @param op - Original operation
	 * @param retry - Function to retry the operation
	 * @returns Result if handled, or throw to propagate error
	 */
	onError?(error: Error, op: Operation, retry: () => Promise<Result>): Result | Promise<Result>;
}

// =============================================================================
// Built-in Plugins
// =============================================================================

/**
 * Logger plugin options.
 */
export interface LoggerPluginOptions {
	/** Log level */
	level?: "debug" | "info" | "warn" | "error";
	/** Enable/disable logging */
	enabled?: boolean;
	/** Custom logger function */
	logger?: (level: string, ...args: unknown[]) => void;
}

/**
 * Logger plugin - logs requests and responses.
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 *   plugins: [logger({ level: 'debug' })],
 * })
 * ```
 */
export function logger(options: LoggerPluginOptions = {}): Plugin {
	const { level = "info", enabled = true, logger: customLogger } = options;

	const log = customLogger ?? console.log.bind(console);

	return {
		name: "logger",

		beforeRequest(op) {
			if (enabled) {
				log(level, `→ [${op.type}] ${op.path}`, op.input);
			}
			return op;
		},

		afterResponse(result, op) {
			if (enabled) {
				if (result.error) {
					log("error", `← [${op.type}] ${op.path} ERROR:`, result.error);
				} else {
					log(level, `← [${op.type}] ${op.path}`, result.data);
				}
			}
			return result;
		},
	};
}

/**
 * Auth plugin options.
 */
export interface AuthPluginOptions {
	/** Function to get auth token */
	getToken: () => string | Promise<string>;
	/** Header name (default: 'Authorization') */
	headerName?: string;
	/** Header prefix (default: 'Bearer') */
	prefix?: string;
}

/**
 * Auth plugin - adds authentication header to requests.
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 *   plugins: [auth({ getToken: () => localStorage.getItem('token') })],
 * })
 * ```
 */
export function auth(options: AuthPluginOptions): Plugin {
	const { getToken, headerName = "Authorization", prefix = "Bearer" } = options;

	return {
		name: "auth",

		async beforeRequest(op) {
			const token = await getToken();
			if (token) {
				const headers = (op.meta?.["headers"] as Record<string, string>) ?? {};
				headers[headerName] = prefix ? `${prefix} ${token}` : token;
				op.meta = { ...op.meta, headers };
			}
			return op;
		},
	};
}

/**
 * Retry plugin options.
 */
export interface RetryPluginOptions {
	/** Maximum retry attempts (default: 3) */
	attempts?: number;
	/** Base delay between retries in ms (default: 1000) */
	delay?: number;
	/** Whether to use exponential backoff (default: true) */
	exponential?: boolean;
	/** Function to determine if error should be retried */
	shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Retry plugin - retries failed requests.
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 *   plugins: [retry({ attempts: 3, delay: 1000 })],
 * })
 * ```
 */
export function retry(options: RetryPluginOptions = {}): Plugin {
	const { attempts = 3, delay = 1000, exponential = true, shouldRetry = () => true } = options;

	return {
		name: "retry",

		async onError(error, op, retryFn) {
			const attempt = ((op.meta?.["retryCount"] as number) ?? 0) + 1;

			if (attempt > attempts || !shouldRetry(error, attempt)) {
				throw error;
			}

			// Calculate delay with optional exponential backoff
			const waitTime = exponential ? delay * 2 ** (attempt - 1) : delay;

			// Wait before retry
			await new Promise((resolve) => setTimeout(resolve, waitTime));

			// Update retry count and retry
			op.meta = { ...op.meta, retryCount: attempt };
			return retryFn();
		},
	};
}

/**
 * Cache plugin options.
 */
export interface CachePluginOptions {
	/** Time to live in ms (default: 60000) */
	ttl?: number;
	/** Custom key function */
	key?: (op: Operation) => string;
	/** Whether to cache only queries (default: true) */
	queriesOnly?: boolean;
}

/**
 * Cache plugin - caches query responses.
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 *   plugins: [cache({ ttl: 60000 })],
 * })
 * ```
 */
export function cache(options: CachePluginOptions = {}): Plugin {
	const {
		ttl = 60000,
		key = (op) => JSON.stringify([op.path, op.input]),
		queriesOnly = true,
	} = options;

	const store = new Map<string, { result: Result; expires: number }>();

	return {
		name: "cache",

		beforeRequest(op) {
			if (queriesOnly && op.type !== "query") {
				return op;
			}

			const cacheKey = key(op);
			const cached = store.get(cacheKey);

			if (cached && cached.expires > Date.now()) {
				// Return cached result via meta
				op.meta = { ...op.meta, cachedResult: cached.result };
			}

			return op;
		},

		afterResponse(result, op) {
			if (queriesOnly && op.type !== "query") {
				return result;
			}

			// Don't cache errors
			if (result.error) {
				return result;
			}

			const cacheKey = key(op);
			store.set(cacheKey, {
				result,
				expires: Date.now() + ttl,
			});

			return result;
		},
	};
}

/**
 * Timeout plugin options.
 */
export interface TimeoutPluginOptions {
	/** Timeout in ms */
	ms: number;
}

/**
 * Timeout plugin - fails requests that take too long.
 *
 * @example
 * ```typescript
 * const client = await createClient({
 *   transport: http({ url: '/api' }),
 *   plugins: [timeout({ ms: 5000 })],
 * })
 * ```
 */
export function timeout(options: TimeoutPluginOptions): Plugin {
	return {
		name: "timeout",

		beforeRequest(op) {
			op.meta = { ...op.meta, timeout: options.ms };
			return op;
		},
	};
}
