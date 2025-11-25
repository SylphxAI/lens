# Lens

> **The Reactive Graph API Framework**

TypeScript-first • Real-time Native • Multi-Server Ready • Zero Codegen

```typescript
// Define operations with router
export const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),

    create: mutation()
      .input(z.object({ name: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.create(input)),
  },
})

// Type-safe client
const user = await client.user.get({ id: '123' })
await client.user.create({ name: 'John' })
```

---

## Why Lens?

### The Problem

Building real-time, type-safe APIs is hard:

- **GraphQL**: Powerful but requires SDL + codegen, two sources of truth
- **tRPC**: Great DX but no entity model, no nested resolution, no real-time
- **REST**: No type safety, over-fetching, manual subscriptions

### The Solution

Lens brings GraphQL concepts to TypeScript:

| Feature | GraphQL | tRPC | **Lens** |
|---------|---------|------|----------|
| Type Safety | Codegen | ✅ | ✅ |
| Code-first | SDL-first | ✅ | ✅ |
| Free Operations | ✅ | ✅ | ✅ |
| Nested Resolution | ✅ | ❌ | ✅ |
| Real-time | Addon | Manual | **Native** |
| Optimistic Updates | Manual | Manual | **Auto** |
| Multi-Server | Federation | Manual | **Native** |
| Codegen Required | Yes | No | **No** |

---

## ✨ Key Features

### 🔌 Pluggable Transport System

Connect to any backend with composable transports:

```typescript
// Simple - single server
const client = await createClient<Api>({
  transport: http({ url: '/api' }),
})

// Real-time - WebSocket for subscriptions
const client = await createClient<Api>({
  transport: routeByType({
    default: http({ url: '/api' }),
    subscription: ws({ url: 'ws://localhost:3000' }),
  }),
})
```

### 🌐 Multi-Server Architecture

**First-class support for microservices** - connect to multiple backends with automatic metadata merging:

```typescript
import type { AuthRouter } from '@company/auth-server'
import type { MainRouter } from '@company/main-server'
import type { AnalyticsRouter } from '@company/analytics-server'

// Merge types from different servers
type Api = AuthRouter & MainRouter & AnalyticsRouter

const client = await createClient<Api>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/api' }),  // fallback
  }),
})

// Full type safety across all servers!
await client.auth.login({ email, password })     // → auth-server
await client.analytics.track({ event: 'click' }) // → analytics-server
await client.user.get({ id: '123' })             // → main-server
```

Each transport automatically performs handshake with its server, and route transport merges all metadata. **Zero configuration for multi-server setups!**

### 🔄 Automatic Optimistic Updates

Server-defined optimistic DSL, client executes automatically:

```typescript
// Server defines optimistic behavior
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic('merge')  // DSL: merge input into cache
  .resolve(({ input, ctx }) => ctx.db.user.update(input))

// Client gets optimistic config via handshake
// Updates are instant, rollback on error - zero client code!
await client.user.update({ id: '123', name: 'New Name' })
```

### 🧩 Plugin System

Extend functionality with lifecycle hooks:

```typescript
const client = await createClient<Api>({
  transport: http({ url: '/api' }),
  plugins: [
    logger(),                    // Log requests/responses
    auth({ getToken: () => token }), // Add auth headers
    retry({ attempts: 3 }),      // Retry on failure
    cache({ ttl: 60000 }),       // Cache responses
  ],
})
```

Plugins use hooks - **order doesn't matter**:

```typescript
interface Plugin {
  name: string
  beforeRequest?: (op: Operation) => Operation
  afterResponse?: (result: Result) => Result
  onError?: (error: Error, retry: () => Promise<Result>) => Result
}
```

---

## Installation

```bash
bun add @sylphx/lens-core @sylphx/lens-server @sylphx/lens-client

# Framework adapters
bun add @sylphx/lens-react      # React hooks
bun add @sylphx/lens-solid      # SolidJS primitives
bun add @sylphx/lens-vue        # Vue composables
bun add @sylphx/lens-svelte     # Svelte stores
```

---

## Quick Start

### 1. Define Schema

```typescript
// schema/entities.ts
import { entity, t } from '@sylphx/lens-core'

export const User = entity({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  role: t.enum(['user', 'admin']),
})

export const Post = entity({
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
})
```

