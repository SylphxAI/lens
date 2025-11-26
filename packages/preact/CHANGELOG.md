# @sylphx/lens-preact

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
