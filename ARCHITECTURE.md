# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**
> Single Source of Truth (SSOT) Document

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
│   - Optimistic by default                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **TypeScript-First** - Full type inference, same code runs on client and server
2. **Reactive by Default** - Every query returns a live signal
3. **Optimistic by Default** - Mutations update UI immediately
4. **Frontend-Driven** - Client declares what it needs
5. **Schema = Source of Truth** - Everything derives from schema
6. **Simple > Complex** - No unnecessary abstractions (NO PLUGINS)

---

## Package Structure

```
@lens/core      Schema, types, shared utilities
@lens/client    Reactive client, Links, Store
@lens/server    Resolvers, handlers, middleware
```

---

## 1. Schema System

### Entity Definition

```typescript
import { defineEntity, t } from '@lens/core'

const User = defineEntity({
  id: t.id(),
  name: t.string(),
  email: t.string().validate(isEmail),

  // .compute() - Runs on BOTH client and server (pure function)
  slug: t.string().compute(u => slugify(u.name)),

  // .default() - Runs on BOTH client and server
  createdAt: t.datetime().default(() => new Date()),

  // Relations
  posts: t.hasMany(Post),
})
```

### Field Modifiers

| Modifier | Runs On | Purpose |
|----------|---------|---------|
| `.default(fn)` | Client + Server | Default value for create |
| `.compute(fn)` | Client + Server | Derived from other fields |
| `.validate(fn)` | Client + Server | Validation rule |
| `.nullable()` | - | Allow null |
| `.optional()` | - | Optional in input |

**Key Insight:** `.default()` and `.compute()` are pure functions that run on BOTH client (for optimistic) and server. This is the power of TypeScript-first / isomorphic design.

### Schema Creation

```typescript
import { createSchemaFrom } from '@lens/core'

export const schema = createSchemaFrom({ User, Post, Comment })
```

---

## 2. Client System

### Client Creation

```typescript
import { createClient } from '@lens/client'

const client = createClient({
  schema,
  links: [
    authLink({ getToken }),
    retryLink({ maxRetries: 3 }),
    httpLink({ url: '/api' }),
  ],
})
```

### Links (ONLY Middleware Mechanism)

Links are the **ONLY** middleware on client. No plugins.

```
Request → authLink → retryLink → cacheLink → httpLink → Server
                                                           ↓
Response ← ─────────────────────────────────────────────────
```

**Built-in Links:**
- `httpLink` - HTTP transport (terminal)
- `websocketLink` - WebSocket transport (terminal)
- `sseLink` - SSE transport (terminal)
- `authLink` - Add auth headers
- `retryLink` - Retry failed requests
- `cacheLink` - Response caching
- `loggerLink` - Request/response logging

**Custom Link:**
```typescript
const myLink = (): Link => () => async (op, next) => {
  console.log('Before:', op)
  const result = await next(op)
  console.log('After:', result)
  return result
}
```

### CRUD Operations

```typescript
// Query
const user = await client.User.get('123')
const users = await client.User.list({ where: { active: true } })

// Mutations (auto optimistic)
await client.User.create({ name: 'Alice' })
await client.User.update('123', { name: 'Bob' })
await client.User.delete('123')

// Pagination (built-in)
const { items, pageInfo } = await client.User.list({
  first: 20,
  after: cursor,
})
```

---

## 3. Optimistic Updates (CORE BEHAVIOR)

### Principle

Optimistic updates are **core behavior**, NOT a plugin.

### Simple CRUD - Automatic

```typescript
// No config needed - auto optimistic
await client.User.update('123', { name: 'New' })

// What happens:
// 1. Merge input into store immediately (+ apply schema .default()/.compute())
// 2. Send to server
// 3. Replace with server response (server authoritative)
// 4. On error, rollback
```

### Custom Mutations - Define Optimistic

For mutations affecting multiple entities:

```typescript
const sendMessage = defineMutation({
  name: 'sendMessage',
  input: { sessionId: t.string(), content: t.string() },
  returns: { message: Message, session: Session },

  // Optimistic: pure function, affects multiple entities
  optimistic: (input, { store, tempId }) => {
    const msgId = tempId()
    const session = store.get('Session', input.sessionId)

    return {
      create: {
        Message: {
          id: msgId,
          content: input.content,
          sessionId: input.sessionId,
          // plainText and createdAt auto-filled by schema .compute()/.default()
        }
      },
      update: {
        Session: {
          [input.sessionId]: {
            messages: [...session.messages, msgId],
            lastMessage: input.content,
          }
        }
      }
    }
  },

  // Server resolver
  resolve: async (input, ctx) => {
    const message = await ctx.db.message.create({ ... })
    const session = await ctx.db.session.update({ ... })
    return { message, session }
  }
})
```

### Optimistic Function Spec

```typescript
type OptimisticFn<TInput> = (
  input: TInput,
  context: {
    store: ReadonlyStore,  // Read current state
    tempId: () => string,   // Generate temp ID
  }
) => {
  create?: { [Entity: string]: object },
  update?: { [Entity: string]: { [id: string]: object | ((current) => object) } },
  delete?: { [Entity: string]: string[] },
}
```

### Optimistic Decision Tree

