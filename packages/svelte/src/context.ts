/**
 * @lens/svelte - Context
 *
 * Svelte context for Lens client injection.
 */

import { getContext, setContext } from "svelte";
import type { Client, ReactiveClient } from "@lens/client";
import type { SchemaDefinition } from "@lens/core";

// =============================================================================
// Client Context
// =============================================================================

/**
 * Context key for Lens client
 */
export const LENS_CLIENT_KEY = Symbol("lens-client");

/**
 * Set Lens client in Svelte context
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { setLensClient } from '@lens/svelte';
 *   import { onMount } from 'svelte';
 *
 *   const client = createClient({ ... });
 *   setLensClient(client);
 * </script>
 * ```
 */
export function setLensClient<S extends SchemaDefinition>(client: Client<S>): void {
	setContext(LENS_CLIENT_KEY, client);
}

/**
 * Get Lens client from Svelte context
 *
 * @throws Error if client not found in context
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { getLensClient } from '@lens/svelte';
 *
 *   const client = getLensClient();
 * </script>
 * ```
 */
export function getLensClient<S extends SchemaDefinition>(): Client<S> {
	const client = getContext<Client<S>>(LENS_CLIENT_KEY);

	if (!client) {
		throw new Error("Lens client not found in context. Did you call setLensClient?");
	}

	return client;
}

// =============================================================================
// Reactive Client Context
// =============================================================================

/**
 * Context key for reactive Lens client
 */
export const REACTIVE_LENS_CLIENT_KEY = Symbol("reactive-lens-client");

/**
 * Set reactive Lens client in Svelte context
 */
export function setReactiveLensClient<S extends SchemaDefinition>(
	client: ReactiveClient<S>,
): void {
	setContext(REACTIVE_LENS_CLIENT_KEY, client);
}

/**
 * Get reactive Lens client from Svelte context
 *
 * @throws Error if client not found in context
 */
export function getReactiveLensClient<S extends SchemaDefinition>(): ReactiveClient<S> {
	const client = getContext<ReactiveClient<S>>(REACTIVE_LENS_CLIENT_KEY);

	if (!client) {
		throw new Error(
			"Reactive Lens client not found in context. Did you call setReactiveLensClient?",
		);
	}

	return client;
}
