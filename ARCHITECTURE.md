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
│                         Client                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Plugins                           │   │
│  │    [logger] → [auth] → [retry] → [cache]            │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Transport                          │   │
│  │    route([                                           │   │
│  │      [auth.*, http('/auth')],                       │   │
│  │      [analytics.*, http('/analytics')],             │   │
│  │      http('/api')  // fallback                      │   │
│  │    ])                                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        Servers                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Auth Server │  │Analytics Srv│  │    Main Server      │ │
│  │ /auth       │  │ /analytics  │  │    /api             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Server Architecture

### Design Principle: Pure Executor

The server is a **pure executor**. It has NO:
- Connection management
- Protocol handling
- Transport logic
- Built-in WebSocket/HTTP handling

```typescript
// Server = Pure Executor
interface LensServer {
  /** Get operation metadata for transport handshake */
  getMetadata(): ServerMetadata

  /** Execute an operation */
  execute(op: LensOperation): Promise<LensResult>
}

// That's it. Nothing else in core.
```

### Why Pure Executor?

1. **Serverless compatibility** - Lambda, Vercel, Cloudflare Workers have no persistent connections
2. **Modularity** - Not everyone needs WebSocket (user's own projects don't use WS)
3. **Separation of concerns** - Protocol handling ≠ business logic
4. **Testability** - Easy to test without mocking sockets

### Server Creation

```typescript
import { createApp, router, query, mutation } from '@sylphx/lens-server'

const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } })),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.create({ data: input })),
  },
})

// Pure executor - no transport, no connection handling
const server = createApp({
  router: appRouter,
  context: () => ({ db: prisma }),
})

// Server only has these methods:
server.getMetadata()        // → { version, operations }
server.execute({ path, input })  // → { data } | { error }
```

---

## 2. Adapter Pattern

Adapters bridge the server to specific protocols/frameworks. Each adapter is a **separate module**.

### HTTP Adapter

```typescript
import { createHTTPHandler } from '@sylphx/lens-server/adapters/http'

// Creates a fetch handler
const handler = createHTTPHandler(server)

// Use with any framework:

// Bun
Bun.serve({ port: 3000, fetch: handler })

// Node (with adapter)
import { createApp } from 'http'
createApp(toNodeHandler(handler)).listen(3000)

// Vercel
export default handler

// Cloudflare Workers
export default { fetch: handler }
```

### WebSocket Adapter

```typescript
import { createWSHandler } from '@sylphx/lens-server/adapters/ws'

// Creates WS handler with connection management
const wsHandler = createWSHandler(server, {
  stateManager: createGraphStateManager(), // Optional - for subscriptions
})

// Use with Bun
Bun.serve({
  port: 3000,
  fetch: httpHandler,
  websocket: wsHandler,
})
```

### SSE Adapter

```typescript
import { createSSEHandler } from '@sylphx/lens-server/adapters/sse'

// Creates SSE handler
const sseHandler = createSSEHandler(server, {
  stateManager: createGraphStateManager(),
})

// Bun/Vercel/Cloudflare
app.get('/sse', sseHandler)
```

### Adapter Interface

```typescript
interface Adapter {
  /** Handle incoming request, route to server.execute() */
  handle(request: Request): Promise<Response>
}

// Each adapter:
// 1. Parses protocol-specific request format
// 2. Calls server.execute()
// 3. Formats protocol-specific response
```

---

## 3. Transport System (Client-Side)

### Transport Interface

Transports define how the **client** communicates with servers.

```typescript
interface Transport {
  /** Connect and get metadata */
  connect(): Promise<Metadata>

  /** Execute an operation */
  execute(op: Operation): Promise<Result> | Observable<Result>
}
```

### Capability Interfaces

Transports declare what operation types they support:

```typescript
interface QueryCapable {
  query(op: Operation): Promise<Result>
}

interface MutationCapable {
  mutation(op: Operation): Promise<Result>
}

interface SubscriptionCapable {
  subscription(op: Operation): Observable<Result>
}

// Transport types (combinations)
type HttpTransport = QueryCapable & MutationCapable
type WsTransport = QueryCapable & MutationCapable & SubscriptionCapable
type SseTransport = QueryCapable & MutationCapable & SubscriptionCapable
type PusherTransport = SubscriptionCapable  // Subscription only
```

### Transport Capability Matrix

| Transport | Query | Mutation | Subscription | Use Case |
|-----------|-------|----------|--------------|----------|
| `http()` | ✅ | ✅ | ❌ | Simple REST-like |
| `ws()` | ✅ | ✅ | ✅ | Full real-time |
| `sse()` | ✅ | ✅ | ✅ | Serverless-friendly real-time |
| `pusher()` | ❌ | ❌ | ✅ | Third-party subscription only |
| `ably()` | ❌ | ❌ | ✅ | Third-party subscription only |

### Transport Implementations

