/**
 * @sylphx/lens-core - Reify Integration (Internal)
 *
 * Re-exports only what Lens needs internally.
 * Users should import directly from @sylphx/reify for DSL building.
 *
 * @example
 * ```typescript
 * // User code - import Reify directly
 * import { entity, pipe, temp, ref, now, branch } from '@sylphx/reify';
 *
 * const pipeline = pipe(({ input }) => [
 *   entity.create('Session', { id: temp() }).as('session'),
 *   entity.create('Message', { sessionId: ref('session').id }).as('message'),
 * ]);
 *
 * // Use in Lens mutation
 * mutation().optimistic(pipeline).resolve(...)
 * ```
 */

export type { Pipeline } from "@sylphx/reify";
// Only export what Lens needs internally
export { isPipeline } from "@sylphx/reify";
