# Architecture Deep Dive

Understanding Lens's internal architecture helps you build more efficient applications.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LENS ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Client     │    │   Transport  │    │   Server     │                  │
│  │              │◄──►│  (HTTP/WS)   │◄──►│              │                  │
│  │  - Query     │    │              │    │  - Router    │                  │
│  │  - Subscribe │    │  - Encode    │    │  - Execute   │                  │
│  │  - Mutate    │    │  - Decode    │    │  - Resolve   │                  │
│  └──────────────┘    │  - Stream    │    │  - Emit      │                  │
│                      └──────────────┘    └──────────────┘                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SHARED CORE                                  │   │
│  │                                                                      │   │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐             │   │
│  │   │   Models    │   │  Operations │   │   Types     │             │   │
│  │   │             │   │             │   │             │             │   │
│  │   │ - Fields    │   │ - Query     │   │ - Inferred  │             │   │
│  │   │ - Relations │   │ - Mutation  │   │ - Validated │             │   │
│  │   │ - Resolvers │   │ - Router    │   │ - Selected  │             │   │
│  │   └─────────────┘   └─────────────┘   └─────────────┘             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Request Flow

### Query Flow

```
Client                    Transport               Server
  │                           │                      │
  │ client.user.get({id})     │                      │
  │ ─────────────────────────►│                      │
  │                           │ HTTP GET /api/lens   │
  │                           │ ─────────────────────►
  │                           │                      │
  │                           │    Router.execute()  │
  │                           │    ┌─────────────────┤
  │                           │    │ 1. Validate     │
  │                           │    │ 2. Resolve      │
  │                           │    │ 3. Select       │
  │                           │    └─────────────────┤
  │                           │                      │
  │                           │◄─────────────────────│
  │◄──────────────────────────│ JSON Response       │
  │                           │                      │
```

### Subscription Flow

```
Client                    Transport               Server
  │                           │                      │
  │ .subscribe()              │                      │
  │ ─────────────────────────►│                      │
  │                           │ WS Connect           │
  │                           │ ─────────────────────►
  │                           │                      │
  │                           │    Initial data      │
  │◄══════════════════════════│◄═════════════════════│
  │                           │                      │
  │                           │    emit() called     │
  │◄══════════════════════════│◄═════════════════════│ Update 1
  │                           │                      │
  │◄══════════════════════════│◄═════════════════════│ Update 2
  │                           │                      │
  │ unsubscribe()             │                      │
  │ ─────────────────────────►│ WS Close            │
  │                           │ ─────────────────────►
```

## Core Components

### 1. Models

Models define data shape and field behavior:

```typescript
const User = model<AppContext>('User', (t) => ({
  // Exposed: Value from parent object
  id: t.id(),
  name: t.string(),

  // Resolved: Computed at runtime
  fullName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),

  // Live: Resolved + subscribes to updates
  status: t.string()
    .resolve(({ parent, ctx }) => ctx.cache.get(`status:${parent.id}`))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, emit)
      onCleanup(unsub)
    }),
}))
```

Field modes:
- **Exposed**: Direct pass-through from parent data
- **Resolved**: Computed once per request
- **Live**: Computed + subscription for updates

### 2. Router

Organizes operations into namespaces:

```typescript
const appRouter = router({
  user: {
    get: query()...,
    create: mutation()...,
    settings: {
      get: query()...,
      update: mutation()...,
    },
  },
})

// Flattened paths:
// "user.get"
// "user.create"
// "user.settings.get"
// "user.settings.update"
```

### 3. Server

The server is a pure executor:

```typescript
const app = createApp({
  router: appRouter,
  context: (req) => ({ db, user }),
  plugins: [opLog()],
})

// Methods:
app.getMetadata()  // Returns operation map for client
app.execute(op)    // Returns Observable<Result>
```

### 4. Handlers

Protocol adapters (no business logic):

```typescript
// HTTP: Request/Response
const httpHandler = createHTTPHandler(app)

// WebSocket: Bidirectional streaming
const wsHandler = createWSHandler(app)

// SSE: Server-to-client streaming
const sseHandler = createSSEHandler(app)
```

### 5. Transport

Client-side protocol abstraction:

