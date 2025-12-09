# ADR-002: Two-Phase Field Resolution

## Status
Proposed

## Context

Lens is a live query library where field resolvers can emit updates over time. Currently, there are two field resolution modes:

```typescript
// Mode 1: .resolve() - Returns value once
posts: f.many(Post).resolve(({ parent, ctx }) =>
  ctx.db.posts.findMany({ authorId: parent.id })
)

// Mode 2: .subscribe() - Emits updates over time
status: f.string().subscribe(({ parent, ctx, emit }) => {
  emit(getCurrentStatus());  // Manual initial value
  ctx.statusService.watch(parent.id, (s) => emit(s));
})
```

**Problems:**

### 1. N+1 Query Problem
DataLoader batching is disabled because ALL field resolvers receive `emit`/`onCleanup` for live query support:

```typescript
// Server code (simplified)
if (hasArgs || context) {
  // ALL fields get emit/onCleanup, even .resolve() fields
  const extendedCtx = { ...context, emit, onCleanup };
  result[field] = await resolverDef.resolveField(field, obj, args, extendedCtx);
} else {
  // DataLoader path - never reached because context always exists
  result[field] = await loader.load(obj);
}
```

DataLoader is incompatible with per-field emit/onCleanup callbacks because:
- DataLoader batches across multiple parent objects
- Each parent needs its own emit callback
- Can't share callbacks across batched calls

### 2. Awkward Initial Value in Subscriptions
`.subscribe()` requires manual emission of initial value:

```typescript
status: f.string().subscribe(async ({ ctx, emit }) => {
  emit(await getStatus());  // Boilerplate: manual initial value
  watch((s) => emit(s));    // Actual subscription logic
})
```

### 3. Mixed Concerns
Initial data fetching and live update setup are conflated in one function.

## Decision

Introduce **two-phase field resolution** with chainable `.resolve().subscribe()`:

```typescript
// Phase 1: Initial data (batchable)
// Phase 2: Live updates (optional)

status: f.string()
  .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))  // Initial
  .subscribe(({ parent, ctx, emit }) => {                      // Updates
    ctx.statusService.watch(parent.id, (s) => emit(s));
  })
```

### Field Resolution Modes

| Mode | API | Initial | Updates | Batchable |
|------|-----|---------|---------|-----------|
| Resolve | `.resolve(fn)` | fn returns value | None | Yes |
| Subscribe | `.subscribe(fn)` | fn emits manually | fn emits | No |
| **Live** | `.resolve(fn).subscribe(fn)` | resolve returns | subscribe emits | **Yes** |

### Server Execution Flow

```
Query arrives
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Initial Resolution (Batchable)                  │
│                                                          │
│   for each field:                                        │
│     if mode == "resolve" or mode == "live":              │
│       result[field] = await resolveField()  // DataLoader OK │
│     else if mode == "subscribe":                         │
│       result[field] = null  // Legacy: subscribe handles it │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Return initial result to client                          │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Subscription Setup (Fire-and-forget)            │
│                                                          │
│   for each field:                                        │
│     if mode == "live":                                   │
│       subscribeField()  // Sets up watchers              │
│     else if mode == "subscribe":                         │
│       resolveField()    // Legacy: emits initial + watches │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Live updates via emit()                                  │
└─────────────────────────────────────────────────────────┘
```

### New Type: LiveField

```typescript
/** Field with both resolver (initial) and subscriber (updates) */
interface LiveField<T, TArgs, TContext> {
  readonly _kind: "resolved";
  readonly _mode: "live";  // New mode
  readonly _returnType: T;
  readonly _argsSchema: z.ZodType<TArgs> | null;
  readonly _resolver: (params: ResolveParams) => T | Promise<T>;
  readonly _subscriber: (params: SubscribeParams) => void | Promise<void>;
}
```

### API Changes

```typescript
// ResolvedField gains .subscribe() method
interface ResolvedField<T, TArgs, TContext> {
  // ... existing properties ...

  /** Add subscription for live updates after initial resolution */
  subscribe(fn: SubscribeFn): LiveField<T, TArgs, TContext>;
}

// FieldBuilder methods return chainable ResolvedField
interface ScalarFieldBuilder<T, TParent, TContext> {
  resolve(fn: ResolveFn): ResolvedField<T> & {
    subscribe(fn: SubscribeFn): LiveField<T>;
  };
  // ... existing methods ...
}
```

### Usage Examples

