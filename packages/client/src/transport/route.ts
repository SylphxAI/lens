/**
 * @sylphx/lens-client - Route Transport
 *
 * Route transport for conditional routing to multiple transports.
 * Supports multi-server architectures with automatic metadata merging.
 */

import type { Metadata, Observable, Operation, Result, Transport } from "./types";

// =============================================================================
// Route Transport (Glob Pattern)
// =============================================================================

/**
 * Route configuration with glob-like patterns.
 * Use '*' as wildcard/fallback.
 *
 * @example
 * ```typescript
 * transport: route({
 *   'auth.*': http({ url: '/auth-api' }),
 *   'analytics.*': http({ url: '/analytics-api' }),
 *   '*': http({ url: '/api' }),  // fallback
 * })
 * ```
 */
export type RouteConfig = Record<string, Transport>;

/**
 * Create route transport with glob-like pattern matching.
 *
 * Patterns:
 * - `'auth.*'` - matches 'auth.login', 'auth.logout', etc.
 * - `'user.profile.*'` - matches 'user.profile.get', 'user.profile.update'
 * - `'*'` - matches everything (fallback, should be last)
 *
 * @example
 * ```typescript
 * // Simple routing
 * const client = await createClient<Api>({
 *   transport: route({
 *     'auth.*': http({ url: '/auth' }),
 *     '*': http({ url: '/api' }),
 *   }),
 * });
 *
 * // Mixed with routeByType
 * const client = await createClient<Api>({
 *   transport: route({
 *     'auth.*': http({ url: '/auth' }),
 *     '*': routeByType({
 *       default: http({ url: '/api' }),
 *       subscription: ws({ url: 'ws://localhost:3000' }),
 *     }),
 *   }),
 * });
 * ```
 */
export function route(config: RouteConfig): Transport {
	const entries = Object.entries(config);

	if (entries.length === 0) {
		throw new Error("route() requires at least one pattern");
	}

	// Sort entries: specific patterns first, '*' last
	const sorted = entries.sort(([a], [b]) => {
		if (a === "*") return 1;
		if (b === "*") return -1;
		// More specific (longer) patterns first
		return b.length - a.length;
	});

	return {
		async connect(): Promise<Metadata> {
			// Connect all transports in parallel
			const results = await Promise.all(
				sorted.map(async ([_pattern, transport]) => {
					try {
						return await transport.connect();
					} catch {
						// Silently fall back to empty metadata for failed transports
						return { version: "unknown", operations: {} } as Metadata;
					}
				}),
			);

			// Merge all metadata
			const mergedOperations: Record<string, Metadata["operations"][string]> = {};
			for (const metadata of results) {
				Object.assign(mergedOperations, metadata.operations);
			}

			return {
				version: results[0]?.version ?? "1.0.0",
				operations: mergedOperations,
			};
		},

		execute(op: Operation): Promise<Result> | Observable<Result> {
			const transport = findMatchingTransport(sorted, op.path);
			return transport.execute(op);
		},
	};
}

/**
 * Match path against glob-like pattern.
 */
function matchPattern(pattern: string, path: string): boolean {
	// '*' matches everything
	if (pattern === "*") return true;

	// 'auth.*' matches 'auth.login', 'auth.logout', etc.
	if (pattern.endsWith(".*")) {
		const prefix = pattern.slice(0, -1); // 'auth.'
		return path.startsWith(prefix);
	}

	// Exact match
	return pattern === path;
}

/**
 * Find transport matching path.
 */
function findMatchingTransport(entries: [string, Transport][], path: string): Transport {
	for (const [pattern, transport] of entries) {
		if (matchPattern(pattern, path)) {
			return transport;
		}
	}

	throw new Error(`No transport matched for path: ${path}`);
}

// =============================================================================
// Route By Type
// =============================================================================

/**
 * Route by type configuration.
 */
export interface RouteByTypeConfig {
	/** Transport for queries */
	query?: Transport;
	/** Transport for mutations */
	mutation?: Transport;
	/** Transport for subscriptions */
	subscription?: Transport;
	/** Default transport (required) */
	default: Transport;
}

/**
 * Create route transport that routes by operation type.
 *
 * @example
 * ```typescript
 * transport: routeByType({
 *   default: http({ url: '/api' }),
 *   subscription: ws({ url: 'ws://localhost:3000' }),
 * })
 * ```
 */
export function routeByType(config: RouteByTypeConfig): Transport {
	const { query, mutation, subscription, default: defaultTransport } = config;

	// Collect all unique transports for connect
	const transports = new Set<Transport>();
	transports.add(defaultTransport);
	if (query) transports.add(query);
	if (mutation) transports.add(mutation);
	if (subscription) transports.add(subscription);

	return {
		async connect(): Promise<Metadata> {
			const results = await Promise.all(
				Array.from(transports).map(async (t) => {
					try {
						return await t.connect();
					} catch {
						// Silently fall back to empty metadata for failed transports
						return { version: "unknown", operations: {} } as Metadata;
					}
				}),
			);

			const mergedOperations: Record<string, Metadata["operations"][string]> = {};
			for (const metadata of results) {
				Object.assign(mergedOperations, metadata.operations);
			}

			return {
				version: results[0]?.version ?? "1.0.0",
				operations: mergedOperations,
			};
		},

		execute(op: Operation): Promise<Result> | Observable<Result> {
			let transport: Transport;

			switch (op.type) {
				case "query":
					transport = query ?? defaultTransport;
					break;
				case "mutation":
					transport = mutation ?? defaultTransport;
					break;
				case "subscription":
					transport = subscription ?? defaultTransport;
					break;
				default:
					transport = defaultTransport;
			}

			return transport.execute(op);
		},
	};
}

// =============================================================================
// Legacy Exports (for backwards compatibility during transition)
// =============================================================================

/** @deprecated Use route() with object syntax instead */
export function routeByPath(config: {
	paths: Record<string, Transport>;
	default: Transport;
}): Transport {
	const routeConfig: RouteConfig = {};

	for (const [prefix, transport] of Object.entries(config.paths)) {
		// Convert 'auth.' to 'auth.*'
		const pattern = prefix.endsWith(".") ? `${prefix}*` : prefix;
		routeConfig[pattern] = transport;
	}
	routeConfig["*"] = config.default;

	return route(routeConfig);
}
