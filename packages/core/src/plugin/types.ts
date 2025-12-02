/**
 * @sylphx/lens-core - Plugin Extension Types
 *
 * Type infrastructure for plugin-driven type extensions.
 * Plugins can extend builder methods with full TypeScript type safety.
 *
 * @example
 * ```typescript
 * // Define a plugin extension
 * interface MyPluginExtension extends PluginExtension {
 *   name: 'my-plugin';
 *   MutationBuilderWithReturns: {
 *     myMethod(): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
 *   };
 * }
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
 * Each plugin can declare the methods it adds to various builders.
 * These are merged at the type level when lens({ plugins }) is called.
 */
export interface PluginExtension {
	/** Plugin name - must match the runtime plugin's name */
	readonly name: string;

	/**
	 * Methods added to MutationBuilder after .returns() is called.
	 * These methods are available before .resolve().
	 */
	readonly MutationBuilderWithReturns?: Record<string, unknown>;

	/**
	 * Methods added to MutationBuilder after .input() is called.
	 * These methods are available before .returns() or .resolve().
	 */
	readonly MutationBuilderWithInput?: Record<string, unknown>;

	/**
	 * Methods added to QueryBuilder.
	 */
	readonly QueryBuilder?: Record<string, unknown>;
}

/**
 * Empty extension type - represents no additional methods.
 * Uses Record<string, never> to satisfy lint rules while representing empty objects.
 */
export type EmptyExtension = Record<string, never>;

/**
 * Empty plugin extension (no methods added).
 * Used as default when no plugins configured.
 */
export interface NoExtension extends PluginExtension {
	readonly name: "none";
	readonly MutationBuilderWithReturns: EmptyExtension;
	readonly MutationBuilderWithInput: EmptyExtension;
	readonly QueryBuilder: EmptyExtension;
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Convert union type to intersection type.
 *
 * @example
 * ```typescript
 * type A = { a: 1 } | { b: 2 };
 * type B = UnionToIntersection<A>; // { a: 1 } & { b: 2 }
 * ```
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never;

/**
 * Flatten intersection types for better IDE display.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Extract a specific extension type from plugin array.
 *
 * @example
 * ```typescript
 * type Plugins = [OptimisticPlugin, ValidationPlugin];
 * type Ext = ExtractExtension<Plugins, 'MutationBuilderWithReturns'>;
 * // Result: OptimisticMethods & ValidationMethods
 * ```
 */
export type ExtractExtension<
	Plugins extends readonly PluginExtension[],
	Key extends keyof PluginExtension,
> = UnionToIntersection<
	Plugins[number] extends infer P
		? P extends PluginExtension
			? P[Key] extends Record<string, unknown>
				? P[Key]
				: EmptyExtension
			: EmptyExtension
		: EmptyExtension
>;

/**
 * Merge all plugin extensions into a single type.
 *
 * @example
 * ```typescript
 * type Merged = MergeExtensions<[OptimisticPlugin, ValidationPlugin]>;
 * // Result: {
 * //   MutationBuilderWithReturns: { optimistic: ..., validate: ... };
 * //   QueryBuilder: { ... };
 * // }
 * ```
 */
export type MergeExtensions<Plugins extends readonly PluginExtension[]> = {
	MutationBuilderWithReturns: ExtractExtension<Plugins, "MutationBuilderWithReturns">;
	MutationBuilderWithInput: ExtractExtension<Plugins, "MutationBuilderWithInput">;
	QueryBuilder: ExtractExtension<Plugins, "QueryBuilder">;
};

/**
 * Check if plugin array includes a specific plugin by name.
 *
 * @example
 * ```typescript
 * type Has = HasPlugin<[OptimisticPlugin], 'optimistic'>; // true
 * type HasNot = HasPlugin<[ValidationPlugin], 'optimistic'>; // false
 * ```
 */
export type HasPlugin<Plugins extends readonly PluginExtension[], Name extends string> = Extract<
	Plugins[number],
	{ name: Name }
> extends never
	? false
	: true;

/**
 * Conditional type based on plugin presence.
 *
 * @example
 * ```typescript
 * type Result = IfPlugin<Plugins, 'optimistic', { optimistic(): void }, {}>;
 * ```
 */
export type IfPlugin<
	Plugins extends readonly PluginExtension[],
	Name extends string,
	Then,
	Else = EmptyExtension,
> = HasPlugin<Plugins, Name> extends true ? Then : Else;

// =============================================================================
// Runtime Plugin Interface
// =============================================================================

/**
 * Runtime plugin marker.
 * Used to connect type extensions with runtime plugin instances.
 */
export interface RuntimePlugin<TExt extends PluginExtension = PluginExtension> {
	/** Plugin name - must match extension's name */
	readonly name: TExt["name"];

	/**
	 * Extension methods to add to builders.
	 * Called during lens() initialization to wire up methods.
	 */
	readonly builderExtensions?: {
		/**
		 * Factory for MutationBuilderWithReturns methods.
		 * Receives the builder instance, returns method implementations.
		 */
		MutationBuilderWithReturns?: (builder: unknown) => Record<string, unknown>;

		/**
		 * Factory for MutationBuilderWithInput methods.
		 */
		MutationBuilderWithInput?: (builder: unknown) => Record<string, unknown>;

		/**
		 * Factory for QueryBuilder methods.
		 */
		QueryBuilder?: (builder: unknown) => Record<string, unknown>;
	};
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
