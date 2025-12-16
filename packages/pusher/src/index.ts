/**
 * @sylphx/lens-pusher
 *
 * Pusher Channels integration for Lens real-time subscriptions.
 * For serverless deployments where WebSocket connections aren't persistent.
 *
 * Flow:
 * 1. Server uses HTTP adapter for requests
 * 2. Clients subscribe to Pusher channels directly (using pusher-js)
 * 3. Server publishes updates to Pusher (via pusher server SDK)
 *
 * @example
 * ```typescript
 * // Client-side (pusher-js)
 * import Pusher from 'pusher-js';
 * import { createPusherSubscription } from '@sylphx/lens-pusher';
 *
 * const pusher = new Pusher('your-key', { cluster: 'us2' });
 *
 * const unsubscribe = createPusherSubscription(pusher, 'entity:User:123', (data) => {
 *   console.log('User updated:', data);
 * });
 *
 * // Server-side (pusher)
 * import Pusher from 'pusher';
 * import { createPusherBroadcaster } from '@sylphx/lens-pusher';
 *
 * const pusher = new Pusher({
 *   appId: process.env.PUSHER_APP_ID,
 *   key: process.env.PUSHER_KEY,
 *   secret: process.env.PUSHER_SECRET,
 *   cluster: process.env.PUSHER_CLUSTER,
 * });
 *
 * const broadcast = createPusherBroadcaster(pusher);
 * await broadcast('entity:User:123', { id: '123', name: 'Updated' });
 * ```
 */

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
 * Pusher client interface (pusher-js).
 * Matches the pusher-js client API.
 */
export interface PusherClientLike {
	subscribe(channelName: string): {
		bind(eventName: string, callback: (data: unknown) => void): void;
		unbind(eventName: string, callback: (data: unknown) => void): void;
	};
	unsubscribe(channelName: string): void;
}

/**
 * Pusher server interface (pusher).
 * Matches the pusher server SDK API.
 */
export interface PusherServerLike {
	trigger(channel: string | string[], event: string, data: unknown): Promise<unknown>;
}

/**
 * Create a subscription to a Lens channel via Pusher (client-side).
 *
 * @param pusher - Pusher client instance (from pusher-js)
 * @param channel - Channel name (e.g., 'entity:User:123')
 * @param onMessage - Callback for incoming messages
 * @param channelPrefix - Channel prefix (default: 'lens-')
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import Pusher from 'pusher-js';
 * import { createPusherSubscription } from '@sylphx/lens-pusher';
 *
 * const pusher = new Pusher('your-key', { cluster: 'us2' });
 *
 * const unsubscribe = createPusherSubscription(pusher, 'entity:User:123', (data) => {
 *   console.log('User updated:', data);
 * });
 * ```
 */
export function createPusherSubscription(
	pusher: PusherClientLike,
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

/**
 * Create a broadcaster for publishing Lens updates via Pusher (server-side).
 *
 * @param pusher - Pusher server instance (from pusher)
 * @param channelPrefix - Channel prefix (default: 'lens-')
 * @returns Broadcast function
 *
 * @example
 * ```typescript
 * import Pusher from 'pusher';
 * import { createPusherBroadcaster } from '@sylphx/lens-pusher';
 *
 * const pusher = new Pusher({
 *   appId: process.env.PUSHER_APP_ID,
 *   key: process.env.PUSHER_KEY,
 *   secret: process.env.PUSHER_SECRET,
 *   cluster: process.env.PUSHER_CLUSTER,
 * });
 *
 * const broadcast = createPusherBroadcaster(pusher);
 * await broadcast('entity:User:123', { id: '123', name: 'Updated' });
 * ```
 */
export function createPusherBroadcaster(
	pusher: PusherServerLike,
	channelPrefix = "lens-",
): (channel: string, data: unknown) => Promise<void> {
	return async (channel: string, data: unknown) => {
		const pusherChannel = `${channelPrefix}${channel}`;
		await pusher.trigger(pusherChannel, "update", data);
	};
}
