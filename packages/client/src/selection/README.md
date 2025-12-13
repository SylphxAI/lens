# Field Merging for RPC Client

## Overview

A production-ready field merging algorithm that enables efficient multi-component subscriptions to the same RPC endpoint. When multiple components need different fields from the same entity, this system automatically:

1. Merges selections to maximum coverage
2. Makes ONE network request per endpoint
3. Distributes filtered data to each component
4. Dynamically adapts as components mount/unmount

## Quick Start

```typescript
import { SelectionRegistry, shouldResubscribe } from './field-merger';

const registry = new SelectionRegistry();

// Component A wants user name
const analysisA = registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "componentA",
  selection: { name: true },
  onData: (data) => console.log("A:", data),
});

// First subscriber → subscribe
if (shouldResubscribe(analysisA, false, true) === "subscribe") {
  const merged = registry.getMergedSelection("user:123");
  // merged = { name: true }
  subscribeToServer("user:123", merged);
}

// Component B wants user email and posts
const analysisB = registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "componentB",
  selection: { email: true, posts: { title: true } },
  onData: (data) => console.log("B:", data),
});

// Selection expanded → re-subscribe
if (shouldResubscribe(analysisB, true, true) === "resubscribe") {
  const merged = registry.getMergedSelection("user:123");
  // merged = { name: true, email: true, posts: { title: true } }
  resubscribeToServer("user:123", merged);
}

// Server sends data
const serverData = {
  id: "123",
  name: "Alice",
  email: "alice@example.com",
  posts: [{ id: "1", title: "Hello" }],
};

registry.distributeData("user:123", serverData);
// Component A receives: { id: "123", name: "Alice" }
// Component B receives: { id: "123", email: "...", posts: [...] }
```

## Files

### Core Implementation
- **[field-merger.ts](./field-merger.ts)** - Complete TypeScript implementation
  - `SelectionRegistry` class
  - `mergeSelections()` function
  - `filterToSelection()` function
  - `shouldResubscribe()` logic
  - Type definitions

### Documentation
- **[FIELD_MERGER.md](./FIELD_MERGER.md)** - Comprehensive algorithm documentation
  - Algorithm design and invariants
  - API reference with examples
  - Performance characteristics
  - Edge cases and future enhancements

- **[ALGORITHM_FLOW.md](./ALGORITHM_FLOW.md)** - Visual flow diagrams
  - Step-by-step lifecycle example
  - State transitions at each step
  - Network requests and data distribution
  - Decision trees and optimizations

### Tests
- **[field-merger.test.ts](./field-merger.test.ts)** - Comprehensive test suite
  - 35 tests covering all functionality
  - Unit tests for each function
  - Integration tests for complete flows
  - Edge case validation

## Key Features

### 1. Selection Merging
Combines multiple selections into maximum coverage (union):

```typescript
const selectionA = { user: { name: true } };
const selectionB = { user: { email: true, posts: { title: true } } };

const merged = mergeSelections([selectionA, selectionB]);
// Result: { user: { name: true, email: true, posts: { title: true } } }
```

### 2. Data Filtering
Filters full data to each subscriber's specific selection:

```typescript
const fullData = {
  id: "123",
  name: "Alice",
  email: "alice@example.com",
  phone: "555-1234",
};

const filtered = filterToSelection(fullData, { name: true });
// Result: { id: "123", name: "Alice" }
```

### 3. Dynamic Re-subscription
Automatically determines when to re-subscribe based on selection changes:

```typescript
// Selection expanded → re-subscribe to get new fields
if (analysis.isExpanded) {
  resubscribe(merged);
}

// Selection shrunk slightly → keep existing (avoid churn)
if (analysis.isShrunk && analysis.removedFields.size <= 3) {
  // No action needed
}

// Selection shrunk significantly → re-subscribe to save bandwidth
if (analysis.isShrunk && analysis.removedFields.size > 3) {
  resubscribe(merged);
}
```

### 4. Registry-Based Tracking
Central registry tracks all subscriptions per endpoint:

```typescript
const registry = new SelectionRegistry();

// Add subscribers
registry.addSubscriber({...});

// Get merged selection
const merged = registry.getMergedSelection(endpointKey);

// Distribute data to all subscribers
registry.distributeData(endpointKey, data);

// Remove subscriber
registry.removeSubscriber(endpointKey, subscriberId);

// Get statistics
const stats = registry.getStats();
```

## Algorithm Complexity

| Operation | Time Complexity | Space Complexity |
|-----------|----------------|------------------|
| mergeSelections(n selections) | O(n × m × d) | O(m × d) |
| filterToSelection(data) | O(n) | O(n) |
| addSubscriber() | O(s × f × d) | O(s × f) |
| removeSubscriber() | O(s × f × d) | O(s × f) |
| distributeData() | O(s × n) | O(n) |

Where:
- n = number of selections or data nodes
- m = average fields per selection
- d = maximum nesting depth
- s = number of subscribers
- f = average fields per subscriber

## Performance Benefits

**Scenario**: 100 components, 10 unique endpoints

| Metric | Without Merging | With Merging | Improvement |
|--------|----------------|--------------|-------------|
| Network Requests | 100 | 10 | 90% reduction |
| Server Load | 100× | 10× | 90% reduction |
| Data Streams | 100 | 10 | 90% reduction |
| Client Memory | High | Low | Minimal overhead |

## Design Principles

