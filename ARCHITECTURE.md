# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**
> Single Source of Truth (SSOT) Document

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "GraphQL concepts, TypeScript implementation"             │
│                                                             │
│   - Operations define entry points (any query/mutation)     │
│   - Entity Resolvers handle nested data                     │
│   - Everything is reactive and can stream                   │
│   - Type-safe without codegen                               │
│   - Multi-server native with automatic metadata merging     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

**Problem with GraphQL:**
- Requires schema definition language (SDL)
- Requires code generation for type safety
- Two sources of truth (SDL + resolvers)
- Federation is complex for multi-server

**Problem with tRPC:**
- No entity-based data model
- No automatic nested resolution
- No built-in optimistic updates
- Manual multi-server routing

**Lens Solution:**
- TypeScript IS the schema (no SDL, no codegen)
- Operations define entry points (like GraphQL Query/Mutation)
- Entity Resolvers handle nested data (like GraphQL type resolvers)
- Reactive by default, optimistic built-in
- **Multi-server native with automatic handshake merging**

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Plugins                            │   │
│  │    [logger] → [auth] → [retry] → [cache]             │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Transport                           │   │
│  │    route([                                            │   │
│  │      [auth.*, http('/auth')],                        │   │
│  │      [analytics.*, http('/analytics')],              │   │
│  │      http('/api')  // fallback                       │   │
│  │    ])                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        Servers                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Auth Server │  │Analytics Srv│  │    Main Server      │ │
│  │ /auth       │  │ /analytics  │  │    /api             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Transport System

### Transport Interface

Every transport implements this simple interface:

```typescript
interface Transport {
  /**
   * Connect to server and get operation metadata.
   * Called once during client initialization.
   */
  connect(): Promise<Metadata>

  /**
   * Execute an operation.
   * Returns Promise for query/mutation, Observable for subscription.
   */
  execute(op: Operation): Promise<Result> | Observable<Result>
}

interface Metadata {
  version: string
  operations: {
    [path: string]: {
      type: 'query' | 'mutation' | 'subscription'
      optimistic?: OptimisticDSL
    }
  }
}

interface Operation {
  id: string
  path: string                    // e.g., 'user.get', 'auth.login'
  type: 'query' | 'mutation' | 'subscription'
  input?: unknown
  meta?: Record<string, unknown>  // For plugins to attach data
}

interface Result<T = unknown> {
  data?: T
  error?: Error
}
```

### Why Transport Handles Handshake

Each transport is responsible for its own handshake because:

1. **Different protocols** - HTTP uses GET, WebSocket sends message
2. **Multi-server** - Each transport connects to different server
3. **Route transport** - Automatically merges child handshakes

```typescript
// HTTP transport
const http = (options): Transport => ({
  async connect() {
    const res = await fetch(`${options.url}/__lens/metadata`)
    return res.json()
  },
  async execute(op) {
    return fetch(options.url, { body: JSON.stringify(op) })
  },
})

// WebSocket transport
const ws = (options): Transport => ({
  async connect() {
    const socket = new WebSocket(options.url)
    await waitForOpen(socket)
    socket.send(JSON.stringify({ type: 'handshake' }))
    return waitForMessage(socket, 'handshake')
  },
  execute(op) {
    socket.send(JSON.stringify(op))
    return op.type === 'subscription'
      ? createWsObservable(socket, op)
      : waitForResponse(socket, op.id)
  },
})

// In-process transport (testing, SSR)
const inProcess = ({ server }): Transport => ({
  async connect() {
    return server.getMetadata()  // Direct call
  },
  execute(op) {
    return server.execute(op)    // Direct call
  },
})
```

### Route Transport (Multi-Server)

Route transport connects to multiple servers and merges metadata:

```typescript
function route(routes: [...[Condition, Transport][], Transport]): Transport {
  return {
    async connect() {
      // Connect all child transports in parallel
      const results = await Promise.all(
        routes.map(async (item) => {
          if (Array.isArray(item)) {
            const [_, transport] = item
            return transport.connect()
          }
          return item.connect()  // fallback
        })
      )

      // Merge all metadata
      return {
        version: results[0]?.version ?? '1.0.0',
        operations: Object.assign({}, ...results.map(r => r.operations)),
      }
    },

    execute(op) {
      // Find matching transport
      for (const item of routes) {
        if (Array.isArray(item)) {
          const [condition, transport] = item
          if (condition(op)) return transport.execute(op)
        } else {
          return item.execute(op)  // fallback
        }
      }
      throw new Error('No matching transport')
    },
  }
}
```

