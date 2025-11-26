---
"@sylphx/lens-preact": minor
---

feat(preact): add @preact/signals support

Added signal-based primitives as an alternative to hooks:
- `createQuerySignal` - Signal-based query subscription
- `createLazyQuerySignal` - Signal-based lazy query
- `createMutationSignal` - Signal-based mutation

Import from `@sylphx/lens-preact/signals` to use.
