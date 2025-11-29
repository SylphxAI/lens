# @sylphx/lens-client

## 1.2.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))

### 🐛 Bug Fixes

- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))
- **build:** add explicit return types for isolated declarations ([3af67c3](https://github.com/SylphxAI/Lens/commit/3af67c3ad875d87db9c97dc4c50989acdc31cacc))
- **build:** add workspace bunup config with type inference ([94b0e02](https://github.com/SylphxAI/Lens/commit/94b0e02fe085337f6debcbbca2bddff39819f4a9))
- **build:** add bunup config to enable type inference ([e89661f](https://github.com/SylphxAI/Lens/commit/e89661f80cabae59d3b3463ee2ae20d683293443))
- use bunup for all packages, remove tsc build:types ([ba31790](https://github.com/SylphxAI/Lens/commit/ba31790239233c1573e3bb2fe1626c1fadc8fae9))
- **core:** add explicit type annotations for bunup CI ([a2cc776](https://github.com/SylphxAI/Lens/commit/a2cc77681155cf807659daefedf54ab0f3116910))
- externalize framework dependencies using bunup ([7e49f16](https://github.com/SylphxAI/Lens/commit/7e49f16535088d05ddfdfefa3b85d234af74c76e))
- **release:** resolve workspace:* dependencies before publishing ([7272d22](https://github.com/SylphxAI/Lens/commit/7272d229bc2e06baecd2a73fcefa5a46585d2e59))

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **client:** eager handshake with deferred execution ([4ee14a2](https://github.com/SylphxAI/Lens/commit/4ee14a2a997ae7078abfcf4bb08c6f43fdb57fc1))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **client:** add comprehensive WebSocket transport tests ([a92ab51](https://github.com/SylphxAI/Lens/commit/a92ab515c3939845c5298985508d07cecb0e121d))
- **client:** add comprehensive transport layer test suite ([44d3563](https://github.com/SylphxAI/Lens/commit/44d3563b8af357a6858f45fcf13ba15ae72081e1))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))
- format package.json files ([625a947](https://github.com/SylphxAI/Lens/commit/625a947d98b2076c327606f718b0119c7cde4e3f))
- format package.json files ([a0a0ed8](https://github.com/SylphxAI/Lens/commit/a0a0ed80252860b43d1220fbbe81bf0f506762f1))
- fix lint errors - remove unused imports and add hook deps suppressions ([ba12a42](https://github.com/SylphxAI/Lens/commit/ba12a423462c773eed8c2d69c3648e80457b80b5))

## 1.1.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))

### 🐛 Bug Fixes

- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **client:** eager handshake with deferred execution ([4ee14a2](https://github.com/SylphxAI/Lens/commit/4ee14a2a997ae7078abfcf4bb08c6f43fdb57fc1))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **client:** add comprehensive WebSocket transport tests ([a92ab51](https://github.com/SylphxAI/Lens/commit/a92ab515c3939845c5298985508d07cecb0e121d))
- **client:** add comprehensive transport layer test suite ([44d3563](https://github.com/SylphxAI/Lens/commit/44d3563b8af357a6858f45fcf13ba15ae72081e1))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))

### 🐛 Bug Fixes

- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **client:** eager handshake with deferred execution ([4ee14a2](https://github.com/SylphxAI/Lens/commit/4ee14a2a997ae7078abfcf4bb08c6f43fdb57fc1))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **client:** add comprehensive WebSocket transport tests ([a92ab51](https://github.com/SylphxAI/Lens/commit/a92ab515c3939845c5298985508d07cecb0e121d))
- **client:** add comprehensive transport layer test suite ([44d3563](https://github.com/SylphxAI/Lens/commit/44d3563b8af357a6858f45fcf13ba15ae72081e1))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.0.9

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.2

## 1.0.8

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.1

## 1.0.7

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.0

## 1.0.6

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.2.0

## 1.0.5

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.1.0

## 1.0.4

### Patch Changes

- 53a6877: Republish all packages with verified build configuration

  - All packages now use workspace bunup configuration
  - Explicit return types for isolated declarations
  - Framework packages properly externalize peer dependencies
  - Solid package uses tsc for type generation

- Updated dependencies [53a6877]
  - @sylphx/lens-core@1.0.4

## 1.0.3

### Patch Changes

- 01920b1: Fix framework bundling and build configuration

  - Fix React bundling issue: properly externalize React instead of bundling (reduces size from 109KB to 4KB)
  - Add workspace bunup configuration with explicit return types for isolated declarations
  - Fix Solid package build: use tsc for type generation since bun build doesn't support --dts
  - Add explicit return types to satisfy TypeScript isolated declarations requirement
  - All packages now build without warnings

- Updated dependencies [01920b1]
  - @sylphx/lens-core@1.0.3

## 1.0.2

### Patch Changes

- Retry release as 1.0.2 (npm 24h restriction - 1.0.0 and 1.0.1 were previously published then unpublished)
- Updated dependencies
  - @sylphx/lens-core@1.0.2

## 1.0.1

### Patch Changes

- Fix server subscription context - add `onCleanup` and `emit` to `ctx` object instead of top-level resolver args. Also retry 1.0.0 release as 1.0.1 due to npm 24-hour unpublish restriction.
- Updated dependencies
  - @sylphx/lens-core@1.0.1

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
  - @sylphx/lens-core@1.0.0

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

## 1.1.1

### Patch Changes

- ## Lazy Connection

  `createClient()` is now synchronous. Connection happens lazily on first operation.

  ```typescript
  // Before (async)
  const client = await createClient({ transport });

  // After (sync!)
  const client = createClient({ transport });
  const user = await client.user.get({ id: "123" }); // connects here
  ```

  This makes framework integration much simpler - no loading states needed in providers.

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

## 1.0.1

### Patch Changes

- 48efc47: Re-release v1.0.1 (npm 1.0.0 version number reserved)
- Updated dependencies [48efc47]
  - @sylphx/lens-core@1.0.1

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
