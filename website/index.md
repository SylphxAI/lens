---
layout: home

hero:
  name: Lens
  text: Type-safe, real-time API framework
  tagline: GraphQL-like power with automatic live queries and incremental transfer. No codegen required.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/SylphxAI/Lens

features:
  - icon:
      src: /icons/refresh.svg
    title: Automatic Live Queries
    details: Every query is automatically subscribable. Clients can subscribe to any query and receive updates when data changes.
  - icon:
      src: /icons/broadcast.svg
    title: Minimal Diff Updates
    details: Server computes and sends only the changed fields. Automatic transfer optimization with value, delta, and patch strategies.
  - icon:
      src: /icons/target.svg
    title: Field Selection
    details: GraphQL-like field selection with field-level arguments. Subscribe to specific fields only.
  - icon:
      src: /icons/bolt.svg
    title: Optimistic Updates
    details: Instant UI feedback with automatic rollback. Define optimistic behavior declaratively.
  - icon:
      src: /icons/plug.svg
    title: Framework Agnostic
    details: Works with React, Vue, Solid, Svelte, and more. First-class Next.js, Nuxt, and SolidStart support.
  - icon:
      src: /icons/shield.svg
    title: Full Type Safety
    details: End-to-end TypeScript inference from server to client. No code generation required.
---

## Quick Example

```typescript
// Server: Define your API
const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.update(input)),
  },
})

// Client: One-time fetch
const user = await client.user.get({ id: '123' })

// Client: Subscribe to live updates
client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)  // Called whenever data changes
})
```

## The Lens Approach

Traditional frameworks require separate endpoints for queries and subscriptions. With Lens, every query is automatically a subscription:

| Pattern | Traditional | Lens |
|---------|-------------|------|
| **One-time fetch** | `await trpc.getUser({ id })` | `await client.user.get({ id })` |
| **Real-time** | Separate subscription endpoint | Same endpoint with `.subscribe()` |
| **Partial updates** | Manual implementation | Automatic with field selection |

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #bd34fe 30%, #41d1ff);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #bd34fe50 50%, #47caff50 50%);
  --vp-home-hero-image-filter: blur(44px);
}
</style>
