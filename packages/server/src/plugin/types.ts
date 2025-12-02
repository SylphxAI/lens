/**
 * @sylphx/lens-server - Plugin System Types
 *
 * Server-side plugin system with lifecycle hooks.
 * Plugins can intercept, modify, or extend server behavior.
 */

// =============================================================================
// Hook Context Types
// =============================================================================

/**
 * Context passed to onSubscribe hook.
 */
export interface SubscribeContext {
	/** Client ID */
	clientId: string;
	/** Subscription ID (unique per client) */
	subscriptionId: string;
	/** Operation path (e.g., 'user.get') */
	operation: string;
	/** Operation input */
	input: unknown;
	/** Fields being subscribed to */
	fields: string[] | "*";
	/** Entity type (if determined) */
	entity?: string;
	/** Entity ID (if determined) */
	entityId?: string;
}

/**
 * Context passed to onUnsubscribe hook.
 */
export interface UnsubscribeContext {
	/** Client ID */
	clientId: string;
	/** Subscription ID */
	subscriptionId: string;
	/** Operation path */
	operation: string;
	/** Entity keys that were being tracked */
	entityKeys: string[];
}

/**
 * Context passed to beforeSend hook.
 *
 * The beforeSend hook is the key integration point for optimization plugins.
 * Plugins can intercept the data and return an optimized payload (e.g., diff).
 */
export interface BeforeSendContext {
	/** Client ID */
	clientId: string;
	/** Subscription ID (unique per client subscription) */
	subscriptionId: string;
	/** Entity type */
	entity: string;
	/** Entity ID */
	entityId: string;
	/** Data to be sent (full entity data) */
	data: Record<string, unknown>;
	/** Whether this is the first send (initial subscription data) */
	isInitial: boolean;
	/** Fields the client is subscribed to */
	fields: string[] | "*";
}

/**
 * Context passed to afterSend hook.
 */
export interface AfterSendContext {
	/** Client ID */
	clientId: string;
	/** Subscription ID */
	subscriptionId: string;
	/** Entity type */
	entity: string;
	/** Entity ID */
	entityId: string;
	/** Data that was sent (may be optimized/transformed by beforeSend) */
	data: Record<string, unknown>;
	/** Whether this was the first send */
	isInitial: boolean;
	/** Fields the client is subscribed to */
	fields: string[] | "*";
	/** Timestamp of send */
	timestamp: number;
}

/**
 * Context passed to onConnect hook.
 */
export interface ConnectContext {
	/** Client ID */
	clientId: string;
	/** Request object (if available) */
	request?: Request;
}

/**
 * Context passed to onDisconnect hook.
 */
export interface DisconnectContext {
	/** Client ID */
	clientId: string;
	/** Number of active subscriptions at disconnect */
	subscriptionCount: number;
}

/**
 * Context passed to beforeMutation hook.
 */
export interface BeforeMutationContext {
	/** Mutation name */
	name: string;
	/** Mutation input */
	input: unknown;
	/** Client ID (if from WebSocket) */
	clientId?: string;
}

/**
 * Context passed to afterMutation hook.
 */
export interface AfterMutationContext {
	/** Mutation name */
	name: string;
	/** Mutation input */
	input: unknown;
	/** Mutation result */
	result: unknown;
	/** Client ID (if from WebSocket) */
	clientId?: string;
	/** Duration in milliseconds */
	duration: number;
}

// =============================================================================
// Plugin Interface
// =============================================================================

/**
 * Server plugin interface.
 *
 * Plugins receive lifecycle hooks to extend server behavior.
 * All hooks are optional - implement only what you need.
 *
 * @example
 * ```typescript
 * const loggingPlugin: ServerPlugin = {
 *   name: 'logging',
 *   onSubscribe: (ctx) => {
 *     console.log(`Client ${ctx.clientId} subscribed to ${ctx.operation}`);
 *   },
 *   beforeSend: (ctx) => {
 *     console.log(`Sending ${Object.keys(ctx.data).length} fields to ${ctx.clientId}`);
 *     return ctx.data; // Can modify data
 *   },
 * };
 * ```
 */
export interface ServerPlugin {
	/** Plugin name (for debugging) */
	name: string;

	/**
	 * Called when a client connects.
	 * Can return false to reject the connection.
	 */
	onConnect?: (ctx: ConnectContext) => void | boolean | Promise<void | boolean>;

