# Changelog

## 1.2.0 (2025-12-17)

Align resolver API with GraphQL conventions - use `args` everywhere instead of `input`

### 🔧 Chores

- retry release ([5c05700](https://github.com/SylphxAI/lens/commit/5c057005ca0bd49bc5fff61fa0a2f6aaa604ee40))

## 1.1.11 (2025-12-17)

refactor: remove deprecated APIs and clean up resolver system

- Remove deprecated entity() API and t.* type builders
- Remove model().resolve() and model().subscribe() chain patterns
- Simplify resolver system: Model = pure schema, Resolver = separate implementation
- Update createResolverFromEntity() to create exposed-only resolvers
- Deprecate hasInlineResolvers() (always returns false)
- Auto-generate exposed-only resolvers for models without explicit resolvers


## 1.1.8 (2025-12-16)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 3.0.1

## 1.1.7 (2025-12-16)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.13.0

## 1.1.6 (2025-12-16)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.12.2

## 1.1.5 (2025-12-13)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.12.1

## 1.1.4

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@2.12.0

## 1.1.3 (2025-12-11)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.11.2

## 1.1.2 (2025-12-11)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.11.1

## 1.1.1 (2025-12-11)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.11.0

## 1.1.0 (2025-12-11)

Add model chain methods .resolve() and .subscribe()

Add plain object model API and scalar type builder

- New API: `model('User', { id: id(), name: string(), ... })`
- Add `scalar()` for custom scalar types
- Add standalone field builders: `id()`, `string()`, `int()`, etc.
- Add `list()` and `nullable()` wrappers for field definitions
- Rename `CustomType` → `ScalarType`

## 1.0.10 (2025-12-11)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.9.0

## 1.0.9 (2025-12-10)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.8.0

## 1.0.8 (2025-12-09)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.7.0

## 1.0.7 (2025-12-09)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.6.1

## 1.0.6 (2025-12-09)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.6.0

## 1.0.5 (2025-12-09)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.5.0

## 1.0.4 (2025-12-09)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.4.0

## 1.0.3

### Patch Changes

- Updated dependencies
  - @sylphx/lens-core@2.3.0

## 1.0.2 (2025-12-07)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.2.0

## 1.0.1 (2025-12-07)

### 📦 Dependencies

- Updated `@sylphx/lens-core` to 2.1.0

## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **signals:** extract store types to dedicated module ([783bacb](https://github.com/SylphxAI/Lens/commit/783bacb3a9de7e36a2706e7075982ee32f795783))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.

## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **signals:** extract store types to dedicated module ([783bacb](https://github.com/SylphxAI/Lens/commit/783bacb3a9de7e36a2706e7075982ee32f795783))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.

## 1.0.0 (2025-12-04)

### 🐛 Bug Fixes

- restore package.json versions, add bump file for v1.5.0 ([d320b83](https://github.com/SylphxAI/Lens/commit/d320b838f2cce196dbd3dbc9ccaa7736d000788e))

### ♻️ Refactoring

- **signals:** extract store types to dedicated module ([783bacb](https://github.com/SylphxAI/Lens/commit/783bacb3a9de7e36a2706e7075982ee32f795783))
- **client:** remove optimistic updates from client core ([8c9618b](https://github.com/SylphxAI/Lens/commit/8c9618b39675718cb7fc45117837c7b5302678f2))
- 💥 **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))

### 🔧 Chores

- reset all package versions to 1.5.0 ([97d09e6](https://github.com/SylphxAI/Lens/commit/97d09e6f7dbff083405c10f8b95625fd836b7715))
- test filtered commits with bump@1.4.5 ([562812b](https://github.com/SylphxAI/Lens/commit/562812bbc3944e851478b60db1832a5021c87ca5))
- update release PR with collapsed changelogs (bump@1.4.4) ([3d58dc7](https://github.com/SylphxAI/Lens/commit/3d58dc7bba3a99ce20317d2998b864ad8d586920))
- re-trigger release with bump@1.4.3 ([c89ced0](https://github.com/SylphxAI/Lens/commit/c89ced01ff75cfa77dc490669c94b6e00f0f6636))
- re-trigger release with bump@1.4.2 ([592d822](https://github.com/SylphxAI/Lens/commit/592d82210135afbff34ac8f5ec8aeb0f7af73213))

### 💥 Breaking Changes

- **client:** extract signals to separate package ([4a92e16](https://github.com/SylphxAI/Lens/commit/4a92e1648bac6ae8f72a50ec00cb17a11c51b79b))
  Signals and ReactiveStore moved to @sylphx/lens-signals.
