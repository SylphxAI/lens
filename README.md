<div align="center">

# 🔮 Lens

> Type-safe, real-time API framework for TypeScript

[![npm](https://img.shields.io/npm/v/@sylphx/lens-server)](https://www.npmjs.com/package/@sylphx/lens-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/SylphxAI/Lens/actions/workflows/ci.yml/badge.svg)](https://github.com/SylphxAI/Lens/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/SylphxAI/Lens)](https://github.com/SylphxAI/Lens)

</div>

---

A **GraphQL-like** frontend-driven framework with **automatic live queries** and **incremental transfer**. Full type safety from server to client, no codegen required.

## What Lens Does

Lens lets you define type-safe API operations on the server that clients can call with full TypeScript inference. **Every query automatically supports subscriptions** - clients can subscribe to any query and receive updates when data changes. The server automatically computes and sends **only the changed fields** (minimal diff).

```typescript
// Server: Define your API
const appRouter = router({
  user: {
    get: query()
      .args(z.object({ id: z.string() }))
      .resolve(({ args, ctx }) => ctx.db.user.find(args.id)),

    update: mutation()
      .args(z.object({ id: z.string(), name: z.string() }))
      .resolve(({ args, ctx }) => ctx.db.user.update(input)),
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
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.user.find(args.id))

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

Lens supports three ways to produce data in resolvers. Each pattern uses a **type-safe API** that enforces correct context access.

### 1. Query: Single Return (`.resolve()`)

Most common pattern - returns a value once. Context has **no** `emit` or `onCleanup`:

```typescript
const getUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.user.find(args.id))
  //         ^ ctx has NO emit, NO onCleanup
```

### 2. Live Query: Initial + Updates (`.resolve().subscribe()`) ✅ Recommended

For real-time updates with initial value. Uses **Publisher pattern** - emit/onCleanup are in the callback, not ctx:

```typescript
const watchUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.user.find(args.id))  // Initial value
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    // Publisher callback - emit/onCleanup passed here, NOT in ctx
    const unsubscribe = db.user.onChange(args.id, (user) => {
      emit(user)  // Push update to subscribed clients
    })
    onCleanup(unsubscribe)
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

### 4. Legacy Subscription (`.subscribe()` standalone) ⚠️ Deprecated

> **⚠️ Deprecated:** Use `.resolve().subscribe()` instead for better performance.

```typescript
// ❌ DEPRECATED - ctx.emit pattern
const watchUser = query()
  .subscribe(({ args, ctx }) => {
    ctx.emit(user)  // OLD pattern - emit on ctx
    ctx.onCleanup(unsubscribe)
  })
```

### Type-Safe Context Summary

| Method | Return Type | `emit` | `onCleanup` |
|--------|-------------|--------|-------------|
| `.resolve()` | `T \| Promise<T>` | ❌ | ❌ |
| `.resolve().subscribe()` ✅ | Publisher callback | In callback | In callback |
| `.subscribe()` ⚠️ deprecated | `void` | On `ctx` | On `ctx` |

---

## Emit API

The `ctx.emit` method provides type-safe methods for pushing state updates to subscribed clients. **Only available in `.subscribe()` resolvers**, not in `.resolve()`. The available methods depend on your output type.

### Object Outputs

For single entity or multi-entity object outputs (`.returns(User)` or `.returns({ user: User, posts: [Post] })`):

```typescript
.subscribe(({ args, ctx }) => {
  // Full data update (merge mode)
  ctx.emit({ title: "Hello", content: "World" })

  // Merge partial update
  ctx.emit.merge({ title: "Updated" })

  // Replace entire state
  ctx.emit.replace({ title: "New", content: "Fresh" })

  // Set single field (type-safe)
  ctx.emit.set("title", "New Title")

  // Delta for string fields (e.g., LLM streaming)
  ctx.emit.delta("content", [{ position: 0, insert: "Hello " }])

  // JSON Patch for object fields
  ctx.emit.patch("metadata", [{ op: "add", path: "/views", value: 100 }])

  // Batch multiple updates
  ctx.emit.batch([
    { field: "title", strategy: "value", data: "New" },
    { field: "content", strategy: "delta", data: [{ position: 0, insert: "!" }] },
  ])
})
```

