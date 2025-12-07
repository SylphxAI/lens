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
 * // Vanilla JS (anywhere - SSR, utilities, event handlers)
 * const user = await client.user.get({ input: { id } });
 * client.user.get({ input: { id } }).subscribe(data => console.log(data));
 *
 * // SolidJS primitives (in components)
 * const { data, loading } = client.user.get.createQuery({ input: { id } });
 * const { mutate } = client.user.create.createMutation();
 * ```
 */

// =============================================================================
// New API (v4) - Recommended
// =============================================================================

export {
	createClient,
	type MutationEndpoint,
	type MutationPrimitiveOptions,
	type MutationPrimitiveResult,
	type QueryEndpoint,
	type QueryPrimitiveOptions,
	type QueryPrimitiveResult,
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