```typescript
// HTTP transport
const http = (options): HttpTransport => ({
  async connect() {
    const res = await fetch(`${options.url}/__lens/metadata`)
    return res.json()
  },
  async execute(op) {
    return fetch(options.url, { body: JSON.stringify(op) })
  },
})

// WebSocket transport
const ws = (options): WsTransport => ({
  async connect() {
    const socket = new WebSocket(options.url)
    await waitForOpen(socket)
    socket.send(JSON.stringify({ type: 'handshake' }))
    return waitForMessage(socket, 'handshake')
  },
  execute(op) {
    return op.type === 'subscription'
      ? createWsObservable(socket, op)
      : sendAndWait(socket, op.id)
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

### routeByType (Type-Safe)

```typescript
interface RouteByTypeConfig<
  Q extends QueryCapable,
  M extends MutationCapable,
  S extends SubscriptionCapable
> {
  query?: Q
  mutation?: M
  subscription?: S
  default: QueryCapable & MutationCapable
}

// Type-safe usage:
const transport = routeByType({
  default: http({ url: '/api' }),
  subscription: pusher({ key: 'xxx' }),
})

// ✅ Works - pusher only for subscriptions
// ❌ Type Error if pusher used as default (no query/mutation)
```

---

## 4. State Management

### GraphStateManager

Tracks per-client entity state for computing minimal diffs. **Lives in adapters**, not server core.

```typescript
import { createGraphStateManager, GraphStateManager } from '@sylphx/lens-server'

// Created by adapters that need subscription support
const stateManager = createGraphStateManager()

// Used by WS/SSE adapters
const wsHandler = createWSHandler(server, { stateManager })
const sseHandler = createSSEHandler(server, { stateManager })
```

### Why State Lives in Adapters?

1. **Not all deployments need state** - HTTP-only servers don't track state
2. **State is per-connection** - Only WS/SSE have persistent connections
3. **Serverless can use external state** - Redis, Pusher, etc.

---

## 5. Plugin System

### Client Plugins

```typescript
interface ClientPlugin {
  name: string
  beforeRequest?: (op: Operation) => Operation | Promise<Operation>
  afterResponse?: (result: Result, op: Operation) => Result | Promise<Result>
  onError?: (error: Error, op: Operation, retry: () => Promise<Result>) => Result | Promise<Result>
}

// Usage
createClient({
  transport: http({ url: '/api' }),
  plugins: [
    logger(),
    auth({ getToken: () => localStorage.token }),
    retry({ attempts: 3 }),
    cache({ ttl: 60000 }),
  ],
})
```

### Server Plugins

```typescript
interface ServerPlugin {
  name: string
  onSubscribe?(ctx: SubscribeContext): void
  onUnsubscribe?(ctx: SubscribeContext): void
  beforeSend?(ctx: SendContext, data: unknown): unknown | null
  afterSend?(ctx: SendContext, data: unknown): void
}

// Usage - passed to adapters, not server
const wsHandler = createWSHandler(server, {
  stateManager,
  plugins: [
    diffOptimizer(),  // Compute minimal diffs
    logger(),
  ],
})
```

### Paired Plugins

For plugins that need matching client/server implementations:

```typescript
interface PairedPlugin {
  __paired: true
  server: ServerPlugin
  client: ClientPlugin
}

// Example: compression
const compression: PairedPlugin = {
  __paired: true,
  server: {
    name: 'compression',
    beforeSend(ctx, data) { return gzip(data) }
  },
  client: {
    name: 'compression',
    afterResponse(result) { return gunzip(result) }
  }
}

// Same import, auto-resolved
import { compression } from '@sylphx/lens-plugin-compression'

// Server adapter gets compression.server
createWSHandler(server, { plugins: [compression] })

// Client gets compression.client
createClient({ plugins: [compression] })
```

---

## 6. Deployment Scenarios

### Scenario A: Traditional Server (WebSocket)

```typescript
import { createApp, createHTTPHandler, createWSHandler } from '@sylphx/lens-server'

const server = createApp({ router })
const httpHandler = createHTTPHandler(server)
const wsHandler = createWSHandler(server, { stateManager: createGraphStateManager() })

Bun.serve({
  port: 3000,
  fetch: httpHandler,
  websocket: wsHandler,
})
```

```
┌─────────┐      WebSocket      ┌─────────┐
│ Client  │ ←─────────────────→ │ Server  │
└─────────┘                     └─────────┘
```

### Scenario B: Serverless (HTTP only)

```typescript
import { createApp, createHTTPHandler } from '@sylphx/lens-server'

const server = createApp({ router })
const handler = createHTTPHandler(server)

// Vercel
export default handler

// Cloudflare Workers
export default { fetch: handler }
```

```
┌─────────┐      HTTP POST      ┌─────────┐
│ Client  │ ──────────────────→ │ Lambda  │
└─────────┘                     └─────────┘
```

### Scenario C: Serverless + SSE

```typescript
import { createApp, createHTTPHandler, createSSEHandler } from '@sylphx/lens-server'

const server = createApp({ router })
const httpHandler = createHTTPHandler(server)
const sseHandler = createSSEHandler(server, { stateManager: createGraphStateManager() })