### 2. Define Operations (Router)

```typescript
// router.ts
import { router, query, mutation } from '@sylphx/lens-core'
import { z } from 'zod'
import { User, Post } from './schema/entities'

export const appRouter = router({
  user: {
    me: query()
      .returns(User)
      .resolve(({ ctx }) => ctx.currentUser),

    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.findUnique({
        where: { id: input.id }
      })),
  },

  post: {
    // "create" → auto 'create' optimistic
    create: mutation()
      .input(z.object({ title: z.string(), content: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.create({
        data: { ...input, authorId: ctx.currentUser.id },
      })),

    // "update" → auto 'merge' optimistic
    update: mutation()
      .input(z.object({ id: z.string(), title: z.string().optional() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.update({
        where: { id: input.id },
        data: input,
      })),
  },
})

export type AppRouter = typeof appRouter
```

### 3. Create Server

```typescript
// server.ts
import { createServer, http } from '@sylphx/lens-server'
import { appRouter } from './router'

const server = createServer({
  transport: http.server({ port: 3000 }),
  plugins: [logger(), auth()],
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
  }),
})

// Server exposes metadata endpoint automatically
// GET /api/__lens/metadata → { operations, version }
```

### 4. Create Client

```typescript
// client.ts
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from './router'

// Client auto-handshakes to get operation metadata
export const client = await createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [logger(), auth({ getToken: () => localStorage.token })],
})

// Type-safe, optimistic by default
const me = await client.user.me()
const post = await client.post.create({ title: 'Hello', content: 'World' })
```

---

## Transport System

Transports handle communication with servers. All transports implement the same interface:

```typescript
interface Transport {
  // Handshake - get operation metadata from server
  connect(): Promise<Metadata>

  // Execute operations
  execute(op: Operation): Promise<Result> | Observable<Result>
}
```

### Built-in Transports

```typescript
// HTTP - queries/mutations via POST, subscriptions via polling
http({ url: string, headers?: HeadersInit })
http.server({ port: number, path?: string })

// WebSocket - native real-time
ws({ url: string })
ws.server({ port: number, path?: string })

// SSE - Server-Sent Events for subscriptions
sse({ url: string })
sse.server({ port: number, path?: string })

// In-Process - direct calls (testing, SSR)
inProcess({ server: LensServer })
```

### Routing Transports

```typescript
// Route by operation type (common pattern)
routeByType({
  default: http({ url: '/api' }),
  subscription: ws({ url: 'ws://localhost:3000' }),
})

// Route by path pattern
route({
  'auth.*': http({ url: '/auth' }),
  'analytics.*': http({ url: '/analytics' }),
  '*': http({ url: '/api' }),  // fallback
})

// Mix both - auth separate, rest with subscriptions on WS
route({
  'auth.*': http({ url: '/auth' }),
  '*': routeByType({
    default: http({ url: '/api' }),
    subscription: ws({ url: 'ws://localhost:3000' }),
  }),
})
```

### Each Transport Handles All Operation Types

```typescript
// HTTP transport handles streaming via polling
const http = {
  execute(op) {
    if (op.type === 'subscription') {
      return createPollingObservable(url, op)
    }
    return fetch(url, { body: JSON.stringify(op) })
  }
}

// WebSocket handles streaming natively
const ws = {
  execute(op) {
    if (op.type === 'subscription') {
      return createWsObservable(socket, op)
    }
    return sendAndWaitForResponse(socket, op)
  }
}
```

---

## Multi-Server Architecture

### The Challenge

Microservices architecture means multiple backends:
- Auth service
- User service
- Analytics service
- Payment service

Traditional approaches require manual routing and lose type safety.

### Lens Solution

**Each server exports its router type:**

```typescript
// @company/auth-server
export const authRouter = router({
  auth: {
    login: mutation({ ... }),
    logout: mutation({ ... }),
    me: query({ ... }),
  },
})
export type AuthRouter = typeof authRouter

// @company/user-server
export const userRouter = router({
  user: {
    get: query({ ... }),
    update: mutation({ ... }),
  },
})
export type UserRouter = typeof userRouter
```

