---
release: patch
packages:
  - @sylphx/lens-client
---

fix: cache accessor results for stable React references

createAccessor() was returning new objects on every call, causing
React hooks to infinite loop during streaming. Now accessor results
are cached by key (path + input), providing stable references for
React's referential equality checks.
