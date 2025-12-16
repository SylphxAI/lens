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
export function direct<TApp extends LensServerInterface>(
	options: DirectTransportOptions<TApp>,
): TypedTransport<ExtractServerTypes<TApp>> {
	const { app } = options;

	// Helper to check if result is Observable
	const isObservable = (value: unknown): value is Observable<Result> => {
		return (
			value !== null &&
			typeof value === "object" &&
			"subscribe" in value &&
			typeof (value as Observable<Result>).subscribe === "function"
		);
	};

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
		 */
		async query(op: Operation): Promise<Result> {
			const result = app.execute(op);
			if (isObservable(result)) {
				// Get first value from Observable
				return new Promise((resolve, reject) => {
					let subscription: { unsubscribe?: () => void } | undefined;
					subscription = result.subscribe({
						next: (value) => {
							subscription?.unsubscribe?.();
							resolve(value);
						},
						error: reject,
					});
				});
			}
			return result;
		},

		/**
		 * Execute mutation operation directly on app.
		 */
		async mutation(op: Operation): Promise<Result> {
			const result = app.execute(op);
			if (isObservable(result)) {
				// Get first value from Observable
				return new Promise((resolve, reject) => {
					let subscription: { unsubscribe?: () => void } | undefined;
					subscription = result.subscribe({
						next: (value) => {
							subscription?.unsubscribe?.();
							resolve(value);
						},
						error: reject,
					});
				});
			}
			return result;
		},

		/**
		 * Execute subscription operation directly on app.
		 * Returns Observable for streaming support.
		 */
		subscription(op: Operation): Observable<Result> {
			const result = app.execute(op);
			if (isObservable(result)) {
				return result;
			}
			// Wrap Promise result in Observable
			return {
				subscribe: (observer) => {
					(async () => {
						try {
							const value = await result;
							observer.next?.(value);
							observer.complete?.();
						} catch (error) {
							observer.error?.(error instanceof Error ? error : new Error(String(error)));
						}
					})();
					return { unsubscribe: () => {} };
				},
			};
		},
	} as TypedTransport<ExtractServerTypes<TApp>>;
}
