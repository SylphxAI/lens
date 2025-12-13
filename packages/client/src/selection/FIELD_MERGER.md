# Field Merging Algorithm

## Overview

The Field Merger enables multiple components to subscribe to the same endpoint with different field selections. It automatically:

1. **Merges** selections to maximum coverage (union of all fields)
2. **Deduplicates** network requests (ONE request per endpoint)
3. **Distributes** data back to each component, filtered to their selection
4. **Dynamically adapts** as components mount/unmount

## Algorithm Design

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SelectionRegistry                         │
│  Tracks all subscriptions per endpoint                       │
│                                                               │
│  Endpoint: "user:123"                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Subscribers:                                          │   │
│  │   - ComponentA: { name: true }                        │   │
│  │   - ComponentB: { email: true, posts: { title: true }}│   │
│  │                                                        │   │
│  │ Merged Selection (union):                             │   │
│  │   { name: true, email: true, posts: { title: true } } │   │
│  │                                                        │   │
│  │ Last Data (from server):                              │   │
│  │   { id: "123", name: "Alice", email: "...", ... }     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         │ On data received                   │ On subscriber change
         ↓                                    ↓
  ┌──────────────┐                    ┌──────────────────┐
  │ filterData() │                    │ mergeSelections()│
  │ for each     │                    │                  │
  │ subscriber   │                    │ Recompute merged │
  └──────────────┘                    │ selection        │
                                      │                  │
                                      │ Trigger          │
                                      │ re-subscribe?    │
                                      └──────────────────┘
```

### Key Invariants

1. **One Network Request**: All subscribers to the same endpoint share ONE subscription
2. **Maximum Coverage**: Merged selection is union of all subscriber selections
3. **Filtered Distribution**: Each subscriber receives only their requested fields
4. **Dynamic Updates**: Selection expands/shrinks as components mount/unmount

## Core Algorithms

### 1. mergeSelections()

Merges multiple selections into maximum coverage.

```typescript
// Input: Multiple selections
const selectionA = { user: { name: true } };
const selectionB = { user: { email: true, posts: { title: true } } };

// Output: Union of all fields
const merged = mergeSelections([selectionA, selectionB]);
// Result: { user: { name: true, email: true, posts: { title: true } } }
```

**Algorithm**:
1. Collect all unique keys across all selections
2. For each key:
   - If any selection has `field: true` → include as `true` (select whole field)
   - If all selections have nested objects → recursively merge nested selections
   - If mixed `true` and objects → `true` wins (selects everything)
3. Handle nested `input` parameters (last one wins)

**Time Complexity**: O(n × m × d)
- n = number of selections
- m = average number of fields per selection
- d = maximum nesting depth

**Space Complexity**: O(m × d) for the merged result

### 2. filterToSelection()

Filters data to match a specific selection (inverse of merge).

```typescript
// Input: Full data + specific selection
const fullData = {
  user: {
    id: "123",
    name: "Alice",
    email: "alice@example.com",
    phone: "555-1234",
    posts: [...]
  }
};

const selection = { user: { name: true } };

// Output: Only requested fields
const filtered = filterToSelection(fullData, selection);
// Result: { user: { id: "123", name: "Alice" } }
```

**Algorithm**:
1. If data is primitive/null → return as-is
2. If data is array → apply filter to each element
3. If data is object:
   - Always include `id` field if present
   - For each selected field:
     - If selection is `true` → include field value as-is
     - If selection is nested object → recursively filter
     - If field not in selection → exclude

**Time Complexity**: O(n) where n = total nodes in data tree

**Space Complexity**: O(n) for the filtered result

### 3. SelectionRegistry

Central registry tracking all subscriptions and their selections.

**Key Operations**:

```typescript
const registry = new SelectionRegistry();

// Add subscriber (returns change analysis)
const analysis = registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "componentA",
  selection: { name: true },
  onData: (data) => updateUI(data),
});

// Check if re-subscription needed
if (shouldResubscribe(analysis, wasSubscribed, hasSubscribers)) {
  // Re-subscribe with new merged selection
  const merged = registry.getMergedSelection("user:123");
  subscribe(merged);
}

