# Plugin-Driven Type Extension Architecture

## Overview

Design document for implementing type-level plugin composition in Lens, enabling plugins to extend builder methods with full TypeScript type safety.

## Current Architecture

### Core (`@sylphx/lens-core`)

```typescript
// lens.ts - Current factory
function lens<TContext>(): Lens<TContext> {
  return {
    resolver: createResolver<TContext>(),
    query: (name?: string) => createQuery<TContext>(name),
    mutation: (name?: string) => createMutation<TContext>(name),
  };
}

// operations/index.ts - Current builders
interface MutationBuilderWithReturns<TInput, TOutput, TContext> {
  // .optimistic() is ALWAYS available, regardless of plugins
  optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<...>;
  resolve(fn: ResolverFn<...>): MutationDef<...>;
}
```

### Server (`@sylphx/lens-server`)

```typescript
// plugin/types.ts - ServerPlugin interface
interface ServerPlugin {
  name: string;
  enhanceOperationMeta?(ctx: EnhanceOperationMetaContext): void;
  beforeSend?(ctx: BeforeSendContext): Record<string, unknown> | void;
  onSubscribe?(ctx: SubscribeContext): void | boolean;
  // ... other hooks
}

// plugin/optimistic.ts - optimisticPlugin
function optimisticPlugin(options?: OptimisticPluginOptions): ServerPlugin {
  return {
    name: 'optimistic',
    enhanceOperationMeta(ctx) {
      // Process mutation._optimistic → ctx.meta.optimistic (Reify Pipeline)
    }
  };
}

// server/create.ts
function createServer(config: ServerConfig) {
  // plugins: ServerPlugin[]
  // Plugins registered via PluginManager
}
```

### Client (`@sylphx/lens-client`)

```typescript
// transport/plugin.ts - Client Plugin
interface Plugin {
  name: string;
  beforeRequest?(op: Operation): Operation;
  afterResponse?(result: Result, op: Operation): Result;
  onError?(error: Error, op: Operation, retry: () => Promise<Result>): Result;
}
```

## Problem Statement

1. **No Type-Level Extension**: `.optimistic()` method exists even without `optimisticPlugin()`. Users get no TypeScript error, but the feature silently doesn't work.

2. **Lack of Extensibility**: Adding new plugin features requires modifying core builder types, not extending them.

3. **Poor DX**: Users can't tell from types alone which features are available based on their plugin configuration.

## Proposed Architecture

### Goal

```typescript
// Without optimistic plugin - Type Error
const { mutation } = lens<AppContext>({ plugins: [] });
mutation().input(...).returns(...).optimistic('merge'); // ❌ Type Error: .optimistic() doesn't exist

// With optimistic plugin - Works
const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
mutation().input(...).returns(...).optimistic('merge'); // ✅ Works
```

### Design: Plugin Extension Protocol

#### 1. Plugin Type Extension Interface

```typescript
// packages/core/src/plugin/types.ts

/**
 * Plugin extension protocol.
 * Each plugin declares the methods it adds to builders.
 */
interface PluginExtension {
  /** Name must match plugin name */
  name: string;

  /** Methods added to MutationBuilder after .returns() */
  MutationBuilderWithReturns?: {};

  /** Methods added to MutationBuilder after input */
  MutationBuilderWithInput?: {};

  /** Methods added to QueryBuilder */
  QueryBuilder?: {};
}

/**
 * Merge multiple plugin extensions into one type.
 */
type MergeExtensions<Plugins extends PluginExtension[]> = {
  MutationBuilderWithReturns: UnionToIntersection<
    Plugins[number]['MutationBuilderWithReturns']
  >;
  QueryBuilder: UnionToIntersection<
    Plugins[number]['QueryBuilder']
  >;
};
```

#### 2. Optimistic Plugin Extension

```typescript
// packages/core/src/plugin/optimistic-extension.ts

/**
 * Type extension for optimistic plugin.
 * Declares .optimistic() method on mutation builders.
 */
interface OptimisticPluginExtension extends PluginExtension {
  name: 'optimistic';

  MutationBuilderWithReturns: {
    /**
     * Define optimistic update behavior.
     * Only available when optimisticPlugin() is configured.
     */
    optimistic(spec: OptimisticDSL): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
    optimistic(callback: OptimisticCallback<TInput>): MutationBuilderWithOptimistic<TInput, TOutput, TContext>;
  };
}

// Runtime marker for type inference
declare const OPTIMISTIC_PLUGIN_SYMBOL: unique symbol;
type OptimisticPlugin = ServerPlugin & { [OPTIMISTIC_PLUGIN_SYMBOL]: true };

function optimisticPlugin(options?: OptimisticPluginOptions): OptimisticPlugin {
  return {
    name: 'optimistic',
    [OPTIMISTIC_PLUGIN_SYMBOL]: true,
    // ... implementation
  } as OptimisticPlugin;
}
```

