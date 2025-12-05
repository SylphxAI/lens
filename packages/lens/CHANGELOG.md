# @sylphx/lens

## 2.0.4 (2025-12-05)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.4

## 2.0.3 (2025-12-05)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.3

## 2.0.2 (2025-12-04)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 2.0.2

## 2.0.1 (2025-12-04)

Fix: bypass deprecated 2.0.0 versions on npm registry.

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 2.0.0 (2025-12-04)

v2.0.0 - Unified release with breaking changes.

Breaking changes:
- `inProcess({ server })` renamed to `inProcess({ app })`
- Signals extracted to `@sylphx/lens-signals`
- Storage adapters moved to separate packages

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 1.5.0 (2025-12-04)

Unified v1.5.0 release.

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))

### 💥 Breaking Changes

- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 1.2.15 (2025-12-02)

No notable changes.

## 1.2.14 (2025-12-02)

Release patch version

### 🐛 Bug Fixes

- **lens:** add bunup config for client/server exports ([2331a97](https://github.com/SylphxAI/Lens/commit/2331a97d27bc88eb9e228b22256527bd548b63c0))

## 1.2.13 (2025-12-02)

Release patch version


## 1.2.12 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.11 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.10 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.9 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.8 (2025-12-02)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.7 (2025-12-01)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

## 1.2.8 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.9.0
- Updated `@sylphx/lens-core` to 1.16.0
- Updated `@sylphx/lens-server` to 2.1.0

## 1.2.7 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.8.0
- Updated `@sylphx/lens-core` to 2.0.0
- Updated `@sylphx/lens-server` to 2.0.0

## 1.2.6 (2025-12-01)

### 🐛 Bug Fixes

- **release:** build all packages before npm publish ([1bd467e](https://github.com/SylphxAI/Lens/commit/1bd467e4d5fdad65ff384386af787dc789ed7a4f))
- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.5 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.4 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.3 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.2 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 1.11.0

## 1.2.1 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.7.0
- Updated `@sylphx/lens-core` to 1.10.0

## 1.2.0 (2025-11-30)

Recovery release - bypass blocked version 1.1.0 on npm.

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **client:** lazy connection - createClient is now sync ([b716da2](https://github.com/SylphxAI/Lens/commit/b716da24834d0b8047e7999abf18017ff31b57ae))

### 🐛 Bug Fixes

- **build:** add workspace bunup config with type inference ([94b0e02](https://github.com/SylphxAI/Lens/commit/94b0e02fe085337f6debcbbca2bddff39819f4a9))
- **build:** add bunup config to enable type inference ([e89661f](https://github.com/SylphxAI/Lens/commit/e89661f80cabae59d3b3463ee2ae20d683293443))
- use bunup for all packages, remove tsc build:types ([ba31790](https://github.com/SylphxAI/Lens/commit/ba31790239233c1573e3bb2fe1626c1fadc8fae9))
- **core:** add explicit type annotations for bunup CI ([a2cc776](https://github.com/SylphxAI/Lens/commit/a2cc77681155cf807659daefedf54ab0f3116910))
- externalize framework dependencies using bunup ([7e49f16](https://github.com/SylphxAI/Lens/commit/7e49f16535088d05ddfdfefa3b85d234af74c76e))
- **release:** resolve workspace:* dependencies before publishing ([7272d22](https://github.com/SylphxAI/Lens/commit/7272d229bc2e06baecd2a73fcefa5a46585d2e59))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))
- bump @sylphx/lens to 1.2.0 (blocked on npm) ([4554df1](https://github.com/SylphxAI/Lens/commit/4554df138251eed6f491f96c1b29ded806135133))
- bump @sylphx/lens to 1.2.0 to bypass blocked version ([2d40f45](https://github.com/SylphxAI/Lens/commit/2d40f4575fb7e3b1b36a74786de611e78f1131a6))
- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))
- format package.json files ([625a947](https://github.com/SylphxAI/Lens/commit/625a947d98b2076c327606f718b0119c7cde4e3f))
- format package.json files ([a0a0ed8](https://github.com/SylphxAI/Lens/commit/a0a0ed80252860b43d1220fbbe81bf0f506762f1))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- bump @sylphx/lens to 1.2.0 (blocked on npm) ([4554df1](https://github.com/SylphxAI/Lens/commit/4554df138251eed6f491f96c1b29ded806135133))
- bump @sylphx/lens to 1.2.0 to bypass blocked version ([2d40f45](https://github.com/SylphxAI/Lens/commit/2d40f4575fb7e3b1b36a74786de611e78f1131a6))
- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- bump @sylphx/lens to 1.2.0 to bypass blocked version ([2d40f45](https://github.com/SylphxAI/Lens/commit/2d40f4575fb7e3b1b36a74786de611e78f1131a6))
- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.1.0 (2025-11-29)

### ✨ Features

- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### 🔧 Chores

- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.0.9

### Patch Changes

- Remove OptimisticFn, keep DSL-only optimistic updates

  - Remove legacy `OptimisticFn` type (functions cannot be serialized for client)
  - `optimistic()` now only accepts DSL (`'merge'`, `'create'`, `'delete'`, etc.)
  - Fixes type variance issues with MutationsMap/QueriesMap

- Updated dependencies
  - @sylphx/lens-core@1.3.2
  - @sylphx/lens-server@1.3.2
  - @sylphx/lens-client@1.0.9

## 1.0.8

### Patch Changes

- Refactor: remove type workarounds and improve type safety

  - Use method syntax for bivariant `_resolve` types (eliminates `any` workaround)
  - Replace `any` types in Nuxt package with proper H3 event types
  - Fix lint errors and remove unused imports

- Updated dependencies
  - @sylphx/lens-core@1.3.1
  - @sylphx/lens-client@1.0.8
  - @sylphx/lens-server@1.3.1

## 1.0.7

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.0
  - @sylphx/lens-server@1.3.0
  - @sylphx/lens-client@1.0.7

## 1.0.6

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.2.0
  - @sylphx/lens-server@1.2.0
  - @sylphx/lens-client@1.0.6

## 1.0.5

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.1.0
  - @sylphx/lens-server@1.1.0
  - @sylphx/lens-client@1.0.5

## 1.0.4

### Patch Changes

- 53a6877: Republish all packages with verified build configuration

  - All packages now use workspace bunup configuration
  - Explicit return types for isolated declarations
  - Framework packages properly externalize peer dependencies
  - Solid package uses tsc for type generation

- Updated dependencies [53a6877]
  - @sylphx/lens-core@1.0.4
  - @sylphx/lens-client@1.0.4
  - @sylphx/lens-server@1.0.4

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
  - @sylphx/lens-client@1.0.3
  - @sylphx/lens-server@1.0.3

## 1.0.2

### Patch Changes

- Retry release as 1.0.2 (npm 24h restriction - 1.0.0 and 1.0.1 were previously published then unpublished)
- Updated dependencies
  - @sylphx/lens-client@1.0.2
  - @sylphx/lens-core@1.0.2
  - @sylphx/lens-server@1.0.2

## 1.0.1

### Patch Changes

- Fix server subscription context - add `onCleanup` and `emit` to `ctx` object instead of top-level resolver args. Also retry 1.0.0 release as 1.0.1 due to npm 24-hour unpublish restriction.
- Updated dependencies
  - @sylphx/lens-client@1.0.1
  - @sylphx/lens-core@1.0.1
  - @sylphx/lens-server@1.0.1

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
  - @sylphx/lens-core@1.0.0
  - @sylphx/lens-server@1.0.0

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
  - @sylphx/lens-client@1.1.0
  - @sylphx/lens-server@1.1.0

## 1.0.1

### Patch Changes

- 48efc47: Re-release v1.0.1 (npm 1.0.0 version number reserved)
- Updated dependencies [48efc47]
  - @sylphx/lens-core@1.0.1
  - @sylphx/lens-client@1.0.1
  - @sylphx/lens-server@1.0.1

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
  - @sylphx/lens-server@1.0.0

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
  - @sylphx/lens-server@1.0.0
