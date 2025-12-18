/**
 * @sylphx/lens-server - Framework Utilities
 *
 * Utilities for framework integrations (Next.js, Nuxt, SolidStart, Fresh, etc.).
 *
 * @example
 * ```typescript
 * import { createServerClientProxy } from '@sylphx/lens-server';
 *
 * // Create a typed proxy for direct server-side calls
 * const serverClient = createServerClientProxy(server);
 * const users = await serverClient.user.list();
 * ```
 */

import { firstValueFrom, isError, isSnapshot } from "@sylphx/lens-core";
import type { LensServer } from "../server/create.js";

// =============================================================================
// Server Client Proxy
// =============================================================================

/**
 * Create a proxy object that provides typed access to server procedures.
 *
 * This proxy allows calling server procedures directly without going through
 * HTTP. Useful for:
 * - Server-side rendering (SSR)
 * - Server Components
 * - Testing
 * - Same-process communication
 *
 * @example
 * ```typescript
 * const serverClient = createServerClientProxy(server);
 *
 * // Call procedures directly (typed!)
 * const users = await serverClient.user.list();
 * const user = await serverClient.user.get({ id: '123' });
 * ```
 */
export function createServerClientProxy(server: LensServer): unknown {
	function createProxy(path: string): unknown {
		return new Proxy(() => {}, {
			get(_, prop) {
				if (typeof prop === "symbol") return undefined;
				if (prop === "then") return undefined;

				const newPath = path ? `${path}.${prop}` : String(prop);
				return createProxy(newPath);
			},
			async apply(_, __, args) {
				const input = args[0];
				const result = await firstValueFrom(server.execute({ path, input }));

				if (isError(result)) {
					throw new Error(result.error);
				}

				if (isSnapshot(result)) {
					return result.data;
				}

				// ops message - shouldn't happen for one-shot calls
				return null;
			},
		});
	}

	return createProxy("");
}
