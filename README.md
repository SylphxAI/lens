# Lens

> **Type-Safe API Framework for TypeScript**

End-to-end type safety from server to client. Like tRPC, but with real-time subscriptions, optimistic updates, and multi-server support built-in.

```typescript
// Server: Define your API
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

// Client: Full type inference
const user = await client.user.get({ id: '123' })
//    ^? { id: string, name: string, email: string }
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

// Define your API routes
export const appRouter = router({
  greeting: query()
    .input(z.object({ name: z.string() }))
    .resolve(({ input }) => `Hello, ${input.name}!`),

  user: {
    list: query()
      .resolve(() => db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } })),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create({ data: input })),
  },
})

// Export the type for client usage
export type AppRouter = typeof appRouter

// Create and start server
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

// Use it anywhere
const greeting = await client.greeting({ name: 'World' })
// => "Hello, World!"

const users = await client.user.list()
const user = await client.user.get({ id: '123' })
await client.user.create({ name: 'John', email: 'john@example.com' })
```

### 3. Use with React (or other frameworks)

```tsx
// components/UserList.tsx
import { useQuery, useMutation } from '@sylphx/lens-react'
import { client } from '../client/api'

function UserList() {
  const { data: users, loading, refetch } = useQuery(client.user.list())
  const { mutate: createUser } = useMutation(client.user.create)

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {users.map(user => <div key={user.id}>{user.name}</div>)}
      <button onClick={() => createUser({ name: 'New User', email: 'new@example.com' }).then(refetch)}>
        Add User
      </button>
    </div>
  )
}
```

---

## Meta-Framework Integrations

For full-stack frameworks like Next.js, Nuxt, SolidStart, and Fresh, Lens provides unified setup that handles both server and client in one place.

### Next.js

```typescript
// lib/lens.ts
import { createLensNext } from '@sylphx/lens-next'
import { appRouter } from './router'
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
// app/providers.tsx
'use client'
import { lens } from '@/lib/lens'

export function Providers({ children }) {
  return <lens.Provider>{children}</lens.Provider>
}
```

```tsx
// app/users/page.tsx (Server Component)
import { lens } from '@/lib/lens'

export default async function UsersPage() {
  // Direct server execution - no HTTP overhead
  const users = await lens.serverClient.user.list()
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

```tsx
// components/UserProfile.tsx (Client Component)
'use client'
import { lens } from '@/lib/lens'

export function UserProfile({ userId }) {
  const { data, loading } = lens.useQuery(c => c.user.get({ id: userId }))
  if (loading) return <div>Loading...</div>
  return <h1>{data?.name}</h1>
}
```

### Nuxt 3

```typescript
// server/lens.ts
import { createLensNuxt } from '@sylphx/lens-nuxt'
import { appRouter } from './router'
import { createServer } from '@sylphx/lens-server'

const server = createServer({ router: appRouter })
export const lens = createLensNuxt({ server })
```

```typescript
// server/api/lens/[...path].ts
import { lens } from '../lens'
export default defineEventHandler(lens.handler)
```

```typescript
// plugins/lens.ts
import { lens } from '~/server/lens'
export default defineNuxtPlugin(() => lens.plugin())
```

```vue
<!-- pages/users.vue -->
<script setup>
import { lens } from '~/server/lens'
const { data, pending } = await lens.useQuery('users', c => c.user.list())
</script>

<template>
  <div v-if="pending">Loading...</div>
  <ul v-else>
    <li v-for="user in data" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

### SolidStart

```typescript
// lib/lens.ts
import { createLensSolidStart } from '@sylphx/lens-solidstart'
import { appRouter } from './router'
import { createServer } from '@sylphx/lens-server'

const server = createServer({ router: appRouter })
export const lens = createLensSolidStart({ server })
```

```typescript
// routes/api/lens/[...path].ts
import { lens } from '~/lib/lens'
export const GET = lens.handler
export const POST = lens.handler
```

```tsx
// routes/users.tsx
import { lens } from '~/lib/lens'
import { Suspense, For } from 'solid-js'

export default function UsersPage() {
  const users = lens.createQuery(c => c.user.list())

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <For each={users()}>{user => <div>{user.name}</div>}</For>
    </Suspense>
  )
}
```

### Fresh (Deno/Preact)

```typescript
// lib/lens.ts
import { createLensFresh } from '@sylphx/lens-fresh'
import { appRouter } from './router.ts'
import { createServer } from '@sylphx/lens-server'

const server = createServer({ router: appRouter })
export const lens = createLensFresh({ server })
```

```typescript
// routes/api/lens/[...path].ts
import { lens } from '~/lib/lens.ts'
export const handler = lens.handler
```

```tsx
// routes/users/[id].tsx
import { lens } from '~/lib/lens.ts'
import UserProfile from '~/islands/UserProfile.tsx'

export const handler: Handlers = {
  async GET(_, ctx) {
    const user = await lens.serverClient.user.get({ id: ctx.params.id })
    return ctx.render({ user: lens.serialize(user) })
  },
}

export default function UserPage({ data }) {
  return <UserProfile initialData={data.user} userId={data.user.data.id} />
}
```

```tsx
// islands/UserProfile.tsx
import { lens } from '~/lib/lens.ts'

export default function UserProfile({ initialData, userId }) {
  const { data } = lens.useIslandQuery(
    c => c.user.get({ id: userId }),
    { initialData }
  )
  return <h1>{data?.name}</h1>
}
```

---

## Core Concepts

### Router & Operations

Lens uses a router to organize your API into namespaces:

```typescript
import { router, query, mutation, subscription } from '@sylphx/lens-server'
import { z } from 'zod'

const appRouter = router({
  // Simple operation
  health: query().resolve(() => ({ status: 'ok' })),

  // Nested namespace
  user: {
    list: query().resolve(() => db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } })),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create({ data: input })),

    // Real-time subscription
    onChange: subscription()
      .resolve(({ emit }) => {
        const unsubscribe = db.user.onChange(user => emit(user))
        return () => unsubscribe()
      }),
  },

  // Deeply nested
  admin: {
    settings: {
      get: query().resolve(() => getSettings()),
      update: mutation()
        .input(z.object({ key: z.string(), value: z.any() }))
        .resolve(({ input }) => updateSetting(input)),
    },
  },
})
```

### Transport System

Transports define how client communicates with server:

```typescript
import { createClient, http, ws, route } from '@sylphx/lens-client'

// Simple HTTP
const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// WebSocket for real-time
const client = createClient<AppRouter>({
  transport: ws({ url: 'ws://localhost:3000/ws' }),
})

// Route to different servers
const client = createClient<AppRouter>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/api' }),
  }),
})
```

### Context

Pass request-specific data to your resolvers:

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

### Optimistic Updates

Mutations can define optimistic behavior:

```typescript
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .optimistic('merge')  // Immediately merge input into cache
  .resolve(({ input }) => db.user.update({ where: { id: input.id }, data: input }))

// Client automatically applies optimistic update, rollback on error
await client.user.update({ id: '123', name: 'New Name' })
```

---

## Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | ✅ | Codegen | ❌ | ✅ |
| Code-first | ✅ | SDL | ✅ | ✅ |
| Subscriptions | Manual | ✅ | Manual | ✅ |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |
| Codegen Required | No | Yes | No | **No** |

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
