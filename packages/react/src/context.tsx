/**
 * @sylphx/lens-react - Context Provider
 *
 * Provides Lens client to React component tree.
 */

import type { LensClient } from "@sylphx/lens-client";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";

// =============================================================================
// Context
// =============================================================================

/**
 * Context for Lens client
 * Using any for internal storage to avoid type constraint issues
 */
const LensContext = createContext<LensClient<any, any> | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderProps {
	/** Lens client instance */
	client: LensClient<any, any>;
	/** Children */
	children: ReactNode;
}

/**
 * Provides Lens client to component tree
 *
 * @example
 * ```tsx
 * import { createClient, http } from '@sylphx/lens-client';
 * import { LensProvider } from '@sylphx/lens-react';
 * import type { AppRouter } from './server';
 *
 * const client = createClient<AppRouter>({
 *   transport: http({ url: '/api' }),
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
export function LensProvider({ client, children }: LensProviderProps): ReactElement {
	return <LensContext.Provider value={client}>{children}</LensContext.Provider>;
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
 *   const { data } = useQuery(client.user.get({ id: userId }));
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */
export function useLensClient<TRouter = any>(): LensClient<any, any> & TRouter {
	const client = useContext(LensContext);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a <LensProvider>. " +
				"Make sure to wrap your app with <LensProvider client={client}>.",
		);
	}

	return client as LensClient<any, any> & TRouter;
}
