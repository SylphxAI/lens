# Lens

> **Type-Safe Reactive API Framework for TypeScript**

End-to-end type safety from server to client. Like tRPC, but with **automatic live queries**, **optimistic updates**, and **multi-server support** built-in.

## What Lens Does

Lens lets you define type-safe API operations on the server that clients can call with full TypeScript inference. **Every query automatically supports subscriptions** - clients can subscribe to any query and receive updates when data changes. The server automatically computes and sends **only the changed fields** (minimal diff).

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

**Key features:**
- 🔄 **Automatic Live Queries** - Any query can be subscribed to
- 📡 **Minimal Diff Updates** - Server only sends changed fields
- 🎯 **Field Selection** - Subscribe to specific fields only
- ⚡ **Optimistic Updates** - Instant UI feedback with automatic rollback
- 🌐 **Multi-Server Routing** - Route to different backends with full type safety
- 🔌 **Plugin System** - Extensible request/response processing

---

## How Live Queries Work

When a client subscribes to a query, the server:

1. Executes the resolver and sends initial data
2. Tracks which entities/fields the client is watching
3. When data changes, computes and sends **only the changed fields**

```
┌─────────┐                      ┌─────────┐
│ Client  │                      │ Server  │
└────┬────┘                      └────┬────┘
     │                                │
     │  Subscribe: user.get({id:'1'}) │
     │ ─────────────────────────────> │
     │                                │
     │  Full data: {id,name,email}    │
     │ <───────────────────────────── │
     │                                │
     │  Diff: {name:'New Name'}       │  ← Only changed field!
     │ <───────────────────────────── │
```

---

## Resolver Patterns

Lens supports three ways to produce data in resolvers. **All patterns support live subscriptions.**

### 1. Single Return (Standard)

Most common pattern - returns a value once:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
```

### 2. Push Updates with `ctx.emit()`

For fine-grained control over when updates are sent:

```typescript
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // Subscribe to external data source
    const unsubscribe = db.user.onChange(input.id, (user) => {
      ctx.emit(user)  // Push update to subscribed clients
    })

    // Cleanup when client disconnects
    ctx.onCleanup(unsubscribe)

    // Return initial data
    return db.user.find(input.id)
  })
```

### 3. Streaming with `yield`

For streaming multiple values (pagination, feeds, AI responses):

```typescript
const streamMessages = query()
  .resolve(async function* ({ ctx }) {
    for await (const message of ctx.ai.stream()) {
      yield message  // Stream each value to client
    }
  })
```

---

## Installation

```bash
# Core packages
npm install @sylphx/lens-server @sylphx/lens-client

# Framework adapters (pick one)
npm install @sylphx/lens-react    # React
npm install @sylphx/lens-vue      # Vue
npm install @sylphx/lens-solid    # SolidJS
npm install @sylphx/lens-svelte   # Svelte
npm install @sylphx/lens-preact   # Preact

# Meta-framework integrations (optional)
npm install @sylphx/lens-next       # Next.js
npm install @sylphx/lens-nuxt       # Nuxt 3
npm install @sylphx/lens-solidstart # SolidStart
npm install @sylphx/lens-fresh      # Fresh (Deno)
```

---

## Quick Start

### 1. Define Your Server

```typescript
// server/api.ts
import { createServer, router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

export const appRouter = router({
  user: {
    list: query()
      .resolve(({ ctx }) => ctx.db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } })),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.create({ data: input })),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string().optional() }))
      .resolve(({ input, ctx }) => ctx.db.user.update({ where: { id: input.id }, data: input })),
  },
})

export type AppRouter = typeof appRouter