// Distribute data to all subscribers
registry.distributeData("user:123", serverData);
// Each subscriber's onData called with filtered data
```

**Data Structures**:
- `Map<EndpointKey, TrackedEndpoint>` - O(1) endpoint lookup
- Each endpoint has `Map<SubscriberId, SubscriberMetadata>` - O(1) subscriber lookup
- Field path index for change detection

## Re-subscription Logic

### When to Re-subscribe

```typescript
function shouldResubscribe(
  analysis: SelectionChangeAnalysis,
  wasSubscribed: boolean,
  hasSubscribers: boolean,
): "subscribe" | "resubscribe" | "unsubscribe" | "none"
```

**Decision Tree**:

```
┌─────────────────────────────────────┐
│ No subscribers left?                │
│   YES → unsubscribe                 │
│   NO  → continue                    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ First subscriber (not subscribed)?  │
│   YES → subscribe                   │
│   NO  → continue                    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Selection expanded (new fields)?    │
│   YES → resubscribe                 │
│   NO  → continue                    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Selection shrunk significantly?     │
│   YES (>3 fields) → resubscribe     │
│   NO → none (keep existing)         │
└─────────────────────────────────────┘
```

**Rationale**:

1. **Expand immediately**: Need new fields → must re-subscribe
2. **Shrink conservatively**: Minor shrink → keep fetching (avoid churn)
3. **Threshold-based**: Only re-subscribe if significantly shrunk (>3 fields)

## Usage Examples

### Example 1: Basic Multi-Component Subscription

```typescript
import { SelectionRegistry, shouldResubscribe } from './field-merger';

const registry = new SelectionRegistry();

// Component A mounts
function ComponentA() {
  useEffect(() => {
    const analysis = registry.addSubscriber({
      endpointKey: "user:123",
      subscriberId: "componentA",
      selection: { name: true },
      onData: (data) => setState(data),
    });

    if (shouldResubscribe(analysis, wasSubscribed, true) !== "none") {
      const merged = registry.getMergedSelection("user:123");
      subscribeToEndpoint("user:123", merged);
    }

    return () => {
      const analysis = registry.removeSubscriber("user:123", "componentA");
      if (shouldResubscribe(analysis, true, registry.hasSubscribers("user:123")) === "unsubscribe") {
        unsubscribeFromEndpoint("user:123");
      }
    };
  }, []);
}

// Component B mounts (different fields)
function ComponentB() {
  useEffect(() => {
    const analysis = registry.addSubscriber({
      endpointKey: "user:123",
      subscriberId: "componentB",
      selection: { email: true, posts: { title: true } },
      onData: (data) => setState(data),
    });

    // Selection expanded → re-subscribe
    if (analysis.isExpanded) {
      const merged = registry.getMergedSelection("user:123");
      // merged = { name: true, email: true, posts: { title: true } }
      resubscribeToEndpoint("user:123", merged);
    }

    return () => registry.removeSubscriber("user:123", "componentB");
  }, []);
}

// Server sends data
socket.on("data", (data) => {
  // Full data matching merged selection
  const fullData = {
    id: "123",
    name: "Alice",
    email: "alice@example.com",
    posts: [
      { id: "1", title: "Hello", body: "World" },
    ],
  };

  registry.distributeData("user:123", fullData);

  // ComponentA receives: { id: "123", name: "Alice" }
  // ComponentB receives: { id: "123", email: "...", posts: [{ id: "1", title: "Hello" }] }
});
```

### Example 2: Nested Selections with Input

```typescript
const registry = new SelectionRegistry();

// Component A: First 10 posts
registry.addSubscriber({
  endpointKey: "user:123:posts",
  subscriberId: "componentA",
  selection: {
    posts: {
      input: { limit: 10 },
      select: { title: true }
    }
  },
  onData: (data) => setState(data),
});

// Component B: First 20 posts with body
registry.addSubscriber({
  endpointKey: "user:123:posts",
  subscriberId: "componentB",
  selection: {
    posts: {
      input: { limit: 20 },
      select: { title: true, body: true }
    }
  },
  onData: (data) => setState(data),
});

// Merged selection uses last input (limit: 20) and merges select fields
const merged = registry.getMergedSelection("user:123:posts");
// Result: {
//   posts: {
//     input: { limit: 20 },
//     select: { title: true, body: true }
//   }
// }
```

### Example 3: Dynamic Field Expansion

```typescript
const registry = new SelectionRegistry();

// Start with basic fields
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "profile",
  selection: { name: true, avatar: true },
  onData: updateProfile,
});

// User opens "Posts" tab → need posts
const analysis = registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "posts-tab",
  selection: {
    posts: {
      title: true,
      createdAt: true,
      comments: { count: true }
    }
  },
  onData: updatePosts,
});

// Selection expanded → automatically re-subscribe
if (analysis.isExpanded) {
  console.log("Added fields:", [...analysis.addedFields]);
  // ["posts", "posts.title", "posts.createdAt", "posts.comments", "posts.comments.count"]

  const merged = registry.getMergedSelection("user:123");
  resubscribe(merged); // Server now sends posts too
}

