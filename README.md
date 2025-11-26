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

## Mental Model: How Lens Differs

### ❌ Traditional Approach (tRPC, GraphQL, REST)

```typescript
// Define separate endpoints for different access patterns
const getUser = query(...)           // One-time fetch
const subscribeUser = subscription(...)  // Real-time updates (separate!)
const streamChat = subscription(...)     // Streaming (yet another!)

// Client must choose which to call
const user = await trpc.getUser({ id })           // One-time
trpc.subscribeUser({ id }).subscribe(callback)    // Real-time
```

**Problems:**
- Duplicate logic between query and subscription
- Must decide upfront: "Will this need real-time?"
- Streaming requires different API pattern

### ✅ Lens Approach: Unified Query Model

```typescript
// Define ONCE - works for all access patterns
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))

// Client chooses access pattern at call site
const user = await client.user.get({ id })              // One-time fetch
client.user.get({ id }).subscribe(callback)             // Live updates!
client.user.get({ id }).select({ name: true }).subscribe(callback)  // Partial live updates!
```

**Key insight:** Every query is automatically a subscription. The server tracks state and pushes diffs.

### The Three Data Patterns

| Pattern | Server Code | Client Gets | Use Case |
|---------|-------------|-------------|----------|
| **Return** | `return data` | Initial data, then diffs when data changes | Database queries, computed values |
| **Emit** | `emit(data)` | Updates whenever you call emit | External subscriptions, webhooks, real-time feeds |
| **Yield** | `yield* stream` | Each yielded value in sequence | AI streaming, pagination, file processing |

All three patterns work with `.subscribe()` on the client!

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

### 2. Push Updates with `emit`

For fine-grained control over when updates are sent:

```typescript
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx, emit, onCleanup }) => {
    // Subscribe to external data source
    const unsubscribe = db.user.onChange(input.id, (user) => {
      emit(user)  // Push update to subscribed clients
    })

    // Cleanup when client disconnects
    onCleanup(unsubscribe)

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

## Emit API

The `emit` parameter provides type-safe methods for pushing state updates to subscribed clients. The available methods depend on your output type.

### Object Outputs

For single entity or multi-entity object outputs (`.returns(User)` or `.returns({ user: User, posts: [Post] })`):

```typescript
resolve(({ input, ctx, emit, onCleanup }) => {
  // Full data update (merge mode)
  emit({ title: "Hello", content: "World" })

  // Merge partial update
  emit.merge({ title: "Updated" })

  // Replace entire state
  emit.replace({ title: "New", content: "Fresh" })

  // Set single field (type-safe)
  emit.set("title", "New Title")

  // Delta for string fields (e.g., LLM streaming)
  emit.delta("content", [{ position: 0, insert: "Hello " }])

  // JSON Patch for object fields
  emit.patch("metadata", [{ op: "add", path: "/views", value: 100 }])

  // Batch multiple updates
  emit.batch([
    { field: "title", strategy: "value", data: "New" },
    { field: "content", strategy: "delta", data: [{ position: 0, insert: "!" }] },
  ])

  return initialData
})
```

### Array Outputs

For array outputs (`.returns([User])`):

```typescript
resolve(({ input, ctx, emit, onCleanup }) => {
  // Replace entire array
  emit([user1, user2])
  emit.replace([user1, user2])

  // Add items
  emit.push(newUser)           // Append to end
  emit.unshift(newUser)        // Prepend to start
  emit.insert(1, newUser)      // Insert at index

  // Remove items
  emit.remove(0)               // Remove by index
  emit.removeById("user-123")  // Remove by id field

  // Update items
  emit.update(1, updatedUser)              // Update at index
  emit.updateById("user-123", updatedUser) // Update by id

  // Merge partial data into items
  emit.merge(0, { name: "Updated" })            // Merge at index
  emit.mergeById("user-123", { name: "Updated" }) // Merge by id

  return initialUsers
})
```

### LLM Streaming Example

```typescript
const chat = query()
  .input(z.object({ prompt: z.string() }))
  .resolve(async ({ input, ctx, emit, onCleanup }) => {
    const stream = ctx.ai.stream(input.prompt)

    stream.on("token", (token) => {
      // Efficiently append to content field
      emit.delta("content", [{ position: Infinity, insert: token }])
    })

    onCleanup(() => stream.close())

    return { content: "" }  // Initial empty state
  })
