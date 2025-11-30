# @sylphx/lens-core

## 1.9.0 (2025-11-30)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

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

## 1.8.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.7.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.6.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.6.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.5.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- **deps:** update @sylphx/bump to 1.3.9 ([73af518](https://github.com/SylphxAI/Lens/commit/73af5183ff6cfd75cf340a197a7fbd3e6235920e))
- bump versions to bypass npm registry conflict ([afe45c4](https://github.com/SylphxAI/Lens/commit/afe45c42ffb8afa01bd080a1dc8b5b6c1edd3c3a))
- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

### 🔧 Chores

- remove legacy eslint-disable comments ([6be72a2](https://github.com/SylphxAI/Lens/commit/6be72a2bfd2640a37891fdcbb43689551f29e4ae))
- update dependencies, fix types, add prepack scripts ([640f46c](https://github.com/SylphxAI/Lens/commit/640f46c447ae222287b808f5ae4d504335636e70))
- polish project presentation - docs, README, packaging ([8bc2262](https://github.com/SylphxAI/Lens/commit/8bc2262c2e1a1b134e9b44bcabe0de8b2278179e))
- fix all doctor warnings - 100% score ([c5e58ce](https://github.com/SylphxAI/Lens/commit/c5e58ce15133c00b4b579be7f5f8d772a81dbe23))

## 1.4.0 (2025-11-29)

### ✨ Features

- **core:** add lens<TContext>() unified factory for functional API ([9bc178f](https://github.com/SylphxAI/Lens/commit/9bc178ff14c59c7cbdee6449bcdc5c7d682ed2d3))
- **core:** implement array diff algorithm for optimal transfer ([58c7dbe](https://github.com/SylphxAI/Lens/commit/58c7dbe7c2ff706864a38cd42bb53f958d250d5f))
- **core:** add operations() factory for typed query/mutation builders ([b3d01e7](https://github.com/SylphxAI/Lens/commit/b3d01e756b2b6159b47ef0ed9444dd1aef104dd8))
- **core:** improve resolver API with curried pattern and object-style params ([564aff3](https://github.com/SylphxAI/Lens/commit/564aff3a788445abee2b2a85f5ecded27d724e94))
- **core:** add resolvers.add() API for cleaner resolver registration ([e49d1f1](https://github.com/SylphxAI/Lens/commit/e49d1f12ffa699e628570dbd1ed8ca7d75aba947))
- **core:** add field args support to client selection types ([c6eab92](https://github.com/SylphxAI/Lens/commit/c6eab92898de36b7b09ec86071cac715ce248186))
- **core:** add field arguments support to resolver API ([6da4c97](https://github.com/SylphxAI/Lens/commit/6da4c976db76da24d069107e57be5353bd25fdb5))
- **core:** introduce new resolver() API with field builder pattern ([c4483ee](https://github.com/SylphxAI/Lens/commit/c4483eeea95a1949eb1f76ef3a2e332a1bddb1db))
- **core:** add RelationBuilder for type-safe foreign key accessors ([ca09420](https://github.com/SylphxAI/Lens/commit/ca09420f6fc043f27e2615af6439c4edc33f1335))

### 🐛 Bug Fixes

- **core:** fix QueryBuilder type inference for .returns() output type ([81be72c](https://github.com/SylphxAI/Lens/commit/81be72c0afa863ec9ace1a184888dfc374f3661c))
- **core:** handle optional fields in InferParent type ([ca0b6f7](https://github.com/SylphxAI/Lens/commit/ca0b6f7cccb1cdc1dd34a4199fa789f617057b86))
- **core:** simplify ResolverFn to avoid TypeScript union function issues ([f57257c](https://github.com/SylphxAI/Lens/commit/f57257c271a7cfffed4efdfe56ee3b3a0f75f2da))
- **core:** improve InferReturnType to properly infer entity scalar fields ([274ce9b](https://github.com/SylphxAI/Lens/commit/274ce9ba5f8670f8fcc670f8851d24d1d6d25cd2))
- **core:** rename RelationBuilder methods to avoid bundler name collisions ([a87dc5b](https://github.com/SylphxAI/Lens/commit/a87dc5bb037359ea00a8381771a57cce7e21aab0))
- **core:** improve type inference for hasMany/belongsTo field accessors ([9ae8711](https://github.com/SylphxAI/Lens/commit/9ae8711d6d2c5d3e43b303263e90f45c0bd03c29))
- **client:** correct mutation detection and type inference ([6344651](https://github.com/SylphxAI/Lens/commit/6344651a4f95fbeee48dd30b91318b9ff77c7822))

### ♻️ Refactoring

- **core:** remove legacy createResolverRegistry API ([ea99640](https://github.com/SylphxAI/Lens/commit/ea9964068aa3d67efdafe18e0c1022a78e15bf97))
- enable noUnusedVariables linter rule ([fd2026d](https://github.com/SylphxAI/Lens/commit/fd2026d394f3498b63f57e79a7d31b2aea89776e))
- cleanup legacy code and incomplete implementations ([f2c574d](https://github.com/SylphxAI/Lens/commit/f2c574d91ac8cefb053c7d13e3d4cee6f888267b))
- **core:** clean up API surface and remove legacy code ([e3da689](https://github.com/SylphxAI/Lens/commit/e3da68951566f72fbb3ef963200ff62e5cf4336f))

### 💅 Styles

- format package.json files with biome ([8565fd9](https://github.com/SylphxAI/Lens/commit/8565fd9b1c71b8f35ce1f56514c822106142947a))

### ✅ Tests

- **core,client,server:** boost test coverage to 92%+ ([b5348b5](https://github.com/SylphxAI/Lens/commit/b5348b5eac9d6444f7d18f202948398bb6d09dc6))
- **core,client:** add comprehensive type inference tests and examples ([3f4d49e](https://github.com/SylphxAI/Lens/commit/3f4d49ecd85ff30580a27a3c8ad8cfe2b83a1b1a))
- **core:** improve test coverage for schema types, operations, and resolvers ([59d5c78](https://github.com/SylphxAI/Lens/commit/59d5c78d97431409c4b097afd0ff3e73b1f4bce3))

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

## 1.3.1

### Patch Changes

- Refactor: remove type workarounds and improve type safety

  - Use method syntax for bivariant `_resolve` types (eliminates `any` workaround)
  - Replace `any` types in Nuxt package with proper H3 event types
  - Fix lint errors and remove unused imports

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

## 1.2.0

### Minor Changes

- Re-publish: Type-safe EmitObject and EmitArray interfaces (version bump to avoid npm conflict)

## 1.1.0

### Minor Changes

- feat(emit): Type-safe EmitObject and EmitArray interfaces

  - `EmitObject<T>` for object outputs with `set()`, `delta()`, `patch()`, `batch()` methods
  - `EmitArray<T>` for array outputs with `push()`, `unshift()`, `insert()`, `remove()`, `removeById()`, `update()`, `updateById()`, `merge()`, `mergeById()` methods
  - GraphStateManager now handles array operations
  - Full test coverage for emit API and array operations

## 1.0.4

### Patch Changes

- 53a6877: Republish all packages with verified build configuration

  - All packages now use workspace bunup configuration
  - Explicit return types for isolated declarations
  - Framework packages properly externalize peer dependencies
  - Solid package uses tsc for type generation

## 1.0.3

### Patch Changes

- 01920b1: Fix framework bundling and build configuration

  - Fix React bundling issue: properly externalize React instead of bundling (reduces size from 109KB to 4KB)
  - Add workspace bunup configuration with explicit return types for isolated declarations
  - Fix Solid package build: use tsc for type generation since bun build doesn't support --dts
  - Add explicit return types to satisfy TypeScript isolated declarations requirement
  - All packages now build without warnings

## 1.0.2

### Patch Changes

- Retry release as 1.0.2 (npm 24h restriction - 1.0.0 and 1.0.1 were previously published then unpublished)

## 1.0.1

### Patch Changes

- Fix server subscription context - add `onCleanup` and `emit` to `ctx` object instead of top-level resolver args. Also retry 1.0.0 release as 1.0.1 due to npm 24-hour unpublish restriction.

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

## 1.0.1

### Patch Changes

- 48efc47: Re-release v1.0.1 (npm 1.0.0 version number reserved)

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
