# @sylphx/lens-next

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
