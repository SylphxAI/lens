/**
 * @lens/react - Context Provider
 *
 * Provides Lens client to React component tree.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { LensClient } from "@lens/client";

// =============================================================================
// Context
// =============================================================================

/**
 * Context for Lens client
 */
const LensContext = createContext<LensClient<unknown, unknown> | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderProps<Q = unknown, M = unknown> {
	/** Lens client instance */
	client: LensClient<Q, M>;
	/** Children */
	children: ReactNode;
}

/**
 * Provides Lens client to component tree
 *
 * @example
 * ```tsx
 * import { createClient, httpLink } from '@lens/client';
 * import { LensProvider } from '@lens/react';
 * import type { AppRouter } from './server';
 *
 * const client = createClient<AppRouter>({
 *   links: [httpLink({ url: '/api' })],
 * });
 *
 * function App() {
 *   return (
 *     <LensProvider client={client}>
 *       <UserProfile />
 *     </LensProvider>
 *   );
 * }
 * ```
 */
export function LensProvider<Q, M>({ client, children }: LensProviderProps<Q, M>) {
	return (
		<LensContext.Provider value={client as LensClient<unknown, unknown>}>
			{children}
		</LensContext.Provider>
	);
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Get Lens client from context
 *
 * @throws Error if used outside LensProvider
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useLensClient<AppRouter>();
 *   const { data } = useQuery(client.queries.getUser({ id: userId }));
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */
export function useLensClient<Q = unknown, M = unknown>(): LensClient<Q, M> {
	const client = useContext(LensContext);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a <LensProvider>. " +
				"Make sure to wrap your app with <LensProvider client={client}>.",
		);
	}

	return client as LensClient<Q, M>;
}
