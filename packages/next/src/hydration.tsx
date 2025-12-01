"use client";

/**
 * Hydration utilities for Next.js App Router.
 *
 * Provides context for passing server-fetched data to client components.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { DehydratedState } from "./index.js";

// =============================================================================
// Context
// =============================================================================

const HydrationContext = createContext<DehydratedState | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface HydrationBoundaryProps {
	/** Dehydrated state from server */
	state: DehydratedState;
	/** Child components */
	children: ReactNode;
}

/**
 * Hydration boundary component.
 *
 * Wraps client components to provide access to server-fetched data.
 *
 * @example
 * ```tsx
 * // Server Component
 * import { dehydrate, HydrationBoundary } from '@sylphx/lens-next';
 *
 * export default async function Page() {
 *   const data = await serverClient.user.get({ id: '1' });
 *   return (
 *     <HydrationBoundary state={dehydrate({ user: data })}>
 *       <ClientComponent />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function HydrationBoundary({ state, children }: HydrationBoundaryProps) {
	return <HydrationContext.Provider value={state}>{children}</HydrationContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access hydrated data in client components.
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * function ClientComponent() {
 *   const hydration = useHydration();
 *   const user = hydration?.queries.user;
 *
 *   // Use hydrated data as initial state
 *   const { data } = useQuery(client.user.get({ id: '1' }));
 *   const displayData = data ?? user;
 *
 *   return <div>{displayData?.name}</div>;
 * }
 * ```
 */
export function useHydration(): DehydratedState | null {
	return useContext(HydrationContext);
}
