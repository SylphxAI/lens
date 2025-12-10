# Two-Phase Field Resolution

Lens uses a two-phase resolution pattern for live fields. This architectural decision enables optimal performance while supporting real-time updates.

## The Problem

Traditional approaches have trade-offs:

### Approach A: Subscription-Only
```typescript
// All data comes through subscription
field.subscribe(({ emit }) => {
  const initial = await getData()
  emit(initial)
  // Then watch for updates...
})
```

**Issues:**
- Initial data can't be batched with DataLoader
- Every field resolver runs serially
- N+1 queries inevitable

### Approach B: Resolve-Only
```typescript
// Resolve returns both data and subscription
field.resolve(({ ctx }) => {
  const data = await getData()
  ctx.emit(data)  // For updates
  return data
})
```

**Issues:**
- Mixing concerns (fetching + subscribing)
- Difficult to test
- Unclear lifecycle

## Two-Phase Solution

Separate initial resolution from subscription:

```typescript
const User = model<AppContext>('User', (t) => ({
  status: t.string()
    // Phase 1: Initial value (batchable)
    .resolve(({ parent, ctx }) =>
      ctx.cache.get(`status:${parent.id}`)
    )
    // Phase 2: Subscribe to updates (fire-and-forget)
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, emit)
      onCleanup(unsub)
    }),
}))
```

## How It Works

### Phase 1: Initial Resolution

```
┌────────────────────────────────────────────────────────┐
│                    PHASE 1: RESOLVE                     │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Request comes in                                       │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────┐                                   │
│  │  DataLoader     │ ◄─── Batches parallel requests    │
│  │  collects keys  │                                   │
│  └─────────────────┘                                   │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────┐                                   │
│  │  Execute batch  │ ◄─── Single DB query              │
│  │  query          │                                   │
│  └─────────────────┘                                   │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────┐                                   │
│  │  Return initial │ ◄─── Send to client immediately   │
│  │  data           │                                   │
│  └─────────────────┘                                   │
│                                                         │
└────────────────────────────────────────────────────────┘
```

Benefits:
- Uses DataLoader for N+1 prevention
- Parallel field resolution
- Fast initial response

### Phase 2: Subscription Setup

```
┌────────────────────────────────────────────────────────┐
│                 PHASE 2: SUBSCRIBE                      │
├────────────────────────────────────────────────────────┤
│                                                         │
│  After initial response sent                            │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────┐                                   │
│  │  Set up event   │ ◄─── Fire-and-forget              │
│  │  listeners      │       (doesn't block response)    │
│  └─────────────────┘                                   │
│         │                                               │
│         ├──────────────────────┐                       │
│         │                      │                       │
│         ▼                      ▼                       │
│  ┌─────────────┐       ┌─────────────┐                │
│  │  Listener 1 │       │  Listener N │                │
│  │  (field A)  │       │  (field Z)  │                │
│  └─────────────┘       └─────────────┘                │
│         │                      │                       │
│         └──────────────────────┘                       │
│                    │                                    │
│                    ▼ Event fires                        │
│         ┌─────────────────┐                            │
│         │  emit(newValue) │ ◄─── Push to client        │
│         └─────────────────┘                            │
│                                                         │
└────────────────────────────────────────────────────────┘
```

Benefits:
- Non-blocking setup
- Independent of initial resolution
- Clean lifecycle (onCleanup for teardown)

## Publisher Pattern

The subscription uses a "Publisher" pattern:

```typescript
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  // This function IS the publisher
  // emit and onCleanup are provided by the framework
})
```

Why this pattern?

1. **Separation of concerns**: `ctx` is your app context, `emit`/`onCleanup` are framework concerns
2. **Type safety**: `emit` is typed to the field's return type
3. **Testability**: Easy to mock emit/onCleanup for testing

## Complete Example

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Simple resolved field (no live updates)
  fullName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),

  // Live field with two-phase resolution
  unreadCount: t.int()
    // Phase 1: Get current count (batchable)
    .resolve(async ({ parent, ctx }) => {
      return ctx.loaders.unreadCount.load(parent.id)
    })
    // Phase 2: Subscribe to changes
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const handler = (count: number) => emit(count)

      ctx.notifications.on(`unread:${parent.id}`, handler)

      onCleanup(() => {
        ctx.notifications.off(`unread:${parent.id}`, handler)
      })
    }),

  // Another live field
  onlineStatus: t.enum(['online', 'away', 'offline'])
    .resolve(({ parent, ctx }) =>
      ctx.presence.getStatus(parent.id)
    )
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.presence.watch(parent.id, emit)
      onCleanup(unsub)
    }),
}))
```

## Performance Comparison

| Approach | Initial Load | Batching | Live Updates |
|----------|--------------|----------|--------------|
| Subscription-only | Slow | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Resolve-only | Fast | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:alert-triangle" class="inline-icon text-yellow" /> Mixed |
| Two-Phase | Fast | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> Clean |

## When to Use Each Phase

### Use `.resolve()` only when:
- Field is computed but doesn't need live updates
- Data changes infrequently

```typescript
fullName: t.string().resolve(({ parent }) =>
  `${parent.firstName} ${parent.lastName}`
)
```

### Use `.resolve().subscribe()` when:
- Field needs real-time updates
- You want optimal initial load performance

```typescript
status: t.string()
  .resolve(({ parent, ctx }) => ctx.cache.get(`status:${parent.id}`))
  .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
    // ...
  })
```

## Testing Two-Phase Fields

```typescript
describe('User.unreadCount', () => {
  it('resolves initial value', async () => {
    const user = await resolveUser({ id: '1' })
    expect(user.unreadCount).toBe(5)
  })

  it('subscribes to updates', async () => {
    const emits: number[] = []
    const cleanup = jest.fn()

    // Get the publisher
    const publisher = User.fields.unreadCount.subscribe({
      parent: { id: '1' },
      ctx: mockContext,
    })

    // Call with mock emit/onCleanup
    publisher({
      emit: (v) => emits.push(v),
      onCleanup: cleanup,
    })

    // Simulate event
    mockContext.notifications.emit('unread:1', 10)

    expect(emits).toEqual([10])

    // Test cleanup
    // ... disconnect
    expect(cleanup).toHaveBeenCalled()
  })
})
```

## Migration Guide

### From Subscription-Only

```typescript
// Before
status: t.string().subscribe(async ({ emit }) => {
  const initial = await getStatus()
  emit(initial)
  onChange(emit)
})

// After
status: t.string()
  .resolve(({ ctx }) => getStatus())
  .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
    const unsub = onChange(emit)
    onCleanup(unsub)
  })
```

### From Mixed Resolve

```typescript
// Before
status: t.string().resolve(async ({ ctx }) => {
  const value = await getStatus()
  ctx.emit(value)  // Mixing concerns
  return value
})

// After
status: t.string()
  .resolve(({ ctx }) => getStatus())
  .subscribe(({ ctx }) => ({ emit, onCleanup }) => {
    // Separate subscription logic
  })
```