### Array Outputs

For array outputs (`.returns([User])`):

```typescript
.subscribe(({ args, ctx }) => {
  // Replace entire array
  ctx.emit([user1, user2])
  ctx.emit.replace([user1, user2])

  // Add items
  ctx.emit.push(newUser)           // Append to end
  ctx.emit.unshift(newUser)        // Prepend to start
  ctx.emit.insert(1, newUser)      // Insert at index

  // Remove items
  ctx.emit.remove(0)               // Remove by index
  ctx.emit.removeById("user-123")  // Remove by id field

  // Update items
  ctx.emit.update(1, updatedUser)              // Update at index
  ctx.emit.updateById("user-123", updatedUser) // Update by id

  // Merge partial data into items
  ctx.emit.merge(0, { name: "Updated" })            // Merge at index
  ctx.emit.mergeById("user-123", { name: "Updated" }) // Merge by id
})
```

### LLM Streaming Example

```typescript
const chat = query()
  .args(z.object({ prompt: z.string() }))
  .subscribe(({ args, ctx }) => {
    const stream = ctx.ai.stream(args.prompt)

    // Emit initial empty state
    ctx.emit({ content: "" })

    stream.on("token", (token) => {
      // Efficiently append to content field
      ctx.emit.delta("content", [{ position: Infinity, insert: token }])
    })

    ctx.onCleanup(() => stream.close())
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

## Model Definition & Field Resolution

Lens separates **schema** (model) from **implementation** (resolver):
- `model()` → Pure schema definition (types only)
- `resolver()` → Field resolution implementation

### Define Models (Schema)

Use `model("Name", { ... })` to define the data shape. Models contain only scalar fields:

```typescript
import { model, id, string, int, boolean, datetime, enumType, nullable, list, resolver, lens } from '@sylphx/lens-core'
import { z } from 'zod'

// Models define scalar fields only (data shape from DB)
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
  role: enumType(["user", "admin", "vip"]),
  avatar: nullable(string()),
  createdAt: datetime(),
})

const Post = model("Post", {
  id: id(),
  title: string(),
  content: string(),
  published: boolean(),
  authorId: string(),  // FK to User
  updatedAt: nullable(datetime()),
  createdAt: datetime(),
})
```

### Define Resolvers (Implementation)

Use `resolver(Model, (t) => ({...}))` to define how fields are resolved. Every model field must have a resolver:

```typescript
const { resolver } = lens<AppContext>()

