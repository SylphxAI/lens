# Lens

> **Type-Safe Reactive API Framework for TypeScript**

End-to-end type safety from server to client. Like tRPC, but with **automatic live queries**, **optimistic updates**, and **multi-server support** built-in.

## What Lens Does

Lens lets you define type-safe API operations on the server that clients can call with full TypeScript inference. **Every query is automatically a live query** - clients can subscribe to any query and receive updates when the data changes.

```typescript
// Server: Define your API (just like tRPC)
const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.find(input.id)),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create(input)),
  },
})

// Client: One-time fetch (like REST/tRPC)
const user = await client.user.get({ id: '123' })

// Client: Live subscription - automatically receives updates!
client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)  // Called on every change
})
```

**Key features:**
- 🔄 **Automatic Live Queries** - Any query can be subscribed to
- 📡 **Minimal Data Transfer** - Server only sends changed fields (automatic diff)
- 🎯 **Field Selection** - Subscribe to specific fields only
- ⚡ **Optimistic Updates** - Instant UI feedback with automatic rollback
- 🌐 **Multi-Server** - Route to different backends with full type safety

---

## How Live Queries Work

Every Lens query is automatically "live". When a client subscribes, Lens:

1. Executes the resolver and sends initial data
2. Tracks which entities/fields the client is watching
3. When data changes, automatically sends **only the changed fields** (diff)

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
     │                                │
     │  Diff: {email:'new@mail.com'}  │  ← Only changed field!
     │ <───────────────────────────── │
```

**The server automatically:**
- Tracks entity state across all subscriptions
- Computes minimal diff between old and new values
- Only sends fields that actually changed
- Batches updates for efficiency

---

## Resolver Patterns

Lens supports three ways to produce data in resolvers. **All patterns support live queries automatically.**

### 1. Single Return (Standard)

Most common pattern - returns a value once:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input }) => db.user.find(input.id))
```

When subscribed, the resolver re-executes when relevant data changes.

### 2. Push Updates with `ctx.emit`

For fine-grained control, push updates manually:

```typescript
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // Subscribe to external data source
    const unsubscribe = db.user.onChange(input.id, (user) => {
      ctx.emit(user)  // Push update to client
    })
    ctx.onCleanup(unsubscribe)  // Cleanup on disconnect

    return db.user.find(input.id)  // Initial data
  })
```

### 3. Streaming with `yield`

For streaming multiple values (pagination, feeds, AI responses):

```typescript
const streamUsers = query()
  .resolve(async function* () {
    for await (const user of db.user.cursor()) {
      yield user  // Stream each value
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
      .resolve(() => db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } })),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create({ data: input })),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string().optional() }))
      .resolve(({ input }) => db.user.update({ where: { id: input.id }, data: input })),
  },
})

export type AppRouter = typeof appRouter
export const server = createServer({ router: appRouter })
```

### 2. Create Your Client

```typescript
// client/api.ts
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/api'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// One-time query
const user = await client.user.get({ id: '123' })

// Live subscription - receives all updates automatically
const subscription = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('Current user:', user)
})

// Update triggers automatic push to all subscribers
await client.user.update({ id: '123', name: 'New Name' })
// ^ All subscribers instantly receive: { name: 'New Name' }

// Cleanup
subscription.unsubscribe()
```

### 3. Use with React

```tsx
import { useQuery, useMutation } from '@sylphx/lens-react'
import { client } from '../client/api'

function UserProfile({ userId }) {
  // Automatically subscribes - receives live updates!
  const { data, loading, error } = useQuery(client.user.get({ id: userId }))

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{data?.name}</h1>  // Auto-updates when name changes
}

function UpdateUser({ userId }) {
  const { mutate, loading } = useMutation(client.user.update)

  const handleClick = () => {
    // This triggers update to ALL components watching this user
    mutate({ id: userId, name: 'New Name' })
  }

  return <button disabled={loading} onClick={handleClick}>Update</button>
}
```

---

## Field Selection

Subscribe to only the fields you need - server tracks and sends minimal updates:

```typescript
// Only subscribe to specific fields
client.user.get({ id: '123' })
  .select({ name: true, email: true })
  .subscribe((user) => {
    // Only receives updates when 'name' or 'email' changes
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

## Meta-Framework Integrations

For full-stack frameworks, Lens provides unified setup:

### Next.js

```typescript
// lib/lens.ts
import { createLensNext } from '@sylphx/lens-next'
import { createServer } from '@sylphx/lens-server'

const server = createServer({ router: appRouter })
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
export function UserProfile({ userId }) {
  const { data, loading } = lens.useQuery(c => c.user.get({ id: userId }))
  return <h1>{data?.name}</h1>  // Auto-updates!
}
```

### Nuxt 3

```typescript
// server/lens.ts
import { createLensNuxt } from '@sylphx/lens-nuxt'
const server = createServer({ router: appRouter })
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
const server = createServer({ router: appRouter })
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

## Transport System

```typescript
import { createClient, http, ws, route } from '@sylphx/lens-client'

// HTTP (queries via GET, mutations via POST, subscriptions via SSE)
const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// WebSocket (all operations, best for real-time)
const client = createClient<AppRouter>({
  transport: ws({ url: 'ws://localhost:3000/ws' }),
})

// Route to multiple servers
const client = createClient<AppRouter>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/api' }),
  }),
})
```

---

## Optimistic Updates

Mutations can define optimistic behavior for instant UI:

```typescript
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .optimistic('merge')  // Instantly merge input into local state
  .resolve(({ input }) => db.user.update({ where: { id: input.id }, data: input }))

// UI updates instantly, rolls back on error
await client.user.update({ id: '123', name: 'New Name' })
```

---

## Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | ✅ | Codegen | ❌ | ✅ |
| Code-first | ✅ | SDL | ✅ | ✅ |
| Auto Live Queries | ❌ | ❌ | ❌ | ✅ |
| Minimal Diff Updates | ❌ | ❌ | ❌ | ✅ |
| Field Selection | ❌ | ✅ | ❌ | ✅ |
| Streaming | ❌ | ❌ | ❌ | ✅ |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |

---

## Packages

| Package | Description |
|---------|-------------|
| `@sylphx/lens-server` | Server, router, operations |
| `@sylphx/lens-client` | Client, transports |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-svelte` | Svelte stores |
| `@sylphx/lens-next` | Next.js integration |
| `@sylphx/lens-nuxt` | Nuxt 3 integration |
| `@sylphx/lens-solidstart` | SolidStart integration |
| `@sylphx/lens-fresh` | Fresh (Deno) integration |

---

## License

MIT © Sylphx AI
