/**
 * @lens/svelte - Context
 *
 * Svelte context for Lens client injection.
 */

import { getContext, setContext } from "svelte";
import type { LensClient } from "@lens/client";

// =============================================================================
// Client Context
// =============================================================================

/**
 * Context key for Lens client
 */
export const LENS_CLIENT_KEY = Symbol("lens-client");

/**
 * Set Lens client in Svelte context
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { setLensClient } from '@lens/svelte';
 *   import { createClient, httpLink } from '@lens/client';
 *   import type { AppRouter } from './server';
 *
 *   const client = createClient<AppRouter>({
 *     links: [httpLink({ url: '/api' })],
 *   });
 *   setLensClient(client);
 * </script>
 * ```
 */
export function setLensClient<Q = unknown, M = unknown>(
	client: LensClient<Q, M>,
): void {
	setContext(LENS_CLIENT_KEY, client);
}

/**
 * Get Lens client from Svelte context
 *
 * @throws Error if client not found in context
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { getLensClient } from '@lens/svelte';
 *   import type { AppRouter } from './server';
 *
 *   const client = getLensClient<AppRouter>();
 * </script>
 * ```
 */
export function getLensClient<Q = unknown, M = unknown>(): LensClient<Q, M> {
	const client = getContext<LensClient<Q, M>>(LENS_CLIENT_KEY);

	if (!client) {
		throw new Error(
			"Lens client not found in context. Did you call setLensClient?",
		);
	}

	return client;
}
