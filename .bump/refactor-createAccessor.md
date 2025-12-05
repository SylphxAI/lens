---
release: patch
packages:
  - @sylphx/lens-client
---

refactor: simplify createAccessor to delegate to executeQuery

Removed ~60 lines of duplicated code by having createAccessor delegate
to executeQuery for all query functionality (caching, subscriptions,
callback management). Only overrides then() to support mutations.

- Eliminates code duplication between createAccessor and executeQuery
- Single source of truth for query handling
- Reduces bundle size by ~1.7KB
- Prevents future bugs from diverging implementations
