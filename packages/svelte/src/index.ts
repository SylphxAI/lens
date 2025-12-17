/**
 * @sylphx/lens-svelte
 *
 * Svelte stores for Lens API framework.
 * Provides reactive stores that integrate with Svelte's reactivity system.
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-svelte';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Vanilla JS (anywhere - SSR, utilities, event handlers)
 * const user = await client.user.get({ args: { id } });
 * client.user.get({ args: { id } }).subscribe(data => console.log(data));
 *
 * // Svelte stores (in components)
 * const userStore = client.user.get.createQuery({ args: { id } });
 * $: ({ data, loading } = $userStore);
 *
 * const { mutate } = client.user.create.createMutation();
 * ```
 */

export {
	createClient,
	type MutationEndpoint,
	type MutationStoreOptions,
	type MutationStoreResult,
	type MutationStoreValue,
	type QueryEndpoint,
	type QueryStoreOptions,
	type QueryStoreResult,
	type QueryStoreValue,
	type TypedClient,
} from "./create.js";