#### 3. Enhanced Lens Factory

```typescript
// packages/core/src/lens.ts

/**
 * Plugin-aware lens factory.
 * Builder methods are extended based on configured plugins.
 */
interface LensConfig<TContext, TPlugins extends PluginExtension[] = []> {
  plugins?: TPlugins;
}

/**
 * Create typed builders with plugin extensions.
 */
function lens<TContext, TPlugins extends PluginExtension[] = []>(
  config?: LensConfig<TContext, TPlugins>
): LensWithPlugins<TContext, TPlugins> {
  // Implementation creates builders with plugin methods
}

/**
 * Lens result type with plugin-extended builders.
 */
type LensWithPlugins<TContext, TPlugins extends PluginExtension[]> = {
  query: LensQuery<TContext>;
  mutation: LensMutation<TContext, MergeExtensions<TPlugins>['MutationBuilderWithReturns']>;
  resolver: LensResolver<TContext>;
};

/**
 * Mutation factory with plugin extensions.
 */
interface LensMutation<TContext, TMutationExt = {}> {
  (): MutationBuilder<unknown, unknown, TContext> & TMutationExt;
  (name: string): MutationBuilder<unknown, unknown, TContext> & TMutationExt;
}
```

### Type Flow Example

```typescript
// User code
import { lens, optimisticPlugin, validationPlugin } from '@sylphx/lens-core';

type AppContext = { db: DB; user: User };

// Plugins array is typed, extensions are computed
const plugins = [optimisticPlugin(), validationPlugin()];

// TPlugins = [OptimisticPluginExtension, ValidationPluginExtension]
// MergeExtensions = { MutationBuilderWithReturns: { optimistic: ..., validate: ... } }
const { query, mutation, resolver } = lens<AppContext>({ plugins });

// mutation() returns MutationBuilder & { optimistic: ..., validate: ... }
const createUser = mutation()
  .input(z.object({ name: z.string() }))
  .returns(User)
  .optimistic('create')  // ✅ Available from OptimisticPluginExtension
  .validate({ /* ... */ }) // ✅ Available from ValidationPluginExtension
  .resolve(({ input, ctx }) => ctx.db.user.create(input));
```

### Implementation Approach

#### Phase 1: Type Infrastructure (Non-Breaking)

1. **Create PluginExtension interface** in `@sylphx/lens-core`
2. **Define OptimisticPluginExtension** type
3. **Update lens() signature** to accept plugins config
4. **Maintain backward compatibility**: Default to current behavior when no plugins specified

```typescript
// Backward compatible - no plugins = all methods available (current behavior)
const { mutation } = lens<AppContext>();
mutation().optimistic('merge'); // Still works (legacy mode)

// New mode - explicit plugins = type-checked extensions
const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
mutation().optimistic('merge'); // Works with type safety
```

#### Phase 2: Builder Extension Mechanism

1. **Create ExtendedMutationBuilder class** that dynamically adds methods
2. **Plugin registers its extension methods** at lens() creation time
3. **Type system enforces** method availability matches plugin config

```typescript
// Internal implementation
class ExtendedMutationBuilderImpl<TInput, TOutput, TContext, TExtensions>
  implements MutationBuilderWithInput<TInput, TOutput, TContext> {

  constructor(
    private base: MutationBuilderImpl<TInput, TOutput, TContext>,
    private extensions: TExtensions
  ) {
    // Dynamically copy extension methods
    for (const [key, method] of Object.entries(extensions)) {
      (this as any)[key] = method.bind(this.base);
    }
  }

  // ... base methods delegate to this.base
}
```

#### Phase 3: Server Plugin Alignment

1. **ServerPlugin includes type extension** declaration
2. **createServer validates** that required plugins are present for used features
3. **Runtime warning** if mutation uses .optimistic() but server lacks optimisticPlugin()

