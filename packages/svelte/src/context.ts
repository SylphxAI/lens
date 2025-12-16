/**
 * @sylphx/lens-svelte - Context
 *
 * Svelte context for Lens client injection.
 */

import type { LensClient } from "@sylphx/lens-client";
import { getContext, setContext } from "svelte";

// =============================================================================
// Client Context
// =============================================================================

/**
 * Context key for Lens client
 */
export const LENS_CLIENT_KEY: unique symbol = Symbol("lens-client");

/**
 * Provide Lens client to component tree via Svelte context.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { provideLensClient } from '@sylphx/lens-svelte';
 *   import { createClient, httpLink } from '@sylphx/lens-client';
 *   import type { AppRouter } from './server';
 *
 *   const client = createClient<AppRouter>({
 *     links: [httpLink({ url: '/api' })],
 *   });
 *   provideLensClient(client);
 * </script>
 * ```
 */
export function provideLensClient(client: LensClient<any, any>): void {
	setContext(LENS_CLIENT_KEY, client);
}

/**
 * Get Lens client from Svelte context.
 *
 * @throws Error if client not provided
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { useLensClient } from '@sylphx/lens-svelte';
 *   import type { AppRouter } from './server';
 *
 *   const client = useLensClient<AppRouter>();
 * </script>
 * ```
 */
export function useLensClient<TRouter = any>(): LensClient<any, any> & TRouter {
	const client = getContext<LensClient<any, any>>(LENS_CLIENT_KEY);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a component that called provideLensClient(). " +
				"Make sure to call provideLensClient(client) in a parent component.",
		);
	}

	return client as LensClient<any, any> & TRouter;
}
