# Unified Client Architecture Refactoring Plan

## Problem Statement

The unified client has **duplicated** V1's optimization layer (~400 lines) while **losing** critical features:

### Duplicated Code
| Feature | V1 Location | Unified Location | Lines |
|---------|-------------|------------------|-------|
| Field ref counting | SubscriptionManager:170-234 | unified.ts:317-388 | ~150 |
| canDerive logic | SubscriptionManager:281-294 | unified.ts:297-312 | ~30 |
| In-flight dedup | QueryResolver:113-115,284-301 | unified.ts:219-220,612-640 | ~40 |
| Batching (10ms) | SubscriptionManager:346-422 | unified.ts:207-217 | ~80 |

### Missing Features
1. **EntitySignal** - No `$.field` fine-grained reactivity
2. **Optimistic Updates** - No immediate UI feedback for mutations
3. **Lazy Subscription** - No `onFieldAccess` trigger
4. **Query Release** - Memory leak risk

### Unused Infrastructure
- `ReactiveStore` is created but not used for normalization
- `OptimisticEntry` exists but not connected

---

## Target Architecture

```
┌─────────────────────────────────────────────────────┐
│              UnifiedClient (Thin Facade)            │
│  - Flat namespace proxy (client.whoami)             │
│  - Links middleware chain                           │
│  - Selection object → field array conversion        │
│  - Promise + Subscribe dual interface               │
└─────────────────────┬───────────────────────────────┘
                      │ DELEGATES TO
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼──────────┐       ┌───────▼──────────┐
│ SubscriptionMgr  │       │  QueryResolver   │
│ (field-level)    │       │  (dedup/batch)   │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         └──────────┬───────────────┘
                    │
           ┌────────▼────────┐
           │  ReactiveStore  │
           │  + EntitySignal │
           │  + Optimistic   │
           └─────────────────┘
```

---

## Implementation Plan

### Phase 1: Unify Key Generation (shared utility)

Create `packages/client/src/shared/keys.ts`:

```typescript
// Entity keys (for store)
export function makeEntityKey(type: string, id: string): string;
export function parseEntityKey(key: string): { type: string; id: string };

// Query keys (for deduplication)
export function makeQueryKey(operation: string, input: unknown): string;
export function makeQueryKeyWithFields(operation: string, input: unknown, fields?: string[]): string;
```

### Phase 2: Unify Batching Infrastructure

Create `packages/client/src/shared/batching.ts`:

```typescript
export class BatchScheduler<T> {
  constructor(delay: number, processor: (items: T[]) => void);
  add(item: T): void;
  flush(): void;
}
```

### Phase 3: Unify In-Flight Deduplication

Create `packages/client/src/shared/dedup.ts`:

```typescript
export class RequestDeduplicator<K, V> {
  get(key: K): Promise<V> | undefined;
  set(key: K, promise: Promise<V>): void;
  delete(key: K): void;
  wrap(key: K, factory: () => Promise<V>): Promise<V>;
}
```

### Phase 4: Refactor UnifiedClient to Delegate

#### 4.1 Use SubscriptionManager

```typescript
// BEFORE (unified.ts)
class UnifiedClientImpl {
  private subscriptions = new Map<string, SubscriptionState>();  // 🔴 Duplicate
  private canDerive(...) { ... }  // 🔴 Duplicate
  private subscribeFields(...) { ... }  // 🔴 Duplicate
}

// AFTER
class UnifiedClientImpl {
  private subscriptionManager: SubscriptionManager;  // ✅ Reuse

  constructor(config) {
    this.subscriptionManager = new SubscriptionManager();
    // Configure transport adapter
  }
}
```

#### 4.2 Use QueryResolver

```typescript
// BEFORE
class UnifiedClientImpl {
  private inFlight = new Map<string, Promise<unknown>>();  // 🔴 Duplicate
  private pendingQueries = [];  // 🔴 Duplicate
  private batchTimer = null;  // 🔴 Duplicate
}

// AFTER
class UnifiedClientImpl {
  private queryResolver: QueryResolver;  // ✅ Reuse
}
```

