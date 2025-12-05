---
release: patch
packages:
  - "@sylphx/lens-react"
---

fix(react): use global singleton for LensContext

Fixes module duplication issue in monorepos where @sylphx/lens-react
could be resolved to different paths, causing LensProvider and useQuery
to use different React contexts (resulting in null client).

- Store context in globalThis with Symbol.for key
- Ensures same context instance across multiple module resolutions
- Common pattern used by react-redux and other React libraries
