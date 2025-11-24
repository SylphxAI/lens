# Lens Implementation Plan

> Current Status: **Phase 2.5** - Core complete, GraphStateManager needed

---

## Progress Overview

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Core Foundation | ✅ Complete |
| 2 | Server Runtime | 🟡 90% (missing GraphStateManager) |
| 3 | Client Runtime | ✅ Complete |
| 4 | React Integration | ✅ Complete |
| 5 | Polish & Release | 🟡 In Progress |

---

## What's Done

### Phase 1: Core Foundation ✅

```
packages/core/
├── schema/          ✅ Type builders, inference, relations
├── updates/         ✅ value/delta/patch strategies
└── plugins/         ✅ 8 plugins (auth, cache, pagination, etc.)
```

**Features:**
- [x] `t.*` type builders with full inference
- [x] `createSchema()` with validation
- [x] `InferEntity<T>` type inference
- [x] `InferSelected<T, S>` selection inference
- [x] Update strategies (value, delta, patch)
- [x] `selectStrategy()` auto-selection
- [x] `createUpdate()` / `applyUpdate()`
- [x] Plugin system (8 built-in plugins)

### Phase 2: Server Runtime 🟡

```
packages/server/
├── resolvers/       ✅ Resolver creation, validation
├── execution/       ✅ Engine, DataLoader, batching
├── subscriptions/   ✅ Handler, field-level tracking
└── server/          ✅ WebSocket, HTTP handlers
```

**Features:**
- [x] `createResolvers()` with validation
- [x] Execution engine with selection
- [x] DataLoader with automatic batching
- [x] Subscription handler (field-level)
- [x] WebSocket/HTTP handlers
- [x] AsyncIterable detection (partial)
- [ ] **GraphStateManager** ← MISSING
- [ ] **emit() API** ← MISSING
- [ ] **yield streaming** ← MISSING

### Phase 3: Client Runtime ✅

```
packages/client/
├── store/           ✅ ReactiveStore
├── reactive/        ✅ EntitySignal, SubscriptionManager
├── links/           ✅ WebSocket, HTTP, SSE
└── client.ts        ✅ createClient API
```

**Features:**
- [x] Signal implementation
- [x] ReactiveStore with entity management
- [x] EntitySignal with field-level signals
- [x] SubscriptionManager
- [x] QueryResolver
- [x] WebSocket transport
- [x] Auto-reconnection
- [x] Field selection optimization
- [x] `applyUpdate()` for all strategies

### Phase 4: React Integration ✅

```
packages/react/
├── hooks.ts         ✅ useEntity, useList, useMutation
├── provider.tsx     ✅ LensProvider
└── suspense.ts      ✅ Suspense support
```

**Features:**
- [x] `useEntity` hook
- [x] `useList` hook
- [x] `useMutation` hook
- [x] `useComputed` hook
- [x] `LensProvider`
- [x] Suspense support

### Phase 5: Polish 🟡

- [x] README with examples
- [x] ARCHITECTURE.md
- [x] API.md reference
- [x] Basic example app
- [x] 377 tests passing
- [ ] Package READMEs
- [ ] CHANGELOG

---

## What's Missing

### GraphStateManager (Critical)

The orchestration layer that connects resolvers to clients:

```typescript
class GraphStateManager {
    // Canonical state per entity (server truth)
    private canonical: Map<EntityKey, EntityData>;

    // Per-client: what they last received
    private clients: Map<ClientId, Map<EntityKey, ClientState>>;

    // Core method - called by resolvers
    emit(entity: string, id: string, data: Partial<T>): void;
}
```

**Responsibilities:**
1. Maintain canonical state per subscribed entity
2. Track per-client last known state
3. Compute diff when state changes
4. Auto-select transfer strategy
5. Push minimal updates to clients

### Resolver emit() API

```typescript
interface ResolverContext {
    // Existing
    db: Database;
    user?: User;

    // NEW
    emit: (data: Partial<Entity>) => void;
    onCleanup: (fn: () => void) => void;
}
```

### yield Streaming

Connect async generators to GraphStateManager:

```typescript
// Current: only takes first value
if (isAsyncIterable(result)) {
    for await (const value of result) {
        return value;  // ❌ Ignores subsequent yields
    }
}

// Needed: stream all yields
if (isAsyncIterable(result)) {
    for await (const value of result) {
        graphStateManager.emit(entity, id, value);  // ✅
    }
}
```

---

## Implementation Order

### Step 1: GraphStateManager
Location: `packages/server/src/state/graph-state-manager.ts`

```typescript
export class GraphStateManager {
    emit(entity: string, id: string, data: Partial<T>): void;
    subscribe(clientId: string, entity: string, id: string, fields: string[]): void;
    unsubscribe(clientId: string, entity: string, id: string): void;
}
```

### Step 2: ResolverContext.emit()
Location: `packages/server/src/execution/engine.ts`

- Add `emit()` to context
- Add `onCleanup()` for teardown

### Step 3: Connect yield → emit
Location: `packages/server/src/execution/engine.ts`

- Loop through async iterator
- Each yield calls `emit()`

### Step 4: Connect return → emit
- `return value` = `emit(value)` + complete

---

## Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| @lens/core | 89 | ✅ |
| @lens/server | 127 | ✅ |
| @lens/client | 98 | ✅ |
| @lens/react | 63 | ✅ |
| **Total** | **377** | ✅ |

---

## File Structure

```
packages/
├── core/                    @lens/core
│   ├── src/
│   │   ├── schema/          Type system
│   │   ├── updates/         Transfer strategies
│   │   └── plugins/         Plugin system
│   └── package.json
│
├── server/                  @lens/server
│   ├── src/
│   │   ├── resolvers/       Resolver creation
│   │   ├── execution/       Graph execution
│   │   ├── subscriptions/   Subscription handler
│   │   ├── state/           GraphStateManager (TODO)
│   │   └── server/          HTTP/WS handlers
│   └── package.json
│
├── client/                  @lens/client
│   ├── src/
│   │   ├── store/           ReactiveStore
│   │   ├── reactive/        EntitySignal, etc.
│   │   ├── links/           Transport
│   │   └── client.ts        API
│   └── package.json
│
└── react/                   @lens/react
    ├── src/
    │   ├── hooks.ts         React hooks
    │   ├── provider.tsx     Context
    │   └── suspense.ts      Suspense
    └── package.json
```

---

## Next Steps

1. **Implement GraphStateManager** - Core orchestration
2. **Add emit() to ResolverContext** - Enable flexible emitting
3. **Connect yield → emit** - Stream generator values
4. **Add integration tests** - End-to-end reactive flow
5. **Package READMEs** - Per-package documentation
