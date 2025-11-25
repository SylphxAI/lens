/**
 * @sylphx/lens
 *
 * Type-safe, real-time API framework.
 * GraphQL concepts in TypeScript with zero codegen.
 *
 * @example
 * ```typescript
 * import { entity, query, mutation, t } from '@sylphx/lens';
 *
 * export const User = entity({
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
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
