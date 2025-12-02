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
	type MutationBuilderWithOptimisticExt,
	OPTIMISTIC_PLUGIN_SYMBOL,
	type OptimisticMutationMethods,
	// Optimistic plugin extension
	type OptimisticPluginExtension,
	type OptimisticPluginMarker,
} from "./optimistic-extension.js";
export {
	type EmptyExtension,
	type ExtractExtension,
	type HasPlugin,
	type IfPlugin,
	isRuntimePlugin,
	type MergeExtensions,
	type NoExtension,
	// Extension protocol
	type PluginExtension,
	type Prettify,
	// Runtime
	type RuntimePlugin,
	// Type utilities
	type UnionToIntersection,
} from "./types.js";
