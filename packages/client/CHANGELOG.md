# @sylphx/lens-client

## 2.0.4 (2025-12-05)

fix: use callbackWrappers in createAccessor subscribe for proper cleanup

createAccessor's subscribe() was creating new wrapped functions but
cleanup was trying to delete the original callback (not in the Set).
This caused callbacks to accumulate, leading to multiple setData
calls on each data update.

Now uses the same callbackWrappers WeakMap pattern as executeQuery
for proper callback tracking and cleanup.

### 🐛 Bug Fixes

- **client:** use callbackWrappers in createAccessor for proper cleanup ([4bcde1d](https://github.com/SylphxAI/Lens/commit/4bcde1d37c267f8162e697601e371306a0b3b4c1))

## 2.0.3 (2025-12-05)

fix: cache accessor results for stable React references

createAccessor() was returning new objects on every call, causing
React hooks to infinite loop during streaming. Now accessor results
are cached by key (path + input), providing stable references for
React's referential equality checks.

### 🐛 Bug Fixes

- **client:** cache accessor results for stable React references ([563afae](https://github.com/SylphxAI/Lens/commit/563afae97a63b411a177567ca85513102989f831))

## 2.0.2 (2025-12-04)

fix: cache QueryResult objects for stable React references

Previously, `executeQuery()` returned a new QueryResult object every call,
causing React hooks to infinite loop:

1. useMemo calls client.getSession({ id })
2. executeQuery returns NEW QueryResult object
3. query reference changes
4. useEffect deps [query, ...] changes
5. useEffect re-runs → re-subscribes
6. subscribe fires (cached data) → setData
7. re-render → back to step 1

Now QueryResult objects are cached by key, providing stable references
for React's referential equality checks.

### 🐛 Bug Fixes

- **client:** cache QueryResult objects for stable React references ([2d0db3a](https://github.com/SylphxAI/Lens/commit/2d0db3a08634bac1eb7740eeb64a69459255ea11))

## 2.0.1 (2025-12-04)

Fix: bypass deprecated 2.0.0 versions on npm registry.

### ✨ Features

- **client:** export transport capability types and guards ([811d01c](https://github.com/SylphxAI/Lens/commit/811d01cf57ddd44dffcdef5b2a66b1a7a7358b27))
- **client:** add type-safe routeByType with generic inference ([9c6a901](https://github.com/SylphxAI/Lens/commit/9c6a9012e4f9c9e47495e84edce0f0ad8ee8d75d))
- **client:** add type-safe transport capability interfaces ([4c14307](https://github.com/SylphxAI/Lens/commit/4c14307bc3746da20dbcbe15df0b8ef37b4cb0b2))
- **client:** add SSE transport for serverless-friendly subscriptions ([45400d9](https://github.com/SylphxAI/Lens/commit/45400d9527f23c3376d8676594b1494b84394edf))
- **core:** add compression support for large reconnection payloads ([2459177](https://github.com/SylphxAI/Lens/commit/2459177c28d98a82670040b7a89fb751c4e7e943))
- **client:** add version-based reconnection flow to WebSocket transport ([0aa79ca](https://github.com/SylphxAI/Lens/commit/0aa79cac1125e06273d2f92a2ba22f8b74279d5f))

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))
- resolve pre-existing build and test issues ([9785c30](https://github.com/SylphxAI/Lens/commit/9785c30f60f9673aac9d92d5494ee2a2b9815a58))
- **client:** fix subscribe callback memory leak ([3c6abe0](https://github.com/SylphxAI/Lens/commit/3c6abe0e6fc50e04b9540c3313a9ebe31343d081))
- **client:** update tests to use optimisticPlugin for optimistic updates ([4eae879](https://github.com/SylphxAI/Lens/commit/4eae8793dc3c240b7c2d3230b198b69a265b9782))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- extract types from god files ([f5c67c1](https://github.com/SylphxAI/Lens/commit/f5c67c1e54690d64e193999039299b8f137254d0))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))
- **client:** unify LensServerInterface definitions ([8f398fc](https://github.com/SylphxAI/Lens/commit/8f398fcc181971c8884d658930b298783c25fbbf))
- **client:** unify ConnectionState type across transports ([81a579d](https://github.com/SylphxAI/Lens/commit/81a579ddd6ea38059ebe9f345a9de24324873dba))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
- **client:** move SubscriptionRegistry from core to client ([20a9468](https://github.com/SylphxAI/Lens/commit/20a9468f307fb14bb801e1c9ea92d9b43c22801f))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.
- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 2.0.0 (2025-12-04)

v2.0.0 - Unified release with breaking changes.

Breaking changes:
- `inProcess({ server })` renamed to `inProcess({ app })`
- Signals extracted to `@sylphx/lens-signals`
- Storage adapters moved to separate packages

### ✨ Features

- **client:** export transport capability types and guards ([811d01c](https://github.com/SylphxAI/Lens/commit/811d01cf57ddd44dffcdef5b2a66b1a7a7358b27))
- **client:** add type-safe routeByType with generic inference ([9c6a901](https://github.com/SylphxAI/Lens/commit/9c6a9012e4f9c9e47495e84edce0f0ad8ee8d75d))
- **client:** add type-safe transport capability interfaces ([4c14307](https://github.com/SylphxAI/Lens/commit/4c14307bc3746da20dbcbe15df0b8ef37b4cb0b2))
- **client:** add SSE transport for serverless-friendly subscriptions ([45400d9](https://github.com/SylphxAI/Lens/commit/45400d9527f23c3376d8676594b1494b84394edf))
- **core:** add compression support for large reconnection payloads ([2459177](https://github.com/SylphxAI/Lens/commit/2459177c28d98a82670040b7a89fb751c4e7e943))
- **client:** add version-based reconnection flow to WebSocket transport ([0aa79ca](https://github.com/SylphxAI/Lens/commit/0aa79cac1125e06273d2f92a2ba22f8b74279d5f))

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))
- resolve pre-existing build and test issues ([9785c30](https://github.com/SylphxAI/Lens/commit/9785c30f60f9673aac9d92d5494ee2a2b9815a58))
- **client:** fix subscribe callback memory leak ([3c6abe0](https://github.com/SylphxAI/Lens/commit/3c6abe0e6fc50e04b9540c3313a9ebe31343d081))
- **client:** update tests to use optimisticPlugin for optimistic updates ([4eae879](https://github.com/SylphxAI/Lens/commit/4eae8793dc3c240b7c2d3230b198b69a265b9782))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- extract types from god files ([f5c67c1](https://github.com/SylphxAI/Lens/commit/f5c67c1e54690d64e193999039299b8f137254d0))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))
- **client:** unify LensServerInterface definitions ([8f398fc](https://github.com/SylphxAI/Lens/commit/8f398fcc181971c8884d658930b298783c25fbbf))
- **client:** unify ConnectionState type across transports ([81a579d](https://github.com/SylphxAI/Lens/commit/81a579ddd6ea38059ebe9f345a9de24324873dba))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
- **client:** move SubscriptionRegistry from core to client ([20a9468](https://github.com/SylphxAI/Lens/commit/20a9468f307fb14bb801e1c9ea92d9b43c22801f))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.
- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 1.5.0 (2025-12-04)

Unified v1.5.0 release.

### ✨ Features

- **client:** export transport capability types and guards ([811d01c](https://github.com/SylphxAI/Lens/commit/811d01cf57ddd44dffcdef5b2a66b1a7a7358b27))
- **client:** add type-safe routeByType with generic inference ([9c6a901](https://github.com/SylphxAI/Lens/commit/9c6a9012e4f9c9e47495e84edce0f0ad8ee8d75d))
- **client:** add type-safe transport capability interfaces ([4c14307](https://github.com/SylphxAI/Lens/commit/4c14307bc3746da20dbcbe15df0b8ef37b4cb0b2))
- **client:** add SSE transport for serverless-friendly subscriptions ([45400d9](https://github.com/SylphxAI/Lens/commit/45400d9527f23c3376d8676594b1494b84394edf))
- **core:** add compression support for large reconnection payloads ([2459177](https://github.com/SylphxAI/Lens/commit/2459177c28d98a82670040b7a89fb751c4e7e943))
- **client:** add version-based reconnection flow to WebSocket transport ([0aa79ca](https://github.com/SylphxAI/Lens/commit/0aa79cac1125e06273d2f92a2ba22f8b74279d5f))

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))
- resolve pre-existing build and test issues ([9785c30](https://github.com/SylphxAI/Lens/commit/9785c30f60f9673aac9d92d5494ee2a2b9815a58))
- **client:** fix subscribe callback memory leak ([3c6abe0](https://github.com/SylphxAI/Lens/commit/3c6abe0e6fc50e04b9540c3313a9ebe31343d081))
- **client:** update tests to use optimisticPlugin for optimistic updates ([4eae879](https://github.com/SylphxAI/Lens/commit/4eae8793dc3c240b7c2d3230b198b69a265b9782))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- extract types from god files ([f5c67c1](https://github.com/SylphxAI/Lens/commit/f5c67c1e54690d64e193999039299b8f137254d0))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))
- **client:** unify LensServerInterface definitions ([8f398fc](https://github.com/SylphxAI/Lens/commit/8f398fcc181971c8884d658930b298783c25fbbf))
- **client:** unify ConnectionState type across transports ([81a579d](https://github.com/SylphxAI/Lens/commit/81a579ddd6ea38059ebe9f345a9de24324873dba))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
- **client:** move SubscriptionRegistry from core to client ([20a9468](https://github.com/SylphxAI/Lens/commit/20a9468f307fb14bb801e1c9ea92d9b43c22801f))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.
- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 1.15.3 (2025-12-02)

No notable changes.

## 1.15.2 (2025-12-02)

Release patch version


## 1.15.1 (2025-12-02)

Release patch version


## 1.15.0 (2025-12-02)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.14.0 (2025-12-02)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.13.0 (2025-12-02)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.12.0 (2025-12-02)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.11.0 (2025-12-02)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.10.0 (2025-12-01)

expose .select() method on accessor API

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.9.0 (2025-12-01)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.8.0 (2025-12-01)

### ✨ Features

- **client:** expose .select() method on accessor API ([97c3640](https://github.com/SylphxAI/Lens/commit/97c364084230bb594400594e6e3db4191fdbe08a))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.7.5 (2025-12-01)

### 🐛 Bug Fixes

- **release:** build all packages before npm publish ([1bd467e](https://github.com/SylphxAI/Lens/commit/1bd467e4d5fdad65ff384386af787dc789ed7a4f))
- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- **client:** improve type safety with generics for optimistic updates ([54d51d4](https://github.com/SylphxAI/Lens/commit/54d51d42c4c71a58942a29371672589a157781fb))
- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

### 🔧 Chores

- fix doctor warnings - consistent zod version and credits ([b34bdb9](https://github.com/SylphxAI/Lens/commit/b34bdb98b0a77172065ae8c3f98529d11d0ea8bf))
- use @sylphx/reify from npm instead of file links ([c7a4fda](https://github.com/SylphxAI/Lens/commit/c7a4fda267139f701e3acf4c8624e955d0ca8dce))

## 1.7.4 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- **client:** improve type safety with generics for optimistic updates ([54d51d4](https://github.com/SylphxAI/Lens/commit/54d51d42c4c71a58942a29371672589a157781fb))
- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

### 🔧 Chores

- fix doctor warnings - consistent zod version and credits ([b34bdb9](https://github.com/SylphxAI/Lens/commit/b34bdb98b0a77172065ae8c3f98529d11d0ea8bf))
- use @sylphx/reify from npm instead of file links ([c7a4fda](https://github.com/SylphxAI/Lens/commit/c7a4fda267139f701e3acf4c8624e955d0ca8dce))

## 1.7.3 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- **client:** improve type safety with generics for optimistic updates ([54d51d4](https://github.com/SylphxAI/Lens/commit/54d51d42c4c71a58942a29371672589a157781fb))
- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

### 🔧 Chores

- fix doctor warnings - consistent zod version and credits ([b34bdb9](https://github.com/SylphxAI/Lens/commit/b34bdb98b0a77172065ae8c3f98529d11d0ea8bf))
- use @sylphx/reify from npm instead of file links ([c7a4fda](https://github.com/SylphxAI/Lens/commit/c7a4fda267139f701e3acf4c8624e955d0ca8dce))

## 1.7.2 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- **client:** improve type safety with generics for optimistic updates ([54d51d4](https://github.com/SylphxAI/Lens/commit/54d51d42c4c71a58942a29371672589a157781fb))
- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

### 🔧 Chores

- fix doctor warnings - consistent zod version and credits ([b34bdb9](https://github.com/SylphxAI/Lens/commit/b34bdb98b0a77172065ae8c3f98529d11d0ea8bf))
- use @sylphx/reify from npm instead of file links ([c7a4fda](https://github.com/SylphxAI/Lens/commit/c7a4fda267139f701e3acf4c8624e955d0ca8dce))

## 1.7.1 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 1.11.0

## 1.7.0 (2025-11-30)

### ✨ Features

- **core:** add v2 optimistic DSL operators ([da35ec6](https://github.com/SylphxAI/Lens/commit/da35ec642995c57f8f812498f3e8a75672872b1c))
- **client:** integrate multi-entity optimistic with store ([a46aaa3](https://github.com/SylphxAI/Lens/commit/a46aaa3339627450e0e33dd4bfbabb71c4662619))
- **core:** add multi-entity optimistic DSL with evaluator ([26c1fe9](https://github.com/SylphxAI/Lens/commit/26c1fe947aee324bce0363016f2610dea0d436cd))

## 1.6.0 (2025-11-30)

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

- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))
- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))
- format package.json files ([625a947](https://github.com/SylphxAI/Lens/commit/625a947d98b2076c327606f718b0119c7cde4e3f))
- format package.json files ([a0a0ed8](https://github.com/SylphxAI/Lens/commit/a0a0ed80252860b43d1220fbbe81bf0f506762f1))
- fix lint errors - remove unused imports and add hook deps suppressions ([ba12a42](https://github.com/SylphxAI/Lens/commit/ba12a423462c773eed8c2d69c3648e80457b80b5))

## 1.5.0 (2025-11-29)

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

## 1.4.0 (2025-11-29)

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

## 1.3.0 (2025-11-29)

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

## 1.3.0 (2025-11-29)

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
  - `inProcess({ app })` - Direct server calls for testing/SSR
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
