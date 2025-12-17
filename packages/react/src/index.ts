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
 * // Vanilla JS (anywhere - SSR, utilities, event handlers)
 * const user = await client.user.get({ args: { id } });
 * client.user.get({ args: { id } }).subscribe(data => console.log(data));
 *
 * // React hooks (in components)
 * const { data, loading } = client.user.get.useQuery({ args: { id } });
 * const { mutate, loading } = client.user.create.useMutation();
 * ```
 */

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
