/**
 * @sylphx/lens-server - Plugin System
 *
 * Export all plugin-related types and utilities.
 */

// Diff Optimizer Plugin
export {
	type DiffOptimizerOptions,
	diffOptimizer,
	isDiffOptimizerPlugin,
} from "./diff-optimizer.js";
export {
	// Context types
	type AfterMutationContext,
	type AfterSendContext,
	type BeforeMutationContext,
	type BeforeSendContext,
	type ConnectContext,
	// Plugin manager
	createPluginManager,
	type DisconnectContext,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "./types.js";