	/**
	 * Called when a client disconnects.
	 */
	onDisconnect?: (ctx: DisconnectContext) => void | Promise<void>;

	/**
	 * Called when a client subscribes to an operation.
	 * Can modify the context or return false to reject.
	 */
	onSubscribe?: (ctx: SubscribeContext) => void | boolean | Promise<void | boolean>;

	/**
	 * Called when a client unsubscribes.
	 */
	onUnsubscribe?: (ctx: UnsubscribeContext) => void | Promise<void>;

	/**
	 * Called before sending data to a client.
	 * Can modify the data to be sent.
	 *
	 * @returns Modified data, or undefined to use original
	 */
	beforeSend?: (
		ctx: BeforeSendContext,
	) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

	/**
	 * Called after data is sent to a client.
	 */
	afterSend?: (ctx: AfterSendContext) => void | Promise<void>;

	/**
	 * Called before a mutation is executed.
	 * Can modify the input or return false to reject.
	 */
	beforeMutation?: (ctx: BeforeMutationContext) => void | boolean | Promise<void | boolean>;

	/**
	 * Called after a mutation is executed.
	 */
	afterMutation?: (ctx: AfterMutationContext) => void | Promise<void>;
}

// =============================================================================
// Plugin Manager
// =============================================================================

/**
 * Plugin manager handles plugin lifecycle and hook execution.
 */
export class PluginManager {
	private plugins: ServerPlugin[] = [];

	/**
	 * Register a plugin.
	 */
	register(plugin: ServerPlugin): void {
		this.plugins.push(plugin);
	}

	/**
	 * Get all registered plugins.
	 */
	getPlugins(): readonly ServerPlugin[] {
		return this.plugins;
	}

	/**
	 * Run onConnect hooks.
	 * Returns false if any plugin rejects the connection.
	 */
	async runOnConnect(ctx: ConnectContext): Promise<boolean> {
		for (const plugin of this.plugins) {
			if (plugin.onConnect) {
				const result = await plugin.onConnect(ctx);
				if (result === false) return false;
			}
		}
		return true;
	}

	/**
	 * Run onDisconnect hooks.
	 */
	async runOnDisconnect(ctx: DisconnectContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (plugin.onDisconnect) {
				await plugin.onDisconnect(ctx);
			}
		}
	}

	/**
	 * Run onSubscribe hooks.
	 * Returns false if any plugin rejects the subscription.
	 */
	async runOnSubscribe(ctx: SubscribeContext): Promise<boolean> {
		for (const plugin of this.plugins) {
			if (plugin.onSubscribe) {
				const result = await plugin.onSubscribe(ctx);
				if (result === false) return false;
			}
		}
		return true;
	}

	/**
	 * Run onUnsubscribe hooks.
	 */
	async runOnUnsubscribe(ctx: UnsubscribeContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (plugin.onUnsubscribe) {
				await plugin.onUnsubscribe(ctx);
			}
		}
	}

	/**
	 * Run beforeSend hooks.
	 * Each plugin can modify the data.
	 */
	async runBeforeSend(ctx: BeforeSendContext): Promise<Record<string, unknown>> {
		let data = ctx.data;
		for (const plugin of this.plugins) {
			if (plugin.beforeSend) {
				const result = await plugin.beforeSend({ ...ctx, data });
				if (result !== undefined) {
					data = result;
				}
			}
		}
		return data;
	}

	/**
	 * Run afterSend hooks.
	 */
	async runAfterSend(ctx: AfterSendContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (plugin.afterSend) {
				await plugin.afterSend(ctx);
			}
		}
	}

	/**
	 * Run beforeMutation hooks.
	 * Returns false if any plugin rejects the mutation.
	 */
	async runBeforeMutation(ctx: BeforeMutationContext): Promise<boolean> {
		for (const plugin of this.plugins) {
			if (plugin.beforeMutation) {
				const result = await plugin.beforeMutation(ctx);
				if (result === false) return false;
			}
		}
		return true;
	}

	/**
	 * Run afterMutation hooks.
	 */
	async runAfterMutation(ctx: AfterMutationContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (plugin.afterMutation) {
				await plugin.afterMutation(ctx);
			}
		}
	}
}

/**
 * Create a new plugin manager.
 */
export function createPluginManager(): PluginManager {
	return new PluginManager();
}
