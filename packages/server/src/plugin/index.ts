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

// Optimistic Updates Plugin
export {
	isOptimisticPlugin,
	type OptimisticPlugin,
	type OptimisticPluginOptions,
	optimisticPlugin,
} from "./optimistic.js";

export {
	// Context types
	type AfterMutationContext,
	type AfterSendContext,
	type BeforeMutationContext,
	type BeforeSendContext,
	type BroadcastContext,
	type ConnectContext,
	// Plugin manager
	createPluginManager,
	type DisconnectContext,
	type EnhanceOperationMetaContext,
	PluginManager,
	// Plugin interface
	type ServerPlugin,
	type SubscribeContext,
	type UnsubscribeContext,
} from "./types.js";