### routeByType Shorthand

Common pattern for splitting by operation type:

```typescript
function routeByType(config: {
  query?: Transport
  mutation?: Transport
  subscription?: Transport
  default: Transport
}): Transport {
  const routes: [...[Condition, Transport][], Transport] = []

  if (config.query) {
    routes.push([op => op.type === 'query', config.query])
  }
  if (config.mutation) {
    routes.push([op => op.type === 'mutation', config.mutation])
  }
  if (config.subscription) {
    routes.push([op => op.type === 'subscription', config.subscription])
  }
  routes.push(config.default)

  return route(routes)
}
```

### Transport Handles All Operation Types

Each transport handles all operation types internally:

```typescript
// HTTP: subscriptions via polling
function http(options): Transport {
  return {
    execute(op) {
      if (op.type === 'subscription') {
        return createPollingObservable(options.url, op, options.polling)
      }
      return fetch(options.url, { body: JSON.stringify(op) })
    },
  }
}

// WebSocket: subscriptions via native WS
function ws(options): Transport {
  return {
    execute(op) {
      if (op.type === 'subscription') {
        return createWsObservable(socket, op)
      }
      return sendAndWait(socket, op)
    },
  }
}

// SSE: subscriptions via EventSource
function sse(options): Transport {
  return {
    execute(op) {
      if (op.type === 'subscription') {
        return createSseObservable(options.url, op)
      }
      // Fallback to HTTP for query/mutation
      return fetch(options.url, { body: JSON.stringify(op) })
    },
  }
}
```

---

## 2. Plugin System

### Plugin Interface

Plugins use lifecycle hooks - no chain, no ordering complexity:

```typescript
interface Plugin {
  name: string

  /**
   * Called before sending request.
   * Can modify operation or return new one.
   */
  beforeRequest?: (op: Operation) => Operation | Promise<Operation>

  /**
   * Called after receiving response.
   * Can modify result or return new one.
   */
  afterResponse?: (result: Result, op: Operation) => Result | Promise<Result>

  /**
   * Called on error.
   * Can retry, transform error, or re-throw.
   */
  onError?: (
    error: Error,
    op: Operation,
    retry: () => Promise<Result>
  ) => Result | Promise<Result>
}
```

### Execution Flow

```
Client.execute(op)
        │
        ▼
┌───────────────────────────────┐
│  beforeRequest hooks          │
│  plugin1.beforeRequest(op)    │
│  plugin2.beforeRequest(op)    │
│  plugin3.beforeRequest(op)    │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  transport.execute(op)        │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  afterResponse hooks          │
│  plugin1.afterResponse(result)│
│  plugin2.afterResponse(result)│
│  plugin3.afterResponse(result)│
└───────────────────────────────┘
        │
        ▼
      Result

(On error, onError hooks are called instead of afterResponse)
```

### Why Hooks Instead of Chain

**Traditional middleware chain (tRPC, Express):**
```typescript
// Order matters, hard to understand
links: [
  loggerLink(),    // Must be first?
  authLink(),      // Before or after retry?
  retryLink(),     // Wraps what follows?
  httpLink(),      // Must be last!
]
```

**Plugin hooks (Lens, Vite-style):**
```typescript
// Order doesn't matter for most plugins
plugins: [
  retry(),
  logger(),
  auth(),
  cache(),
]
```

Each plugin declares WHAT it does (beforeRequest, afterResponse), not WHERE in the chain.

### Built-in Plugins

