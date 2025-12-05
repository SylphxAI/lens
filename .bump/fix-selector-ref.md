---
release: patch
packages:
  - "@sylphx/lens-react"
---

fix(react): use ref for selector to avoid useCallback requirement

Previously, useQuery included `selector` in useMemo dependencies,
causing infinite loops if users didn't wrap their selectors with
useCallback. Now uses a ref to track the selector, matching the
pattern already used for the `select` option.
