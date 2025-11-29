/**
 * @sylphx/lens-client - In-Process Transport
 *
 * In-process transport for direct server calls without network.
 * Useful for testing and SSR.
 */

import type { Metadata, Observable, Operation, Result, Transport } from "./types";

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
 * In-process transport options with typed server.
 * TServer is the full server type including _types for inference.
 */
export interface InProcessTransportOptions<
	TServer extends LensServerInterface = LensServerInterface,
> {
	/** Lens server instance */
	server: TServer;
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
 * Create in-process transport for direct server calls.
 *
 * No network overhead - direct function calls to server.
 * Useful for:
 * - Unit testing
 * - Integration testing
 * - Server-Side Rendering (SSR)
 * - Same-process communication
 *
 * Type inference works automatically when using typed server:
 * ```typescript
 * const server = createServer({ router: appRouter });
 * const client = createClient({
 *   transport: inProcess({ server }),
 * });
 * // client is fully typed!
 * ```
 *
 * @example
 * ```typescript
 * // Testing
 * const server = createServer({ router: appRouter })
 * const client = createClient({
 *   transport: inProcess({ server }),
 * })
 *
 * // SSR
 * export async function getServerSideProps() {
 *   const client = createClient({
 *     transport: inProcess({ server }),
 *   })
 *   const user = await client.user.get({ id: '123' })
 *   return { props: { user } }
 * }
 * ```
 */
export function inProcess<TServer extends LensServerInterface>(
	options: InProcessTransportOptions<TServer>,
): TypedTransport<ExtractServerTypes<TServer>> {
	const { server } = options;

	// Cast to TypedTransport - _api is a phantom type, never accessed at runtime
	return {
		/**
		 * Get metadata directly from server.
		 * No network call needed.
		 */
		async connect(): Promise<Metadata> {
			return server.getMetadata();
		},

		/**
		 * Execute operation directly on server.
		 * No network call needed.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			return server.execute(op);
		},
	} as TypedTransport<ExtractServerTypes<TServer>>;
}