```typescript
// Logger
const logger = (options?: { level?: 'debug' | 'info' }): Plugin => ({
  name: 'logger',
  beforeRequest: (op) => {
    console.log(`→ ${op.path}`, op.input)
    return op
  },
  afterResponse: (result, op) => {
    console.log(`← ${op.path}`, result.data ?? result.error)
    return result
  },
})

// Auth
const auth = (options: { getToken: () => string | Promise<string> }): Plugin => ({
  name: 'auth',
  beforeRequest: async (op) => {
    const token = await options.getToken()
    op.meta = { ...op.meta, headers: { Authorization: `Bearer ${token}` } }
    return op
  },
})

// Retry
const retry = (options?: { attempts?: number }): Plugin => ({
  name: 'retry',
  onError: async (error, op, retry) => {
    if (op.meta?.retryCount >= (options?.attempts ?? 3)) {
      throw error
    }
    op.meta = { ...op.meta, retryCount: (op.meta?.retryCount ?? 0) + 1 }
    return retry()
  },
})

// Cache
const cache = (options?: { ttl?: number }): Plugin => {
  const store = new Map<string, { result: Result; expires: number }>()

  return {
    name: 'cache',
    beforeRequest: (op) => {
      if (op.type !== 'query') return op
      const key = JSON.stringify([op.path, op.input])
      const cached = store.get(key)
      if (cached && cached.expires > Date.now()) {
        op.meta = { ...op.meta, cached: cached.result }
      }
      return op
    },
    afterResponse: (result, op) => {
      if (op.type !== 'query') return result
      const key = JSON.stringify([op.path, op.input])
      store.set(key, { result, expires: Date.now() + (options?.ttl ?? 60000) })
      return result
    },
  }
}
```

---

## 3. Server Architecture

### Server Interface

```typescript
interface LensServer {
  /**
   * Get operation metadata for handshake.
   */
  getMetadata(): Metadata

  /**
   * Execute an operation.
   */
  execute(op: Operation): Promise<Result> | Observable<Result>
}
```

### createServer

```typescript
function createServer(config: {
  transport: ServerTransport | ServerTransport[]
  plugins?: Plugin[]
  router: Router
  context?: (req: Request) => Context | Promise<Context>
}): LensServer {

  const server: LensServer = {
    getMetadata() {
      return buildMetadataFromRouter(config.router)
    },

    async execute(op) {
      // Build context
      const ctx = await config.context?.(op.meta?.request)

      // Run beforeRequest plugins
      for (const plugin of config.plugins ?? []) {
        op = await plugin.beforeRequest?.(op) ?? op
      }

      // Execute operation
      let result: Result
      try {
        const handler = findHandler(config.router, op.path)
        const data = await handler.resolve({ input: op.input, ctx })
        result = { data }
      } catch (error) {
        result = { error: error as Error }
      }

      // Run afterResponse plugins
      for (const plugin of config.plugins ?? []) {
        result = await plugin.afterResponse?.(result, op) ?? result
      }

      return result
    },
  }

  // Start transports
  const transports = Array.isArray(config.transport)
    ? config.transport
    : [config.transport]

  for (const transport of transports) {
    transport.listen(server)
  }

  return server
}
```

### Server Transport Interface

```typescript
interface ServerTransport {
  /**
   * Start listening and route requests to server.
   */
  listen(server: LensServer): void
}

// HTTP Server Transport
const httpServer = (options: { port: number; path?: string }): ServerTransport => ({
  listen(server) {
    Bun.serve({
      port: options.port,
      fetch(req) {
        const url = new URL(req.url)

        // Metadata endpoint
        if (url.pathname === `${options.path ?? ''}/__lens/metadata`) {
          return Response.json(server.getMetadata())
        }

        // Operation endpoint
        if (req.method === 'POST') {
          const body = await req.json()
          const result = await server.execute(body)
          return Response.json(result)
        }
      },
    })
  },
})

// WebSocket Server Transport
const wsServer = (options: { port: number }): ServerTransport => ({
  listen(server) {
    Bun.serve({
      port: options.port,
      websocket: {
        message(ws, message) {
          const data = JSON.parse(message)

          if (data.type === 'handshake') {
            ws.send(JSON.stringify({
              type: 'handshake',
              ...server.getMetadata(),
            }))
            return
          }

          // Execute operation
          const result = await server.execute(data)
          ws.send(JSON.stringify({ id: data.id, ...result }))
        },
      },
    })
  },
})
```

---

## 4. Multi-Server Architecture

### The Problem

Microservices mean multiple backends:
- Auth service (login, logout, session)
- User service (profiles, settings)
- Analytics service (events, metrics)
- Payment service (subscriptions, invoices)

Traditional approaches:
- **Manual routing**: Lose type safety
- **GraphQL Federation**: Complex setup
- **API Gateway**: Single point of failure

### Lens Solution

**Each server exports its router type:**

```typescript
// @company/auth-server/src/router.ts
export const authRouter = router({
  auth: {
    login: mutation()
      .input(z.object({ email: z.string(), password: z.string() }))
      .returns(Session)
      .resolve(({ input }) => authService.login(input)),

    logout: mutation()
      .resolve(({ ctx }) => authService.logout(ctx.session)),

    me: query()
      .returns(User)
      .resolve(({ ctx }) => ctx.currentUser),
  },
})

export type AuthRouter = typeof authRouter
```