export const server = createServer({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

### 2. Create Your Client

```typescript
// client/api.ts
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/api'

// Sync creation - connection is lazy (on first operation)
export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// One-time query (await)
const user = await client.user.get({ id: '123' })

// Live subscription
const unsubscribe = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('Current user:', user)
})

// Mutations trigger updates to all subscribers
await client.user.update({ id: '123', name: 'New Name' })
// ^ All subscribers receive the update

// Cleanup
unsubscribe()
```

### 3. Use with React

```tsx
import { useQuery, useMutation } from '@sylphx/lens-react'
import { client } from './api'

function UserProfile({ userId }: { userId: string }) {
  // Automatically subscribes and receives live updates
  const { data: user, loading, error } = useQuery(client.user.get({ id: userId }))

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{user?.name}</h1>
}

function UpdateUser({ userId }: { userId: string }) {
  const { mutate, loading } = useMutation(client.user.update)

  return (
    <button
      disabled={loading}
      onClick={() => mutate({ id: userId, name: 'New Name' })}
    >
      Update
    </button>
  )
}
```

---

## Field Selection

Subscribe to only the fields you need. The server tracks and sends minimal updates:

```typescript
// Select specific fields
client.user.get({ id: '123' })
  .select({ name: true, email: true })
  .subscribe((user) => {
    // Only receives updates when name or email changes
  })

// Nested selection for relations
client.user.get({ id: '123' })
  .select({
    name: true,
    posts: { select: { title: true, author: true } }
  })
  .subscribe((user) => {
    // Receives updates for user.name or any post's title/author
  })
```

---

## Transport System

### HTTP Transport

Default transport - uses HTTP for queries/mutations, polling for subscriptions:

```typescript
import { createClient, http } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})
```

### WebSocket Transport

All operations over WebSocket - best for real-time apps:

```typescript
import { createClient, ws } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: ws({
    url: 'ws://localhost:3000/ws',
    reconnect: { enabled: true, maxAttempts: 10 },
  }),
})
```

### Multi-Server Routing

Route operations to different backends based on path patterns:

```typescript
import { createClient, http, route } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/api' }),  // fallback
  }),
})

// Routes automatically:
await client.auth.login({ ... })      // → /auth-api
await client.analytics.track({ ... }) // → /analytics-api
await client.user.get({ ... })        // → /api
```

### Route by Operation Type

```typescript
import { createClient, http, ws, routeByType } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: routeByType({
    default: http({ url: '/api' }),
    subscription: ws({ url: 'ws://localhost:3000/ws' }),
  }),
})
```

---

## Optimistic Updates

Mutations can define optimistic behavior for instant UI feedback:

```typescript
// Server: Define optimistic strategy
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .optimistic('merge')  // Instantly merge input into local state
  .resolve(({ input, ctx }) => ctx.db.user.update({
    where: { id: input.id },
    data: input
  }))

// Client: UI updates instantly, rolls back on error
await client.user.update({ id: '123', name: 'New Name' })
```

Optimistic strategies:
- `'merge'` - Merge input into existing entity (auto-derived from `updateX` naming)
- `'create'` - Create with temporary ID (auto-derived from `createX` naming)
- `'delete'` - Mark entity as deleted (auto-derived from `deleteX` naming)
- `{ merge: { field: value } }` - Merge with additional fields

---

## Plugin System

Extend client behavior with plugins:

```typescript
import { createClient, http } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    // Auth plugin
    {
      name: 'auth',
      beforeRequest: async (op) => {
        op.meta = {
          ...op.meta,
          headers: { Authorization: `Bearer ${getToken()}` }
        }
        return op
      },
    },
    // Logger plugin
    {
      name: 'logger',
      beforeRequest: (op) => {
        console.log('→', op.path, op.input)
        return op
      },
      afterResponse: (result, op) => {
        console.log('←', op.path, result.data ?? result.error)
        return result
      },
    },
    // Retry plugin
    {
      name: 'retry',
      onError: async (error, op, retry) => {
        if (op.meta?.retryCount ?? 0 < 3) {
          op.meta = { ...op.meta, retryCount: (op.meta?.retryCount ?? 0) + 1 }
          return retry()
        }
        throw error
      },
    },
  ],
})
```

---

## Meta-Framework Integrations

### Next.js

```typescript
// lib/lens.ts
import { createLensNext } from '@sylphx/lens-next'
import { server } from './server'

export const lens = createLensNext({ server })
```

```typescript
// app/api/lens/[...path]/route.ts
import { lens } from '@/lib/lens'
export const GET = lens.handler
export const POST = lens.handler
```

```tsx
// Server Component - direct execution, no HTTP
export default async function UsersPage() {
  const users = await lens.serverClient.user.list()
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

```tsx
// Client Component - live updates
'use client'
export function UserProfile({ userId }: { userId: string }) {
  const { data, loading } = lens.useQuery(c => c.user.get({ id: userId }))
  return <h1>{data?.name}</h1>
}
```

### Nuxt 3

```typescript
// server/lens.ts
import { createLensNuxt } from '@sylphx/lens-nuxt'
export const lens = createLensNuxt({ server })
```

```vue
<script setup>
const { data } = await lens.useQuery('user', c => c.user.get({ id: '123' }))
</script>
<template>
  <h1>{{ data?.name }}</h1>
</template>
```

### SolidStart

```typescript
// lib/lens.ts
import { createLensSolidStart } from '@sylphx/lens-solidstart'
export const lens = createLensSolidStart({ server })
```

```tsx
export default function UserProfile() {
  const user = lens.createQuery(c => c.user.get({ id: '123' }))
  return <h1>{user()?.name}</h1>
}
```

---

## Context

Pass request-specific data to resolvers:

```typescript
const server = createServer({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromToken(req.headers.authorization),
  }),
})

// Access in resolver
const getMe = query().resolve(({ ctx }) => ctx.user)
```

---

## Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | ✅ | Codegen | ❌ | ✅ |
| Code-first | ✅ | SDL | ✅ | ✅ |
| Live Subscriptions | ❌ | Subscriptions | ❌ | ✅ Auto |
| Minimal Diff Updates | ❌ | ❌ | ❌ | ✅ |
| Field Selection | ❌ | ✅ | ❌ | ✅ |
| Streaming | ✅ | ❌ | ❌ | ✅ |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |
| Plugin System | Links | ❌ | ❌ | ✅ Hooks |

---

## Packages

| Package | Description |
|---------|-------------|
| `@sylphx/lens-server` | Server, router, operations |
| `@sylphx/lens-client` | Client, transports, plugins |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-svelte` | Svelte stores |
| `@sylphx/lens-preact` | Preact hooks + signals |
| `@sylphx/lens-next` | Next.js integration |
| `@sylphx/lens-nuxt` | Nuxt 3 integration |
| `@sylphx/lens-solidstart` | SolidStart integration |
| `@sylphx/lens-fresh` | Fresh (Deno) integration |

---

## License

MIT © Sylphx AI
