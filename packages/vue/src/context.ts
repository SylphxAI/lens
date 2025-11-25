/**
 * @sylphx/lens-vue - Context
 *
 * Vue provide/inject for Lens client.
 */

import type { LensClient } from "@sylphx/lens-client";
import { type InjectionKey, inject, provide } from "vue";

// =============================================================================
// Injection Key
// =============================================================================

export const LensClientKey: InjectionKey<LensClient<any, any>> = Symbol("lens-client");

// =============================================================================
// Provider
// =============================================================================

/**
 * Provide Lens client to component tree.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { createClient, httpLink } from '@sylphx/lens-client';
 * import { provideLensClient } from '@sylphx/lens-vue';
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
export function provideLensClient(client: LensClient<any, any>): void {
	provide(LensClientKey, client);
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
 * import { useLensClient } from '@sylphx/lens-vue';
 * import type { AppRouter } from './server';
 *
 * const client = useLensClient<AppRouter>();
 * </script>
 * ```
 */
export function useLensClient<TRouter = any>(): LensClient<any, any> & TRouter {
	const client = inject(LensClientKey);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a component that called provideLensClient(). " +
				"Make sure to call provideLensClient(client) in a parent component.",
		);
	}

	return client as LensClient<any, any> & TRouter;
}