| Situation | Optimistic Behavior |
|-----------|-------------------|
| Simple CRUD | Automatic, use input + schema defaults |
| Custom mutation, single entity | Optional define, or automatic |
| Custom mutation, multi-entity | **Define `optimistic` function** |
| Complex / don't want optimistic | Don't define, wait for server |

---

## 4. The Unified Query Model

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
// 1. return - Simplest, one-time data
resolve: async (id, ctx) => {
  return await db.get(id);
}

// 2. yield - Generator pattern, sequential streaming
resolve: async function* (id, ctx) {
  yield await db.get(id);              // Initial
  for await (const chunk of stream) {
    yield { content: chunk };          // Updates
  }
}

// 3. emit - Most flexible, any pattern
resolve: async (id, ctx) => {
  ctx.emit(await db.get(id));          // Initial
  redis.subscribe(`entity:${id}`, (msg) => {
    ctx.emit(msg);                     // Event-driven
  });
  ctx.onCleanup(() => redis.unsubscribe());
}
```

---

## 5. Reactive System

### Signals

```typescript
import { signal, computed, effect } from '@lens/client'

const count = signal(0)
const doubled = computed(() => count.value * 2)

effect(() => {
  console.log('Count:', count.value)
})
```

### Entity Signals (Field-Level Reactivity)

```typescript
const user = client.User.get('123')

// user is an EntitySignal with field-level reactivity
effect(() => {
  console.log(user.name.value) // Only re-runs when name changes
})
```

### EntitySignal Interface

```typescript
interface EntitySignal<T> {
  readonly value: T;                              // Full entity
  readonly $: { [K in keyof T]: Signal<T[K]> };  // Field signals
  readonly $pending: Signal<boolean>;             // Optimistic pending
  readonly loading: Signal<boolean>;
  readonly error: Signal<Error | null>;
  dispose(): void;
}
```

---

## 6. Server Architecture

### GraphStateManager (Core)

Single orchestration layer for all subscriptions:

```typescript
class GraphStateManager {
  // Canonical state per entity (server truth)
  private canonical: Map<EntityKey, EntityData>;

  // Per-client: what they last received
  private clients: Map<ClientId, Map<EntityKey, ClientState>>;

  emit(entity: string, id: string, data: Partial<T>): void {
    // 1. Merge into canonical state
    // 2. For each subscribed client:
    //    - Compute minimal diff
    //    - Send (auto-selects value/delta/patch)
    //    - Update client's last known state
  }
}
```

### Server Middleware

```typescript
const server = createServer({
  schema,
  middleware: [
    authMiddleware(),
    rateLimitMiddleware({ limit: 100, window: '1m' }),
  ],
})
```

---

## 7. Transfer Optimization

### Automatic Strategy Selection

| Data Type | Strategy | When | Savings |
|-----------|----------|------|---------|
| Short string | `value` | < 100 chars | - |
| Long string | `delta` | Small change | ~57% |
| Object | `patch` | Partial change | ~99% |
| Primitives | `value` | Always | - |

---

## 8. What We DON'T Have

### NO Plugin System

Plugins are replaced by:
- **Links** - Client middleware
- **Server Middleware** - Server middleware
- **Schema Features** - `.validate()`, `.default()`, `.compute()`
- **Core Behavior** - Optimistic, pagination

### NO Handshake Protocol

Not needed. Schema is shared code.

### NO OptimisticPlugin / OptimisticManager

Optimistic is core behavior in mutation execution.

---

## 9. File Structure

```
packages/
├── core/
│   └── src/
│       ├── schema/
│       │   ├── types.ts      # Field types (t.string, etc.)
│       │   ├── define.ts     # defineEntity, defineMutation
│       │   └── create.ts     # createSchemaFrom
│       └── index.ts
│
├── client/
│   └── src/
│       ├── client/
│       │   └── client.ts     # createClient, CRUD, optimistic
│       ├── links/
│       │   ├── types.ts
│       │   ├── http.ts
│       │   ├── auth.ts
│       │   └── ...
│       ├── reactive/
│       │   ├── signal.ts
│       │   └── store.ts
│       └── index.ts
│
└── server/
    └── src/
        ├── server/
        │   └── server.ts
        ├── middleware/
        │   ├── auth.ts
        │   └── rate-limit.ts
        └── index.ts
```

---

## 10. Code Generation (Future)

Since schema is TypeScript, can generate clients for other languages:

```bash
lens codegen --target swift --output ./ios/
lens codegen --target kotlin --output ./android/
```

---

## 11. Migration: What to Delete

```
DELETE:
├── packages/core/src/plugins/           # Entire plugin system
├── packages/client/src/plugins/         # Client plugins
├── packages/client/src/reactive/optimistic-manager.ts

KEEP:
├── packages/client/src/links/           # Only middleware
├── packages/client/src/reactive/        # Signals, store
```

---

## Summary

| Concept | Implementation |
|---------|---------------|
| Schema | `defineEntity`, `t.*` field types |
| Computed fields | Schema `.compute()` (isomorphic) |
| Defaults | Schema `.default()` (isomorphic) |
| Validation | Schema `.validate()` |
| Client Middleware | **Links only** |
| Server Middleware | Server middleware |
| Optimistic | **Core behavior** + `optimistic` in mutations |
| Pagination | Built-in, cursor-based |
| Real-time | Subscriptions via WebSocket/SSE |

**No plugins. No unnecessary complexity. Schema-driven everything.**
