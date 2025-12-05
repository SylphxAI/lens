---
release: patch
packages:
  - @sylphx/lens-client
---

fix: use callbackWrappers in createAccessor subscribe for proper cleanup

createAccessor's subscribe() was creating new wrapped functions but
cleanup was trying to delete the original callback (not in the Set).
This caused callbacks to accumulate, leading to multiple setData
calls on each data update.

Now uses the same callbackWrappers WeakMap pattern as executeQuery
for proper callback tracking and cleanup.
