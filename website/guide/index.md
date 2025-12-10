# What is Lens?

Lens is a **GraphQL-like frontend-driven framework** with **automatic live queries** and **incremental transfer**. Full type safety from server to client, no codegen required.

## Key Features

- **🔄 Automatic Live Queries** - Any query can be subscribed to
- **📡 Minimal Diff Updates** - Server only sends changed fields
- **🎯 Field Selection** - Subscribe to specific fields only
- **⚡ Optimistic Updates** - Instant UI feedback with automatic rollback
- **🌐 Multi-Server Routing** - Route to different backends with full type safety
- **🔌 Plugin System** - Extensible request/response processing

## Mental Model

### Traditional Approach (tRPC, GraphQL, REST)

```typescript
// Define separate endpoints for different access patterns
const getUser = query(...)           // One-time fetch
const subscribeUser = subscription(...)  // Real-time updates (separate!)

// Client must choose which to call
const user = await trpc.getUser({ id })           // One-time
trpc.subscribeUser({ id }).subscribe(callback)    // Real-time
```

**Problems:**
- Duplicate logic between query and subscription
- Must decide upfront: "Will this need real-time?"
- Streaming requires different API pattern

### Lens Approach: Unified Query Model

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

## The Three Data Patterns

| Pattern | Server Code | Client Gets | Use Case |
|---------|-------------|-------------|----------|
| **Return** | `return data` | Initial data, then diffs when data changes | Database queries, computed values |
| **Emit** | `emit(data)` | Updates whenever you call emit | External subscriptions, webhooks, real-time feeds |
| **Yield** | `yield* stream` | Each yielded value in sequence | AI streaming, pagination, file processing |

All three patterns work with `.subscribe()` on the client!

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

## Next Steps

- [Installation](/guide/installation) - Install Lens packages
- [Quick Start](/guide/quick-start) - Build your first Lens app
- [Core Concepts](/guide/concepts) - Deep dive into live queries