// Route based on path
export default (req: Request) => {
  const url = new URL(req.url)
  if (url.pathname === '/sse') return sseHandler.handle(req)
  return httpHandler.handle(req)
}
```

```
┌─────────┐      HTTP POST      ┌─────────┐
│ Client  │ ──────────────────→ │ Server  │
│         │ ←── SSE Stream ──── │         │
└─────────┘                     └─────────┘
```

### Scenario D: Third-Party Realtime (Pusher)

```typescript
// Server (Lambda)
import { createApp, createHTTPHandler, createPusherPublisher } from '@sylphx/lens-server'

const server = createApp({ router })
const httpHandler = createHTTPHandler(server)
const pusherPublisher = createPusherPublisher({ appId, key, secret })

// After mutations, publish to Pusher
server.onMutation(async (result) => {
  await pusherPublisher.publish(result.entity, result.data)
})

// Client
createClient({
  transport: routeByType({
    default: http({ url: '/api' }),
    subscription: pusher({ key: 'xxx' }),  // Subscribe via Pusher
  }),
})
```

```
┌─────────┐    HTTP     ┌─────────┐
│ Client  │ ──────────→ │ Lambda  │
│         │             └────┬────┘
│         │                  │ publish
│         │             ┌────▼────┐
│         │ ←── SSE ─── │ Pusher  │
└─────────┘             └─────────┘
```

### Quick Reference

| Scenario | Server Setup | Client Transport |
|----------|-------------|------------------|
| Full-featured | `httpHandler` + `wsHandler` | `ws()` |
| HTTP only | `httpHandler` | `http()` |
| SSE | `httpHandler` + `sseHandler` | `routeByType({ default: http(), subscription: sse() })` |
| Pusher | `httpHandler` + `pusherPublisher` | `routeByType({ default: http(), subscription: pusher() })` |

---

## 7. Package Structure

```
packages/
├── core/                    @sylphx/lens-core
│   ├── schema/              entity(), relation(), t.*
│   ├── operations/          query(), mutation(), router()
│   ├── plugin/              PairedPlugin, resolvers
│   └── types/               Shared types
│
├── client/                  @sylphx/lens-client
│   ├── client/              createClient
│   ├── transport/           http, ws, sse, pusher, route, routeByType
│   ├── plugins/             logger, auth, retry, cache
│   └── store/               ReactiveStore, optimistic
│
├── server/                  @sylphx/lens-server
│   ├── server/              createApp (pure executor)
│   ├── adapters/
│   │   ├── http.ts          createHTTPHandler
│   │   ├── ws.ts            createWSHandler
│   │   └── sse.ts           createSSEHandler
│   ├── state/               GraphStateManager
│   ├── plugins/             diffOptimizer, logger
│   └── publishers/
│       └── pusher.ts        createPusherPublisher
│
├── react/                   @sylphx/lens-react
├── solid/                   @sylphx/lens-solid
├── vue/                     @sylphx/lens-vue
└── svelte/                  @sylphx/lens-svelte
```

---

## 8. Multi-Server Architecture

### Each Server Exports Router Type

```typescript
// @company/auth-server/src/router.ts
export const authRouter = router({
  auth: {
    login: mutation()
      .input(z.object({ email: z.string(), password: z.string() }))
      .returns(Session)
      .resolve(({ input }) => authService.login(input)),
  },
})

export type AuthRouter = typeof authRouter
```

### Client Merges Types

```typescript
import type { AuthRouter } from '@company/auth-server'
import type { UserRouter } from '@company/user-server'

type Api = AuthRouter & UserRouter

const client = createClient<Api>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    '*': http({ url: '/user-api' }),
  }),
})

// Full type safety across all servers!
await client.auth.login({ email, password })  // → auth-api
await client.user.get({ id: '123' })          // → user-api
```

---

## Design Decisions Log

### Why Server is Pure Executor?

**Problem:** Built-in WebSocket/HTTP handling forces specific deployment model.

**Decision:** Server only executes operations. Adapters handle protocol.

**Benefit:** Works with Lambda, Vercel, Cloudflare, traditional servers, testing.

### Why State Lives in Adapters?

**Problem:** Not all deployments need state tracking.

**Decision:** GraphStateManager is created and managed by adapters that need it.

**Benefit:** HTTP-only deployments have zero overhead. State management is opt-in.

### Why Transport Has connect()?

**Problem:** Multi-server needs per-transport handshake.

**Decision:** Each transport handles its own handshake. Route transport merges.

**Benefit:** Clean multi-server support, transport-specific protocols.

### Why Plugin Hooks Instead of Chain?

**Problem:** Middleware chains are confusing - order matters, hard to understand.

**Decision:** Plugins declare lifecycle hooks (beforeRequest, afterResponse, onError).

**Benefit:** Order doesn't matter (mostly), clearer mental model.

---

## Philosophy

**TypeScript-first:** Same code runs on client and server. No SDL, no codegen.

**Multi-server native:** Connect to multiple backends with full type safety.

**Pure executor:** Server has no protocol knowledge. Adapters bridge to frameworks.

**Modular by default:** Nothing built-in that isn't essential. Everything is opt-in.

**Plugin-based extension:** Add functionality without modifying core.

**Reactive by default:** Every query can stream, optimistic is built-in.

**Simple > Complex:** Fewer concepts, clearer mental model.
