# @sylphx/lens-svelte

## 1.2.6 (2025-11-29)

### 🐛 Bug Fixes

- update happy-dom to v20.0.10 in all packages ([2ca2842](https://github.com/SylphxAI/Lens/commit/2ca28425835033cdfb46b612fbff98f2f82b51bc))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### 🐛 Bug Fixes

- update happy-dom to v20.0.10 in all packages ([2ca2842](https://github.com/SylphxAI/Lens/commit/2ca28425835033cdfb46b612fbff98f2f82b51bc))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### 🐛 Bug Fixes

- update happy-dom to v20.0.10 in all packages ([2ca2842](https://github.com/SylphxAI/Lens/commit/2ca28425835033cdfb46b612fbff98f2f82b51bc))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.5

### Patch Changes

- @sylphx/lens-client@1.0.9

## 1.2.4

### Patch Changes

- @sylphx/lens-client@1.0.8

## 1.2.3

### Patch Changes

- @sylphx/lens-client@1.0.7

## 1.2.2

### Patch Changes

- @sylphx/lens-client@1.0.6

## 1.2.1

### Patch Changes

- @sylphx/lens-client@1.0.5

## 1.2.0

### Minor Changes

- Add QueryInput type for conditional queries and accessor functions

  - All framework packages now accept `QueryInput<T>` which can be:

    - `QueryResult<T>` - direct query
    - `null | undefined` - skip query (returns null data, loading=false)
    - `() => QueryResult<T> | null | undefined` - accessor function for reactive inputs

  - Enables conditional queries similar to SWR, React Query, and Apollo:

    ```tsx
    // React
    const { data } = useQuery(
      sessionId ? client.session.get({ id: sessionId }) : null
    );

    // Vue
    const { data } = useQuery(() =>
      sessionId.value ? client.session.get({ id: sessionId.value }) : null
    );

    // Svelte
    const store = query(() =>
      sessionId ? client.session.get({ id: sessionId }) : null
    );

    // Solid
    const result = createQuery(() =>
      sessionId() ? client.session.get({ id: sessionId() }) : null
    );
    ```

  - Export `QueryInput` type from all framework packages

## 1.0.5

### Patch Changes

- 53a6877: Republish all packages with verified build configuration

  - All packages now use workspace bunup configuration
  - Explicit return types for isolated declarations
  - Framework packages properly externalize peer dependencies
  - Solid package uses tsc for type generation

- Updated dependencies [53a6877]
  - @sylphx/lens-client@1.0.4

## 1.0.4

### Patch Changes

- 01920b1: Fix framework bundling and build configuration

  - Fix React bundling issue: properly externalize React instead of bundling (reduces size from 109KB to 4KB)
  - Add workspace bunup configuration with explicit return types for isolated declarations
  - Fix Solid package build: use tsc for type generation since bun build doesn't support --dts
  - Add explicit return types to satisfy TypeScript isolated declarations requirement
  - All packages now build without warnings

- Updated dependencies [01920b1]
  - @sylphx/lens-client@1.0.3

## 1.0.3

### Patch Changes

- Fix framework dependencies being bundled instead of externalized. React bundle reduced from 109KB to 4KB. This fixes "Invalid hook call" errors when using with React 19.2.0 or different React versions.

## 1.0.2

### Patch Changes

- Retry release as 1.0.2 (npm 24h restriction - 1.0.0 and 1.0.1 were previously published then unpublished)
- Updated dependencies
  - @sylphx/lens-client@1.0.2

## 1.0.1

### Patch Changes

- Fix server subscription context - add `onCleanup` and `emit` to `ctx` object instead of top-level resolver args. Also retry 1.0.0 release as 1.0.1 due to npm 24-hour unpublish restriction.
- Updated dependencies
  - @sylphx/lens-client@1.0.1

## 1.0.0

### Major Changes

- c6293e0: # Initial 1.0.0 Release 🎉

  First stable release of Lens - Type-safe, real-time API framework.

  ## Core Features

  **Transport + Plugin Architecture**

  - Clean separation: Transport handles communication, Plugins add cross-cutting concerns
  - Built-in transports: HTTP, WebSocket, in-process
  - Routing: `route()` with glob patterns, `routeByType()`, `routeByPath()`
  - Built-in plugins: logger, auth, retry, cache, timeout

  **Type Safety**

  - Full end-to-end type safety
  - Zero codegen required
  - GraphQL-like developer experience with TypeScript

  **Reactive & Real-time**

  - WebSocket subscriptions with `ctx.emit()`
  - Optimistic updates with simple DSL
  - Field selection (like GraphQL)
  - Framework adapters: React, Vue, Svelte, SolidJS

  ## Architecture Improvements (vs pre-release)

  - Removed signals from QueryResult interface (framework-agnostic)
  - Removed unnecessary dependencies (React bundle: -49KB)
  - Clean dependency graph (no circular dependencies)
  - Lazy connection (createClient is synchronous)

  ## Breaking Changes from Pre-release

  - `client.$store` removed (ReactiveStore still exported for advanced use)
  - QueryResult no longer has `signal`, `loading`, `error` properties
  - Framework adapters use `subscribe()` for their own reactivity systems
  - Signals are now optional peer dependency in client package

### Patch Changes

- Updated dependencies [c6293e0]
  - @sylphx/lens-client@1.0.0

## 1.1.2

### Patch Changes

- Architecture cleanup: remove unnecessary dependencies and optimize bundle sizes

  **Breaking Changes:**

  - Removed `client.$store` property (ReactiveStore no longer exposed via client instance)

  **Dependency Cleanup:**

  - React: removed @preact/signals-react dependency (-49KB bundle size!)
  - React/Vue/Svelte: removed unused @sylphx/lens-core dependency
  - Client: moved @preact/signals-core to optional peerDependencies

  **Bundle Size Improvements:**

  - React: 158KB → 109KB (-31% reduction)

  **Internal Changes:**

  - Removed ReactiveStore from ClientImpl (still exported for advanced use)
  - Removed QueryResult signal/loading/error properties (use subscribe() instead)
  - Framework adapters now only depend on lens-client (consistent with SolidJS)

- Updated dependencies
  - @sylphx/lens-client@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @sylphx/lens-client@1.1.1

## 1.1.0

### Minor Changes

- ## New Transport + Plugin Architecture

  ### Breaking Changes

  - `createClient()` now requires `transport` instead of `links`
  - `createClient()` is now async: `await createClient(config)`
  - Removed old link system (httpLink, websocketLink, etc.)

  ### New Features

  #### Transport System

  - `http({ url })` - HTTP transport with polling for subscriptions
  - `ws({ url })` - WebSocket transport with native streaming
  - `inProcess({ server })` - Direct server calls for testing/SSR
  - `route({ 'pattern.*': transport })` - Pattern-based routing
  - `routeByType({ default, subscription })` - Route by operation type

  #### Plugin System

  - `logger()` - Request/response logging
  - `auth({ getToken })` - Authentication headers
  - `retry({ attempts })` - Retry with exponential backoff
  - `cache({ ttl })` - Response caching
  - `timeout({ ms })` - Request timeout

  #### Multi-Server Support

  - Connect to multiple backends with automatic metadata merging
  - Full type safety across all servers
  - Pattern-based routing: `route({ 'auth.*': authServer, '*': mainServer })`

  ### Example

  ```typescript
  const client = await createClient<Api>({
    transport: route({
      "auth.*": http({ url: "/auth" }),
      "*": routeByType({
        default: http({ url: "/api" }),
        subscription: ws({ url: "ws://localhost:3000" }),
      }),
    }),
    plugins: [logger(), auth({ getToken: () => token })],
  });
  ```

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.1.0
  - @sylphx/lens-client@1.1.0

## 1.0.1

### Patch Changes

- 48efc47: Re-release v1.0.1 (npm 1.0.0 version number reserved)
- Updated dependencies [48efc47]
  - @sylphx/lens-core@1.0.1
  - @sylphx/lens-client@1.0.1

## 1.0.0

### Major Changes

- a7adcb9: # Lens v1.0 - Type-safe, Real-time API Framework

  First stable release of Lens - bringing GraphQL concepts to TypeScript with zero codegen.

  ## @sylphx/lens-core

  - Schema builder with Zod integration
  - Type-safe entity and relation definitions
  - Operations API (`query()`, `mutation()`) with fluent builder pattern
  - **Router API** (`router()`) for tRPC-style namespaced operations
  - Auto-derived optimistic updates from naming conventions
  - Full TypeScript type inference
  - **tRPC-style context**: `ctx` passed directly to resolvers

  ## @sylphx/lens-client

  - Type-safe client with tRPC-style links architecture
  - **Nested proxy** for router-based namespaced access (`client.user.get()`)
  - Composable middleware: `httpLink`, `websocketLink`, `sseLink`, `loggerLink`, `retryLink`, `batchLink`

  ## @sylphx/lens-server

  - Resolver-based execution engine
  - **Router support** for namespaced operations
  - DataLoader pattern for N+1 elimination
  - WebSocket server with subscription support
  - Context passed directly to resolvers (tRPC style)

  ## Framework Adapters

  - @sylphx/lens-react: React hooks
  - @sylphx/lens-solid: SolidJS primitives
  - @sylphx/lens-vue: Vue composables
  - @sylphx/lens-svelte: Svelte stores

### Patch Changes

- Updated dependencies [a7adcb9]
  - @sylphx/lens-core@1.0.0
  - @sylphx/lens-client@1.0.0

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
  - @sylphx/lens-client@1.0.0
