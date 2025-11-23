/**
 * @lens/react - Context Provider
 *
 * Provides Lens client to React component tree.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Client } from "@lens/client";
import type { SchemaDefinition } from "@lens/core";

// =============================================================================
// Context
// =============================================================================

/**
 * Context for Lens client
 */
const LensContext = createContext<Client<SchemaDefinition> | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderProps {
	/** Lens client instance */
	client: Client<SchemaDefinition>;
	/** Children */
	children: ReactNode;
}

/**
 * Provides Lens client to component tree
 *
 * @example
 * ```tsx
 * import { createClient } from '@lens/client';
 * import { LensProvider } from '@lens/react';
 *
 * const client = createClient({ url: 'ws://localhost:3000' });
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
export function LensProvider({ client, children }: LensProviderProps) {
	return <LensContext.Provider value={client}>{children}</LensContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Get Lens client from context
 *
 * @throws Error if used outside LensProvider
 */
export function useLensClient<S extends SchemaDefinition>(): Client<S> {
	const client = useContext(LensContext);

	if (!client) {
		throw new Error("useLensClient must be used within a LensProvider");
	}

	return client as Client<S>;
}
