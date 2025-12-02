/**
 * @sylphx/lens-core - Plugin Extension Types
 *
 * Type infrastructure for plugin-driven type extensions.
 * Plugins can extend builder methods with full TypeScript type safety.
 *
 * The plugin system works by:
 * 1. Each plugin defines a PluginExtension interface with a name
 * 2. Each plugin exports a Methods type (e.g., OptimisticPluginMethods)
 * 3. The TPlugins type parameter flows through the entire builder chain
 * 4. At each stage, plugin methods are looked up by name via ExtractPluginMethods
 *
 * @example
 * ```typescript
 * // Define a plugin extension
 * interface MyPluginExtension extends PluginExtension {
 *   name: 'my-plugin';
 * }
 *
 * // Define plugin methods as a type
 * type MyPluginMethods<TStage, TInput, TOutput, TContext> =
 *   TStage extends "MutationBuilderWithReturns"
 *     ? { myMethod(): MutationBuilderWithOptimistic<TInput, TOutput, TContext> }
 *     : {};
 *
 * // Use in lens()
 * const { mutation } = lens<AppContext>({ plugins: [myPlugin()] });
 * mutation().input(...).returns(...).myMethod(); // Type-safe!
 * ```
 */

// =============================================================================
// Plugin Extension Protocol
// =============================================================================

/**
 * Base interface for plugin type extensions.
 *
 * Each plugin declares methods it adds to various builder stages.
 * Methods are generic over TInput, TOutput, TContext to work with any operation.
 *
 * IMPORTANT: Plugin methods must be defined with proper generics to receive
 * the builder's type parameters. Use the helper types below.
 */
export interface PluginExtension {
	/** Plugin name - must match the runtime plugin's name */
	readonly name: string;

	/**
	 * Methods added to MutationBuilder (before .input())
	 */
	readonly MutationBuilder?: Record<string, unknown>;

	/**
	 * Methods added to MutationBuilder after .input() is called.
	 * These methods are available before .returns() or .resolve().
	 */
	readonly MutationBuilderWithInput?: Record<string, unknown>;

	/**
	 * Methods added to MutationBuilder after .returns() is called.
	 * These methods are available before .resolve().
	 */
	readonly MutationBuilderWithReturns?: Record<string, unknown>;

	/**
	 * Methods added to QueryBuilder.
	 */
	readonly QueryBuilder?: Record<string, unknown>;
}

/**
 * Empty extension type - represents no additional methods.
 * Uses {} (any object) rather than Record<string, never> because
 * Record<string, never> breaks intersection types (T & Record<string, never> = never-like).
 * With {}, we get T & {} = T, which is the desired behavior for "no additional methods".
 */
// biome-ignore lint/complexity/noBannedTypes: Empty object needed for intersection identity (T & {} = T)
export type EmptyExtension = {};

/**
 * Empty plugin extension (no methods added).
 * Used as default when no plugins configured.
 */
export interface NoPlugins extends PluginExtension {
	readonly name: "none";
}

// =============================================================================
// Type Utilities
// =============================================================================

// Re-export shared type utilities
export type { Prettify, UnionToIntersection } from "../utils/types.js";

// =============================================================================
// Plugin Method Type Imports
// =============================================================================

// Import plugin method types for direct lookup
// Each plugin exports a Methods type that defines methods for each builder stage
import type { OptimisticPluginMethods } from "./optimistic-extension.js";

/**
 * Plugin Method Lookup - maps plugin names to their method types.
 *
 * This type performs compile-time lookup of plugin methods based on the plugin name.
 *
 * To add a new plugin:
 * 1. Create MyPluginMethods<TStage, TInput, TOutput, TContext> type
 * 2. Import it above
 * 3. Add a conditional branch here: Name extends "my-plugin" ? MyPluginMethods<...> : ...
 *
 * Note: This is intentionally explicit rather than using module augmentation.
 * It provides better cross-package type visibility and simpler TypeScript semantics.
 */
type LookupPluginMethods<
	Name extends string,
	TStage extends string,
	TInput,
	TOutput,
	TContext,
