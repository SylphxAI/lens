# Core Concepts

This page explains the fundamental concepts that make Lens unique.

## Live Queries

In Lens, **every query is a live query**. When you subscribe to a query, the server:

1. Executes the resolver and sends initial data
2. Tracks which entities and fields you're watching
3. When data changes, computes and sends only the differences

### How Updates Propagate

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

## Incremental Transfer

Lens automatically selects the optimal transfer strategy for each field:

| Strategy | Data Type | Use Case |
|----------|-----------|----------|
| `value` | Primitives, short strings | Full replacement |
| `delta` | Long strings (≥100 chars) | Character-level diff (~57% savings) |
| `patch` | Objects (≥50 chars) | JSON Patch RFC 6902 (~99% savings) |

You don't think about this - Lens handles it automatically based on data characteristics.

## Type Inference

Lens provides end-to-end type safety without code generation:

```
Server Definition
      ↓
AppRouter type exported
      ↓
Client infers from AppRouter
      ↓
Full autocomplete & type checking
```

### Example

```typescript
// Server: Define operations with types
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)  // Return type
  .resolve(({ input, ctx }) => {
    return ctx.db.user.find(input.id)
    // TypeScript enforces return matches User
  })

// Client: Types flow automatically
const user = await client.user.get({ id: '123' })
//    ^? User type inferred automatically

user.name  // ✅ Autocomplete works
user.foo   // ❌ TypeScript error
```

## Field Selection

Like GraphQL, Lens supports selecting specific fields:

```typescript
// Select only the fields you need
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    email: true,
    // posts: false (implicitly not selected)
  }
})

// user only has { name, email }
// TypeScript knows the exact shape
```

### Nested Selection

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      select: {
        title: true,
        author: { select: { name: true } }
      }
    }
  }
})
```

### Field Arguments

Like GraphQL, fields can have arguments:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: { title: true }
    }
  }
})
```

## Two-Phase Resolution

Lens uses a two-phase resolution pattern for optimal performance:

### Phase 1: Initial Resolution (Batchable)
- Executes `.resolve()` for all fields
- Can use DataLoader for batching
- Returns initial value immediately

### Phase 2: Subscription Setup (Fire-and-forget)
- Executes `.subscribe()` for live fields
- Sets up watchers/publishers
- Updates stream over time

```typescript
// Example: Live field with two-phase resolution
const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),
  // Phase 1: Get initial status (batchable)
  // Phase 2: Subscribe to updates
  status: t.string()
    .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      ctx.statusService.watch(parent.id, (s) => emit(s))
      onCleanup(() => ctx.statusService.unwatch(parent.id))
    })
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

This keeps `emit` and `onCleanup` separate from your application context (`ctx`), making the API cleaner.

## Next Steps

- [Comparison](/guide/comparison) - How Lens compares to alternatives
- [Models](/server/models) - Define your data models
- [Live Queries](/server/live-queries) - Implement live queries