// User closes "Posts" tab → shrink selection
const removal = registry.removeSubscriber("user:123", "posts-tab");

if (removal.isShrunk) {
  console.log("Removed fields:", [...removal.removedFields]);

  // Only re-subscribe if significantly shrunk (saves bandwidth)
  if (shouldResubscribe(removal, true, true) === "resubscribe") {
    const merged = registry.getMergedSelection("user:123");
    resubscribe(merged);
  }
}
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `addSubscriber()` | O(s × f × d) | s=subscribers, f=fields, d=depth |
| `removeSubscriber()` | O(s × f × d) | Same as add |
| `distributeData()` | O(s × n) | s=subscribers, n=data size |
| `mergeSelections()` | O(n × m × d) | n=selections, m=fields, d=depth |
| `filterToSelection()` | O(n) | n=data nodes |
| `getMergedSelection()` | O(1) | Cached |

### Space Complexity

| Component | Space | Notes |
|-----------|-------|-------|
| Registry per endpoint | O(s × f) | s=subscribers, f=avg fields |
| Merged selection | O(f × d) | f=total fields, d=depth |
| Cached data | O(n) | n=data size |

### Optimization Strategies

1. **Lazy Re-subscription**: Only re-subscribe when expanded or significantly shrunk
2. **Caching**: Store merged selection, only recompute on change
3. **Index by Entity**: Fast lookup of all subscriptions for an entity
4. **Field Path Flattening**: Quick change detection via Set comparison

## Edge Cases

### 1. Overlapping Selections

```typescript
// Both want "name", but different nested fields
const selectionA = { user: { name: true, email: true } };
const selectionB = { user: { name: true, posts: { title: true } } };

const merged = mergeSelections([selectionA, selectionB]);
// Result: { user: { name: true, email: true, posts: { title: true } } }
```

### 2. True vs Nested Selection

```typescript
// A wants whole user, B wants specific fields
const selectionA = { user: true };
const selectionB = { user: { name: true } };

const merged = mergeSelections([selectionA, selectionB]);
// Result: { user: true } - true wins (selects everything)
```

### 3. Null/Missing Data

```typescript
const data = { user: null };
const selection = { user: { name: true } };

const filtered = filterToSelection(data, selection);
// Result: { user: null } - null passes through
```

### 4. Array Filtering

```typescript
const data = {
  users: [
    { id: "1", name: "Alice", email: "alice@example.com" },
    { id: "2", name: "Bob", email: "bob@example.com" },
  ]
};
const selection = { users: { name: true } };

const filtered = filterToSelection(data, selection);
// Result: {
//   users: [
//     { id: "1", name: "Alice" },
//     { id: "2", name: "Bob" },
//   ]
// }
```

## Testing

Run comprehensive tests:

```bash
pnpm test field-merger.test.ts
```

Tests cover:
- Selection merging (simple, nested, deep)
- Data filtering (objects, arrays, nested)
- Registry operations (add, remove, distribute)
- Re-subscription logic (expand, shrink, thresholds)
- Integration scenarios (multi-component lifecycle)

## Future Enhancements

### 1. Selection Priorities

Allow prioritizing certain subscribers' input parameters:

```typescript
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "admin-panel",
  selection: { posts: { input: { limit: 100 }, select: { title: true } } },
  priority: "high", // Takes precedence for input merging
});
```

### 2. Partial Updates

Support partial data updates for specific fields:

```typescript
// Only posts changed
registry.distributePartialUpdate("user:123", {
  path: "posts",
  data: [/* new posts */],
});
// Only subscribers with "posts" in selection get notified
```

### 3. Field-Level Caching

Cache specific fields separately for faster filtering:

```typescript
registry.distributeData("user:123", fullData, {
  cache: {
    "user.name": "Alice",
    "user.email": "alice@example.com",
  }
});
```

### 4. Bandwidth Optimization

Track field access patterns and auto-optimize:

```typescript
registry.getStats().fieldStats;
// {
//   "name": { subscribers: 5, dataSize: 100 },
//   "posts": { subscribers: 1, dataSize: 50000 },
// }
// Consider splitting heavy fields into separate subscriptions
```

## References

- [Server Selection Logic](/packages/server/src/server/selection.ts)
- [Client Subscription Registry](/packages/client/src/reconnect/subscription-registry.ts)
- [Core Types](/packages/client/src/client/types.ts)
