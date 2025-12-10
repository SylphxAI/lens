# Quick Start

This guide walks you through creating a simple Lens application with a server and client.

## 1. Define Your Server

Create a new file `server/api.ts`:

```typescript
import { createApp, router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

// Define your router with operations
export const appRouter = router({
  user: {
    list: query()
      .resolve(({ ctx }) => ctx.db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) =>
        ctx.db.user.findUnique({ where: { id: input.id } })
      ),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input, ctx }) =>
        ctx.db.user.create({ data: input })
      ),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string().optional() }))
      .resolve(({ input, ctx }) =>
        ctx.db.user.update({ where: { id: input.id }, data: input })
      ),
  },
})

// Export the router type for client inference
export type AppRouter = typeof appRouter

// Create the app
export const app = createApp({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

## 2. Create an HTTP Handler

For Bun:

```typescript
import { createHTTPHandler } from '@sylphx/lens-server'
import { app } from './api'

const handler = createHTTPHandler(app)

Bun.serve({
  port: 3000,
  fetch: handler,
})

console.log('Server running at http://localhost:3000')
```

For Next.js, see the [Next.js integration guide](/frameworks/next).

## 3. Create Your Client

```typescript
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/api'

// Create a typed client
export const client = createClient<AppRouter>({
  transport: http({ url: 'http://localhost:3000' }),
})
```

## 4. Use the Client

### One-time Query

```typescript
// Fetch user once
const user = await client.user.get({ id: '123' })
console.log(user.name)
```

### Live Subscription

```typescript
// Subscribe to live updates
const unsubscribe = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('Current user:', user)
  // Called on initial data and every update
})

// Later: stop receiving updates
unsubscribe()
```

### Mutation

```typescript
// Mutations trigger updates to all subscribers
await client.user.update({ id: '123', name: 'New Name' })
// All subscribers receive the update automatically
```

## 5. Use with React

```tsx
import { client } from './api'

function UserProfile({ userId }: { userId: string }) {
  // useQuery hook - auto-subscribes and receives live updates
  const { data: user, loading, error } = client.user.get.useQuery({
    input: { id: userId }
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{user?.name}</h1>
}

function UpdateUser({ userId }: { userId: string }) {
  // useMutation hook
  const { mutate, loading } = client.user.update.useMutation()

  return (
    <button
      disabled={loading}
      onClick={() => mutate({ input: { id: userId, name: 'New Name' } })}
    >
      Update
    </button>
  )
}
```

## Next Steps

- [Core Concepts](/guide/concepts) - Understand live queries and incremental transfer
- [Models](/server/models) - Define type-safe data models
- [Transports](/client/transports) - WebSocket, HTTP, and more
- [React Integration](/frameworks/react) - Full React guide
