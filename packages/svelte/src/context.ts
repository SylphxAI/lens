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
 * Provide Lens client to component tree via Svelte context.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { provideLensClient } from '@lens/svelte';
 *   import { createClient, httpLink } from '@lens/client';
 *   import type { AppRouter } from './server';
 *
 *   const client = createClient<AppRouter>({
 *     links: [httpLink({ url: '/api' })],
 *   });
 *   provideLensClient(client);
 * </script>
 * ```
 */
export function provideLensClient<Q = unknown, M = unknown>(
	client: LensClient<Q, M>,
): void {
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
 *   import { useLensClient } from '@lens/svelte';
 *   import type { AppRouter } from './server';
 *
 *   const client = useLensClient<AppRouter>();
 * </script>
 * ```
 */
export function useLensClient<Q = unknown, M = unknown>(): LensClient<Q, M> {
	const client = getContext<LensClient<Q, M>>(LENS_CLIENT_KEY);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a component that called provideLensClient(). " +
				"Make sure to call provideLensClient(client) in a parent component.",
		);
	}

	return client;
}

// Legacy aliases for backwards compatibility
/** @deprecated Use provideLensClient instead */
export const setLensClient = provideLensClient;
/** @deprecated Use useLensClient instead */
export const getLensClient = useLensClient;
