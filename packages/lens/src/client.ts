/**
 * @sylphx/lens/client
 *
 * Client-side functionality for Lens.
 *
 * @example
 * ```typescript
 * import { createClient, httpLink } from '@sylphx/lens/client';
 * import type { AppRouter } from './server';
 *
 * const client = createClient<AppRouter>({
 *   links: [httpLink({ url: '/api' })],
 * });
 *
 * const user = await client.queries.getUser({ id: '123' });
 * ```
 */

export * from "@sylphx/lens-client";