```typescript
// Capabilities:
interface Transport {
  query: (op) => Promise<Result>
  mutation: (op) => Promise<Result>
  subscription?: (op) => Observable<Result>
}

// Routing:
route({
  query: http({ url: '/api' }),
  subscription: ws({ url: 'wss://...' }),
})
```

## Type Flow

Types propagate from server to client:

```
Server Definition
      │
      ▼
┌─────────────────────┐
│   Router Type       │
│   (typeof router)   │
└─────────────────────┘
      │
      │ export type AppRouter = typeof appRouter
      ▼
┌─────────────────────┐
│   Client Generic    │
│   createClient<AR>  │
└─────────────────────┘
      │
      │ Type inference
      ▼
┌─────────────────────┐
│   Full Autocomplete │
│   + Type Checking   │
└─────────────────────┘
```

## Plugin Architecture

Plugins hook into the request lifecycle:

```
                 Request
                    │
                    ▼
            ┌───────────────┐
            │  onConnect    │ ← Connection established
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │  onSubscribe  │ ← Subscription created
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │beforeMutation │ ← Before mutation executes
            └───────┬───────┘
                    │
                 Execute
                    │
            ┌───────▼───────┐
            │ afterMutation │ ← After mutation completes
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │  beforeSend   │ ← Before sending to client
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │   afterSend   │ ← After sending to client
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │ onUnsubscribe │ ← Subscription ended
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │  onDisconnect │ ← Connection closed
            └───────────────┘
```

## State Management

### GraphStateManager

Tracks canonical state per entity:

```
┌─────────────────────────────────────────────┐
│           GraphStateManager                  │
├─────────────────────────────────────────────┤
│                                              │
│  User:123 ─────► { name: "Alice", ... }     │
│  User:456 ─────► { name: "Bob", ... }       │
│  Post:789 ─────► { title: "Hello", ... }    │
│                                              │
│  Per-Client State:                           │
│  ┌───────────────────────────────────────┐  │
│  │ Client A: { lastSeen: {...} }         │  │
│  │ Client B: { lastSeen: {...} }         │  │
│  └───────────────────────────────────────┘  │
│                                              │
└─────────────────────────────────────────────┘
```

### Diff Computation

Only send what changed:

```
Previous: { name: "Alice", email: "a@b.com", bio: "..." }
Current:  { name: "Bob",   email: "a@b.com", bio: "..." }

Diff: { name: "Bob" }  // ~99% smaller
```

## Performance Optimizations

### 1. DataLoader Batching

Field resolvers are automatically batched:

```typescript
// Without batching: 100 users = 100 queries
// With DataLoader: 100 users = 1 batched query

users.map(u => ctx.db.department.find(u.deptId))
// Automatically batched into:
// ctx.db.department.findMany({ id: { in: [...deptIds] } })
```

### 2. Incremental Transfer

Update strategy selection:

| Data Size | Data Type | Strategy |
|-----------|-----------|----------|
| < 50 bytes | Any | Value (full) |
| ≥ 100 chars | String | Delta (char-diff) |
| ≥ 50 chars | Object | Patch (JSON Patch) |

### 3. Connection Pooling

WebSocket connections are multiplexed:

```
┌─────────┐          ┌─────────┐
│Client A │──────────│         │
│         │          │  Single │
│Client A │──────────│  WebSocket
│         │          │  Connection
│Client A │──────────│         │
└─────────┘          └─────────┘
   10 subscriptions = 1 connection
```

## Extending Lens

### Custom Transport

```typescript
const customTransport: Transport = {
  async query(op) {
    // Custom implementation
  },
  async mutation(op) {
    // Custom implementation
  },
  subscription(op) {
    return new Observable((observer) => {
      // Custom implementation
    })
  },
}
```

### Custom Plugin

```typescript
const myPlugin: ServerPlugin = {
  name: 'my-plugin',
  onConnect: (ctx) => { /* ... */ },
  beforeMutation: (ctx) => { /* ... */ },
  afterSend: (ctx) => { /* ... */ },
}
```

### Custom Storage

```typescript
const customStorage: OpLogStorage = {
  async get(key) { /* ... */ },
  async set(key, value, ttl) { /* ... */ },
  async delete(key) { /* ... */ },
}
```
