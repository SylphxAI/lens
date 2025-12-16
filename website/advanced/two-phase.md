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
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

const User = model('User', {
  status: string(),
})
  // Phase 1: Initial value (batchable)
  .resolve({
    status: ({ source, ctx }) =>
      ctx.cache.get(`status:${source.id}`),
  })
  // Phase 2: Subscribe to updates (fire-and-forget)
  .subscribe({
    status: ({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${source.id}`, emit)
      onCleanup(unsub)
    },
  })
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
import { lens, id, string, int } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),

  // Simple resolved field (no live updates)
  fullName: string(),

  // Live field with two-phase resolution
  unreadCount: int(),

  // Another live field
  onlineStatus: string(),
}).resolve({
  fullName: ({ source }) =>
    `${source.firstName} ${source.lastName}`,
  // Phase 1: Get current count (batchable)
  unreadCount: async ({ source, ctx }) => {
    return ctx.loaders.unreadCount.load(source.id)
  },
  onlineStatus: ({ source, ctx }) =>
    ctx.presence.getStatus(source.id),
}).subscribe({
  // Phase 2: Subscribe to changes
  unreadCount: ({ source, ctx }) => ({ emit, onCleanup }) => {
    const handler = (count: number) => emit(count)

    ctx.notifications.on(`unread:${source.id}`, handler)

    onCleanup(() => {
      ctx.notifications.off(`unread:${source.id}`, handler)
    })
  },
  onlineStatus: ({ source, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.presence.watch(source.id, emit)
    onCleanup(unsub)
  },
})
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
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

// Before
const User1 = model('User', {
  status: string(),
}).subscribe({
  status: async ({ emit }) => {
    const initial = await getStatus()
    emit(initial)
    onChange(emit)
  },
})

// After
const User2 = model('User', {
  status: string(),
}).resolve({
  status: ({ ctx }) => getStatus(),
}).subscribe({
  status: ({ ctx }) => ({ emit, onCleanup }) => {
    const unsub = onChange(emit)
    onCleanup(unsub)
  },
})
```

### From Mixed Resolve

```typescript
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

// Before
const User1 = model('User', {
  status: string(),
}).resolve({
  status: async ({ ctx }) => {
    const value = await getStatus()
    ctx.emit(value)  // Mixing concerns
    return value
  },
})

// After
const User2 = model('User', {
  status: string(),
}).resolve({
  status: ({ ctx }) => getStatus(),
}).subscribe({
  status: ({ ctx }) => ({ emit, onCleanup }) => {
    // Separate subscription logic
  },
})
```
