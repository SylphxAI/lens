# @sylphx/lens-preact

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
