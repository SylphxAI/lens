/**
 * @sylphx/lens-server - Pusher Subscription Transport
 *
 * Server-side transport for delivering updates via Pusher Channels.
 * Ideal for serverless deployments where WebSocket connections aren't persistent.
 *
 * Flow:
 * 1. Server publishes updates to Pusher channels via REST API
 * 2. Clients subscribe to Pusher channels directly (using pusher-js)
 * 3. Clients receive real-time updates from Pusher
 *
 * @example
 * ```typescript
 * import { createServer, pusher } from '@sylphx/lens-server';
 *
 * const server = createServer({
 *   router: appRouter,
 *   subscriptionTransport: pusher({
 *     appId: process.env.PUSHER_APP_ID!,
 *     key: process.env.PUSHER_KEY!,
 *     secret: process.env.PUSHER_SECRET!,
 *     cluster: process.env.PUSHER_CLUSTER!,
 *   }),
 * });
 * ```
 */

import type { SubscriptionTransport } from "../server/create.js";

/**
 * Pusher transport configuration.
 */
export interface PusherTransportOptions {
	/** Pusher app ID */
	appId: string;
	/** Pusher key */
	key: string;
	/** Pusher secret */
	secret: string;
	/** Pusher cluster (e.g., 'us2', 'eu', 'ap1') */
	cluster: string;
	/** Use TLS (default: true) */
	useTLS?: boolean;
	/** Channel prefix (default: 'lens-') */
	channelPrefix?: string;
	/** Debug logging */
	debug?: boolean;
}

/**
 * Pusher client interface.
 * Matches the pusher npm package API.
 */
interface PusherClient {
	trigger(channel: string | string[], event: string, data: unknown): Promise<unknown>; // Response from node-fetch
}

/**
 * Create a Pusher subscription transport.
 *
 * This transport uses Pusher Channels for real-time message delivery.
 * It's ideal for serverless environments where WebSocket connections
 * aren't persistent.
 *
 * Note: Clients must use pusher-js to subscribe to channels.
 * The server only publishes updates; subscription is handled client-side.
 *
 * @example
 * ```typescript
 * // Server
 * const server = createServer({
 *   router: appRouter,
 *   subscriptionTransport: pusher({
 *     appId: 'your-app-id',
 *     key: 'your-key',
 *     secret: 'your-secret',
 *     cluster: 'us2',
 *   }),
 * });
 *
 * // Client (using pusher-js directly)
 * import Pusher from 'pusher-js';
 *
 * const pusherClient = new Pusher('your-key', { cluster: 'us2' });
 * const channel = pusherClient.subscribe('lens-entity:User:123');
 * channel.bind('update', (data) => {
 *   // Handle update
 * });
 * ```
 */
export function pusher(options: PusherTransportOptions): SubscriptionTransport {
	const {
		appId,
		key,
		secret,
		cluster,
		useTLS = true,
		channelPrefix = "lens-",
		debug = false,
	} = options;

	let client: PusherClient | null = null;

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[pusher-transport]", ...args);
		}
	};

	return {
		name: "pusher",

		async init(): Promise<void> {
			// Dynamically import pusher to avoid requiring it if not used
			try {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const PusherModule = await import("pusher");
				// Pusher uses CommonJS default export pattern
				const Pusher =
					(PusherModule as unknown as { default: new (opts: unknown) => PusherClient }).default ??
					PusherModule;
				client = new Pusher({
					appId,
					key,
					secret,
					cluster,
					useTLS,
				});
				log("Pusher client initialized");
			} catch (error) {
				throw new Error(
					`Failed to initialize Pusher transport. Make sure 'pusher' package is installed: npm install pusher\n${error}`,
				);
			}
		},

		async publish(channel: string, message: unknown): Promise<void> {
			if (!client) {
				throw new Error("Pusher transport not initialized. Call init() first.");
			}

			const pusherChannel = `${channelPrefix}${channel}`;
			log("Publishing to", pusherChannel, message);

			try {
				await client.trigger(pusherChannel, "update", message);
			} catch (error) {
				console.error("[pusher-transport] Failed to publish:", error);
				throw error;
			}
		},

		subscribe(
			clientId: string,
			channel: string,
			_onMessage: (message: unknown) => void,
		): () => void {
			// For Pusher, clients subscribe directly via pusher-js.
			// The server doesn't track subscriptions; Pusher handles this.
			// This method is a no-op for external pub/sub transports.
			log("subscribe() called for", clientId, channel, "- clients subscribe via pusher-js");

			// Return no-op unsubscribe
			return () => {};
		},

		async close(): Promise<void> {
			// Pusher doesn't need explicit cleanup
			client = null;
			log("Pusher transport closed");
		},
	};
}

/**
 * Client-side Pusher subscription helper.
 *
 * This is a lightweight wrapper around pusher-js that integrates with
 * Lens's subscription model.
 *
 * @example
 * ```typescript
 * import Pusher from 'pusher-js';
 * import { createPusherSubscription } from '@sylphx/lens-server';
 *
 * const pusher = new Pusher('your-key', { cluster: 'us2' });
 *
 * // Subscribe to entity updates
 * const unsubscribe = createPusherSubscription(pusher, 'entity:User:123', (data) => {
 *   console.log('User updated:', data);
 * });
 *
 * // Later...
 * unsubscribe();
 * ```
 */
export interface PusherLike {
	subscribe(channelName: string): {
		bind(eventName: string, callback: (data: unknown) => void): void;
		unbind(eventName: string, callback: (data: unknown) => void): void;
	};
	unsubscribe(channelName: string): void;
}

/**
 * Create a subscription to a Lens channel via Pusher.
 *
 * @param pusher - Pusher client instance (from pusher-js)
 * @param channel - Channel name (e.g., 'entity:User:123')
 * @param onMessage - Callback for incoming messages
 * @param channelPrefix - Channel prefix (default: 'lens-')
 * @returns Unsubscribe function
 */
export function createPusherSubscription(
	pusher: PusherLike,
	channel: string,
	onMessage: (data: unknown) => void,
	channelPrefix = "lens-",
): () => void {
	const pusherChannel = `${channelPrefix}${channel}`;
	const subscription = pusher.subscribe(pusherChannel);

	subscription.bind("update", onMessage);

	return () => {
		subscription.unbind("update", onMessage);
		pusher.unsubscribe(pusherChannel);
	};
}
