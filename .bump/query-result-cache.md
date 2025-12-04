---
release: patch
packages:
  - @sylphx/lens-client
---

fix: cache QueryResult objects for stable React references

Previously, `executeQuery()` returned a new QueryResult object every call,
causing React hooks to infinite loop:

1. useMemo calls client.getSession({ id })
2. executeQuery returns NEW QueryResult object
3. query reference changes
4. useEffect deps [query, ...] changes
5. useEffect re-runs → re-subscribes
6. subscribe fires (cached data) → setData
7. re-render → back to step 1

Now QueryResult objects are cached by key, providing stable references
for React's referential equality checks.
