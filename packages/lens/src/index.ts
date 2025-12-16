/**
 * @sylphx/lens
 *
 * Type-safe, real-time API framework.
 * GraphQL concepts in TypeScript with zero codegen.
 *
 * @example
 * ```typescript
 * import { model, query, mutation, id, string } from '@sylphx/lens';
 * import { z } from 'zod';
 *
 * export const User = model('User', {
 *   id: id(),
 *   name: string(),
 *   email: string(),
 * });
 *
 * export const getUser = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 * ```
 */

// =============================================================================
// Core - Schema & Operations (re-export everything)
// =============================================================================

export * from "@sylphx/lens-core";
