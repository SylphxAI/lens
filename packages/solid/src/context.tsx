/**
 * @sylphx/lens-solid - Context
 *
 * SolidJS context for Lens client injection.
 */

import type { LensClient } from "@sylphx/lens-client";
import { createContext, type ParentComponent, useContext } from "solid-js";

// =============================================================================
// Context
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LensClientContext = createContext<LensClient<any, any>>();

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderProps {
	/** Lens client instance */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: LensClient<any, any>;
}

/**
 * Provider for Lens client in SolidJS.
 *
 * @example
 * ```tsx
 * import { createClient, httpLink } from '@sylphx/lens-client';
 * import { LensProvider } from '@sylphx/lens-solid';
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
		<LensClientContext.Provider value={props.client}>{props.children}</LensClientContext.Provider>
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLensClient<TRouter = any>(): LensClient<any, any> & TRouter {
	const client = useContext(LensClientContext);

	if (!client) {
		throw new Error(
			"useLensClient must be used within a <LensProvider>. " +
				"Make sure to wrap your app with <LensProvider client={client}>.",
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return client as LensClient<any, any> & TRouter;
}
