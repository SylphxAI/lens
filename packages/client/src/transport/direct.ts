/**
 * @sylphx/lens-client - Direct Transport
 *
 * Direct transport for server calls without network.
 * Full streaming support for live queries and emit-based updates.
 *
 * Use this for:
 * - Server-Side Rendering (SSR)
 * - Server Components
 * - Testing
 * - Same-process communication
 */

import type {
	FullTransport,
	LensServerInterface,
	Metadata,
	Observable,
	Operation,
	Result,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Extract _types from a server (if present).
 * Handles both `{ _types: T }` and intersection types.
 */
export type ExtractServerTypes<T> = T extends { _types: infer Types } ? Types : unknown;

/**
 * Direct transport options with typed app.
 * TApp is the full app type including _types for inference.
 */
export interface DirectTransportOptions<TApp extends LensServerInterface = LensServerInterface> {
	/** Lens app instance (created with createApp) */
	app: TApp;
}

/**
 * Transport with type marker for inference.
 * The _api property is a phantom type - never accessed at runtime.
 */
export type TypedTransport<TApi = unknown> = FullTransport & {
	/** Type marker for API inference (phantom type - never accessed at runtime) */
	readonly _api: TApi;
};

// =============================================================================
// Direct Transport
// =============================================================================

/**
 * Create direct transport for same-process server calls.
 *
 * No network overhead - direct function calls to app.
 * Full streaming support - Observable passthrough for live queries.
 *
 * Type inference works automatically when using typed app:
 * ```typescript
 * const app = createApp({ router: appRouter });
 * const client = createClient({
 *   transport: direct({ app }),
 * });
 * // client is fully typed!
 * ```
 *
 * @example
 * ```typescript
 * // Server-Side Rendering
 * const client = createClient({
 *   transport: direct({ app: server }),
 * });
 *
 * // Live queries work!
 * const { data } = client.user.get({ input: { id: '123' } });
 *
 * // One-shot for SSR
 * const user = await client.user.get.fetch({ input: { id: '123' } });
 * ```
 *
 * @example
 * ```typescript
 * // Testing
 * const app = createApp({ router: appRouter });
 * const client = createClient({
 *   transport: direct({ app }),
 * });
 *
 * // Test queries
 * const result = await client.user.list.fetch({});
 * expect(result).toHaveLength(5);
 * ```
 */
/**
 * Extract first value from Observable as Promise.
 * Used for query/mutation operations.
 */
function firstValueFrom<T>(observable: Observable<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		let subscription: { unsubscribe?: () => void } | undefined;
		subscription = observable.subscribe({
			next: (value) => {
				subscription?.unsubscribe?.();
				resolve(value);
			},
			error: reject,
		});
	});
}

export function direct<TApp extends LensServerInterface>(
	options: DirectTransportOptions<TApp>,
): TypedTransport<ExtractServerTypes<TApp>> {
	const { app } = options;

	// Cast to TypedTransport - _api is a phantom type, never accessed at runtime
	return {
		/**
		 * Get metadata directly from app.
		 * No network call needed.
		 */
		async connect(): Promise<Metadata> {
			return app.getMetadata();
		},

		/**
		 * Execute query operation directly on app.
		 * Server returns Observable, extract first value as Promise.
		 */
		query(op: Operation): Promise<Result> {
			return firstValueFrom(app.execute(op));
		},

		/**
		 * Execute mutation operation directly on app.
		 * Server returns Observable, extract first value as Promise.
		 */
		mutation(op: Operation): Promise<Result> {
			return firstValueFrom(app.execute(op));
		},

		/**
		 * Execute subscription operation directly on app.
		 * Returns Observable for streaming support (passthrough).
		 */
		subscription(op: Operation): Observable<Result> {
			return app.execute(op);
		},
	} as TypedTransport<ExtractServerTypes<TApp>>;
}
