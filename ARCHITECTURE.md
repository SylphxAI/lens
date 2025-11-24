# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "Everything is Reactive. Everything can Stream."          │
│                                                             │
│   - Zero distinction between query and subscription         │
│   - Server emits, Client receives                           │
│   - Declare what you want, get updates automatically        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **TypeScript-First** - Full type inference from schema to client
2. **Reactive by Default** - Every query returns a live signal
3. **Frontend-Driven** - Client declares what it needs
4. **Zero Config** - Schema = Shape, Resolver = Implementation
5. **Minimal Transfer** - Automatic delta/patch/value strategy
6. **Simple API** - Internal complexity, external simplicity

---

## The Unified Model

### No Query vs Subscription

Traditional APIs separate "queries" (one-time) from "subscriptions" (live).

**Lens unifies them:**

```
return value   → Server yields once      → Client receives once
yield values   → Server yields many      → Client receives updates
emit(data)     → Server emits anytime    → Client receives updates

All three feed into the same reactive pipeline.
Client just sees: Signal<T> that updates automatically.
```

### Three Syntaxes, One Purpose

```typescript
// ═══════════════════════════════════════════════════════════
// 1. return - Simplest, one-time data
// ═══════════════════════════════════════════════════════════
resolve: async (id, ctx) => {
    return await db.get(id);
}

// ═══════════════════════════════════════════════════════════
// 2. yield - Generator pattern, sequential streaming
// ═══════════════════════════════════════════════════════════
resolve: async function* (id, ctx) {
    yield await db.get(id);              // Initial
    for await (const chunk of stream) {
        yield { content: chunk };        // Updates
    }
}

// ═══════════════════════════════════════════════════════════
// 3. emit - Most flexible, any pattern
// ═══════════════════════════════════════════════════════════
resolve: async (id, ctx) => {
    ctx.emit(await db.get(id));          // Initial

    redis.subscribe(`entity:${id}`, (msg) => {
        ctx.emit(msg);                   // Event-driven
    });

    ctx.onCleanup(() => redis.unsubscribe());
}
```

**User chooses based on data source pattern:**

| Pattern | Syntax | Example |
|---------|--------|---------|
| DB query | `return` | `return await db.get(id)` |
| Sequential stream | `yield` | LLM streaming |
| Event-driven | `emit()` | WebSocket, Redis pub/sub |
| Mixed | `yield` + `emit()` | Initial + live updates |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│                                                              │
│   api.post.get({ id })  →  Signal<Post>  (auto-updates)     │
│                                 ↑                            │
│   ┌─────────────────────────────┴──────────────────────────┐│
│   │  Reactive Store                                         ││
│   │  • Applies updates (value/delta/patch)                 ││
│   │  • Maintains local state                               ││
│   └─────────────────────────────────────────────────────────┘│
│                                 ↑                            │
│                            WebSocket                         │
└─────────────────────────────────┼───────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────┐
│                                 ↓              SERVER        │
│   ┌─────────────────────────────────────────────────────────┐│
│   │  GraphStateManager (Single Source of Truth)             ││
│   │                                                          ││
│   │  ┌─────────────┐     ┌─────────────┐                   ││
│   │  │ Canonical   │     │ Per-Client  │                   ││
│   │  │ State       │────▶│ Diff        │────▶ WebSocket    ││
│   │  │ (truth)     │     │ (minimal)   │                   ││
│   │  └─────────────┘     └─────────────┘                   ││
│   │         ↑                                               ││
│   │   return / yield / emit()                               ││
│   └─────────┼───────────────────────────────────────────────┘│
│             │                                                │
│   ┌─────────┴───────────────────────────────────────────────┐│
│   │  Resolvers                                               ││
│   │  • Any data source: DB, Redis, WebSocket...             ││
│   │  • emit() patches server state                          ││
│   │  • Server auto-syncs to clients                         ││
│   └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Server Architecture

### GraphStateManager (Core)

The **single** orchestration layer for all subscriptions:

