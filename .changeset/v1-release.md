---
"@sylphx/core": major
"@sylphx/client": major
"@sylphx/server": major
"@sylphx/react": major
"@sylphx/solid": major
"@sylphx/vue": major
"@sylphx/svelte": major
---

# Lens v1.0 - Type-safe, Real-time API Framework

First stable release of Lens - bringing GraphQL concepts to TypeScript with zero codegen.

## @sylphx/core

- Schema builder with Zod integration
- Type-safe entity and relation definitions (`entity()`, `relation()`, `hasMany()`, `belongsTo()`)
- Operations API (`query()`, `mutation()`) with fluent builder pattern
- Auto-derived optimistic updates from naming conventions
- Full TypeScript type inference

## @sylphx/client

- Type-safe client with tRPC-style links architecture
- Composable middleware: `httpLink`, `websocketLink`, `sseLink`, `loggerLink`, `retryLink`, `batchLink`
- Reactive store with Preact Signals integration
- Automatic entity caching and deduplication
- QueryResult pattern: thenable, subscribable, chainable

## @sylphx/server

- Resolver-based execution engine
- DataLoader pattern for N+1 elimination
- WebSocket server with subscription support
- SSE handler for streaming updates
- AsyncLocalStorage context system

## @sylphx/react

- `LensProvider` for React context injection
- `useQuery`, `useMutation`, `useLazyQuery` hooks
- Operations-based API accepting QueryResult directly
- Full TypeScript support with inferred types

## @sylphx/solid

- `LensProvider` for SolidJS context injection
- `createQuery`, `createMutation`, `createLazyQuery` primitives
- Reactive signals integration
- Automatic cleanup on unmount

## @sylphx/vue

- `provideLensClient` / `useLensClient` for Vue provide/inject
- `useQuery`, `useMutation`, `useLazyQuery` composables
- Vue 3 Composition API integration
- Reactive refs for state management

## @sylphx/svelte

- `provideLensClient` / `useLensClient` for Svelte context
- `query`, `mutation`, `lazyQuery` store factories
- Svelte store integration
- Automatic subscription cleanup