// User resolver - defines field exposure and computed fields/relations
const userResolver = resolver(User, (t) => ({
  // Expose scalar fields directly from source data
  id: t.expose('id'),
  name: t.expose('name'),
  email: t.expose('email'),
  role: t.expose('role'),
  avatar: t.expose('avatar'),
  createdAt: t.expose('createdAt'),

  // Computed field - plain function
  displayName: ({ source }) => `${source.name} (${source.role})`,

  // Relation with arguments - use t.args().resolve()
  posts: t
    .args(z.object({
      first: z.number().default(10),
      published: z.boolean().optional(),
    }))
    .resolve(({ source, args, ctx }) => {
      let posts = ctx.db.posts.filter(p => p.authorId === source.id)
      if (args.published !== undefined) {
        posts = posts.filter(p => p.published === args.published)
      }
      return posts.slice(0, args.first)
    }),

  // Live field with Publisher pattern
  status: t.resolve(({ source, ctx }) => ctx.getStatus(source.id))
    .subscribe(({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${source.id}`, emit)
      onCleanup(unsub)
    }),
}))

// Post resolver
const postResolver = resolver(Post, (t) => ({
  id: t.expose('id'),
  title: t.expose('title'),
  content: t.expose('content'),
  published: t.expose('published'),
  authorId: t.expose('authorId'),
  updatedAt: t.expose('updatedAt'),
  createdAt: t.expose('createdAt'),

  // Relation - plain function resolver
  author: ({ source, ctx }) => {
    const author = ctx.db.users.get(source.authorId)
    if (!author) throw new Error(`Author not found: ${source.authorId}`)
    return author
  },

  // Computed field with arguments
  excerpt: t
    .args(z.object({ length: z.number().default(100) }))
    .resolve(({ source, args }) => {
      const text = source.content
      if (text.length <= args.length) return text
      return text.slice(0, args.length) + "..."
    }),
}))
```

### Register with Server

Pass models, resolvers, and router to `createApp`:

```typescript
import { createApp } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  entities: { User, Post },                      // Models for normalization
  resolvers: [userResolver, postResolver],       // Field resolvers array
  context: () => ({ db }),
})
```

### Field Resolver Signature

```typescript
// Full signature: ({ source, args, ctx }) => result
({ source, args, ctx }: { source: TSource; args: TArgs; ctx: TContext }) => TResult | Promise<TResult>
```

### Field Builder API

| Function | Description | Example |
|----------|-------------|---------|
| `id()` | ID field | `id: id()` |
| `string()` | String field | `name: string()` |
| `int()` | Integer field | `age: int()` |
| `boolean()` | Boolean field | `active: boolean()` |
| `datetime()` | DateTime field | `createdAt: datetime()` |
| `enumType([...])` | Enum field | `role: enumType(["user", "admin"])` |
| `list(() => E)` | Collection relation | `posts: list(() => Post)` |
| `nullable(T)` | Nullable field | `email: nullable(string())` |

### Resolver Builder API

| Method | Description | Example |
|--------|-------------|---------|
| `t.expose('field')` | Pass through from source | `id: t.expose('id')` |
| `({ source, ctx }) => ...` | Plain function resolver | `avatar: ({ source, ctx }) => ctx.cdn.url(source.avatarKey)` |
| `t.args(schema).resolve(fn)` | Field with arguments | `posts: t.args(z.object({...})).resolve(...)` |
| `t.resolve(fn).subscribe(fn)` | Live field (Publisher pattern) | `status: t.resolve(...).subscribe(...)` |

### GraphQL Comparison

```graphql
# GraphQL
query {
  user(id: "1") {
    name
    posts(first: 5, published: true) {
      title
      excerpt(length: 50)
    }
    postsCount(published: true)
  }
}
```

```typescript
// Lens - equivalent
client.user.get({ id: "1" }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: {
        title: true,
        excerpt: { args: { length: 50 } },
      }
    },
    postsCount: { args: { published: true } },
  }
})
```

**Lens adds:**
- `.subscribe()` for live updates
- Automatic incremental diff transfer
- Full TypeScript inference (no codegen)

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
import { createApp, router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

export const appRouter = router({
  user: {
    list: query()
      .resolve(({ ctx }) => ctx.db.user.findMany()),

    get: query()
      .args(z.object({ id: z.string() }))
      .resolve(({ args, ctx }) => ctx.db.user.findUnique({ where: { id: args.id } })),

    create: mutation()
      .args(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ args, ctx }) => ctx.db.user.create({ data: args })),

    update: mutation()
      .args(z.object({ id: z.string(), name: z.string().optional() }))
      .resolve(({ args, ctx }) => ctx.db.user.update({ where: { id: args.id }, data: args })),
  },
})

export type AppRouter = typeof appRouter

export const app = createApp({
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
import { client } from './api'

function UserProfile({ userId }: { userId: string }) {
  // .useQuery() - React hook that auto-subscribes and receives live updates
  const { data: user, loading, error } = client.user.get.useQuery({
    input: { id: userId }
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{user?.name}</h1>
}

function UpdateUser({ userId }: { userId: string }) {
  // .useMutation() - React hook for mutations
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

---

## Field Selection & Arguments

GraphQL-like field selection with **field-level arguments**. The server tracks and sends minimal updates:

```typescript
// Simple selection
const user = await client.user.get({ id: '123' }, {
  select: { name: true, email: true }
})

// Nested selection with field arguments
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    displayName: true,

    // Field with arguments
    posts: {
      args: { first: 5, published: true, orderBy: 'createdAt' },
      select: {
        title: true,
        excerpt: { args: { length: 50 } },  // Scalar with args
        author: { select: { name: true } },
      }
    },

    // Computed field with arguments
    postsCount: { args: { published: true } },
  }
})

// Live subscription with field args
client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5 },
      select: { title: true }
    }
  }
}).subscribe((user) => {
  // Updates when user.name OR any post changes
})
```

### Selection Syntax

```typescript
// Boolean - include field with default args
{ name: true }

// Object with select - nested entity
{ posts: { select: { title: true } } }

// Object with args - field arguments
{ postsCount: { args: { published: true } } }

// Object with args + select - both
{ posts: { args: { first: 5 }, select: { title: true } } }
```

### Type Inference

Selection is fully typed - TypeScript knows the exact shape:

```typescript
const user = await client.user.get({ id: '1' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5 },
      select: { title: true, author: { select: { name: true } } }
    },
    postsCount: { args: { published: true } },
  }
})

// TypeScript infers:
// {
//   name: string
//   posts: Array<{
//     title: string
//     author: { name: string }
//   }>
//   postsCount: number
// }
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

Mutations can define optimistic behavior for instant UI feedback.

### Simple (Single Entity)

```typescript
// Server: Define optimistic strategy
const updateUser = mutation()
  .args(z.object({ id: z.string(), name: z.string() }))
  .optimistic('merge')  // Instantly merge input into local state
  .resolve(({ args, ctx }) => ctx.db.user.update({
    where: { id: args.id },
    data: args
  }))

// Client: UI updates instantly, rolls back on error
await client.user.update({ id: '123', name: 'New Name' })
```

Simple strategies:
- `'merge'` - Merge input into existing entity
- `'create'` - Create with temporary ID
- `'delete'` - Mark entity as deleted
- `{ merge: { field: value } }` - Merge with additional fields

### Multi-Entity Optimistic (Reify Pipeline)

For mutations that affect multiple entities, use [Reify](https://github.com/SylphxAI/reify) pipelines - **"Describe once, execute anywhere"**:

```typescript
// Import Reify DSL directly from @sylphx/reify
import { entity, pipe, temp, ref, now, branch, inc, push } from '@sylphx/reify';

const sendMessagePipeline = pipe(({ args }) => [
  // Step 1: Conditional upsert - create or update session
  branch(args.sessionId)
    .then(entity.update('Session', {
      id: args.sessionId,
      updatedAt: now()
    }))
    .else(entity.create('Session', {
      id: temp(),
      title: args.title,
      createdAt: now()
    }))
    .as('session'),

  // Step 2: Create message (references session from step 1)
  entity.create('Message', {
    id: temp(),
    sessionId: ref('session').id,  // Reference sibling operation result
    role: 'user',
    content: args.content,
    createdAt: now(),
  }).as('message'),

  // Step 3: Update user stats with operators
  entity.update('User', {
    id: args.userId,
    messageCount: inc(1),          // Increment by 1
    tags: push('active'),          // Append to array
    lastActiveAt: now(),
  }).as('userStats'),
]);

// Use in Lens mutation
const createChatSession = mutation()
  .args(z.object({
    sessionId: z.string().optional(),
    title: z.string(),
    content: z.string(),
    userId: z.string(),
  }))
  .returns(Message)
  .optimistic(sendMessagePipeline)  // 🔥 Lens accepts Reify pipelines
  .resolve(...)
```

**Why Reify?**
- Same pipeline definition works for **client optimistic updates** (cache) and **server execution** (Prisma/DB)
- Pipelines are **serializable** - can be sent over the wire
- Operations are **composable** - build complex flows from simple steps

See [@sylphx/reify documentation](https://github.com/SylphxAI/reify) for full DSL reference

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
import { client } from '@/lib/client'

export function UserProfile({ userId }: { userId: string }) {
  const { data, loading } = client.user.get.useQuery({ input: { id: userId } })
  return <h1>{data?.name}</h1>
}
```

### Nuxt 3

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-vue'
import { httpTransport } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: httpTransport({ url: '/api/lens' }),
})
```

```vue
<script setup lang="ts">
import { client } from '@/lib/client'

// .useQuery() - Vue composable for reactive queries
const { data, loading } = client.user.get.useQuery({ input: { id: '123' } })
</script>
<template>
  <div v-if="loading">Loading...</div>
  <h1 v-else>{{ data?.name }}</h1>
</template>
```

### SolidStart

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-solid'
import { httpTransport } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: httpTransport({ url: '/api/lens' }),
})
```

```tsx
import { client } from '@/lib/client'

export default function UserProfile() {
  // .createQuery() - SolidJS primitive for reactive queries
  const { data, loading } = client.user.get.createQuery({ input: { id: '123' } })
  return <Show when={!loading()} fallback={<div>Loading...</div>}>
    <h1>{data()?.name}</h1>
  </Show>
}
```

---

## Context

Pass request-specific data to resolvers:

```typescript
const app = createApp({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromToken(req.headers.authorization),
  }),
})

// Access in resolver
const getMe = query().resolve(({ ctx }) => ctx.user)
```

### Typed Context (Automatic Inference)

Each query/mutation declares only what it actually uses. The router automatically merges them, and `createServer` enforces the final type:

```typescript
// routes/user.ts - Only declare what you USE
import { query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

// Only uses ctx.db
export const getUser = query<{ db: PrismaClient }>()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => {
    return ctx.db.user.findUnique({ where: { id: args.id } })
  })

// Uses ctx.db AND ctx.user
export const createUser = mutation<{ db: PrismaClient; user: User | null }>()
  .args(z.object({ name: z.string(), email: z.string() }))
  .resolve(({ args, ctx }) => {
    if (!ctx.user) throw new Error('Unauthorized')
    return ctx.db.user.create({ data: args })
  })
```

```typescript
// routes/cache.ts - Different requirements
// Only uses ctx.cache
export const getCached = query<{ cache: RedisClient }>()
  .args(z.object({ key: z.string() }))
  .resolve(({ args, ctx }) => ctx.cache.get(args.key))
```

```typescript
// server.ts - Context is automatically inferred & enforced
import { createServer, router } from '@sylphx/lens-server'
import * as userRoutes from './routes/user'
import * as cacheRoutes from './routes/cache'

const appRouter = router({
  user: userRoutes,
  cache: cacheRoutes,
})

// Merged context: { db: PrismaClient; user: User | null; cache: RedisClient }
const app = createApp({
  router: appRouter,
  context: async (req) => ({
    db: prisma,                // Required by getUser, createUser
    user: await getUser(req),  // Required by createUser
    cache: redis,              // Required by getCached
  }),
})
```

This gives you:
- **Full autocomplete** on `ctx` in all resolvers
- **Dependency injection style** - each procedure declares what it needs
- **Automatic merging** - router combines all context requirements
- **Type enforcement** - `createServer` ensures context satisfies all needs

#### Simple Approach: Shared Context Type

If you prefer simplicity, just declare the same context type everywhere:

```typescript
// types.ts
export interface Context {
  db: PrismaClient
  user: User | null
  cache: RedisClient
}

// routes/user.ts
export const getUser = query<Context>()
  .resolve(({ ctx }) => ctx.db.user.find(...))

export const createUser = mutation<Context>()
  .resolve(({ ctx }) => ctx.db.user.create(...))
```

Or wrap it once and reuse:

```typescript
// lib/procedures.ts
import { query, mutation } from '@sylphx/lens-server'
import type { Context } from './types'

export const typedQuery = () => query<Context>()
export const typedMutation = () => mutation<Context>()

// routes/user.ts
import { typedQuery, typedMutation } from '../lib/procedures'

export const getUser = typedQuery()
  .args(z.object({ id: z.string() }))
  .resolve(({ ctx }) => ctx.db.user.find(...))
```

---

## Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | ✅ | Codegen | ❌ | ✅ Native |
| Code-first | ✅ | SDL | ✅ | ✅ |
| Field Selection | ❌ | ✅ | ❌ | ✅ |
| Field Arguments | ❌ | ✅ | ❌ | ✅ |
| Live Subscriptions | ❌ | Separate | ❌ | ✅ Auto |
| Incremental Updates | ❌ | ❌ | ❌ | ✅ Diff |
| Streaming | ✅ | ❌ | ❌ | ✅ |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |

**Lens = GraphQL's power + Live queries + No codegen**

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@sylphx/lens](./packages/lens) | [![version](https://img.shields.io/npm/v/@sylphx/lens)](https://www.npmjs.com/package/@sylphx/lens) | All-in-one package |
| [@sylphx/lens-server](./packages/server) | [![version](https://img.shields.io/npm/v/@sylphx/lens-server)](https://www.npmjs.com/package/@sylphx/lens-server) | Server, router, operations |
| [@sylphx/lens-client](./packages/client) | [![version](https://img.shields.io/npm/v/@sylphx/lens-client)](https://www.npmjs.com/package/@sylphx/lens-client) | Client, transports, plugins |
| [@sylphx/lens-core](./packages/core) | [![version](https://img.shields.io/npm/v/@sylphx/lens-core)](https://www.npmjs.com/package/@sylphx/lens-core) | Core types and utilities |
| [@sylphx/lens-react](./packages/react) | [![version](https://img.shields.io/npm/v/@sylphx/lens-react)](https://www.npmjs.com/package/@sylphx/lens-react) | React hooks |
| [@sylphx/lens-vue](./packages/vue) | [![version](https://img.shields.io/npm/v/@sylphx/lens-vue)](https://www.npmjs.com/package/@sylphx/lens-vue) | Vue composables |
| [@sylphx/lens-solid](./packages/solid) | [![version](https://img.shields.io/npm/v/@sylphx/lens-solid)](https://www.npmjs.com/package/@sylphx/lens-solid) | SolidJS primitives |
| [@sylphx/lens-svelte](./packages/svelte) | [![version](https://img.shields.io/npm/v/@sylphx/lens-svelte)](https://www.npmjs.com/package/@sylphx/lens-svelte) | Svelte stores |
| [@sylphx/lens-preact](./packages/preact) | [![version](https://img.shields.io/npm/v/@sylphx/lens-preact)](https://www.npmjs.com/package/@sylphx/lens-preact) | Preact hooks + signals |
| [@sylphx/lens-next](./packages/next) | [![version](https://img.shields.io/npm/v/@sylphx/lens-next)](https://www.npmjs.com/package/@sylphx/lens-next) | Next.js integration |
| [@sylphx/lens-nuxt](./packages/nuxt) | [![version](https://img.shields.io/npm/v/@sylphx/lens-nuxt)](https://www.npmjs.com/package/@sylphx/lens-nuxt) | Nuxt 3 integration |
| [@sylphx/lens-solidstart](./packages/solidstart) | [![version](https://img.shields.io/npm/v/@sylphx/lens-solidstart)](https://www.npmjs.com/package/@sylphx/lens-solidstart) | SolidStart integration |
| [@sylphx/lens-fresh](./packages/fresh) | [![version](https://img.shields.io/npm/v/@sylphx/lens-fresh)](https://www.npmjs.com/package/@sylphx/lens-fresh) | Fresh (Deno) integration |

---

## Common Patterns & Examples

### Real-time Dashboard

```typescript
// Server: Single query serves both initial load AND live updates
const getDashboard = query()
  .resolve(({ ctx }) => ({
    metrics: ctx.metrics.getCurrent(),
    alerts: ctx.alerts.getCurrent(),
  }))
  .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
    // Publisher pattern - emit/onCleanup in callback
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
// Server: Stream tokens as they arrive (yield pattern)
const chat = query()
  .args(z.object({ messages: z.array(MessageSchema) }))
  .resolve(async function* ({ args, ctx }) {
    const stream = ctx.openai.chat.completions.create({
      model: "gpt-4",
      messages: args.messages,
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
  .args(z.object({ docId: z.string() }))
  .resolve(({ args, ctx }) => ctx.docs.get(args.docId).get())
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    const docRef = ctx.docs.get(args.docId)

    // Listen for changes from ANY user
    const unsub = docRef.onSnapshot((doc) => {
      emit(doc.data())
    })

    onCleanup(unsub)
  })

const updateDocument = mutation()
  .args(z.object({ docId: z.string(), content: z.string() }))
  .resolve(({ args, ctx }) => {
    // Update triggers onSnapshot above
    // ALL subscribed clients receive the change
    return ctx.docs.update(args.docId, { content: args.content })
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
  .args(z.object({ cursor: z.string().optional(), limit: z.number() }))
  .resolve(({ args, ctx }) =>
    ctx.posts.findMany({ cursor: args.cursor, take: args.limit })
  )
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    // Listen for new posts
    const unsub = ctx.posts.onNew((newPost) => {
      emit.unshift(newPost)  // Add to front of array
    })

    onCleanup(unsub)
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
  .args(z.object({ roomId: z.string() }))
  .resolve(({ args, ctx }) => {
    const room = ctx.presence.join(args.roomId, ctx.user)
    return room.getUsers()
  })
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    const room = ctx.presence.get(args.roomId)

    // Listen for user join/leave
    room.onUpdate((users) => {
      emit(users)
    })

    onCleanup(() => room.leave())
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

Use `yield` in an async generator with `.resolve()`:

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

Use `.resolve().subscribe()` with the Publisher pattern:

```typescript
const watchPrices = query()
  .args(z.object({ symbol: z.string() }))
  .resolve(({ args }) => ({ price: 0, symbol: args.symbol }))  // Initial value
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    // Connect to external WebSocket
    const ws = new WebSocket(`wss://prices.api/${args.symbol}`)

    ws.onmessage = (event) => {
      emit(JSON.parse(event.data))  // Push to Lens clients
    }

    onCleanup(() => ws.close())
  })
```

### "How do mutations trigger updates to subscribed queries?"

Two ways:

**1. Automatic (via shared data source):**
```typescript
// Query subscribes to database changes
const getUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.user.find(args.id))
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    // Listen for changes
    const unsub = ctx.db.user.onChange(args.id, emit)
    onCleanup(unsub)
  })

// Mutation updates database
const updateUser = mutation().resolve(({ args, ctx }) => {
  return ctx.db.user.update(input)  // Triggers onChange above
})
```

**2. Manual (via shared state manager):**
```typescript
// Both query and mutation use same GraphStateManager
const manager = new GraphStateManager()

const getUser = query().resolve(({ args }) => {
  return manager.getState("User", args.id)
})

const updateUser = mutation().resolve(({ args }) => {
  manager.emit("User", args.id, args.data)  // Pushes to all subscribers
  return args.data
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
.resolve(() => initialData)
.subscribe(({ ctx }) => ({ emit, onCleanup }) => {
  // Push updates periodically
  const interval = setInterval(() => emit(getData()), 1000)

  onCleanup(() => {
    clearInterval(interval)  // Called when client unsubscribes
  })
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

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SylphxAI/Lens&type=Date)](https://star-history.com/#SylphxAI/Lens&Date)

## Powered by Sylphx

- [@sylphx/biome-config](https://github.com/SylphxAI/configs) - Shared Biome configuration
- [@sylphx/tsconfig](https://github.com/SylphxAI/configs) - Shared TypeScript configuration
- [@sylphx/doctor](https://github.com/SylphxAI/doctor) - Project health checker
- [@sylphx/bump](https://github.com/SylphxAI/bump) - Version management
- [@sylphx/reify](https://github.com/SylphxAI/reify) - Declarative entity operations
- [@sylphx/standard-entity](https://github.com/SylphxAI/standard-entity) - Standard entity definitions

---

<div align="center">
<sub>Built with ❤️ by <a href="https://github.com/SylphxAI">Sylphx</a></sub>
</div>