```typescript
// 1. Resolve only (can batch)
posts: f.many(Post).resolve(({ parent, ctx }) =>
  ctx.db.posts.findMany({ authorId: parent.id })
)

// 2. Subscribe only (legacy, no batch)
status: f.string().subscribe(({ ctx, emit }) => {
  emit(getStatus());
  watch((s) => emit(s));
})

// 3. Resolve + Subscribe (NEW - can batch initial!)
status: f.string()
  .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
  .subscribe(({ parent, ctx, emit }) => {
    ctx.statusService.watch(parent.id, (s) => emit(s));
  })

// 4. Relation with live updates
posts: f.many(Post)
  .resolve(({ parent, ctx }) => ctx.db.posts.findMany({ authorId: parent.id }))
  .subscribe(({ parent, ctx, emit }) => {
    ctx.db.posts.onChange(parent.id, () => {
      emit(ctx.db.posts.findMany({ authorId: parent.id }));
    });
  })
```

### ResolverDef Changes

```typescript
interface ResolverDef<...> {
  // Existing
  isSubscription(name: string): boolean;
  getFieldMode(name: string): "exposed" | "resolve" | "subscribe" | null;
  resolveField(name, parent, args, ctx): Promise<unknown>;

  // New
  isLive(name: string): boolean;
  getFieldMode(name: string): "exposed" | "resolve" | "subscribe" | "live" | null;

  /** Resolve initial value (for "resolve" and "live" modes) */
  resolveInitial(name, parent, args, ctx): Promise<unknown>;

  /** Set up subscription (for "live" mode only, not "subscribe") */
  subscribeField(name, parent, args, ctx): Promise<void>;
}
```

## Implementation Plan

### Phase 1: Core Types
- [ ] Add `LiveField` type to `resolver-types.ts`
- [ ] Update `FieldDef` union to include `LiveField`
- [ ] Add `.subscribe()` method to `ResolvedField`
- [ ] Update field builder types

### Phase 2: Resolver Builder
- [ ] Implement `.subscribe()` chaining on resolved fields
- [ ] Update `createScalarFieldBuilder` and `createRelationFieldBuilder`
- [ ] Add `isLive()` and `subscribeField()` to `ResolverDefImpl`
- [ ] Tests for new chaining API

### Phase 3: Server Integration
- [ ] Separate resolution into two phases
- [ ] Phase 1: Run resolvers for "resolve" and "live" fields (batchable)
- [ ] Phase 2: Set up subscriptions for "live" and "subscribe" fields
- [ ] Enable DataLoader for Phase 1

### Phase 4: DataLoader Re-enable
- [ ] Update condition: `if (hasArgs || isSubscription(field))`
- [ ] "resolve" and "live" fields go through DataLoader
- [ ] "subscribe" fields skip DataLoader (legacy behavior)
- [ ] Tests for N+1 batching

### Phase 5: Documentation
- [ ] Update API documentation
- [ ] Migration guide from `.subscribe()` to `.resolve().subscribe()`
- [ ] Examples in README

## Backwards Compatibility

- **`.resolve()` unchanged** - Works exactly as before
- **`.subscribe()` unchanged** - Legacy mode still works
- **New `.resolve().subscribe()` is additive** - No breaking changes
- **DataLoader enabled for more fields** - Performance improvement, not breaking

## Consequences

### Positive
- **Solves N+1** - DataLoader works for resolve and live fields
- **Cleaner API** - Separate initial vs updates concerns
- **No boilerplate** - No manual initial emit in subscriptions
- **Better performance** - Batching for initial load
- **Gradual migration** - Can adopt incrementally

### Negative
- **More complexity** - Three modes instead of two
- **Migration effort** - Existing `.subscribe()` should migrate to `.resolve().subscribe()`
- **Larger API surface** - More methods to learn

### Neutral
- **Same live query semantics** - Updates still work via emit

## Alternatives Considered

### Option A: Always Pass emit/onCleanup (Status Quo)
- Pro: Simple implementation
- Con: N+1 problem, no batching

### Option B: Batch at Data Source Level
```typescript
posts: f.many(Post).resolve(({ parent, ctx }) =>
  ctx.loaders.userPosts.load(parent.id)  // User manages DataLoader
)
```
- Pro: Works today
- Con: Manual loader setup, not automatic

### Option C: Declarative Batch Config
```typescript
posts: f.many(Post).batch({
  key: (parent) => parent.id,
  load: (ids, ctx) => ctx.db.posts.findMany({ authorId: { in: ids } })
})
```
- Pro: Explicit batching
- Con: New API, doesn't solve live query integration

## References

- [DataLoader](https://github.com/graphql/dataloader) - Facebook's batching library
- [GraphQL Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions/) - Similar initial + updates pattern
- [ADR-001: Unified Entity Definition](./001-unified-entity-definition.md) - Related architecture decision
