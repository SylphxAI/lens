/**
 * @sylphx/lens-client - In-Process Transport
 *
 * In-process transport for direct server calls without network.
 * Useful for testing and SSR.
 */

import type { Metadata, Observable, Operation, Result, Transport } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Base Lens server interface for in-process transport.
 */
export interface LensServerInterface {
	/** Get operation metadata */
	getMetadata(): Metadata;
	/** Execute an operation */
	execute(op: Operation): Promise<Result> | Observable<Result>;
}

/**
 * Extract _types from a server (if present).
 * Handles both `{ _types: T }` and intersection types.
 */
export type ExtractServerTypes<T> = T extends { _types: infer Types } ? Types : unknown;

/**
 * In-process transport options with typed app.
 * TApp is the full app type including _types for inference.
 */
export interface InProcessTransportOptions<TApp extends LensServerInterface = LensServerInterface> {
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
// In-Process Transport
// =============================================================================

/**
 * Create in-process transport for direct app calls.
 *
 * No network overhead - direct function calls to app.
 * Useful for:
 * - Unit testing
 * - Integration testing
 * - Server-Side Rendering (SSR)
 * - Same-process communication
 *
 * Type inference works automatically when using typed app:
 * ```typescript
 * const app = createApp({ router: appRouter });
 * const client = createClient({
 *   transport: inProcess({ app }),
 * });
 * // client is fully typed!
 * ```
 *
 * @example
 * ```typescript
 * // Testing
 * const app = createApp({ router: appRouter })
 * const client = createClient({
 *   transport: inProcess({ app }),
 * })
 *
 * // SSR
 * export async function getServerSideProps() {
 *   const client = createClient({
 *     transport: inProcess({ app }),
 *   })
 *   const user = await client.user.get({ id: '123' })
 *   return { props: { user } }
 * }
 * ```
 */
export function inProcess<TApp extends LensServerInterface>(
	options: InProcessTransportOptions<TApp>,
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
		 * No network call needed.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			return app.execute(op);
		},
	} as TypedTransport<ExtractServerTypes<TApp>>;
}
