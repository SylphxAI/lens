# @sylphx/lens-server

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
