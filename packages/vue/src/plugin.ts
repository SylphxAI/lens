/**
 * @lens/vue - Plugin
 *
 * Vue plugin for providing Lens client to the component tree.
 */

import { inject, type App, type InjectionKey } from "vue";
import type { Client, ReactiveClient } from "@lens/client";
import type { SchemaDefinition } from "@lens/core";

// =============================================================================
// Injection Keys
// =============================================================================

/**
 * Injection key for Lens client
 */
export const LENS_CLIENT_KEY: InjectionKey<Client<SchemaDefinition>> = Symbol("lens-client");

/**
 * Injection key for reactive Lens client
 */
export const REACTIVE_LENS_CLIENT_KEY: InjectionKey<ReactiveClient<SchemaDefinition>> =
	Symbol("reactive-lens-client");

// =============================================================================
// Plugin
// =============================================================================

export interface LensPluginOptions<S extends SchemaDefinition = SchemaDefinition> {
	/** Lens client instance */
	client?: Client<S>;
	/** Reactive Lens client instance */
	reactiveClient?: ReactiveClient<S>;
}

/**
 * Vue plugin for Lens client
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { LensPlugin } from '@lens/vue';
 * import { createClient } from '@lens/client';
 *
 * const client = createClient({ ... });
 *
 * const app = createApp(App);
 * app.use(LensPlugin, { client });
 * app.mount('#app');
 * ```
 */
export const LensPlugin = {
	install<S extends SchemaDefinition>(app: App, options: LensPluginOptions<S> = {}) {
		if (options.client) {
			app.provide(LENS_CLIENT_KEY, options.client);
		}
		if (options.reactiveClient) {
			app.provide(REACTIVE_LENS_CLIENT_KEY, options.reactiveClient);
		}
	},
};

// =============================================================================
// Injection Composables
// =============================================================================

/**
 * Get Lens client from Vue's provide/inject
 *
 * @throws Error if client not found
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLensClient } from '@lens/vue';
 *
 * const client = useLensClient();
 * </script>
 * ```
 */
export function useLensClient<S extends SchemaDefinition>(): Client<S> {
	const client = inject(LENS_CLIENT_KEY);

	if (!client) {
		throw new Error("Lens client not found. Did you install LensPlugin?");
	}

	return client as Client<S>;
}

/**
 * Get reactive Lens client from Vue's provide/inject
 *
 * @throws Error if client not found
 */
export function useReactiveLensClient<S extends SchemaDefinition>(): ReactiveClient<S> {
	const client = inject(REACTIVE_LENS_CLIENT_KEY);

	if (!client) {
		throw new Error("Reactive Lens client not found. Did you install LensPlugin?");
	}

	return client as ReactiveClient<S>;
}
