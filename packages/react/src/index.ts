/**
 * @sylphx/lens-react
 *
 * React bindings for Lens API framework.
 * Hooks and context provider for reactive data access.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-react';
 * import { httpTransport } from '@sylphx/lens-client';
 * import type { AppRouter } from '@/server/router';
 *
 * export const client = createClient<AppRouter>({
 *   transport: httpTransport({ url: '/api/lens' }),
 * });
 *
 * // Component usage
 * function UserProfile({ id }: { id: string }) {
 *   const { data, loading } = client.user.get({ input: { id } });
 *   return <div>{data?.name}</div>;
 * }
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
// Legacy API (v3) - Deprecated, will be removed in v3.0
// =============================================================================

export { LensProvider, type LensProviderProps, useLensClient } from "./context.js";

export {
	// Types
	type MutationSelector,
	type QuerySelector,
	type RouteSelector,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	// Query hooks
	useLazyQuery,
	// Mutation hook
	useMutation,
	useQuery,
} from "./hooks.js";
