# Context

Context provides request-scoped data to all resolvers. It's created once per request and available throughout the request lifecycle.

## Basic Context

```typescript
import { createApp } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  context: () => ({
    db: prisma,
  }),
})
```

## Async Context

Context can be async to fetch user info from requests:

```typescript
const app = createApp({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

## Context Type Definition

Define a type for your context:

```typescript
// context.ts
import { PrismaClient } from '@prisma/client'

export interface AppContext {
  db: PrismaClient
  user: {
    id: string
    role: 'user' | 'admin'
  } | null
  requestId: string
}

export const createContext = async (req: Request): Promise<AppContext> => ({
  db: prisma,
  user: await getUserFromRequest(req),
  requestId: crypto.randomUUID(),
})
```

```typescript
// app.ts
import { createApp } from '@sylphx/lens-server'
import { createContext, type AppContext } from './context'

const app = createApp({
  router: appRouter,
  context: createContext,
})
```

## Using Context in Operations

Context is available in all resolvers:

```typescript
const getUser = query<AppContext>()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // ctx is typed as AppContext
    return ctx.db.user.findUnique({ where: { id: input.id } })
  })
```

## Using Context in Models

Pass context type to model:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  posts: t.many(() => Post).resolve(({ parent, ctx }) => {
    // ctx is typed as AppContext
    return ctx.db.post.findMany({ where: { authorId: parent.id } })
  }),
}))
```

## Authentication

Common pattern for authentication:

```typescript
// context.ts
export interface AppContext {
  db: PrismaClient
  user: User | null
}

export const createContext = async (req: Request): Promise<AppContext> => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  let user = null

  if (token) {
    try {
      const payload = await verifyToken(token)
      user = await prisma.user.findUnique({ where: { id: payload.userId } })
    } catch {
      // Invalid token - user stays null
    }
  }

  return { db: prisma, user }
}
```

```typescript
// operations.ts
const getMyProfile = query<AppContext>()
  .resolve(({ ctx }) => {
    if (!ctx.user) {
      throw new Error('Not authenticated')
    }
    return ctx.user
  })

const adminOnlyOperation = mutation<AppContext>()
  .resolve(({ ctx }) => {
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new Error('Admin access required')
    }
    // ... admin logic
  })
```

## DataLoaders

Add DataLoaders to context for batching:

```typescript
import DataLoader from 'dataloader'

export interface AppContext {
  db: PrismaClient
  loaders: {
    user: DataLoader<string, User | null>
    postsByAuthor: DataLoader<string, Post[]>
  }
}

export const createContext = async (req: Request): Promise<AppContext> => {
  const db = prisma

  return {
    db,
    loaders: {
      user: new DataLoader(async (ids) => {
        const users = await db.user.findMany({
          where: { id: { in: [...ids] } },
        })
        return ids.map(id => users.find(u => u.id === id) ?? null)
      }),

      postsByAuthor: new DataLoader(async (authorIds) => {
        const posts = await db.post.findMany({
          where: { authorId: { in: [...authorIds] } },
        })
        return authorIds.map(id => posts.filter(p => p.authorId === id))
      }),
    },
  }
}
```

```typescript
// Using loaders
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.loaders.postsByAuthor.load(parent.id)
  ),
}))
```

## Request Info

Include request information in context:

```typescript
export interface AppContext {
  db: PrismaClient
  request: {
    ip: string
    userAgent: string
    requestId: string
  }
}

export const createContext = async (req: Request): Promise<AppContext> => ({
  db: prisma,
  request: {
    ip: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    requestId: crypto.randomUUID(),
  },
})
```

## Services

Inject services into context:

```typescript
export interface AppContext {
  db: PrismaClient
  services: {
    email: EmailService
    storage: StorageService
    analytics: AnalyticsService
  }
}

export const createContext = async (req: Request): Promise<AppContext> => ({
  db: prisma,
  services: {
    email: new EmailService(),
    storage: new StorageService(),
    analytics: new AnalyticsService(),
  },
})
```

```typescript
const sendNotification = mutation<AppContext>()
  .input(z.object({ userId: z.string(), message: z.string() }))
  .resolve(async ({ input, ctx }) => {
    const user = await ctx.db.user.findUnique({ where: { id: input.userId } })
    if (user) {
      await ctx.services.email.send(user.email, input.message)
    }
  })
```

## PubSub

Add pubsub for real-time features:

```typescript
import { PubSub } from './pubsub'

export interface AppContext {
  db: PrismaClient
  pubsub: PubSub
}

const pubsub = new PubSub()

export const createContext = async (req: Request): Promise<AppContext> => ({
  db: prisma,
  pubsub,
})
```

```typescript
// Subscribe to events
const User = model<AppContext>('User', (t) => ({
  status: t.string()
    .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`user:${parent.id}:status`, emit)
      onCleanup(unsub)
    }),
}))

// Publish events
const updateStatus = mutation<AppContext>()
  .input(z.object({ status: z.string() }))
  .resolve(async ({ input, ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.user.id },
      data: { status: input.status },
    })
    ctx.pubsub.emit(`user:${ctx.user.id}:status`, input.status)
  })
```

## Best Practices

### 1. Type Your Context

```typescript
// ✅ Good: Explicit type
interface AppContext {
  db: PrismaClient
  user: User | null
}

query<AppContext>().resolve(({ ctx }) => {
  // ctx is typed
})

// ❌ Bad: No type
query().resolve(({ ctx }) => {
  // ctx is any
})
```

### 2. Create Context Factory

```typescript
// ✅ Good: Factory function
export const createContext = async (req: Request): Promise<AppContext> => ({
  // ...
})

// ❌ Bad: Inline
createApp({
  context: async (req) => {
    // Complex logic inline
  },
})
```

### 3. Use DataLoaders for Relations

```typescript
// ✅ Good: Batched with DataLoader
posts: t.many(() => Post).resolve(({ parent, ctx }) =>
  ctx.loaders.postsByAuthor.load(parent.id)
)

// ⚠️ Less efficient: Individual queries
posts: t.many(() => Post).resolve(({ parent, ctx }) =>
  ctx.db.post.findMany({ where: { authorId: parent.id } })
)
```

### 4. Keep Context Lightweight

```typescript
// ✅ Good: Create loaders per-request
export const createContext = async (req: Request) => ({
  loaders: createLoaders(prisma),
})

// ❌ Bad: Heavy initialization
export const createContext = async (req: Request) => ({
  allUsers: await prisma.user.findMany(), // Don't preload data
})
```