### 1. Correctness
- Each subscriber receives exactly their requested fields
- No data leakage between subscribers
- Always includes `id` field for entity identification

### 2. Efficiency
- ONE network request per unique endpoint
- Lazy re-subscription (don't churn for minor changes)
- Client-side filtering (fast, local)
- O(1) lookups via Maps

### 3. Simplicity
- Clear separation of concerns
- Pure functions (mergeSelections, filterToSelection)
- Immutable analysis results
- Easy to reason about

### 4. Adaptability
- Dynamic expansion/contraction
- Threshold-based re-subscription
- Handles null/missing data gracefully
- Supports nested selections and arrays

## Usage Patterns

### Pattern 1: React Hook

```typescript
function useSubscription(endpointKey, subscriberId, selection) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const analysis = registry.addSubscriber({
      endpointKey,
      subscriberId,
      selection,
      onData: setData,
    });

    if (shouldResubscribe(analysis, registry.isSubscribed(endpointKey), true)) {
      const merged = registry.getMergedSelection(endpointKey);
      subscribeToServer(endpointKey, merged);
      registry.markSubscribed(endpointKey);
    }

    return () => {
      const removal = registry.removeSubscriber(endpointKey, subscriberId);
      const hasSubscribers = registry.hasSubscribers(endpointKey);

      if (shouldResubscribe(removal, true, hasSubscribers) === "unsubscribe") {
        unsubscribeFromServer(endpointKey);
        registry.markUnsubscribed(endpointKey);
      }
    };
  }, [endpointKey, subscriberId]);

  return data;
}
```

### Pattern 2: Observable Wrapper

```typescript
class MergedObservable<T> {
  constructor(
    private endpointKey: string,
    private selection: SelectionObject,
  ) {}

  subscribe(observer: (data: T) => void) {
    const subscriberId = generateId();

    const analysis = registry.addSubscriber({
      endpointKey: this.endpointKey,
      subscriberId,
      selection: this.selection,
      onData: observer,
    });

    handleResubscription(analysis);

    return () => {
      const removal = registry.removeSubscriber(this.endpointKey, subscriberId);
      handleResubscription(removal);
    };
  }
}
```

### Pattern 3: Global Cache Layer

```typescript
class RPCClient {
  private registry = new SelectionRegistry();
  private subscriptions = new Map<string, WebSocket>();

  subscribe<T>(entity: string, entityId: string, selection: SelectionObject) {
    const endpointKey = getEndpointKey(entity, entityId);
    const subscriberId = generateId();

    const analysis = this.registry.addSubscriber({
      endpointKey,
      subscriberId,
      selection,
      onData: (data) => this.emit(subscriberId, data),
    });

    const action = shouldResubscribe(
      analysis,
      this.registry.isSubscribed(endpointKey),
      true,
    );

    if (action === "subscribe" || action === "resubscribe") {
      const merged = this.registry.getMergedSelection(endpointKey);
      this.subscribeToServer(endpointKey, merged);
    }

    return subscriberId;
  }

  private subscribeToServer(endpointKey: string, selection: SelectionObject) {
    // Send subscription request with merged selection
    const ws = this.getWebSocket();
    ws.send(JSON.stringify({
      type: "subscribe",
      endpoint: endpointKey,
      selection,
    }));
  }
}
```

## Testing

Run the comprehensive test suite:

```bash
bun test packages/client/src/selection/field-merger.test.ts
```

Tests include:
- Selection merging (simple, nested, deep)
- Data filtering (objects, arrays, null handling)
- Registry operations (add, remove, distribute)
- Re-subscription logic (expand, shrink, thresholds)
- Integration scenarios (complete component lifecycles)

## Integration with Existing Codebase

The field merger integrates seamlessly with the existing Lens architecture:

### Server-Side Selection
Reuses existing `applySelection()` from `packages/server/src/server/selection.ts`:

```typescript
import { applySelection } from '@sylphx/lens-server';

// Server prepares full data matching merged selection
const fullData = await resolver.resolve(mergedSelection);

// Client filters to individual selections
const filtered = filterToSelection(fullData, componentSelection);
```

### Client-Side Subscriptions
Extends existing `SubscriptionRegistry` from `packages/client/src/reconnect/subscription-registry.ts`:

```typescript
import { SubscriptionRegistry as ReconnectRegistry } from '../reconnect/subscription-registry';
import { SelectionRegistry } from './field-merger';

class EnhancedClient {
  private reconnectRegistry = new ReconnectRegistry();
  private selectionRegistry = new SelectionRegistry();

  // Combine both registries for full functionality
}
```

## Future Enhancements

1. **Selection Priorities**: Allow prioritizing certain subscribers' input parameters
2. **Partial Updates**: Support field-level updates without full re-fetch
3. **Field-Level Caching**: Cache individual fields for faster filtering
4. **Bandwidth Tracking**: Auto-optimize based on field access patterns
5. **Debounced Re-subscription**: Prevent rapid mount/unmount churn

## Summary

The Field Merging Algorithm provides a robust, efficient solution for multi-component RPC subscriptions. It delivers:

- **90% reduction** in network requests
- **Automatic optimization** via smart re-subscription logic
- **Type-safe** TypeScript implementation
- **Production-ready** with comprehensive tests
- **Easy integration** with existing codebase

For detailed documentation, see:
- [FIELD_MERGER.md](./FIELD_MERGER.md) - Complete API reference
- [ALGORITHM_FLOW.md](./ALGORITHM_FLOW.md) - Visual examples and flows
