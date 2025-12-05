/**
 * @sylphx/lens-react - Context Provider
 *
 * Provides Lens client to React component tree.
 *
 * Uses global singleton pattern to ensure the same context is shared
 * across multiple module instances (important for monorepos where
 * the same package may be resolved to different paths).
 */

import type { LensClient } from "@sylphx/lens-client";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";

// =============================================================================
// Context (Global Singleton)
// =============================================================================

/**
 * Global key for storing the singleton context.
 * Using a Symbol ensures no collision with other globals.
 */
const LENS_CONTEXT_KEY = Symbol.for("@sylphx/lens-react/context");

/**
 * Get or create the global singleton context.
 * This ensures that even if the module is loaded multiple times
 * (common in monorepos), all instances share the same React context.
 */
function getOrCreateContext(): React.Context<LensClient<any, any> | null> {
	const globalObj = globalThis as unknown as Record<symbol, React.Context<LensClient<any, any> | null>>;

	if (!globalObj[LENS_CONTEXT_KEY]) {
		globalObj[LENS_CONTEXT_KEY] = createContext<LensClient<any, any> | null>(null);
	}

	return globalObj[LENS_CONTEXT_KEY];
}

/**
 * Context for Lens client (singleton)
 * Using any for internal storage to avoid type constraint issues
 */
const LensContext = getOrCreateContext();

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
