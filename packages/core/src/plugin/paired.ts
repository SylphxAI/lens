/**
 * @sylphx/lens-core - Paired Plugin Type
 *
 * PairedPlugin allows writing a single plugin that works on both
 * server and client. Each side extracts its relevant part.
 *
 * @example
 * ```typescript
 * import type { PairedPlugin } from '@sylphx/lens-core';
 * import type { ServerPlugin } from '@sylphx/lens-server';
 * import type { Plugin as ClientPlugin } from '@sylphx/lens-client';
 *
 * const compression: PairedPlugin<ServerPlugin, ClientPlugin> = {
 *   __paired: true,
 *   server: {
 *     name: 'compression',
 *     beforeSend: (ctx) => compress(ctx.data),
 *   },
 *   client: {
 *     name: 'compression',
 *     afterResponse: (result) => decompress(result.data),
 *   },
 * };
 * ```
 */

/**
 * Paired plugin that works on both server and client.
 *
 * This pattern allows writing cross-cutting concerns (like compression,
 * encryption, or logging) as a single unit that's properly split
 * between server and client at runtime.
 *
 * @typeParam S - Server plugin type
 * @typeParam C - Client plugin type
 */
export interface PairedPlugin<S = unknown, C = unknown> {
	/** Marker to identify paired plugins */
	readonly __paired: true;
	/** Server-side plugin */
	server: S;
	/** Client-side plugin */
	client: C;
}

/**
 * Type guard to check if a value is a PairedPlugin.
 *
 * @param plugin - Value to check
 * @returns true if plugin is a PairedPlugin
 */
export function isPairedPlugin<S, C>(
	plugin: unknown,
): plugin is PairedPlugin<S, C> {
	return (
		typeof plugin === "object" &&
		plugin !== null &&
		"__paired" in plugin &&
		(plugin as PairedPlugin).__paired === true
	);
}

/**
 * Extract server plugins from a mixed array of plugins.
 *
 * Handles both regular server plugins and paired plugins (extracts .server).
 *
 * @param plugins - Array of server plugins or paired plugins
 * @returns Array of server plugins only
 */
export function resolveServerPlugins<S>(
	plugins: (S | PairedPlugin<S, unknown>)[],
): S[] {
	return plugins.map((p) => (isPairedPlugin<S, unknown>(p) ? p.server : p));
}

/**
 * Extract client plugins from a mixed array of plugins.
 *
 * Handles both regular client plugins and paired plugins (extracts .client).
 *
 * @param plugins - Array of client plugins or paired plugins
 * @returns Array of client plugins only
 */
export function resolveClientPlugins<C>(
	plugins: (C | PairedPlugin<unknown, C>)[],
): C[] {
	return plugins.map((p) => (isPairedPlugin<unknown, C>(p) ? p.client : p));
}
