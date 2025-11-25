/**
 * @sylphx/lens/server
 *
 * Server-side functionality for Lens.
 *
 * @example
 * ```typescript
 * import { createServer } from '@sylphx/lens/server';
 * import * as entities from './schema';
 * import * as queries from './queries';
 * import * as mutations from './mutations';
 *
 * export const server = createServer({
 *   entities,
 *   queries,
 *   mutations,
 *   context: async (req) => ({
 *     db: prisma,
 *     user: await getUser(req),
 *   }),
 * });
 *
 * export type AppRouter = typeof server.router;
 * ```
 */

export * from "@sylphx/lens-server";
