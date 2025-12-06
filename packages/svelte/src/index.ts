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
 * // Component usage
 * const userStore = client.user.get({ input: { id } });
 * $: ({ data, loading } = $userStore);
 *
 * // SSR usage
 * const user = await client.user.get.fetch({ input: { id } });
 * ```
 */

// =============================================================================
// New API (v4) - Recommended
// =============================================================================

export {
	createClient,
	type MutationEndpoint,
	type MutationHookOptions,
	type MutationHookResult,
	type QueryEndpoint,
	type QueryHookOptions,
	type QueryHookResult,
	type TypedClient,
} from "./create.js";

// =============================================================================
// Legacy API (v3) - Deprecated
// =============================================================================

export {
	type LazyQueryStore,
	lazyQuery,
	type MutationFn,
	type MutationStore,
	type MutationStoreValue,
	mutation,
	// Types
	type QueryInput,
	type QueryStore,
	type QueryStoreOptions,
	type QueryStoreValue,
	// Store factories
	query,
} from "./stores.js";

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