**Client merges types and routes automatically:**

```typescript
import type { AuthRouter } from '@company/auth-server'
import type { UserRouter } from '@company/user-server'

type Api = AuthRouter & UserRouter

const client = await createClient<Api>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    '*': http({ url: '/user-api' }),
  }),
})

// Full type safety!
await client.auth.login({ email, password })  // → auth-api
await client.user.get({ id: '123' })          // → user-api
```

### How Handshake Works

```
createClient()
     │
     ▼
transport.connect()  (route transport)
     │
     ├── http('/auth-api').connect()
     │   └── GET /auth-api/__lens/metadata
     │   └── Returns: { operations: { 'auth.login': { type: 'mutation' }, ... } }
     │
     └── http('/user-api').connect()
         └── GET /user-api/__lens/metadata
         └── Returns: { operations: { 'user.get': { type: 'query' }, ... } }
     │
     ▼
Route transport merges all metadata:
{
  operations: {
    'auth.login': { type: 'mutation' },
    'auth.logout': { type: 'mutation' },
    'user.get': { type: 'query' },
    'user.update': { type: 'mutation', optimistic: 'merge' },
  }
}
```

**Client now knows:**
- Which operations exist
- Their types (query/mutation/subscription)
- Optimistic update strategies

---

## Plugin System

Plugins extend client and server with lifecycle hooks.

### Plugin Interface

```typescript
interface Plugin {
  name: string

  // Before sending request
  beforeRequest?: (op: Operation) => Operation | Promise<Operation>

  // After receiving response
  afterResponse?: (result: Result, op: Operation) => Result | Promise<Result>

  // On error (can retry)
  onError?: (error: Error, op: Operation, retry: () => Promise<Result>) => Result | Promise<Result>
}
```

### Built-in Plugins

```typescript
// Logging
logger({ level?: 'debug' | 'info' | 'warn' | 'error' })

// Authentication
auth({ getToken: () => string | Promise<string> })

// Retry with exponential backoff
retry({ attempts?: number, delay?: number, shouldRetry?: (err) => boolean })

// Response caching
cache({ ttl?: number, key?: (op) => string })

// Request timeout
timeout({ ms: number })
```

### Custom Plugin Example

```typescript
const metricsPlugin = (): Plugin => ({
  name: 'metrics',

  beforeRequest: (op) => {
    op.meta.startTime = performance.now()
    return op
  },

  afterResponse: (result, op) => {
    const duration = performance.now() - op.meta.startTime
    metrics.record(op.path, duration)
    return result
  },

  onError: (error, op) => {
    metrics.recordError(op.path, error)
    throw error
  },
})
```

### Execution Order

```
1. All beforeRequest hooks (array order)
        ↓
2. transport.execute()
        ↓
3. All afterResponse hooks (array order)
        ↓
   (if error) → All onError hooks
```

---

## Framework Adapters

### React

```tsx
import { LensProvider, useLensClient } from '@sylphx/lens-react'

function App() {
  return (
    <LensProvider client={client}>
      <UserProfile />
    </LensProvider>
  )
}

function UserProfile() {
  const client = useLensClient<AppRouter>()
  const { data, loading } = useQuery(client.user.me())

  if (loading) return <div>Loading...</div>
  return <div>Welcome, {data?.name}!</div>
}
```

### SolidJS

```tsx
import { LensProvider, useLensClient } from '@sylphx/lens-solid'

function App() {
  return (
    <LensProvider client={client}>
      <UserProfile />
    </LensProvider>
  )
}

function UserProfile() {
  const client = useLensClient<AppRouter>()
  const user = createQuery(() => client.user.me())

  return (
    <Show when={!user.loading} fallback={<div>Loading...</div>}>
      <div>Welcome, {user.data?.name}!</div>
    </Show>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { provideLensClient, useLensClient, useQuery } from '@sylphx/lens-vue'

const client = useLensClient<AppRouter>()
const { data, loading } = useQuery(() => client.user.me())
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else>Welcome, {{ data?.name }}!</div>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { provideLensClient, useLensClient, query } from '@sylphx/lens-svelte'

  const client = useLensClient<AppRouter>()
  const user = query(() => client.user.me())
</script>

{#if $user.loading}
  <div>Loading...</div>
{:else}
  <div>Welcome, {$user.data?.name}!</div>
{/if}
```

