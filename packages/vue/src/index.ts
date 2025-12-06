/**
 * @sylphx/lens-vue
 *
 * Vue composables for Lens API framework.
 * Uses Vue's Composition API for reactive state management.
 *
 * @example
 * ```ts
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-vue';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Component usage
 * const { data, loading } = client.user.get({ input: { id } });
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
	LensClientKey,
	provideLensClient,
	useLensClient,
} from "./context.js";

export {
	type MutationFn,
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	useMutation,
	useQuery,
} from "./composables.js";
