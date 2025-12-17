# Changelog

## 1.2.0 (2025-12-17)

Align resolver API with GraphQL conventions - use `args` everywhere instead of `input`

### ♻️ Refactoring

- **core:** remove deprecated input and parent aliases ([f5a8510](https://github.com/SylphxAI/lens/commit/f5a8510aa480313ddd60e950233dfaad4fc943dc))

### 🔧 Chores

- retry release ([5c05700](https://github.com/SylphxAI/lens/commit/5c057005ca0bd49bc5fff61fa0a2f6aaa604ee40))

## 1.1.1 (2025-12-17)

refactor: remove deprecated APIs and clean up resolver system

- Remove deprecated entity() API and t.* type builders
- Remove model().resolve() and model().subscribe() chain patterns
- Simplify resolver system: Model = pure schema, Resolver = separate implementation
- Update createResolverFromEntity() to create exposed-only resolvers
- Deprecate hasInlineResolvers() (always returns false)
- Auto-generate exposed-only resolvers for models without explicit resolvers

### ♻️ Refactoring

- **core:** remove deprecated input and parent aliases ([f5a8510](https://github.com/SylphxAI/lens/commit/f5a8510aa480313ddd60e950233dfaad4fc943dc))

## 1.1.0 (2025-12-11)

Add model chain methods .resolve() and .subscribe()

Add plain object model API and scalar type builder

- New API: `model('User', { id: id(), name: string(), ... })`
- Add `scalar()` for custom scalar types
- Add standalone field builders: `id()`, `string()`, `int()`, etc.
- Add `list()` and `nullable()` wrappers for field definitions
- Rename `CustomType` → `ScalarType`


## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))
  External storage adapters moved to separate packages.

## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))
  External storage adapters moved to separate packages.

## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **server:** split storage adapters and pusher into separate packages ([2bf5ccf](https://github.com/SylphxAI/Lens/commit/2bf5ccfeac6dcc568590a9633271ff2135a8fbd7))
  External storage adapters moved to separate packages.
