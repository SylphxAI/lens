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
 * const user = await client.user.get({ args: { id } });
 * client.user.get({ args: { id } }).subscribe(data => console.log(data));
 *
 * // SolidJS primitives (in components)
 * const { data, loading } = client.user.get.createQuery({ args: { id } });
 * const { mutate } = client.user.create.createMutation();
 * ```
 */

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

export {
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type CreateQueryResult,
	createLazyQuery,
	createMutation,
	createQuery,
	type MutationFn,
	type QueryInput,
} from "./primitives.js";
