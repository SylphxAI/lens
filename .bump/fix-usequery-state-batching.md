---
release: patch
packages:
  - "@sylphx/lens-react"
---

fix(react): use useReducer for atomic state updates in useQuery

Prevents cascading re-renders when multiple components subscribe to the
same query data. Previously, useQuery made 4-6 individual setState calls
when data arrived, causing "Maximum update depth exceeded" errors.

- Replace multiple useState with single useReducer
- Atomic state transitions (data + loading + error in one dispatch)
- Eliminates race conditions between state updates
