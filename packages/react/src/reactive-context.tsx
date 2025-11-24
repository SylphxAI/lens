/**
 * @lens/react - Reactive Context
 *
 * React context for ReactiveClient with fine-grained reactivity.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ReactiveClient } from "@lens/client";
import type { SchemaDefinition } from "@lens/core";

// =============================================================================
// Context
// =============================================================================

const ReactiveClientContext = createContext<ReactiveClient<SchemaDefinition> | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface ReactiveLensProviderProps<S extends SchemaDefinition> {
	/** ReactiveClient instance */
	client: ReactiveClient<S>;
	/** Child components */
	children: ReactNode;
}

/**
 * Provider for ReactiveClient with fine-grained reactivity.
 *
 * @example
 * ```tsx
 * import { createReactiveClient, httpLink } from "@lens/client";
 * import { ReactiveLensProvider } from "@lens/react";
 *
 * const client = createReactiveClient({
 *   links: [httpLink({ url: "/api" })],
 * });
 *
 * function App() {
 *   return (
 *     <ReactiveLensProvider client={client}>
 *       <UserProfile userId="123" />
 *     </ReactiveLensProvider>
 *   );
 * }
 * ```
 */
export function ReactiveLensProvider<S extends SchemaDefinition>({
	client,
	children,
}: ReactiveLensProviderProps<S>) {
	return (
		<ReactiveClientContext.Provider value={client as ReactiveClient<SchemaDefinition>}>
			{children}
		</ReactiveClientContext.Provider>
	);
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Get the ReactiveClient from context.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useReactiveLensClient();
 *   const user = client.User.get("123");
 *   // ...
 * }
 * ```
 */
export function useReactiveLensClient<S extends SchemaDefinition>(): ReactiveClient<S> {
	const client = useContext(ReactiveClientContext);

	if (!client) {
		throw new Error(
			"useReactiveLensClient must be used within a ReactiveLensProvider. " +
				"Make sure you have wrapped your app with <ReactiveLensProvider client={...}>",
		);
	}

	return client as ReactiveClient<S>;
}