#### 4.3 Use ReactiveStore + EntitySignal

```typescript
// BEFORE (QueryResult)
interface QueryResult<T> {
  value: T | null;                    // 🔴 Plain object
  signal: Signal<T | null>;           // 🔴 Coarse-grained
}

// AFTER
interface QueryResult<T> {
  $: FieldSignals<T>;                 // ✅ Fine-grained
  value: Signal<T>;                   // ✅ Computed from fields
  loading: Signal<boolean>;
  error: Signal<Error | null>;
}
```

### Phase 5: Add Optimistic Updates

```typescript
class UnifiedClientImpl {
  private optimisticTracker: OptimisticTracker;  // Copy from ReactiveClient

  async executeMutation(operation, input) {
    const optId = this.optimisticTracker.apply(...);
    try {
      const result = await this.transport.mutate(...);
      this.optimisticTracker.confirm(optId, result);
      return result;
    } catch (error) {
      this.optimisticTracker.rollback(optId);
      throw error;
    }
  }
}
```

### ~~Phase 6: Entity Type Declaration~~ ❌ NOT NEEDED

> **Reason**: Unified client is operation-centric, not entity-centric.
> Entity normalization would add complexity without clear benefit.
> The `.select()` API already provides field-level optimization.

---

## Migration Strategy

### Step 1: Create Shared Utilities (non-breaking)
- Extract key generation, batching, dedup into shared/
- Both V1 and unified use shared utilities
- No API changes

### Step 2: Internal Refactor (non-breaking)
- Replace unified's duplicated code with V1 infrastructure calls
- Keep external API identical
- All tests should pass

### Step 3: Add Optimistic Updates (additive) ✅ DONE
- Add `OptimisticConfig` type
- `applyOptimistic()`, `confirmOptimistic()`, `rollbackOptimistic()` methods
- `executeMutationOptimistic()` for mutations with automatic rollback

### ~~Step 4: Add EntitySignal Support~~ ❌ NOT NEEDED
> **Reason**: `.select()` API already provides field-level subscriptions.
> - `client.getUser({ id }).select({ name: true })` → only subscribes to `name` field
> - Server only pushes updates for selected fields
> - `$.field` would be redundant complexity

---

## Code Reduction Estimate

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| unified.ts | ~850 lines | ~300 lines | -65% |
| SubscriptionState | ~60 lines | 0 (reuse) | -100% |
| canDerive | ~30 lines | 0 (delegate) | -100% |
| Field tracking | ~150 lines | 0 (delegate) | -100% |
| In-flight dedup | ~40 lines | 0 (delegate) | -100% |
| Batching | ~80 lines | 0 (shared) | -100% |

**Total: ~550 lines removed, ~50 lines shared utilities added = 500 line net reduction**

---

## Testing Strategy

1. **All existing tests must pass** - API is unchanged ✅
2. **Add shared utility tests** - keys, batching, dedup ✅ (16 tests)
3. **Add Maximum Principle tests** - subscription sharing ✅ (3 tests)
4. **Add optimistic update tests** - mutation rollback (future)

---

## Risk Assessment

### Low Risk
- Creating shared utilities (additive)
- Adding EntitySignal support (additive)
- Adding optimistic updates (additive)

### Medium Risk
- Refactoring internal implementation (regression possible)
- Changing subscription model (edge cases)

### Mitigation
- Comprehensive test suite
- Feature flags for new behavior
- Gradual rollout

---

## Timeline Estimate

- Phase 1-3 (shared utilities): 1 hour
- Phase 4 (delegation refactor): 2 hours
- Phase 5 (optimistic updates): 1 hour
- Phase 6 (entity declaration): 1 hour
- Testing & fixes: 1 hour

**Total: ~6 hours of focused work**
