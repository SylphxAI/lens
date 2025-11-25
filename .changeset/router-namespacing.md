---
"@sylphx/lens-core": minor
"@sylphx/lens-client": minor
"@sylphx/lens-server": minor
---

Add router() for namespaced operations (tRPC-style)

Organize operations into logical namespaces for better API structure:

```typescript
import { router, query, mutation } from '@sylphx/lens-core'

const appRouter = router({
  user: router({
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } })),
    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.create({ data: input })),
  }),
  post: router({
    list: query()
      .returns([Post])
      .resolve(({ ctx }) => ctx.db.post.findMany()),
  }),
})

export type AppRouter = typeof appRouter
```

Server configuration:
```typescript
const server = createServer({
  router: appRouter,  // Use router for namespaced operations
  // ...
})
```

Client usage:
```typescript
import { createClient, RouterApiShape } from '@sylphx/lens-client'
import type { AppRouter } from './router'

const client = createClient<RouterApiShape<AppRouter>>({
  links: [httpLink({ url: '/api' })],
})

// Namespaced access with full type inference
const user = await client.user.get({ id: "1" })
const post = await client.post.create({ title: "Hello" })
```

Features:
- Deeply nested namespaces supported
- Auto-optimistic still works (based on procedure name: `create`, `update`, `delete`)
- Full TypeScript type inference
- Flat operations still supported for backwards compatibility