```typescript
interface ServerPluginWithExtension<TExt extends PluginExtension = PluginExtension>
  extends ServerPlugin {
  /** Type extension this plugin provides */
  readonly extension?: TExt;
}
```

## Migration Path

### Stage 1: Soft Migration (v0.x)

- Add `lens({ plugins })` API alongside existing `lens()`
- Both work; plugins config is optional
- Document new pattern, deprecate raw `lens()`

### Stage 2: Deprecation Warnings (v0.y)

- `lens()` without plugins logs deprecation warning
- All docs show plugins-based usage

### Stage 3: Breaking Change (v1.0)

- `lens({ plugins })` required
- `.optimistic()` only exists when plugin configured
- Clean break, full type safety

## File Changes Summary

### New Files

| Path | Purpose |
|------|---------|
| `packages/core/src/plugin/types.ts` | PluginExtension interface |
| `packages/core/src/plugin/optimistic-extension.ts` | Optimistic type extension |
| `packages/core/src/plugin/index.ts` | Plugin exports |
| `packages/core/src/lens-with-plugins.ts` | Enhanced lens factory |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/core/src/lens.ts` | Add plugins config, backward compat |
| `packages/core/src/operations/index.ts` | Extract extension point interfaces |
| `packages/core/src/index.ts` | Export plugin types |
| `packages/server/src/plugin/optimistic.ts` | Add extension type |
| `packages/server/src/server/create.ts` | Plugin validation |

## Type Utilities

```typescript
// packages/core/src/plugin/utils.ts

/**
 * Convert union to intersection.
 * { a: 1 } | { b: 2 } → { a: 1; b: 2 }
 */
type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends ((k: infer I) => void)
    ? I
    : never;

/**
 * Extract extension from plugin array.
 */
type ExtractExtensions<T extends PluginExtension[]> = T[number];

/**
 * Check if plugin array includes specific plugin.
 */
type HasPlugin<Plugins extends PluginExtension[], Name extends string> =
  Extract<Plugins[number], { name: Name }> extends never ? false : true;

/**
 * Conditional type based on plugin presence.
 */
type IfPlugin<
  Plugins extends PluginExtension[],
  Name extends string,
  Then,
  Else = {}
> = HasPlugin<Plugins, Name> extends true ? Then : Else;
```

## Testing Strategy

### Unit Tests

```typescript
// Type-level tests (compile-time)
describe('Plugin Type Extensions', () => {
  it('should error when using .optimistic() without plugin', () => {
    const { mutation } = lens<{}>({ plugins: [] });
    // @ts-expect-error - .optimistic() not available
    mutation().input(z.object({})).returns(User).optimistic('create');
  });

  it('should allow .optimistic() with plugin', () => {
    const { mutation } = lens<{}>({ plugins: [optimisticPlugin()] });
    // Should compile
    mutation().input(z.object({})).returns(User).optimistic('create');
  });
});
```

### Integration Tests

```typescript
describe('Plugin Runtime Behavior', () => {
  it('should apply optimistic update when plugin configured', async () => {
    const { mutation } = lens({ plugins: [optimisticPlugin()] });
    const createUser = mutation()
      .input(z.object({ name: z.string() }))
      .returns(User)
      .optimistic('create')
      .resolve(({ input }) => ({ id: '1', name: input.name }));

    const server = createServer({
      router: router({ user: { create: createUser } }),
      plugins: [optimisticPlugin()],
    });

    // Verify metadata includes optimistic config
    const meta = server.getMetadata();
    expect(meta.operations['user.create'].optimistic).toBeDefined();
  });
});
```

## Implementation Order

1. **[x] Current State**: optimisticPlugin() works, but .optimistic() always available
2. **[ ] Add PluginExtension type** infrastructure
3. **[ ] Create lens({ plugins }) API** with type composition
4. **[ ] Update MutationBuilder** to support extension points
5. **[ ] Add OptimisticPluginExtension** type declaration
6. **[ ] Wire up runtime** plugin registration
7. **[ ] Add tests** for type safety and runtime
8. **[ ] Update docs** and examples
9. **[ ] Deprecate** raw lens() without plugins

## References

- tRPC Plugin Architecture: https://trpc.io/docs/server/plugins
- TypeScript Conditional Types: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
- Builder Pattern with Type Safety: https://effectivetypescript.com/2020/06/16/typed-builder-pattern/
