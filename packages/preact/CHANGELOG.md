# @sylphx/lens-preact

## 1.2.23 (2025-12-01)

### 🐛 Bug Fixes

- revert all package versions to match npm ([c1a2832](https://github.com/SylphxAI/Lens/commit/c1a2832fa0ca0464af25256bce7a85f021825859))

### ✅ Tests

- comprehensive test coverage for all packages ([567987b](https://github.com/SylphxAI/Lens/commit/567987be1413b46346a36af26d2d9fa8b67cafb7))

## 1.2.24 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.9.0

## 1.2.23 (2025-12-01)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.8.0

## 1.2.22 (2025-12-01)

### 🐛 Bug Fixes

- **release:** build all packages before npm publish ([1bd467e](https://github.com/SylphxAI/Lens/commit/1bd467e4d5fdad65ff384386af787dc789ed7a4f))
- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.21 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.20 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.19 (2025-12-01)

### 🐛 Bug Fixes

- update codebase for strict TypeScript settings ([17ef860](https://github.com/SylphxAI/Lens/commit/17ef860ee4a850e5304414f836d14f02b14f0aa2))

## 1.2.18 (2025-11-30)

No notable changes.

## 1.2.17 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.7.0

## 1.2.16 (2025-11-30)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.6.0

## 1.2.15 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.5.0

## 1.2.14 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.4.0

## 1.2.13 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.3.0

## 1.2.12 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.3.0

## 1.2.11 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.2.0

## 1.2.7 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.1.0

## 1.2.6 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.1.0

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

- 4f7f4da: feat(preact): add @preact/signals support

  Added signal-based primitives as an alternative to hooks:

  - `createQuerySignal` - Signal-based query subscription
  - `createLazyQuerySignal` - Signal-based lazy query
  - `createMutationSignal` - Signal-based mutation

  Import from `@sylphx/lens-preact/signals` to use.

## 1.1.0

### Minor Changes

- Add Preact bindings for Lens API framework

  - New package `@sylphx/lens-preact` with native Preact hooks
  - Same API as `@sylphx/lens-react`:
    - `LensProvider` and `useLensClient` for context
    - `useQuery`, `useLazyQuery`, `useMutation` hooks
    - `QueryInput` type for conditional queries and accessor functions
  - Imports from `preact` and `preact/hooks` (no React compatibility layer needed)
  - Peer dependency: `preact >= 10.0.0`