```

---

## Update Strategies

The server automatically selects optimal transfer strategies:

| Strategy | Use Case | Data Type |
|----------|----------|-----------|
| `value` | Full replacement | Primitives, short strings (<100 chars) |
| `delta` | Character-level diff | Long strings (≥100 chars), ~57% savings |
| `patch` | JSON Patch RFC 6902 | Objects (≥50 chars), ~99% savings |

**Note:** The emit API describes HOW business state changed. The server independently decides the optimal transfer strategy per-client based on data characteristics.

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                           LENS SERVER                                 │
│                                                                       │
│  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐   │
│  │   Router    │────>│  GraphStateManager│────>│  Transport      │   │
│  │  (resolvers)│     │  (canonical state)│     │  (WS/HTTP)      │   │
│  └─────────────┘     └──────────────────┘     └─────────────────┘   │
│        │                      │                        │             │
│        │ emit()               │ per-client             │ send()      │
│        │ return               │ state tracking         │             │
│        v                      v                        v             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    State Synchronization                     │    │
│  │  1. Resolver emits business state change                    │    │
│  │  2. GraphStateManager updates canonical state               │    │
│  │  3. Computes diff per-client (based on their last state)    │    │
│  │  4. Selects optimal transfer strategy (value/delta/patch)   │    │
│  │  5. Sends minimal update to each subscribed client          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Minimal diff updates
                                  v
┌──────────────────────────────────────────────────────────────────────┐
│                           LENS CLIENT                                 │
│                                                                       │
│  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐   │
│  │  Transport  │────>│   State Store    │────>│  UI Bindings    │   │
│  │  (WS/HTTP)  │     │  (apply updates) │     │  (React/Vue/...)│   │
│  └─────────────┘     └──────────────────┘     └─────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### GraphStateManager

The core orchestration layer that makes live queries work:

```typescript
// Internal: What happens when a resolver emits
class GraphStateManager {
  // Server truth - one canonical state per entity
  canonical: Map<EntityKey, Record<string, unknown>>

  // Per-client tracking - each client has their own "last known state"
  clientStates: Map<ClientId, Map<EntityKey, {
    lastState: Record<string, unknown>
    fields: Set<string> | "*"  // subscribed fields
  }>>

  // When resolver calls emit():
  emit(entity, id, data) {
    // 1. Update canonical state
    this.canonical.set(key, { ...current, ...data })

    // 2. For each subscribed client:
    for (const client of subscribers) {
      // 3. Compute diff from their last known state
      const diff = computeDiff(client.lastState, newState)

      // 4. Select optimal strategy per field
      const updates = {}
      for (const [field, value] of diff) {
        updates[field] = selectStrategy(oldValue, newValue)
        // → "value" for primitives
        // → "delta" for long strings (character-level diff)
        // → "patch" for objects (JSON Patch)
      }

      // 5. Send minimal update
      client.send({ entity, id, updates })

      // 6. Update client's last known state
      client.lastState = newState
    }
  }
}
```

### Two-Layer Design

**Layer 1: Business Logic (Resolver Author)**
- `emit()` describes what changed in your domain
- You don't care about transfer efficiency
- Focus on business semantics

```typescript
// Resolver author thinks: "user's name changed"
emit.set("name", "Alice")

// Or: "append this token to content"
emit.delta("content", [{ position: Infinity, insert: token }])
```

**Layer 2: Transfer Optimization (Lens Server)**
- Independently decides HOW to send each update
- Considers: old value, new value, data size, client state
- Selects: value (replace), delta (string diff), or patch (JSON Patch)

```typescript
// Lens server thinks: "content is 5KB string, only 10 chars changed"
// → Uses delta strategy, sends ~50 bytes instead of 5KB

// Or: "metadata object changed 1 field out of 20"
// → Uses patch strategy, sends [{ op: "replace", path: "/views", value: 101 }]
```

### How Mutations Trigger Live Updates

```
Client A                    Server                     Client B
   │                          │                           │
   │  mutation: updateUser    │                           │
   │ ─────────────────────────>                           │
   │                          │                           │
   │                    ┌─────┴─────┐                     │
   │                    │  Resolver │                     │
   │                    │  executes │                     │
   │                    │  + emit() │                     │
   │                    └─────┬─────┘                     │
   │                          │                           │
   │                    ┌─────┴─────┐                     │
   │                    │  GraphState                     │
   │                    │  Manager  │                     │
   │                    └─────┬─────┘                     │
   │                          │                           │
   │  mutation result         │    live update (diff)     │
   │ <─────────────────────────────────────────────────────>
   │                          │                           │
```

The mutation resolver either:
1. **Returns data** → Lens extracts entity and emits to GraphStateManager
2. **Calls emit()** → Directly updates GraphStateManager

All clients subscribed to affected entities receive updates automatically.

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

### Typed Context with `initLens`

For full type safety across your project, use the tRPC-style `initLens` pattern:

```typescript
// lib/lens.ts - Define once, use everywhere
import { initLens } from '@sylphx/lens-core'
import type { PrismaClient } from '@prisma/client'

