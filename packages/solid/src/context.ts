/**
 * @lens/solid - Context
 *
 * SolidJS context for Lens client injection.
 */

import { createContext, useContext, type ParentComponent } from "solid-js";
import type { LensClient } from "@lens/client";

// =============================================================================
// Context
// =============================================================================

const LensClientContext = createContext<LensClient<unknown, unknown>>();

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderProps {
	/** Lens client instance */
	client: LensClient<unknown, unknown>;
}

/**
 * Provider for Lens client in SolidJS.
 *
 * @example
 * ```tsx
 * import { createClient, httpLink } from '@lens/client';
 * import { LensProvider } from '@lens/solid';
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
export const LensProvider: ParentComponent<LensProviderProps> = (props) => {
	return (
		<LensClientContext.Provider value={props.client}>
			{props.children}
		</LensClientContext.Provider>
	);
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Get Lens client from context.
 *
 * @throws Error if used outside LensProvider
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const client = useLensClient<AppRouter>();
 *   const user = createQuery(() => client.queries.getUser({ id: '123' }));
 *   return <h1>{user.data?.name}</h1>;
 * }
 * ```
 */
export function useLensClient<Q = unknown, M = unknown>(): LensClient<Q, M> {
	const client = useContext(LensClientContext);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a LensProvider. " +
				"Make sure you have wrapped your app with <LensProvider client={...}>",
		);
	}

	return client as LensClient<Q, M>;
}