```typescript
// @company/user-server/src/router.ts
export const userRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input }) => userService.getUser(input.id)),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string().optional() }))
      .returns(User)
      .optimistic('merge')
      .resolve(({ input }) => userService.updateUser(input)),
  },
})

export type UserRouter = typeof userRouter
```

**Client merges types and routes:**

```typescript
// client/src/api.ts
import type { AuthRouter } from '@company/auth-server'
import type { UserRouter } from '@company/user-server'
import type { AnalyticsRouter } from '@company/analytics-server'

// Merge all router types
type Api = AuthRouter & UserRouter & AnalyticsRouter

const client = createClient<Api>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/user-api' }),  // fallback
  }),
  plugins: [logger(), auth({ getToken: () => localStorage.token })],
})

// Full type safety across all servers!
await client.auth.login({ email, password })      // → auth-api
await client.analytics.track({ event: 'click' })  // → analytics-api
await client.user.get({ id: '123' })              // → user-api
```

### Handshake Flow

```
createClient()
     │
     ▼
transport.connect()  ← route transport
     │
     ├── http('/auth-api').connect()
     │   └── GET /auth-api/__lens/metadata
     │   └── { operations: { 'auth.login': { type: 'mutation' }, ... } }
     │
     ├── http('/analytics-api').connect()
     │   └── GET /analytics-api/__lens/metadata
     │   └── { operations: { 'analytics.track': { type: 'mutation' }, ... } }
     │
     └── http('/user-api').connect()
         └── GET /user-api/__lens/metadata
         └── { operations: { 'user.get': { type: 'query' }, ... } }
     │
     ▼
Merged metadata:
{
  operations: {
    'auth.login': { type: 'mutation' },
    'auth.logout': { type: 'mutation' },
    'analytics.track': { type: 'mutation' },
    'user.get': { type: 'query' },
    'user.update': { type: 'mutation', optimistic: 'merge' },
  }
}
     │
     ▼
Client ready!
- Knows all operations
- Knows their types
- Knows optimistic strategies
```

### Benefits

| Feature | Lens Multi-Server | GraphQL Federation | Manual |
|---------|-------------------|-------------------|--------|
| Type Safety | ✅ Full | ✅ With codegen | ❌ |
| Setup Complexity | Low | High | Medium |
| Single Config | ✅ | ❌ Gateway needed | ❌ |
| Optimistic Merging | ✅ Auto | ❌ Manual | ❌ |
| Runtime Discovery | ✅ Handshake | ❌ Build-time | ❌ |

---

## 5. Optimistic Updates

### How It Works

1. **Server defines** optimistic DSL in mutation
2. **Handshake transmits** DSL to client
3. **Client executes** optimistic update immediately
4. **Server responds** with real data
5. **Client replaces** optimistic with real
6. **On error** client rolls back

### Optimistic DSL

```typescript
// Auto-derived from naming convention
const createUser = mutation()  // 'create' → auto 'create' optimistic
const updateUser = mutation()  // 'update' → auto 'merge' optimistic
const deleteUser = mutation()  // 'delete' → auto 'delete' optimistic

// Explicit DSL
const publishPost = mutation()
  .optimistic('merge')                        // Merge input into entity
  .optimistic('create')                       // Create with tempId
  .optimistic('delete')                       // Mark as deleted
  .optimistic({ merge: { published: true } }) // Merge with extra fields
  .optimistic({ create: { status: 'draft' }}) // Create with extra fields
```

### Metadata Contains Optimistic Config

```typescript
// Server metadata response
{
  operations: {
    'user.create': {
      type: 'mutation',
      optimistic: 'create',  // Auto-derived from name
    },
    'user.update': {
      type: 'mutation',
      optimistic: 'merge',   // Auto-derived from name
    },
    'post.publish': {
      type: 'mutation',
      optimistic: { merge: { published: true } },  // Explicit
    },
  }
}
```

### Client Execution

```typescript
// Client internally
async execute(path, input) {
  const meta = this.metadata.operations[path]

  // Apply optimistic update if mutation
  let rollback: (() => void) | null = null
  if (meta?.type === 'mutation' && meta.optimistic) {
    rollback = this.store.applyOptimistic(path, input, meta.optimistic)
  }

  try {
    // Execute through transport
    const result = await this.transport.execute({ path, input, type: meta.type })

    // Replace optimistic with real data
    if (meta?.type === 'mutation') {
      this.store.replaceOptimistic(path, result.data)
    }

    return result
  } catch (error) {
    // Rollback on error
    rollback?.()
    throw error
  }
}
```

