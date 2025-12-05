# @sylphx/lens-next

## 2.1.3 (2025-12-05)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.4

## 2.1.2 (2025-12-05)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.3

## 2.1.1 (2025-12-04)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.2

## 2.1.0 (2025-12-04)

feat: selector-based hooks API - client auto-injected from context

BREAKING: Hooks now use selector callbacks to auto-inject client from LensProvider context.

Before:
```tsx
const client = useLensClient();
const { data } = useQuery(client.user.get, { id: userId });
```

After:
```tsx
const { data } = useQuery((client) => client.user.get, { id: userId });
```

- `useQuery`, `useMutation`, `useLazyQuery` now accept selector callbacks
- Client is automatically injected from `LensProvider` context
- No need to call `useLensClient()` separately
- Two patterns supported:
  - Route + Params: `useQuery((c) => c.user.get, { id })`
  - Accessor + Deps: `useQuery((c) => c.user.get({ id }), [id])`

fix: prevent "Maximum update depth exceeded" during streaming

- Fixed duplicate setState calls from subscribe + then firing simultaneously
- Subscribe is now the primary data source for streaming queries
- Then only handles completion/errors, avoiding duplicate data updates

### ✨ Features

- **react:** selector-based hooks API with auto-injected client ([fb24032](https://github.com/SylphxAI/Lens/commit/fb24032e5b29ffa42296aa304b1e068795b66a90))

## 2.0.2 (2025-12-04)

Fix: prevent infinite re-subscription loops in useQuery hook

### 🐛 Bug Fixes

- **react:** prevent infinite re-subscription loops in useQuery hook ([7184645](https://github.com/SylphxAI/Lens/commit/718464582e878d21750ac41d9053b3d54da098a8))

## 2.0.1 (2025-12-04)

Fix: bypass deprecated 2.0.0 versions on npm registry.

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

## 2.0.0 (2025-12-04)

v2.0.0 - Unified release with breaking changes.

Breaking changes:
- `inProcess({ server })` renamed to `inProcess({ app })`
- Signals extracted to `@sylphx/lens-signals`
- Storage adapters moved to separate packages

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

## 1.5.0 (2025-12-04)

Unified v1.5.0 release.

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

## 1.2.22 (2025-12-02)

No notable changes.

## 1.2.21 (2025-12-02)

Release patch version


## 1.2.20 (2025-12-02)

Release patch version


## 1.2.19 (2025-12-02)

### 🐛 Bug Fixes

- **build:** add skipLibCheck for CI type resolution ([3b392fa](https://github.com/SylphxAI/Lens/commit/3b392fa23fdabc63ba880af4646f3b5436f7bb56))
- **build:** use bunx tsc for CI compatibility ([659c813](https://github.com/SylphxAI/Lens/commit/659c81314ab328103f41b74736d89c1e7ab1992b))
- **next:** revert to bun build for CI compatibility ([1327de7](https://github.com/SylphxAI/Lens/commit/1327de7778709b2b2a526b424646ebfe394b2c22))
- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ♻️ Refactoring

- **build:** migrate packages to bunup, fix build issues ([6a3412e](https://github.com/SylphxAI/Lens/commit/6a3412eff5e1d5c94136935787a310ed905c4afd))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.18 (2025-12-02)

### 🐛 Bug Fixes

- **build:** add skipLibCheck for CI type resolution ([3b392fa](https://github.com/SylphxAI/Lens/commit/3b392fa23fdabc63ba880af4646f3b5436f7bb56))
- **build:** use bunx tsc for CI compatibility ([659c813](https://github.com/SylphxAI/Lens/commit/659c81314ab328103f41b74736d89c1e7ab1992b))
- **next:** revert to bun build for CI compatibility ([1327de7](https://github.com/SylphxAI/Lens/commit/1327de7778709b2b2a526b424646ebfe394b2c22))
- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ♻️ Refactoring

- **build:** migrate packages to bunup, fix build issues ([6a3412e](https://github.com/SylphxAI/Lens/commit/6a3412eff5e1d5c94136935787a310ed905c4afd))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.17 (2025-12-02)

### 🐛 Bug Fixes

- **build:** use bunx tsc for CI compatibility ([659c813](https://github.com/SylphxAI/Lens/commit/659c81314ab328103f41b74736d89c1e7ab1992b))
- **next:** revert to bun build for CI compatibility ([1327de7](https://github.com/SylphxAI/Lens/commit/1327de7778709b2b2a526b424646ebfe394b2c22))
- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ♻️ Refactoring

- **build:** migrate packages to bunup, fix build issues ([6a3412e](https://github.com/SylphxAI/Lens/commit/6a3412eff5e1d5c94136935787a310ed905c4afd))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.16 (2025-12-02)

### 🐛 Bug Fixes

- **next:** revert to bun build for CI compatibility ([1327de7](https://github.com/SylphxAI/Lens/commit/1327de7778709b2b2a526b424646ebfe394b2c22))
- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ♻️ Refactoring

- **build:** migrate packages to bunup, fix build issues ([6a3412e](https://github.com/SylphxAI/Lens/commit/6a3412eff5e1d5c94136935787a310ed905c4afd))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.15 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ♻️ Refactoring

- **build:** migrate packages to bunup, fix build issues ([6a3412e](https://github.com/SylphxAI/Lens/commit/6a3412eff5e1d5c94136935787a310ed905c4afd))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.14 (2025-12-01)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.15 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.9.0
- Updated `@sylphx/lens-server` to 2.1.0

## 1.2.14 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.8.0
- Updated `@sylphx/lens-server` to 2.0.0

## 1.2.13 (2025-12-01)

### 🐛 Bug Fixes

- **release:** build all packages before npm publish ([1bd467e](https://github.com/SylphxAI/Lens/commit/1bd467e4d5fdad65ff384386af787dc789ed7a4f))
- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.12 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.11 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.10 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.9 (2025-11-30)

No notable changes.

## 1.2.8 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.7.0

## 1.2.7 (2025-11-30)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

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

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.6 (2025-11-29)

### ♻️ Refactoring

- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.2.5

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.3.2
  - @sylphx/lens-client@1.0.9
  - @sylphx/lens-react@1.2.5

## 1.2.4

### Patch Changes

- @sylphx/lens-client@1.0.8
- @sylphx/lens-server@1.3.1
- @sylphx/lens-react@1.2.4

## 1.2.3

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.3.0
  - @sylphx/lens-client@1.0.7
  - @sylphx/lens-react@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.2.0
  - @sylphx/lens-client@1.0.6
  - @sylphx/lens-react@1.2.2

## 1.2.1

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.1.0
  - @sylphx/lens-client@1.0.5
  - @sylphx/lens-react@1.2.1

## 1.2.0

### Minor Changes

- feat: unified factory API for all meta-framework packages

  All meta-framework packages now expose a unified factory function that creates both server and client in one call:

  **Next.js:**

  ```ts
  import { createLensNext } from "@sylphx/lens-next";
  import { server } from "./server";

  export const lens = createLensNext({ server });
  export const {
    handler,
    client,
    serverClient,
    Provider,
    useQuery,
    useMutation,
  } = lens;
  ```

  **Nuxt:**

  ```ts
  import { createLensNuxt } from "@sylphx/lens-nuxt";
  import { server } from "./server";

  export const lens = createLensNuxt({ server });
  export const {
    handler,
    client,
    serverClient,
    plugin,
    useQuery,
    useMutation,
  } = lens;
  ```

  **SolidStart:**

  ```ts
  import { createLensSolidStart } from "@sylphx/lens-solidstart";
  import { server } from "./server";

  export const lens = createLensSolidStart({ server });
  export const {
    handler,
    client,
    serverClient,
    createQuery,
    createMutation,
    serverQuery,
  } = lens;
  ```

  **Fresh (Deno/Preact):**

  ```ts
  import { createLensFresh } from "@sylphx/lens-fresh";
  import { server } from "./server";

  export const lens = createLensFresh({ server });
  export const {
    handler,
    client,
    serverClient,
    serialize,
    useIslandQuery,
    useMutation,
  } = lens;
  ```

  Each factory returns:

  - `handler` - API route handler for the framework
  - `client` - Browser client with HTTP transport
  - `serverClient` - Server-side client with direct execution (no HTTP)
  - Framework-specific hooks/composables

  Legacy exports are preserved for backwards compatibility.

## 1.1.0

### Minor Changes

- 0bfe8c7: feat: add meta-framework integrations

  New packages for SSR meta-frameworks:

  - `@sylphx/lens-next` - Next.js integration (App Router + Pages Router)

    - SSR-safe hooks, fetchQuery, prefetchQuery, HydrationBoundary
    - Server handler for API routes

  - `@sylphx/lens-nuxt` - Nuxt 3 integration

    - SSR-safe composables with useAsyncData pattern
    - useLensQuery, useLensMutation, createLensPlugin

  - `@sylphx/lens-solidstart` - SolidStart integration

    - SSR-safe primitives with createResource
    - createLensQuery, createLensMutation, createServerQuery, createServerAction

  - `@sylphx/lens-fresh` - Fresh (Deno/Preact) integration
    - Server-side fetching utilities
    - Island hydration with useIslandQuery
    - Fresh handler for API routes
