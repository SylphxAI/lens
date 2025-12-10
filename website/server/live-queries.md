# Live Queries

Live queries enable real-time data synchronization. In Lens, **every query can be a live query** - clients choose whether to subscribe.

## How It Works

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
```

## Two-Phase Resolution

Lens uses a two-phase pattern for optimal performance:

### Phase 1: Initial Resolution (Batchable)

The `.resolve()` method runs once to get the initial value. It can be batched with DataLoader for efficiency.

### Phase 2: Subscription Setup (Fire-and-forget)

The `.subscribe()` method sets up watchers that emit updates over time.

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  status: t.string()
    // Phase 1: Get initial value (batchable)
    .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))

    // Phase 2: Subscribe to updates (Publisher pattern)
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.statusService.watch(parent.id, (status) => {
        emit(status)
      })
      onCleanup(unsub)
    }),
}))
```

## Publisher Pattern

Subscriptions use the Publisher pattern where `emit` and `onCleanup` are passed via a callback:

```typescript
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  // Set up your subscription
  const unsub = ctx.eventSource.on('change', (data) => {
    emit(data)  // Push update to client
  })

  // Cleanup when client disconnects
  onCleanup(() => unsub())
})
```

This pattern keeps `emit` and `onCleanup` separate from your application context (`ctx`), making the API cleaner.

## Operation-Level Live Queries

For queries that need live updates at the operation level:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  // Phase 1: Initial data
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
  // Phase 2: Subscribe to changes
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.pubsub.on(`user:${input.id}`, (user) => {
      emit(user)
    })
    onCleanup(unsub)
  })
```

## Field-Level Live Queries

For specific fields that need real-time updates:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Only this field is live
  onlineStatus: t.enum(['online', 'away', 'offline'])
    .resolve(({ parent, ctx }) => ctx.presence.get(parent.id))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.presence.watch(parent.id, emit)
      onCleanup(unsub)
    }),

  // This field is NOT live (no .subscribe)
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: parent.id } })
  ),
}))
```

## Emit API

The `emit` function supports various update patterns:

### Full Value

```typescript
emit(newValue)
// or explicitly:
emit.value(newValue)
```

### Merge Fields

```typescript
emit.merge({ name: 'Updated Name' })
// Merges into existing object
```

### Replace

```typescript
emit.replace(entireNewObject)
// Replaces entire value
```

### Array Operations

For array fields:

```typescript
emit.push(item)         // Add to end
emit.unshift(item)      // Add to start
emit.insert(index, item) // Insert at index
emit.remove(index)       // Remove at index
emit.update(index, item) // Update at index
```

## Client Usage

Clients can choose one-time or live:

```typescript
// One-time (HTTP)
const user = await client.user.get({ id: '123' })

// Live subscription (WebSocket)
const unsubscribe = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)
})

// Stop receiving updates
unsubscribe()
```

## Incremental Transfer

Lens automatically selects the optimal transfer strategy:

| Strategy | Data Type | Use Case |
|----------|-----------|----------|
| `value` | Primitives, short strings | Full replacement |
| `delta` | Long strings (≥100 chars) | Character-level diff (~57% savings) |
| `patch` | Objects (≥50 chars) | JSON Patch RFC 6902 (~99% savings) |

You don't configure this - Lens handles it automatically based on data characteristics.

## Example: Real-time Chat

```typescript
// Model with live messages
const ChatRoom = model<AppContext>('ChatRoom', (t) => ({
  id: t.id(),
  name: t.string(),

  messages: t.many(() => Message)
    .args(z.object({ limit: z.number().default(50) }))
    .resolve(({ parent, args, ctx }) =>
      ctx.db.message.findMany({
        where: { roomId: parent.id },
        take: args.limit,
        orderBy: { createdAt: 'desc' },
      })
    )
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`room:${parent.id}:message`, (msg) => {
        emit.push(msg)
      })
      onCleanup(unsub)
    }),
}))

// Query
const getChatRoom = query()
  .input(z.object({ id: z.string() }))
  .returns(ChatRoom)
  .resolve(({ input, ctx }) => ctx.db.chatRoom.find(input.id))
```

```typescript
// Client subscribes to room
client.chatRoom.get({ id: 'room-1' }).subscribe((room) => {
  // Called on initial load and every new message
  renderMessages(room.messages)
})
```

## Example: Live Dashboard

```typescript
const Dashboard = model<AppContext>('Dashboard', (t) => ({
  id: t.id(),

  // Live metrics
  activeUsers: t.int()
    .resolve(({ ctx }) => ctx.metrics.getActiveUsers())
    .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
      const interval = setInterval(async () => {
        emit(await ctx.metrics.getActiveUsers())
      }, 5000)
      onCleanup(() => clearInterval(interval))
    }),

  // Live revenue
  revenue: t.float()
    .resolve(({ ctx }) => ctx.metrics.getRevenue())
    .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.metrics.onRevenueChange(emit)
      onCleanup(unsub)
    }),
}))
```

## Best Practices

### 1. Use Two-Phase for Expensive Operations

```typescript
// ✅ Good: Separate initial and updates
status: t.string()
  .resolve(({ parent, ctx }) => ctx.cache.get(`status:${parent.id}`))
  .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
    ctx.events.on(`status:${parent.id}`, emit)
    onCleanup(() => ctx.events.off(`status:${parent.id}`, emit))
  })

// ❌ Bad: Mixing concerns
status: t.string().resolve(({ parent, ctx }) => {
  // Don't set up subscriptions in resolve
  ctx.events.on(`status:${parent.id}`, (s) => ctx.emit(s))
  return ctx.cache.get(`status:${parent.id}`)
})
```

### 2. Always Clean Up

```typescript
// ✅ Good: Proper cleanup
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  const unsub = ctx.pubsub.on('event', emit)
  onCleanup(unsub)  // Clean up on disconnect
})

// ❌ Bad: Memory leak
.subscribe(({ parent, ctx }) => ({ emit }) => {
  ctx.pubsub.on('event', emit)  // Never cleaned up!
})
```

### 3. Debounce High-Frequency Updates

```typescript
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  let timeout: NodeJS.Timeout | null = null
  let pending: unknown = null

  const unsub = ctx.rapidEvents.on('update', (data) => {
    pending = data
    if (!timeout) {
      timeout = setTimeout(() => {
        emit(pending)
        timeout = null
      }, 100)  // Debounce to 10 updates/sec max
    }
  })

  onCleanup(() => {
    unsub()
    if (timeout) clearTimeout(timeout)
  })
})
```

### 4. Consider Partial Updates

```typescript
// ✅ Good: Only emit changed fields
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  ctx.events.on('userUpdate', (changes) => {
    emit.merge(changes)  // Only send changed fields
  })
})

// ⚠️ Less efficient: Emit full object
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  ctx.events.on('userUpdate', async () => {
    const user = await ctx.db.user.find(parent.id)
    emit(user)  // Sends entire user even for small changes
  })
})
```