---

## 6. Three-Layer Data Model

### Layer 1: Schema (Structure)

```typescript
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

export const relations = [
  relation(User, {
    posts: hasMany(Post, e => e.authorId),
  }),
  relation(Post, {
    author: belongsTo(User, e => e.authorId),
  }),
]
```

### Layer 2: Operations (Entry Points)

```typescript
export const appRouter = router({
  user: {
    me: query()
      .returns(User)
      .resolve(({ ctx }) => ctx.currentUser),

    search: query()
      .input(z.object({ query: z.string() }))
      .returns([User])
      .resolve(({ input, ctx }) => ctx.db.user.findMany({
        where: { name: { contains: input.query } },
      })),
  },

  post: {
    create: mutation()
      .input(z.object({ title: z.string(), content: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.create({
        data: { ...input, authorId: ctx.currentUser.id },
      })),
  },
})
```

### Layer 3: Entity Resolvers (Nested Data)

```typescript
export const resolvers = entityResolvers({
  User: {
    posts: (user, ctx) => ctx.db.post.findMany({
      where: { authorId: user.id },
    }),
  },

  Post: {
    author: (post, ctx) => ctx.db.user.findUnique({
      where: { id: post.authorId },
    }),
  },
})
```

### Why Three Layers?

**Operations are NOT tied to entities:**

| Operation | Returns | Notes |
|-----------|---------|-------|
| `user.me` | `User` | No input, returns current user |
| `user.search` | `User[]` | Custom search logic |
| `admin.promote` | `{users, logs}` | Multi-entity |
| `health.check` | `{status}` | Not even an entity! |

**Entity resolvers are reused:**

```typescript
// All three use SAME User.posts resolver
const me = await client.user.me().select({ posts: true })
const users = await client.user.search({ q: 'john' }).select({ posts: true })
const admins = await client.admin.list().select({ posts: true })
```

---

## 7. Package Structure

```
packages/
├── core/                    @sylphx/lens-core
│   ├── schema/              entity(), relation(), t.*
│   ├── operations/          query(), mutation(), router()
│   └── types/               Shared types
│
├── client/                  @sylphx/lens-client
│   ├── client/              createClient
│   ├── transport/           http, ws, sse, inProcess, route
│   ├── plugins/             logger, auth, retry, cache
│   └── store/               ReactiveStore, optimistic
│
├── server/                  @sylphx/lens-server
│   ├── server/              createServer
│   ├── transport/           http.server, ws.server
│   ├── plugins/             logger, auth, rateLimit
│   └── execution/           ExecutionEngine
│
├── react/                   @sylphx/lens-react
├── solid/                   @sylphx/lens-solid
├── vue/                     @sylphx/lens-vue
└── svelte/                  @sylphx/lens-svelte
```

---

## Design Decisions Log

### Why Transport Has connect()?

**Problem:** Multi-server needs per-transport handshake.

**Decision:** Each transport handles its own handshake. Route transport merges.

**Benefit:** Clean multi-server support, transport-specific protocols.

### Why Plugin Hooks Instead of Chain?

**Problem:** Middleware chains are confusing - order matters, hard to understand.

**Decision:** Plugins declare lifecycle hooks (beforeRequest, afterResponse, onError).

**Benefit:** Order doesn't matter (mostly), clearer mental model.

### Why Server Exposes getMetadata()?

**Problem:** In-process transport needs metadata without HTTP.

**Decision:** Server has `getMetadata()` method, transports use it.

**Benefit:** Transport-agnostic metadata access.

### Why TypeScript Types for Multi-Server?

**Problem:** How to type-check operations across multiple servers?

**Decision:** Each server exports router type. Client merges with `&`.

**Benefit:** Full type safety, compile-time checking, no runtime overhead.

---

## Philosophy

**TypeScript-first:** Same code runs on client and server. No SDL, no codegen.

**Multi-server native:** Connect to multiple backends with full type safety.

**Transport-agnostic:** HTTP, WebSocket, SSE, or custom - same API.

**Plugin-based extension:** Add functionality without modifying core.

**Reactive by default:** Every query can stream, optimistic is built-in.

**Simple > Complex:** Fewer concepts, clearer mental model.
