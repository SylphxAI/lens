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
 * const user = await client.user.get({ input: { id } });
 * client.user.get({ input: { id } }).subscribe(data => console.log(data));
 *
 * // Svelte stores (in components)
 * const userStore = client.user.get.createQuery({ input: { id } });
 * $: ({ data, loading } = $userStore);
 *
 * const { mutate } = client.user.create.createMutation();
 * ```
 */

// =============================================================================
// New API (v4) - Recommended
// =============================================================================

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

// =============================================================================
// Legacy API (v3) - Deprecated
// =============================================================================

export {
	getLensClient,
	// Context key
	LENS_CLIENT_KEY,
	// Context functions (recommended)
	provideLensClient,
	// Legacy aliases (deprecated)
	setLensClient,
	useLensClient,
} from "./context.js";
export {
	type LazyQueryStore,
	lazyQuery,
	type MutationFn,
	type MutationStore,
	// Note: MutationStoreValue exported from create.js (new API)
	mutation,
	// Types
	type QueryInput,
	type QueryStore,
	// Note: QueryStoreOptions, QueryStoreValue exported from create.js (new API)
	// Store factories
	query,
} from "./stores.js";
