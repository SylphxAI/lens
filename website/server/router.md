# Router

The router organizes operations into namespaces and provides type-safe API structure.

## Basic Router

```typescript
import { router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),

    create: mutation()
      .input(z.object({ name: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.create(input)),
  },
})
```

## Nested Namespaces

Create deeply nested structures:

```typescript
const appRouter = router({
  user: {
    get: query()...,
    create: mutation()...,

    // Nested namespace
    settings: {
      get: query()...,
      update: mutation()...,
    },
  },

  admin: {
    users: {
      list: query()...,
      delete: mutation()...,
    },
  },
})
```

Client access follows the structure:

```typescript
// Flat operations
await client.user.get({ id: '1' })

// Nested operations
await client.user.settings.get({ userId: '1' })
await client.admin.users.list()
```

## Router Merging

Combine multiple routers:

```typescript
// routes/user.ts
export const userRouter = router({
  user: {
    get: query()...,
    create: mutation()...,
  },
})

// routes/post.ts
export const postRouter = router({
  post: {
    list: query()...,
    create: mutation()...,
  },
})

// routes/index.ts
import { router } from '@sylphx/lens-server'
import { userRouter } from './user'
import { postRouter } from './post'

export const appRouter = router({
  ...userRouter,
  ...postRouter,
})

export type AppRouter = typeof appRouter
```

## Type Export

Always export the router type for client inference:

```typescript
// server/router.ts
export const appRouter = router({
  // ... operations
})

// Export type for client
export type AppRouter = typeof appRouter
```

```typescript
// client/api.ts
import { createClient } from '@sylphx/lens-client'
import type { AppRouter } from '../server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: 'http://localhost:3000' }),
})
```

## Router with createApp

Pass the router to `createApp`:

```typescript
import { createApp, router, query } from '@sylphx/lens-server'

const appRouter = router({
  health: {
    check: query().resolve(() => ({ status: 'ok' })),
  },
})

const app = createApp({
  router: appRouter,
  context: () => ({ db: prisma }),
})
```

## Context Type Inference

The router automatically infers context type from operations:

```typescript
interface AppContext {
  db: PrismaClient
  user: User | null
}

const appRouter = router({
  user: {
    me: query<AppContext>()
      .resolve(({ ctx }) => {
        // ctx.db and ctx.user are typed
        return ctx.user
      }),
  },
})
```

## Operation Paths

Operations are accessed by their dot-separated path:

```typescript
const appRouter = router({
  user: {
    profile: {
      get: query()...,
    },
  },
})

// Internal path: "user.profile.get"
// Client access: client.user.profile.get()
```

## Best Practices

### 1. Organize by Domain

```typescript
// routes/
//   user.ts
//   post.ts
//   comment.ts
//   admin/
//     users.ts
//     analytics.ts
```

### 2. Keep Routers Focused

```typescript
// ✅ Good: One domain per router
const userRouter = router({
  user: {
    get: query()...,
    update: mutation()...,
  },
})

// ❌ Bad: Mixed domains
const mixedRouter = router({
  user: { get: query()... },
  post: { list: query()... },
  comment: { create: mutation()... },
})
```

### 3. Use Consistent Naming

```typescript
// ✅ Good: Consistent verb patterns
const userRouter = router({
  user: {
    get: query()...,      // Single item
    list: query()...,     // Multiple items
    create: mutation()..., // Create
    update: mutation()..., // Update
    delete: mutation()..., // Delete
  },
})
```

### 4. Type Safety

```typescript
// Always export router type
export type AppRouter = typeof appRouter

// Use generic context for type safety
const getUser = query<AppContext>()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // ctx is typed as AppContext
    return ctx.db.user.find(input.id)
  })
```

## Complete Example

```typescript
// server/context.ts
import { PrismaClient } from '@prisma/client'

export interface AppContext {
  db: PrismaClient
  user: { id: string; role: 'user' | 'admin' } | null
}

// server/routes/user.ts
import { router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'
import type { AppContext } from '../context'

export const userRouter = router({
  user: {
    me: query<AppContext>()
      .resolve(({ ctx }) => ctx.user),

    get: query<AppContext>()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) =>
        ctx.db.user.findUnique({ where: { id: input.id } })
      ),

    update: mutation<AppContext>()
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .resolve(({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated')
        return ctx.db.user.update({
          where: { id: ctx.user.id },
          data: input,
        })
      }),
  },
})

// server/routes/index.ts
import { router } from '@sylphx/lens-server'
import { userRouter } from './user'
import { postRouter } from './post'

export const appRouter = router({
  ...userRouter,
  ...postRouter,
})

export type AppRouter = typeof appRouter

// server/index.ts
import { createApp, createHTTPHandler } from '@sylphx/lens-server'
import { appRouter } from './routes'
import type { AppContext } from './context'

const app = createApp({
  router: appRouter,
  context: async (req): Promise<AppContext> => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})

const handler = createHTTPHandler(app)
Bun.serve({ port: 3000, fetch: handler })
```
