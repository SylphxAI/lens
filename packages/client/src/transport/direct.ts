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
	LensServerInterface,
	Metadata,
	Observable,
	Operation,
	Result,
	Transport,
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
export type TypedTransport<TApi = unknown> = Transport & {
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
		 * Execute operation directly on app.
		 * Returns Observable for streaming support.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			return app.execute(op);
		},
	} as TypedTransport<ExtractServerTypes<TApp>>;
}

// =============================================================================
// Legacy Aliases (Backwards Compatibility)
// =============================================================================

/**
 * @deprecated Use `direct` instead. Will be removed in next major version.
 *
 * @example
 * ```typescript
 * // Old (deprecated)
 * import { inProcess } from '@sylphx/lens-client';
 * const client = createClient({ transport: inProcess({ app }) });
 *
 * // New
 * import { direct } from '@sylphx/lens-client';
 * const client = createClient({ transport: direct({ app }) });
 * ```
 */
export const inProcess: typeof direct = direct;

/**
 * @deprecated Use `DirectTransportOptions` instead.
 */
export type InProcessTransportOptions<TApp extends LensServerInterface = LensServerInterface> =
	DirectTransportOptions<TApp>;
