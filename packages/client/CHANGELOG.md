# @sylphx/lens-client

## 1.0.0

### Major Changes

- 844f436: # Lens v1.0 - Type-safe, Real-time API Framework

  First stable release of Lens - bringing GraphQL concepts to TypeScript with zero codegen.

  ## @sylphx/lens-core

  - Schema builder with Zod integration
  - Type-safe entity and relation definitions (`entity()`, `relation()`, `hasMany()`, `belongsTo()`)
  - Operations API (`query()`, `mutation()`) with fluent builder pattern
  - Auto-derived optimistic updates from naming conventions
  - Full TypeScript type inference
  - Complete type system:
    - Primitives: `t.id()`, `t.string()`, `t.int()`, `t.float()`, `t.boolean()`
    - Date/Time: `t.datetime()`, `t.date()`
    - Precision: `t.decimal()`, `t.bigint()`
    - Binary: `t.bytes()`
    - Flexible: `t.json()`, `t.enum()`, `t.object<T>()`, `t.array()`
    - Custom: `t.custom()` with `defineType()`
  - Field modifiers: `.nullable()`, `.optional()`, `.default()`

  ## @sylphx/lens-client

  - Type-safe client with tRPC-style links architecture
  - Composable middleware: `httpLink`, `websocketLink`, `sseLink`, `loggerLink`, `retryLink`, `batchLink`
  - Reactive store with Preact Signals integration
  - Automatic entity caching and deduplication
  - QueryResult pattern: thenable, subscribable, chainable

  ## @sylphx/lens-server

  - Resolver-based execution engine
  - DataLoader pattern for N+1 elimination
  - WebSocket server with subscription support
  - SSE handler for streaming updates
  - AsyncLocalStorage context system

  ## @sylphx/lens-react

  - `LensProvider` for React context injection
  - `useQuery`, `useMutation`, `useLazyQuery` hooks
  - Operations-based API accepting QueryResult directly
  - Full TypeScript support with inferred types

  ## @sylphx/lens-solid

  - `LensProvider` for SolidJS context injection
  - `createQuery`, `createMutation`, `createLazyQuery` primitives
  - Reactive signals integration
  - Automatic cleanup on unmount

  ## @sylphx/lens-vue

  - `provideLensClient` / `useLensClient` for Vue provide/inject
  - `useQuery`, `useMutation`, `useLazyQuery` composables
  - Vue 3 Composition API integration
  - Reactive refs for state management

  ## @sylphx/lens-svelte

  - `provideLensClient` / `useLensClient` for Svelte context
  - `query`, `mutation`, `lazyQuery` store factories
  - Svelte store integration
  - Automatic subscription cleanup

### Patch Changes

- Updated dependencies [844f436]
  - @sylphx/lens-core@1.0.0
