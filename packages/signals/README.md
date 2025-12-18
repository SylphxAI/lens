# @sylphx/lens-signals

Signals-based reactive store for Lens. Uses fine-grained reactivity for optimal performance.

## Installation

```bash
bun add @sylphx/lens-signals
```

## Quick Start

```typescript
import { createStore, signal, computed, effect } from "@sylphx/lens-signals";

// Create reactive store
const store = createStore();

// Get entity signal (reactive)
const user = store.getEntity<User>("User", "123");

// Computed values update automatically
const displayName = computed(() => {
  const data = user.value.data;
  return data ? `${data.name} (${data.email})` : "Loading...";
});

// Side effects react to changes
effect(() => {
  console.log("User changed:", user.value.data);
});
```

## Core Primitives

### `signal<T>(value)`

Create a reactive value:

```typescript
const count = signal(0);
count.value++;  // Triggers updates
```

### `computed<T>(fn)`

Derived values that auto-update:

```typescript
const doubled = computed(() => count.value * 2);
```

### `effect(fn)`

Run side effects on changes:

```typescript
effect(() => {
  document.title = `Count: ${count.value}`;
});
```

### `batch(fn)`

Batch multiple updates:

```typescript
batch(() => {
  count.value++;
  name.value = "New";
  // Single update notification
});
```

## Store API

### Entity State

```typescript
const store = createStore();

// Get entity signal
const user = store.getEntity<User>("User", "123");
// Returns Signal<EntityState<User>>

// EntityState shape:
// { data: User | null, loading: boolean, error: Error | null }

// Update entity
store.setEntity("User", "123", { id: "123", name: "Alice" });

// Invalidate (triggers refetch)
store.invalidate("User", "123");
```

### Optimistic Updates

```typescript
// Start transaction
const tx = store.startOptimistic();

// Apply optimistic changes
tx.set("User", "123", { ...user, name: "Optimistic" });

// On success - commit
tx.commit();

// On error - rollback
tx.rollback();
```

### Cascade Rules

Define how entity changes propagate:

```typescript
const store = createStore({
  cascadeRules: [
    {
      // When User changes, invalidate their Posts
      source: "User",
      target: "Post",
      relation: (userId) => ({ authorId: userId }),
    },
  ],
});
```

## Integration with Lens

Used internally by `@sylphx/lens-preact`. For most users, import hooks directly:

```typescript
// Preact
import { useQuery, useMutation } from "@sylphx/lens-preact";

// The hooks use signals internally for optimal reactivity
const { data, loading } = useQuery(client.user.get, { id: "123" });
```

## When to Use

| Use Case | Recommendation |
|----------|----------------|
| React app | Use `@sylphx/lens-react` |
| Preact app | Use `@sylphx/lens-preact` (uses signals) |
| Custom store | Use `@sylphx/lens-signals` directly |
| Fine-grained reactivity | Use `@sylphx/lens-signals` |

## API Reference

| Export | Description |
|--------|-------------|
| `signal(value)` | Create writable signal |
| `computed(fn)` | Create derived signal |
| `effect(fn)` | Run reactive side effect |
| `batch(fn)` | Batch updates |
| `derive(signal, fn)` | Derive from existing signal |
| `toPromise(signal)` | Convert signal to Promise |
| `isSignal(value)` | Type guard |
| `createStore(config)` | Create reactive store |
| `ReactiveStore` | Store class |

## License

MIT