```typescript
class GraphStateManager {
    // Canonical state per entity (server truth)
    private canonical: Map<EntityKey, EntityData>;

    // Per-client: what they last received
    private clients: Map<ClientId, Map<EntityKey, ClientState>>;

    // When resolver emits:
    emit(entity: string, id: string, data: Partial<T>): void {
        // 1. Merge into canonical state
        canonical[key] = { ...canonical[key], ...data };

        // 2. For each subscribed client:
        for (const client of getSubscribers(entity, id)) {
            // 3. Compute minimal diff
            const diff = createUpdate(client.lastState, canonical[key]);

            // 4. Send (auto-selects value/delta/patch)
            send(client, diff);

            // 5. Update client's last known state
            client.lastState = canonical[key];
        }
    }
}
```

### Server Integration

```typescript
const server = createServer({
    schema,
    resolvers,
    context: () => ({ db }),
});

// Internally:
// - GraphStateManager handles all subscription state
// - ExecutionEngine.executeReactive() connects resolvers → GraphStateManager
// - WebSocket handler connects GraphStateManager → clients
```

---

## Transfer Optimization

### Automatic Strategy Selection

Server selects optimal transfer based on data type and change:

| Data Type | Strategy | When | Savings |
|-----------|----------|------|---------|
| Short string | `value` | < 100 chars | - |
| Long string | `delta` | Small change | ~57% |
| Object | `patch` | Partial change | ~99% |
| Array | `patch` | Modifications | ~90% |
| Primitives | `value` | Always | - |

### Wire Protocol

```typescript
// Value - full replacement
{ strategy: "value", data: "New Title" }

// Delta - character-level diff
{ strategy: "delta", data: [{ position: 10, insert: "Hello" }] }

// Patch - JSON Patch RFC 6902
{ strategy: "patch", data: [{ op: "replace", path: "/name", value: "John" }] }
```

---

## Client Reactivity

### EntitySignal

Every query returns a reactive signal with field-level granularity:

```typescript
interface EntitySignal<T> {
    // Full entity value (computed)
    readonly value: T;

    // Field-level signals
    readonly $: { [K in keyof T]: Signal<T[K]> };

    // Metadata
    readonly loading: Signal<boolean>;
    readonly error: Signal<Error | null>;

    // Lifecycle
    dispose(): void;
}
```

### Fine-grained Updates

```typescript
// Coarse: re-renders when ANY field changes
<div>{user.value.name}</div>

// Fine: re-renders ONLY when name changes
<div>{user.$.name.value}</div>
```

---

## Package Structure

```
@lens/core      Schema, types, update strategies, EntityKey
@lens/server    Resolvers, GraphStateManager, ExecutionEngine
@lens/client    Reactive store, signals, transport
@lens/react     React hooks and bindings
```

### Key Types (from @lens/core)

```typescript
// Shared across all packages
export type EntityKey = `${string}:${string}`;
export type Update = { strategy: "value" | "delta" | "patch"; data: unknown };
```

---

## Comparison

| Feature | GraphQL | tRPC | Lens |
|---------|---------|------|------|
| Type Safety | Codegen | Native | Native |
| Field Selection | ✅ | ❌ | ✅ |
| Real-time | Subscription | Manual | **Native** |
| Streaming | ❌ | ❌ | **Native** |
| Optimistic | Manual | Manual | **Auto** |
| N+1 Prevention | DataLoader | Manual | **Auto** |
| Transfer Optimization | ❌ | ❌ | **Auto** |
| Query/Sub Unified | ❌ | ❌ | **✅** |

---

## Summary

```
Schema     = Define shape (WHAT)
Resolvers  = Implement fetching (HOW)
             - return (once)
             - yield (stream)
             - emit (flexible)
Client     = Reactive access (USE)
             - Signal<T> auto-updates
             - Declare what you want

GraphStateManager = Single source of truth
                    - Maintains canonical state
                    - Tracks per-client state
                    - Computes minimal diffs
                    - Auto-syncs to clients

Everything else is automatic.
```