// Define your context type
interface Context {
  db: PrismaClient
  user: { id: string; role: 'admin' | 'user' } | null
}

// Create typed lens instance
export const lens = initLens.context<Context>().create()
```

```typescript
// routes/user.ts - ctx is fully typed!
import { lens } from '../lib/lens'
import { z } from 'zod'

export const getUser = lens.query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // ctx.db is typed as PrismaClient
    // ctx.user is typed as { id: string; role: 'admin' | 'user' } | null
    return ctx.db.user.findUnique({ where: { id: input.id } })
  })

export const createUser = lens.mutation()
  .input(z.object({ name: z.string(), email: z.string() }))
  .resolve(({ input, ctx }) => {
    if (ctx.user?.role !== 'admin') throw new Error('Unauthorized')
    return ctx.db.user.create({ data: input })
  })
```

```typescript
// server.ts - Wire up the context
import { createServer, router } from '@sylphx/lens-server'
import * as userRoutes from './routes/user'

export const server = createServer({
  router: router({ user: userRoutes }),
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

This gives you:
- **Full autocomplete** on `ctx` in all resolvers
- **Type errors** when accessing non-existent properties
- **Single source of truth** for context type across your codebase

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

## Common Patterns & Examples

### Real-time Dashboard

```typescript
// Server: Single query serves both initial load AND live updates
const getDashboard = query()
  .resolve(({ ctx, emit, onCleanup }) => {
    // Subscribe to multiple data sources
    const unsubMetrics = ctx.metrics.onChange((metrics) => {
      emit.set("metrics", metrics)
    })
    const unsubAlerts = ctx.alerts.onChange((alerts) => {
      emit.set("alerts", alerts)
    })

    onCleanup(() => {
      unsubMetrics()
      unsubAlerts()
    })

    // Return initial state
    return {
      metrics: ctx.metrics.getCurrent(),
      alerts: ctx.alerts.getCurrent(),
    }
  })

// Client: Subscribe once, receive all updates
client.dashboard.get().subscribe((dashboard) => {
  // Called on initial load
  // Called again whenever metrics OR alerts change
  renderDashboard(dashboard)
})
```

### AI Chat Streaming

```typescript
// Server: Stream tokens as they arrive
const chat = query()
  .input(z.object({ messages: z.array(MessageSchema) }))
  .resolve(async function* ({ input, ctx }) {
    const stream = ctx.openai.chat.completions.create({
      model: "gpt-4",
      messages: input.messages,
      stream: true,
    })

    let content = ""
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ""
      content += token
      yield { role: "assistant", content }
    }
  })

// Client: Receive each token as it streams
client.chat({ messages }).subscribe((response) => {
  // Called for EACH yield
  // response.content grows: "H" → "He" → "Hel" → "Hello" → ...
  setMessages([...messages, response])
})
```

### Collaborative Editing

```typescript
// Server: Multiple users editing same document
const getDocument = query()
  .input(z.object({ docId: z.string() }))
  .resolve(({ input, ctx, emit, onCleanup }) => {
    const docRef = ctx.docs.get(input.docId)

    // Listen for changes from ANY user
    const unsub = docRef.onSnapshot((doc) => {
      emit(doc.data())
    })

    onCleanup(unsub)
    return docRef.get()
  })

const updateDocument = mutation()
  .input(z.object({ docId: z.string(), content: z.string() }))
  .resolve(({ input, ctx }) => {
    // Update triggers onSnapshot above
    // ALL subscribed clients receive the change
    return ctx.docs.update(input.docId, { content: input.content })
  })

// Client A & B: Both subscribe to same document
client.document.get({ docId: "123" }).subscribe((doc) => {
  editor.setContent(doc.content)
})

// When Client A edits:
await client.document.update({ docId: "123", content: newContent })
// → Client A receives update via mutation response
// → Client B receives update via subscription (automatically!)
```

### Paginated List with Live Updates

```typescript
// Server: Return page, but also push new items
const getPosts = query()
  .input(z.object({ cursor: z.string().optional(), limit: z.number() }))
  .resolve(({ input, ctx, emit, onCleanup }) => {
    // Listen for new posts
    const unsub = ctx.posts.onNew((newPost) => {
      emit.unshift(newPost)  // Add to front of array
    })

    onCleanup(unsub)

    // Return paginated results
    return ctx.posts.findMany({
      cursor: input.cursor,
      take: input.limit,
    })
  })

// Client: Load page AND receive new posts in real-time
client.posts.get({ limit: 20 }).subscribe((posts) => {
  // Initial: 20 posts
  // When new post created: 21 posts (new one at front)
  setPosts(posts)
})
```

### Presence / Who's Online

```typescript
// Server: Track active users
const getPresence = query()
  .input(z.object({ roomId: z.string() }))
  .resolve(({ input, ctx, emit, onCleanup }) => {
    const room = ctx.presence.join(input.roomId, ctx.user)

    room.onUpdate((users) => {
      emit(users)
    })

    onCleanup(() => room.leave())

    return room.getUsers()
  })

// Client: See who's online in real-time
client.presence.get({ roomId: "room-1" }).subscribe((users) => {
  // Updates when anyone joins/leaves
  showOnlineUsers(users)
})
```

---

## FAQ

### "Where's the subscription type? How do I define real-time endpoints?"

**You don't need to.** Every query is automatically subscribable.

```typescript
// ❌ Not needed in Lens
const userSubscription = subscription()...

// ✅ Just define a query
const getUser = query().resolve(...)

// Client decides: one-time or live
await client.user.get({ id })           // One-time
client.user.get({ id }).subscribe(...)  // Live
```

### "How do I do streaming like Server-Sent Events?"

Use `yield` in an async generator:

```typescript
// Server
const streamData = query()
  .resolve(async function* ({ ctx }) {
    for await (const item of ctx.dataStream) {
      yield item  // Each yield sends to client
    }
  })

// Client
client.data.stream().subscribe((item) => {
  // Called for each yielded item
})
```

### "What if my data comes from an external source (WebSocket, webhook, etc.)?"

Use `emit` to push updates whenever you want:

```typescript
const watchPrices = query()
  .input(z.object({ symbol: z.string() }))
  .resolve(({ input, ctx, emit, onCleanup }) => {
    // Connect to external WebSocket
    const ws = new WebSocket(`wss://prices.api/${input.symbol}`)

    ws.onmessage = (event) => {
      emit(JSON.parse(event.data))  // Push to Lens clients
    }

    onCleanup(() => ws.close())

    return { price: 0, symbol: input.symbol }
  })
