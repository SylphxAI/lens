# @sylphx/lens-solidstart

## 1.2.11 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.2.0
- Updated `@sylphx/lens-server` to 1.4.0

## 1.2.7 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.1.0
- Updated `@sylphx/lens-server` to 1.4.0

## 1.2.6 (2025-11-29)

### 📦 Dependencies

- Updated `@sylphx/lens-client` to 1.1.0
- Updated `@sylphx/lens-server` to 1.4.0

## 1.2.5

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.3.2
  - @sylphx/lens-client@1.0.9
  - @sylphx/lens-solid@1.2.5

## 1.2.4

### Patch Changes

- @sylphx/lens-client@1.0.8
- @sylphx/lens-server@1.3.1
- @sylphx/lens-solid@1.2.4

## 1.2.3

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.3.0
  - @sylphx/lens-client@1.0.7
  - @sylphx/lens-solid@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.2.0
  - @sylphx/lens-client@1.0.6
  - @sylphx/lens-solid@1.2.2

## 1.2.1

### Patch Changes

- Updated dependencies
  - @sylphx/lens-server@1.1.0
  - @sylphx/lens-client@1.0.5
  - @sylphx/lens-solid@1.2.1

## 1.2.0

### Minor Changes

- feat: unified factory API for all meta-framework packages

  All meta-framework packages now expose a unified factory function that creates both server and client in one call:

  **Next.js:**

  ```ts
  import { createLensNext } from "@sylphx/lens-next";
  import { server } from "./server";

  export const lens = createLensNext({ server });
  export const {
    handler,
    client,
    serverClient,
    Provider,
    useQuery,
    useMutation,
  } = lens;
  ```

  **Nuxt:**

  ```ts
  import { createLensNuxt } from "@sylphx/lens-nuxt";
  import { server } from "./server";

  export const lens = createLensNuxt({ server });
  export const {
    handler,
    client,
    serverClient,
    plugin,
    useQuery,
    useMutation,
  } = lens;
  ```

  **SolidStart:**

  ```ts
  import { createLensSolidStart } from "@sylphx/lens-solidstart";
  import { server } from "./server";

  export const lens = createLensSolidStart({ server });
  export const {
    handler,
    client,
    serverClient,
    createQuery,
    createMutation,
    serverQuery,
  } = lens;
  ```

  **Fresh (Deno/Preact):**

  ```ts
  import { createLensFresh } from "@sylphx/lens-fresh";
  import { server } from "./server";

  export const lens = createLensFresh({ server });
  export const {
    handler,
    client,
    serverClient,
    serialize,
    useIslandQuery,
    useMutation,
  } = lens;
  ```

  Each factory returns:

  - `handler` - API route handler for the framework
  - `client` - Browser client with HTTP transport
  - `serverClient` - Server-side client with direct execution (no HTTP)
  - Framework-specific hooks/composables

  Legacy exports are preserved for backwards compatibility.

## 1.1.0

### Minor Changes

- 0bfe8c7: feat: add meta-framework integrations

  New packages for SSR meta-frameworks:

  - `@sylphx/lens-next` - Next.js integration (App Router + Pages Router)

    - SSR-safe hooks, fetchQuery, prefetchQuery, HydrationBoundary
    - Server handler for API routes

  - `@sylphx/lens-nuxt` - Nuxt 3 integration

    - SSR-safe composables with useAsyncData pattern
    - useLensQuery, useLensMutation, createLensPlugin

  - `@sylphx/lens-solidstart` - SolidStart integration

    - SSR-safe primitives with createResource
    - createLensQuery, createLensMutation, createServerQuery, createServerAction

  - `@sylphx/lens-fresh` - Fresh (Deno/Preact) integration
    - Server-side fetching utilities
    - Island hydration with useIslandQuery
    - Fresh handler for API routes
