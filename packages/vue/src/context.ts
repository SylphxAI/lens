/**
 * @sylphx/vue - Context
 *
 * Vue provide/inject for Lens client.
 */

import { inject, provide, type InjectionKey } from "vue";
import type { LensClient } from "@sylphx/client";

// =============================================================================
// Injection Key
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LensClientKey: InjectionKey<LensClient<any, any>> =
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
 * import { createClient, httpLink } from '@sylphx/client';
 * import { provideLensClient } from '@sylphx/vue';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * import { useLensClient } from '@sylphx/vue';
 * import type { AppRouter } from './server';
 *
 * const client = useLensClient<AppRouter>();
 * </script>
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLensClient<TRouter = any>(): LensClient<any, any> & TRouter {
	const client = inject(LensClientKey);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a component that called provideLensClient(). " +
				"Make sure to call provideLensClient(client) in a parent component.",
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return client as LensClient<any, any> & TRouter;
}