```

### "How do mutations trigger updates to subscribed queries?"

Two ways:

**1. Automatic (via shared data source):**
```typescript
// Query subscribes to database changes
const getUser = query().resolve(({ input, ctx, emit, onCleanup }) => {
  const unsub = ctx.db.user.onChange(input.id, emit)
  onCleanup(unsub)
  return ctx.db.user.find(input.id)
})

// Mutation updates database
const updateUser = mutation().resolve(({ input, ctx }) => {
  return ctx.db.user.update(input)  // Triggers onChange above
})
```

**2. Manual (via shared state manager):**
```typescript
// Both query and mutation use same GraphStateManager
const manager = new GraphStateManager()

const getUser = query().resolve(({ input }) => {
  return manager.getState("User", input.id)
})

const updateUser = mutation().resolve(({ input }) => {
  manager.emit("User", input.id, input.data)  // Pushes to all subscribers
  return input.data
})
```

### "What's the difference between `emit()` and `emit.set()`?"

```typescript
// emit() - Full object (merge mode)
emit({ name: "Alice", age: 30 })  // Merges into current state

// emit.set() - Single field
emit.set("name", "Alice")  // Only updates 'name' field

// Use emit.set() when:
// 1. You only have one field to update
// 2. You want explicit field-level control
// 3. You're using delta/patch strategies

emit.delta("content", [...])  // String diff
emit.patch("metadata", [...]) // JSON Patch
```

### "How do I handle errors in subscriptions?"

```typescript
// Client
client.data.get().subscribe({
  onData: (data) => setData(data),
  onError: (error) => setError(error),
  onComplete: () => console.log("Stream ended"),
})

// Server - throw errors normally
const getData = query().resolve(({ ctx }) => {
  if (!ctx.user) {
    throw new Error("Unauthorized")
  }
  return ctx.data
})
```

### "How do I unsubscribe / cleanup?"

```typescript
// Client: unsubscribe returns cleanup function
const unsubscribe = client.data.get().subscribe(callback)

// Later...
unsubscribe()  // Stops receiving updates

// Server: onCleanup is called when client disconnects
resolve(({ emit, onCleanup }) => {
  const interval = setInterval(() => emit(getData()), 1000)

  onCleanup(() => {
    clearInterval(interval)  // Called when client unsubscribes
  })

  return initialData
})
```

### "Can I have multiple subscribers to the same query?"

Yes! Each subscriber is independent:

```typescript
// Same query, different field selections
const unsub1 = client.user.get({ id }).select({ name: true }).subscribe(...)
const unsub2 = client.user.get({ id }).select({ email: true }).subscribe(...)

// unsub1 only receives name changes
// unsub2 only receives email changes
// Server tracks each subscription separately
```

---

## License

MIT © Sylphx AI
