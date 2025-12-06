/**
 * @sylphx/lens-solid
 *
 * SolidJS bindings for Lens API framework.
 * Reactive primitives that integrate with SolidJS fine-grained reactivity.
 *
 * @example
 * ```tsx
 * // lib/client.ts
 * import { createClient } from '@sylphx/lens-solid';
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

export { LensProvider, type LensProviderProps, useLensClient } from "./context.js";

// =============================================================================
// Reactive Primitives
// =============================================================================

export {
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type CreateQueryResult,
	createLazyQuery,
	// Mutation primitive
	createMutation,
	// Query primitives
	createQuery,
	type MutationFn,
	// Types
	type QueryInput,
} from "./primitives.js";
