/**
 * @sylphx/lens-core - Plugin System
 *
 * Export all plugin-related types and utilities.
 */

// =============================================================================
// Paired Plugin (Client/Server plugin pairs)
// =============================================================================

export {
	// Type guard
	isPairedPlugin,
	// Types
	type PairedPlugin,
	// Resolvers
	resolveClientPlugins,
	resolveServerPlugins,
} from "./paired.js";

// =============================================================================
// Plugin Extension Protocol (Type-level plugin extensions)
// =============================================================================

export {
	isOptimisticPlugin,
	OPTIMISTIC_PLUGIN_SYMBOL,
	// Optimistic plugin extension
	type OptimisticPluginExtension,
	type OptimisticPluginMarker,
	// Optimistic plugin methods (for type composition)
	type OptimisticPluginMethods,
} from "./optimistic-extension.js";

export {
	type EmptyExtension,
	// Legacy extraction types (backward compatibility)
	type ExtractExtension,
	type ExtractPluginExtensions,
	type ExtractPluginMethods,
	type HasPlugin,
	type IfPlugin,
	isRuntimePlugin,
	type MergeExtensions,
	type NoExtension,
	type NoPlugins,
	// Extension protocol
	type PluginExtension,
	type PluginHooks,
	type Prettify,
	// Runtime
	type RuntimePlugin,
	// Type utilities
	type UnionToIntersection,
} from "./types.js";
