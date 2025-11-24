# Lens Implementation Plan

> Current Status: **Phase 5** - Integration & Polish

---

## Progress Overview

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Core Foundation | ✅ Complete |
| 2 | Server Runtime | ✅ Complete |
| 3 | Client Runtime | ✅ Complete |
| 4 | React Integration | ✅ Complete |
| 5 | Integration & Polish | 🟡 In Progress |

---

## Architecture Simplification (Current Focus)

### Completed
- [x] GraphStateManager - canonical state, per-client diffing
- [x] ExecutionEngine.executeReactive() - unified reactive execution
- [x] EmitContext (emit/onCleanup) for resolvers

### In Progress
- [ ] Wire GraphStateManager → createServer → WebSocket
- [ ] Remove redundant handlers (SSEHandler, SubscriptionHandler)
- [ ] Centralize EntityKey in @lens/core

### Architectural Decisions

**Single Subscription System**: GraphStateManager is the single source of truth for all subscriptions. Removed redundant:
- ~~SubscriptionHandler~~ (merged into GraphStateManager)
- ~~SSEHandler~~ (transport-agnostic, GraphStateManager handles state)
- ~~LensServerImpl.subscriptions~~ (replaced by GraphStateManager)

---

## Package Structure

```
packages/
├── core/                    @lens/core
│   ├── schema/              Type system
│   ├── updates/             Transfer strategies
│   └── types.ts             EntityKey, Update (shared)
│
├── server/                  @lens/server
│   ├── resolvers/           Resolver creation
│   ├── execution/           ExecutionEngine + reactive
│   ├── state/               GraphStateManager (core)
│   └── server/              createServer (WebSocket integration)
│
├── client/                  @lens/client
│   ├── store/               ReactiveStore
│   ├── reactive/            EntitySignal, SubscriptionManager
│   ├── links/               Transport (WebSocket, HTTP)
│   └── client.ts            createClient
│
└── react/                   @lens/react
    ├── hooks.ts             useEntity, useList, useMutation
    └── provider.tsx         LensProvider
```

---

## Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| @lens/core | 89 | ✅ |
| @lens/server | 97 | ✅ |
| @lens/client | 98 | ✅ |
| @lens/react | 63 | ✅ |
| **Total** | **347** | ✅ |

---

## Reactive Model

### Three Syntaxes → One Pipeline

```typescript
// All three feed into GraphStateManager.emit()

// 1. return - emit once
resolve: async (id) => await db.get(id)

// 2. yield - emit multiple times
resolve: async function* (id) {
    yield await db.get(id);
    for await (const update of stream) yield update;
}

// 3. ctx.emit() - emit from anywhere
resolve: async (id, ctx) => {
    ctx.emit(await db.get(id));
    events.on('update', (data) => ctx.emit(data));
    ctx.onCleanup(() => events.off('update'));
}
```

### Server Flow

```
Resolver (return/yield/emit)
    ↓
ExecutionEngine.executeReactive()
    ↓
GraphStateManager.emit()
    ↓
Per-client diff computation
    ↓
WebSocket.send() (minimal transfer)
```

---

## Next Steps

1. **Wire GraphStateManager** - Connect to createServer WebSocket handler
2. **Remove dead code** - SSEHandler, SubscriptionHandler
3. **Centralize types** - EntityKey → @lens/core
4. **Package READMEs** - Per-package documentation
5. **CHANGELOG** - Version history
