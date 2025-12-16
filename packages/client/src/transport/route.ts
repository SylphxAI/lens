/**
 * @sylphx/lens-client - Route Transport
 *
 * Route transport for conditional routing to multiple transports.
 * Supports multi-server architectures with automatic metadata merging.
 */

import type {
	Metadata,
	MutationCapable,
	Operation,
	QueryCapable,
	SubscriptionCapable,
	TransportBase,
} from "./types.js";
import { isMutationCapable, isQueryCapable, isSubscriptionCapable } from "./types.js";

// =============================================================================
// Route By Type (Type-Safe)
// =============================================================================

/**
 * Type-safe route by type configuration.
 *
 * @template Q - Query transport type
 * @template M - Mutation transport type
 * @template S - Subscription transport type
 * @template D - Default transport type
 */
export interface TypeSafeRouteByTypeConfig<
	Q extends QueryCapable | undefined = undefined,
	M extends MutationCapable | undefined = undefined,
	S extends SubscriptionCapable | undefined = undefined,
	D extends TransportBase = TransportBase,
> {
	/** Transport for queries (must support queries) */
	query?: Q;
	/** Transport for mutations (must support mutations) */
	mutation?: M;
	/** Transport for subscriptions (must support subscriptions) */
	subscription?: S;
	/** Default transport (required) */
	default: D;
}

/**
 * Infer capabilities from route by type config.
 * Result type has capabilities based on what transports are configured.
 */
type InferRouteByTypeCapabilities<Config extends TypeSafeRouteByTypeConfig> = TransportBase &
	// Query capability: from query transport or default
	(Config["query"] extends QueryCapable
		? QueryCapable
		: Config["default"] extends QueryCapable
			? QueryCapable
			: unknown) &
	// Mutation capability: from mutation transport or default
	(Config["mutation"] extends MutationCapable
		? MutationCapable
		: Config["default"] extends MutationCapable
			? MutationCapable
			: unknown) &
	// Subscription capability: from subscription transport or default
	(Config["subscription"] extends SubscriptionCapable
		? SubscriptionCapable
		: Config["default"] extends SubscriptionCapable
			? SubscriptionCapable
			: unknown);

/**
 * Create type-safe route transport that routes by operation type.
 *
 * The returned transport type reflects the actual capabilities based on config:
 * - If `query` or `default` is QueryCapable, result is QueryCapable
 * - If `mutation` or `default` is MutationCapable, result is MutationCapable
 * - If `subscription` or `default` is SubscriptionCapable, result is SubscriptionCapable
 *
 * @example
 * ```typescript
 * // HTTP for queries/mutations, WebSocket for subscriptions
 * const transport = routeByType({
 *   default: http({ url: '/api' }),      // QueryCapable & MutationCapable
 *   subscription: ws({ url: 'ws://...' }), // SubscriptionCapable
 * });
 * // Result type: QueryCapable & MutationCapable & SubscriptionCapable
 *
 * // HTTP only (no subscription support)
 * const httpOnly = routeByType({
 *   default: http({ url: '/api' }),
 * });
 * // Result type: QueryCapable & MutationCapable (no SubscriptionCapable)
 * ```
 */
export function routeByType<Config extends TypeSafeRouteByTypeConfig>(
	config: Config,
): InferRouteByTypeCapabilities<Config> {
	const { query, mutation, subscription, default: defaultTransport } = config;

	// Collect all unique transports for connect
	const transports = new Set<TransportBase>();
	transports.add(defaultTransport);
	if (query) transports.add(query);
	if (mutation) transports.add(mutation);
	if (subscription) transports.add(subscription);

	const result: TransportBase & Partial<QueryCapable & MutationCapable & SubscriptionCapable> = {
		async connect(): Promise<Metadata> {
			const results = await Promise.all(
				Array.from(transports).map(async (t) => {
					try {
						return await t.connect();
					} catch {
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
	};

	// Add query method if any transport supports it
	const queryTransport = query ?? (isQueryCapable(defaultTransport) ? defaultTransport : undefined);
	if (queryTransport && isQueryCapable(queryTransport)) {
		result.query = (op: Operation) => queryTransport.query(op);
	}

	// Add mutation method if any transport supports it
	const mutationTransport =
		mutation ?? (isMutationCapable(defaultTransport) ? defaultTransport : undefined);
	if (mutationTransport && isMutationCapable(mutationTransport)) {
		result.mutation = (op: Operation) => mutationTransport.mutation(op);
	}

	// Add subscription method if any transport supports it
	const subscriptionTransport =
		subscription ?? (isSubscriptionCapable(defaultTransport) ? defaultTransport : undefined);
	if (subscriptionTransport && isSubscriptionCapable(subscriptionTransport)) {
		result.subscription = (op: Operation) => subscriptionTransport.subscription(op);
	}

	return result as InferRouteByTypeCapabilities<Config>;
}
