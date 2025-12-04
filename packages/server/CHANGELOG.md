# @sylphx/lens-server

## 1.5.0 (2025-12-04)

Unified v1.5.0 release.

### ✨ Features

- **server:** add Redis, Upstash, Vercel KV storage adapters ([8c7c940](https://github.com/SylphxAI/Lens/commit/8c7c940e5b98b858c5029033db51c87a38e34560))
- **server:** add storage adapter pattern for opLog ([34accec](https://github.com/SylphxAI/Lens/commit/34accec172773b2df7dd62e07ed98e995a5c55b3))
- **server:** add unified createHandler (HTTP + SSE) ([8d53b16](https://github.com/SylphxAI/Lens/commit/8d53b16e794138baf148159b8fdaa5dabaa193e3))
- **server:** implement OptimisticPluginMarker for unified lens/server plugin ([556e62f](https://github.com/SylphxAI/Lens/commit/556e62f39e97e090ff6e0599bc1ce0a3d0744700))
- **server:** add optimisticPlugin for metadata enhancement ([8ec3f40](https://github.com/SylphxAI/Lens/commit/8ec3f403e7878f585992a6f5a5dcad12139d682f))
- **server:** add Pusher subscription transport ([a745b38](https://github.com/SylphxAI/Lens/commit/a745b3804e921e83da934630c1b5657c4f696bf9))
- **server:** add subscriptionTransport config for custom pub/sub ([52141a7](https://github.com/SylphxAI/Lens/commit/52141a7458901ca841a2782a531616bc84a515de))
- **server:** add diffOptimizer plugin for opt-in state tracking ([e06e365](https://github.com/SylphxAI/Lens/commit/e06e365c50ae733d68150a0dafd79aa91cdabd97))
- **server:** add plugin system with lifecycle hooks ([f3fa168](https://github.com/SylphxAI/Lens/commit/f3fa16845fe76c58f863549ea57f68f80b09c8c4))
- **server:** integrate reconnect protocol into WebSocket message handler ([fa66ebf](https://github.com/SylphxAI/Lens/commit/fa66ebf816c27cfb30bc1db8321bc60ab446d60d))
- **core:** add compression support for large reconnection payloads ([2459177](https://github.com/SylphxAI/Lens/commit/2459177c28d98a82670040b7a89fb751c4e7e943))
- **server:** add version tracking and reconnection support to GraphStateManager ([6b0c04c](https://github.com/SylphxAI/Lens/commit/6b0c04ce6795a70c40f2b0e9e4742659e9126a33))

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))
- **server:** cleanup duplicate subscription IDs in WS handler ([0636058](https://github.com/SylphxAI/Lens/commit/063605840913ae979f37b0eabb6352430453fefe))
- resolve pre-existing build and test issues ([9785c30](https://github.com/SylphxAI/Lens/commit/9785c30f60f9673aac9d92d5494ee2a2b9815a58))
- **server:** output Reify-compatible DSL format in optimisticPlugin ([3fdb9ee](https://github.com/SylphxAI/Lens/commit/3fdb9eee0e5819b1d26a23fb6524d5fc3e400e1c))

### ♻️ Refactoring

- remove deprecated aliases (createServer, WSAdapter, HTTPAdapter) ([1fdf821](https://github.com/SylphxAI/Lens/commit/1fdf821ba03c64993654f8897b95fd32bf55c893))
- **server:** extract WS handler types to dedicated module ([0dc8446](https://github.com/SylphxAI/Lens/commit/0dc84460ec1cebe221ca61b43463bfb9695a4a6f))
- extract types from god files ([f5c67c1](https://github.com/SylphxAI/Lens/commit/f5c67c1e54690d64e193999039299b8f137254d0))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))
- **server:** remove pusher transport from core library ([2748c0e](https://github.com/SylphxAI/Lens/commit/2748c0ecbc91798770ffd883565fe5525e694049))
- **server:** remove dead code and add optimistic locking ([bcdd484](https://github.com/SylphxAI/Lens/commit/bcdd484bd8d50782fb41db06e2b24bb06638b89a))
- **server:** rename client-state.ts to op-log.ts ([eea3061](https://github.com/SylphxAI/Lens/commit/eea30611f7713eaf66985c79f3c1028857126ef7))
- **server:** rename stateSync to opLog ([8c8fd60](https://github.com/SylphxAI/Lens/commit/8c8fd603f252bcad2859f507aaa5e9bdd48dc622))
- **server:** simplify plugin to only handle state, not routing ([08a2eaf](https://github.com/SylphxAI/Lens/commit/08a2eaf1dad436fe7131364a17dde4e4b1545d5f))
- **server:** convert clientState to cursor-based architecture ([8580f6b](https://github.com/SylphxAI/Lens/commit/8580f6b5b9aa38bb339fbb3ea8bf14bbc3510f64))
- **server:** rename stateSync to clientState ([be3430a](https://github.com/SylphxAI/Lens/commit/be3430a1982b659cc29eedd6ceb1dfaf5d0cb10d))
- **server:** rename diffOptimizer to stateSync ([d507dae](https://github.com/SylphxAI/Lens/commit/d507dae76c18394009bc15aeb940e102fb624416))
- **server:** make core server stateless, move state to plugins ([ca6b0a7](https://github.com/SylphxAI/Lens/commit/ca6b0a74d7873b77630efc62d1ec48d864eb2627))
- **server:** decouple GraphStateManager from public API ([f715cd4](https://github.com/SylphxAI/Lens/commit/f715cd4550125052c456821703a98d6ecd0764f0))
- **server:** extract framework handler utilities ([caa8d4f](https://github.com/SylphxAI/Lens/commit/caa8d4fe5a39f519076068e6c1eae8a5fcd73eaf))
- **server:** complete Adapter → Handler naming migration ([b850eac](https://github.com/SylphxAI/Lens/commit/b850eacbdd8115a00e622a94e1dd99ee51546c5b))
- 💥 **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
- **server:** rename adapters folder to handlers ([60a2bcb](https://github.com/SylphxAI/Lens/commit/60a2bcbfa5c328b9d1e20164556df3e0ec702a9b))
- **server:** rename adapters to handlers ([6e12d32](https://github.com/SylphxAI/Lens/commit/6e12d322bb7daa7f3e3eac5ff005f4145a31bff0))
- **server:** rename createServer to createApp ([2f804c2](https://github.com/SylphxAI/Lens/commit/2f804c2b4e4fc3caaf1dd9696f84dfd21f4dde52))
- **server:** add type safety to OperationMeta.optimistic ([0307e6e](https://github.com/SylphxAI/Lens/commit/0307e6eaa4db4a801c81d18b4e43f5d0d59792dd))
- **server:** delegate reconnect and updateFields to plugin hooks ([bd2c2b8](https://github.com/SylphxAI/Lens/commit/bd2c2b8c49aebf4b1c4323cb8742bf464b65e9f7))
- **server:** clean separation of concerns between adapter, server, and plugin ([fa702cf](https://github.com/SylphxAI/Lens/commit/fa702cf637d1734a443eb6b5232a48d7599afc8f))
- **server:** move plugins from adapter to server level ([fc36d8a](https://github.com/SylphxAI/Lens/commit/fc36d8a06a37745880df76bc85c149139c13c277))
- **client:** move SubscriptionRegistry from core to client ([20a9468](https://github.com/SylphxAI/Lens/commit/20a9468f307fb14bb801e1c9ea92d9b43c22801f))
- **core:** separate platform-specific code from core ([380a129](https://github.com/SylphxAI/Lens/commit/380a129241c8524c354431c857e436de0c6d7491))
- **server:** pure executor architecture ([dbcc8aa](https://github.com/SylphxAI/Lens/commit/dbcc8aa58192a3ce23afd677f545de0e5e5103ea))
- **server:** remove subscriptionTransport and deprecate legacy methods ([ab069cd](https://github.com/SylphxAI/Lens/commit/ab069cd784fb23977de448f29621038bae1c57f5))
- **server:** add modular adapter pattern for protocol handlers ([564dfe0](https://github.com/SylphxAI/Lens/commit/564dfe0831ae860ef5471600e17f19a38cc96725))
- **server:** remove subscriptionTransport from server config ([1f01a87](https://github.com/SylphxAI/Lens/commit/1f01a8743a189e3cdb7ff417596bfc1a3efb1abe))

### ✅ Tests

- add tests for PairedPlugin and Pusher transport ([c244877](https://github.com/SylphxAI/Lens/commit/c2448774eccf796313d7350e5e7e51bb2db33b65))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- **server:** remove deprecated aliases for clientState ([7900407](https://github.com/SylphxAI/Lens/commit/7900407f7323a46497a7868fffb422c195f3331f))

### 💥 Breaking Changes

- **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))
  External storage adapters moved to separate packages.
- **client:** rename inProcess({ server }) to inProcess({ app }) ([415e87f](https://github.com/SylphxAI/Lens/commit/415e87f2d3ba2ebb086a5d757f8a22286e3c06ef))
  The `server` property in InProcessTransportOptions has been

## 1.11.3 (2025-12-02)

No notable changes.

## 1.11.2 (2025-12-02)

Release patch version


## 1.11.1 (2025-12-02)

Release patch version


## 1.11.0 (2025-12-02)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.10.0 (2025-12-02)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.9.0 (2025-12-02)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.8.0 (2025-12-02)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.7.0 (2025-12-02)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.6.0 (2025-12-01)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 2.1.0 (2025-12-01)

### ✨ Features

- **core:** move emit and onCleanup into ctx ([40097cd](https://github.com/SylphxAI/Lens/commit/40097cd7f2730df86dc4acb398309b0714853790))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 2.0.0 (2025-12-01)

### ♻️ Refactoring

- 💥 **core:** move emit and onCleanup into ctx ([9f9ed3f](https://github.com/SylphxAI/Lens/commit/9f9ed3faf8a3c4750b426982ad59a0cd4d6c7a8f))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

### 💥 Breaking Changes

- **core:** move emit and onCleanup into ctx ([9f9ed3f](https://github.com/SylphxAI/Lens/commit/9f9ed3faf8a3c4750b426982ad59a0cd4d6c7a8f))
  emit and onCleanup are now accessed via ctx instead of being top-level resolver parameters.

## 1.5.6 (2025-12-01)

### 🐛 Bug Fixes

- **release:** build all packages before npm publish ([1bd467e](https://github.com/SylphxAI/Lens/commit/1bd467e4d5fdad65ff384386af787dc789ed7a4f))
- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

## 1.5.5 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

## 1.5.4 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

## 1.5.3 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

### ♻️ Refactoring

- remove legacy DSL evaluator, use Reify for optimistic updates ([e0d83cf](https://github.com/SylphxAI/Lens/commit/e0d83cf7661474030a2d185ccac5f1af6d39a0ec))

## 1.5.2 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 1.11.0

## 1.5.1 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 1.10.0

## 1.5.0 (2025-11-30)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))
- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **client:** add automatic type inference from inProcess transport ([431e2a9](https://github.com/SylphxAI/Lens/commit/431e2a96ae87fe8893be8e61f29f5ac56092ef50))
- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))

### 🐛 Bug Fixes

- **server:** fix InferApi type to work with createServer return type ([c443e40](https://github.com/SylphxAI/Lens/commit/c443e40d85bf4a1144d140ea1191398506684292))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- **server,client:** replace console.* with configurable logger ([7675a53](https://github.com/SylphxAI/Lens/commit/7675a532b24d024710d29c0dfdf8afd278e13891))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))

### 🔧 Chores

- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.3.2

### Patch Changes

- Remove OptimisticFn, keep DSL-only optimistic updates

  - Remove legacy `OptimisticFn` type (functions cannot be serialized for client)
  - `optimistic()` now only accepts DSL (`'merge'`, `'create'`, `'delete'`, etc.)
  - Fixes type variance issues with MutationsMap/QueriesMap

- Updated dependencies
  - @sylphx/lens-core@1.3.2

## 1.3.1

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.1

## 1.3.0

### Minor Changes

- ## Typed Context Inference

  ### Context Type Inference from Router

  Each query/mutation can declare its own context requirements. The router automatically merges them, and `createServer` enforces the final type:

  ```typescript
  // Each procedure declares only what it uses
  const getUser = query<{ db: DB }>()
    .resolve(({ ctx }) => ctx.db.user.find(...))

  const createUser = mutation<{ db: DB; user: User }>()
    .resolve(({ ctx }) => {
      if (!ctx.user) throw new Error('Unauthorized')
      return ctx.db.user.create(...)
    })

  const getCached = query<{ cache: Cache }>()
    .resolve(({ ctx }) => ctx.cache.get(...))

  // Router merges all contexts
  const appRouter = router({
    user: { get: getUser, create: createUser },
    cache: { get: getCached },
  })

  // createServer enforces merged context: { db: DB; user: User; cache: Cache }
  const server = createServer({
    router: appRouter,
    context: () => ({ db, user, cache }),  // Type-checked!
  })
  ```

  ### Simple Approach: Shared Context

  For simplicity, you can use the same context type everywhere:

  ```typescript
  interface Context { db: DB; user: User; cache: Cache }

  // Use directly
  const getUser = query<Context>().resolve(...)

  // Or wrap it
  export const typedQuery = () => query<Context>()
  export const typedMutation = () => mutation<Context>()
  ```

  ### `.returns()` Now Supports Zod Schemas

  ```typescript
  const ResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
  });

  const getStatus = query()
    .returns(ResponseSchema) // Zod schema!
    .resolve(() => ({ success: true, message: "OK" }));
  ```

  ### Breaking Changes

  - Removed `initLens` - no longer needed with automatic context inference

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.3.0

## 1.2.0

### Minor Changes

- Re-publish: Type-safe EmitObject and EmitArray interfaces (version bump to avoid npm conflict)

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@1.2.0

## 1.1.0

### Minor Changes

- feat(emit): Type-safe EmitObject and EmitArray interfaces

  - `EmitObject<T>` for object outputs with `set()`, `delta()`, `patch()`, `batch()` methods
  - `EmitArray<T>` for array outputs with `push()`, `unshift()`, `insert()`, `remove()`, `removeById()`, `update()`, `updateById()`, `merge()`, `mergeById()` methods
  - GraphStateManager now handles array operations
  - Full test coverage for emit API and array operations

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
