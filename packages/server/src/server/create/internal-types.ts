/**
 * @sylphx/lens-server - Create / Internal Types
 *
 * Shared internal type aliases used across the server executor sub-modules.
 * Internal module - not part of the public API.
 */

import type { ResolverDef } from "@sylphx/lens-core";

/** Resolver map type for internal use */
export type ResolverMap = Map<string, ResolverDef<any, any, any>>;