> = Name extends "optimistic"
	? OptimisticPluginMethods<TStage, TInput, TOutput, TContext>
	: EmptyExtension;

/**
 * Extract methods for a specific builder stage from plugin array.
 *
 * Uses direct type lookup based on plugin name. Each plugin's methods
 * are defined in its own file and looked up via LookupPluginMethods.
 *
 * @example
 * ```typescript
 * type Plugins = [OptimisticPluginExtension];
 * type Methods = ExtractPluginMethods<Plugins, 'MutationBuilderWithReturns', TInput, TOutput, TContext>;
 * // Result: { optimistic(spec): MutationBuilderWithOptimistic<TInput, TOutput, TContext> }
 * ```
 */
export type ExtractPluginMethods<
	TPlugins extends readonly PluginExtension[],
	TStage extends string,
	TInput = unknown,
	TOutput = unknown,
	TContext = unknown,
> = TPlugins extends readonly []
	? // Empty array - no methods
		EmptyExtension
	: UnionToIntersection<
			TPlugins[number] extends infer P
				? P extends { readonly name: infer N extends string }
					? LookupPluginMethods<N, TStage, TInput, TOutput, TContext>
					: EmptyExtension
				: EmptyExtension
		>;

/**
 * Check if plugin array includes a specific plugin by name.
 *
 * @example
 * ```typescript
 * type Has = HasPlugin<[OptimisticPlugin], 'optimistic'>; // true
 * type HasNot = HasPlugin<[ValidationPlugin], 'optimistic'>; // false
 * ```
 */
export type HasPlugin<TPlugins extends readonly PluginExtension[], Name extends string> = Extract<
	TPlugins[number],
	{ readonly name: Name }
> extends never
	? false
	: true;

/**
 * Conditional type based on plugin presence.
 *
 * @example
 * ```typescript
 * type Result = IfPlugin<Plugins, 'optimistic', { optimistic(): void }, {}>
 * ```
 */
export type IfPlugin<
	TPlugins extends readonly PluginExtension[],
	Name extends string,
	Then,
	Else = EmptyExtension,
> = HasPlugin<TPlugins, Name> extends true ? Then : Else;

// =============================================================================
// Backward Compatibility Types (Legacy Plugin Extraction)
// =============================================================================

/**
 * Extract methods from a specific stage across all plugins.
 * This is the legacy approach that extracts directly from plugin extension interfaces.
 * For plugins with generic parameters, use ExtractPluginMethods with PluginMethodRegistry.
 *
 * @deprecated Use ExtractPluginMethods with PluginMethodRegistry for generic-aware extraction
 *
 * @example
 * ```typescript
 * type Methods = ExtractExtension<[PluginA, PluginB], 'MutationBuilderWithReturns'>;
 * // Result: { methodA(): void } & { methodB(): void }
 * ```
 */
export type ExtractExtension<
	TPlugins extends readonly PluginExtension[],
	TStage extends keyof PluginExtension,
> = UnionToIntersection<
	TPlugins[number] extends infer P
		? P extends PluginExtension
			? TStage extends keyof P
				? P[TStage] extends Record<string, unknown>
					? P[TStage]
					: EmptyExtension
				: EmptyExtension
			: EmptyExtension
		: EmptyExtension
>;

/**
 * Merge all extension categories from plugins into a single extension type.
 * This is the legacy approach that merges directly from plugin extension interfaces.
 *
 * @deprecated Use ExtractPluginMethods for individual stage extraction
 *
 * @example
 * ```typescript
 * type Merged = MergeExtensions<[PluginA, PluginB]>;
 * // Result: {
 * //   MutationBuilderWithReturns: { methodA(): void } & { methodB(): void };
 * //   QueryBuilder: { queryMethod(): void };
 * // }
 * ```
 */
