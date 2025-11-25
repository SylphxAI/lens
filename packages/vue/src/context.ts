/**
 * @lens/vue - Context
 *
 * Vue provide/inject for Lens client.
 */

import { inject, provide, type InjectionKey } from "vue";
import type { LensClient } from "@lens/client";

// =============================================================================
// Injection Key
// =============================================================================

export const LensClientKey: InjectionKey<LensClient<unknown, unknown>> =
	Symbol("lens-client");

// =============================================================================
// Provider
// =============================================================================

/**
 * Provide Lens client to component tree.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { createClient, httpLink } from '@lens/client';
 * import { provideLensClient } from '@lens/vue';
 * import type { AppRouter } from './server';
 *
 * const client = createClient<AppRouter>({
 *   links: [httpLink({ url: '/api' })],
 * });
 *
 * provideLensClient(client);
 * </script>
 *
 * <template>
 *   <router-view />
 * </template>
 * ```
 */
export function provideLensClient<Q = unknown, M = unknown>(
	client: LensClient<Q, M>,
): void {
	provide(LensClientKey, client as LensClient<unknown, unknown>);
}

// =============================================================================
// Injection
// =============================================================================

/**
 * Inject Lens client from parent component.
 *
 * @throws Error if client not provided
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLensClient } from '@lens/vue';
 * import type { AppRouter } from './server';
 *
 * const client = useLensClient<AppRouter>();
 * </script>
 * ```
 */
export function useLensClient<Q = unknown, M = unknown>(): LensClient<Q, M> {
	const client = inject(LensClientKey);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a component that called provideLensClient(). " +
				"Make sure to call provideLensClient(client) in a parent component.",
		);
	}

	return client as LensClient<Q, M>;
}