---

## Server Configuration

### Single Transport

```typescript
const server = createServer({
  transport: http.server({ port: 3000 }),
  router: appRouter,
})
```

### Multiple Transports

```typescript
const server = createServer({
  transport: [
    http.server({ port: 3000, path: '/api' }),
    ws.server({ port: 3000, path: '/ws' }),
  ],
  plugins: [logger(), auth(), rateLimit()],
  router: appRouter,
})
```

### With Context

```typescript
const server = createServer({
  transport: http.server({ port: 3000 }),
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
    redis: redisClient,
  }),
})
```

---

## Optimistic Updates

### Auto-Derived from Naming Convention

```typescript
// "create" prefix → auto 'create' optimistic
const createUser = mutation()
  .input(z.object({ name: z.string() }))
  .returns(User)
  .resolve(({ input }) => db.user.create({ data: input }))

// "update" prefix → auto 'merge' optimistic
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .resolve(({ input }) => db.user.update({ where: { id: input.id }, data: input }))

// "delete" prefix → auto 'delete' optimistic
const deleteUser = mutation()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => db.user.delete({ where: { id: input.id } }))
```

### Explicit DSL

```typescript
// Custom optimistic behavior
const publishPost = mutation()
  .input(z.object({ id: z.string() }))
  .returns(Post)
  .optimistic({ merge: { published: true } })  // Set specific fields
  .resolve(({ input }) => db.post.update({
    where: { id: input.id },
    data: { published: true },
  }))
```

### How It Works

1. Server defines optimistic DSL in mutation
2. Client receives DSL via handshake
3. On mutation call:
   - Apply optimistic update immediately
   - Send request to server
   - Replace with server response
   - On error: rollback

---

## API Summary

```typescript
// === Schema ===
entity(fields)                    // Define entity
relation(entity, relations)       // Define relations
t.id(), t.string(), t.int(), ... // Field types

// === Operations ===
query()
  .input(zodSchema)               // Optional input
  .returns(Entity | [Entity])     // Return type
  .resolve(fn)                    // Resolver

mutation()
  .input(zodSchema)               // Required input
  .returns(Entity | { ... })      // Return type
  .optimistic(dsl)                // Optional (auto-derived)
  .resolve(fn)                    // Resolver

router({ ... })                   // Namespace operations

// === Client ===
createClient<Api>({
  transport: Transport,
  plugins?: Plugin[],
})

// === Transports ===
http({ url })                     // HTTP transport
ws({ url })                       // WebSocket transport
sse({ url })                      // SSE transport
inProcess({ server })             // In-process transport
route({ 'path.*': transport })    // Pattern-based routing
routeByType({ default, subscription?, ... })

// === Server ===
createServer({
  transport: Transport | Transport[],
  plugins?: Plugin[],
  router: Router,
  context?: (req) => Context,
})

// === Plugins ===
logger()                          // Request/response logging
auth({ getToken })                // Authentication
retry({ attempts })               // Retry on failure
cache({ ttl })                    // Response caching
timeout({ ms })                   // Request timeout
```

---

## Package Structure

| Package | Description |
|---------|-------------|
| `@sylphx/lens-core` | Schema, operations, types (zero deps) |
| `@sylphx/lens-server` | Server, transports, execution engine |
| `@sylphx/lens-client` | Client, transports, reactive store |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-svelte` | Svelte stores |

---

## Documentation

- **[Architecture](./ARCHITECTURE.md)** - Design philosophy and decisions
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Development roadmap

---

## Philosophy

**TypeScript-first:** Same code runs on client and server. No SDL, no codegen.

**Multi-server native:** Connect to multiple backends with full type safety.

**Transport-agnostic:** HTTP, WebSocket, SSE, or custom - same API.

**Plugin-based extension:** Add functionality without modifying core.

**Reactive by default:** Every query can stream, optimistic is built-in.

---

## License

MIT © Sylphx AI

---

## Why "Lens"?

A lens focuses light to create a clear image. Similarly, Lens focuses your data layer to create a clear, type-safe, reactive API. It's the lens through which your frontend views your backend data.