export type MergeExtensions<TPlugins extends readonly PluginExtension[]> = {
	MutationBuilder: ExtractExtension<TPlugins, "MutationBuilder">;
	MutationBuilderWithInput: ExtractExtension<TPlugins, "MutationBuilderWithInput">;
	MutationBuilderWithReturns: ExtractExtension<TPlugins, "MutationBuilderWithReturns">;
	QueryBuilder: ExtractExtension<TPlugins, "QueryBuilder">;
};

/**
 * @deprecated Use NoPlugins instead
 */
export type NoExtension = NoPlugins;

// =============================================================================
// Runtime Plugin Interface
// =============================================================================

/**
 * Runtime plugin marker.
 * Used to connect type extensions with runtime plugin instances.
 *
 * @typeParam TExt - The plugin's type extension interface
 */
export interface RuntimePlugin<TExt extends PluginExtension = PluginExtension> {
	/** Plugin name - must match extension's name */
	readonly name: TExt["name"];

	/**
	 * Phantom type to store the extension type for extraction.
	 * Never set at runtime - only used for type inference.
	 */
	readonly _extension?: TExt;

	/**
	 * Runtime hooks for the plugin.
	 * Called at various points during operation execution.
	 */
	readonly hooks?: PluginHooks;

	/**
	 * Extension methods to add to builders.
	 * Called during lens() initialization to wire up methods.
	 */
	readonly builderExtensions?: {
		/**
		 * Factory for MutationBuilder methods (before .input()).
		 */
		MutationBuilder?: (builder: unknown) => Record<string, unknown>;

		/**
		 * Factory for MutationBuilderWithInput methods.
		 */
		MutationBuilderWithInput?: (builder: unknown) => Record<string, unknown>;

		/**
		 * Factory for MutationBuilderWithReturns methods.
		 */
		MutationBuilderWithReturns?: (builder: unknown) => Record<string, unknown>;

		/**
		 * Factory for QueryBuilder methods.
		 */
		QueryBuilder?: (builder: unknown) => Record<string, unknown>;
	};
}

/**
 * Plugin lifecycle hooks.
 * Plugins can hook into various stages of operation execution.
 */
export interface PluginHooks {
	/**
	 * Called before mutation execution.
	 * Can modify input or abort execution.
	 */
	beforeMutation?: (ctx: {
		path: string;
		input: unknown;
		meta: Record<string, unknown>;
	}) => void | Promise<void>;

	/**
	 * Called after mutation execution.
	 * Can modify output or perform side effects.
	 */
	afterMutation?: (ctx: {
		path: string;
		input: unknown;
		output: unknown;
		meta: Record<string, unknown>;
	}) => void | Promise<void>;

	/**
	 * Called before query execution.
	 */
	beforeQuery?: (ctx: {
		path: string;
		input: unknown;
		meta: Record<string, unknown>;
	}) => void | Promise<void>;

	/**
	 * Called after query execution.
	 */
	afterQuery?: (ctx: {
		path: string;
		input: unknown;
		output: unknown;
		meta: Record<string, unknown>;
	}) => void | Promise<void>;
}

/**
 * Type guard to check if a value is a RuntimePlugin.
 */
export function isRuntimePlugin(value: unknown): value is RuntimePlugin {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof (value as RuntimePlugin).name === "string"
	);
}

/**
 * Helper type to extract extension from a single RuntimePlugin.
 * Uses the _extension phantom property for reliable extraction.
 */
type ExtractSingleExtension<P> = P extends { readonly _extension?: infer E }
	? E extends PluginExtension
		? E
		: NoPlugins
	: NoPlugins;

/**
 * Extract PluginExtension types from a RuntimePlugin array.
 *
 * This allows lens({ plugins: [optimisticPlugin()] }) to work where
 * optimisticPlugin() returns RuntimePlugin<OptimisticPluginExtension>.
 *
 * @example
 * ```typescript
 * type Plugins = [RuntimePlugin<OptimisticPluginExtension>];
 * type Extensions = ExtractPluginExtensions<Plugins>;
 * // Result: [OptimisticPluginExtension]
 * ```
 */
export type ExtractPluginExtensions<T extends readonly RuntimePlugin[]> = {
	[K in keyof T]: ExtractSingleExtension<T[K]>;
};
