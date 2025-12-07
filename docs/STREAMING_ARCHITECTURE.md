# Lens Streaming Architecture

> Unified Observable-based streaming for all transports

## Overview

Lens supports three streaming patterns, all unified through a single `Observable`-based `execute()` API:

1. **AsyncIterable (Pull)** - Resolver yields multiple values
2. **emit (Push)** - Resolver pushes updates via `ctx.emit`
3. **One-shot** - Resolver returns single value

## Core Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                    server.execute() → Observable                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Single entry point for ALL operations                          │
│  Observable abstracts all streaming patterns                     │
│  Transports adapt Observable to their protocol                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Streaming Patterns

### 1. AsyncIterable (Pull Model)

Resolver is a generator that yields values. Client pulls from the stream.

```typescript
query()
  .input(z.object({ cursor: z.string().optional() }))
  .resolve(async function* ({ input }) {
    let cursor = input.cursor;
    while (true) {
      const { data, nextCursor } = await fetchPage(cursor);
      yield data;
      if (!nextCursor) break;
      cursor = nextCursor;
    }
  });
```

**Use cases:**
- Cursor-based pagination
- Polling with backpressure
- Finite streams

### 2. emit (Push Model)

Resolver returns initial data, then pushes updates via `ctx.emit`.

```typescript
query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => {
    const user = getUser(input.id);

    // Subscribe to changes
    const unsub = database.subscribe(input.id, (changes) => {
      ctx.emit.set("name", changes.name);        // Field update
      ctx.emit.delta("bio", changes.bioOps);     // Delta (text)
      ctx.emit.patch("settings", changes.patch); // JSON Patch
    });

    ctx.onCleanup(unsub);
    return user;
  });
```

**Use cases:**
- Real-time collaboration
- Live dashboards
- Field-level updates (minimal payloads)

### 3. One-shot

Standard query/mutation returning single value.

```typescript
query()
  .input(z.object({ id: z.string() }))
  .resolve(async ({ input }) => {
    return await getUser(input.id);
  });
```

## Server Interface

```typescript
interface LensServer {
  /**
   * Get operation metadata for client handshake.
   */
  getMetadata(): ServerMetadata;

  /**
   * Execute operation and return Observable.
   *
   * Observable behavior varies by resolver:
   * - Promise<T>: emits once, completes
   * - AsyncIterable<T>: emits each yield, completes when done
   * - emit calls: emits on each call, stays open until unsubscribe
   */
  execute(op: Operation): Observable<Result>;
}
```

## Observable Contract

```typescript
interface Observable<T> {
  subscribe(observer: Observer<T>): Unsubscribable;
}

interface Observer<T> {
  next?: (value: T) => void;
  error?: (err: Error) => void;
  complete?: () => void;
}

interface Unsubscribable {
  unsubscribe(): void;
}
```

### Behavior by Pattern

| Pattern | `next()` calls | `complete()` call | Stays open |
|---------|---------------|-------------------|------------|
| One-shot (Promise) | 1 | Yes (after next) | No |
| AsyncIterable | N (each yield) | Yes (when done) | No |
| emit-based | 1 (initial) + N (emit) | On unsubscribe | Yes |

## Transport Adaptation

Transports adapt Observable to their protocol capabilities:

### direct() - Full Streaming

Direct passthrough, supports all patterns.

```typescript
function direct({ app }) {
  return {
    connect: () => Promise.resolve(app.getMetadata()),
    execute: (op) => app.execute(op),  // Direct Observable passthrough
  };
}
```

**Use cases:**
- Server-side rendering (SSR)
- Server Components
- Testing
- Same-process communication

### http() - One-shot Only

Takes first value from Observable.

```typescript
function http({ url }) {
  return {
    execute: async (op) => {
      const res = await fetch(url, { body: JSON.stringify(op) });
      return res.json();
      // Server handler: firstValueFrom(server.execute(op))
    },
  };
}
```

**Limitation:** Cannot stream. For streaming, use `ws()` or `sse()`.

### ws() - Full Streaming via WebSocket

Streams Observable values over WebSocket.

```typescript
function ws({ url }) {
  return {
    execute: (op) => {
      return {
        subscribe(observer) {
          socket.send({ type: 'subscribe', ...op });
          // Server streams Observable values as WS messages
          socket.on('data', (msg) => observer.next?.(msg));
          socket.on('complete', () => observer.complete?.());
          return { unsubscribe: () => socket.send({ type: 'unsubscribe' }) };
        }
      };
    },
  };
}
```

### sse() - Full Streaming via Server-Sent Events

Streams Observable values over EventSource.

```typescript
function sse({ url }) {
  return {
    execute: (op) => {
      if (op.type === 'subscription') {
        return createSseObservable(url, op);
      }
      return httpRequest(url, op);  // Fallback for queries/mutations
    },
  };
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          Resolver                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  async function resolve({ input, ctx }) {                       │
│    // Option 1: Return Promise (one-shot)                       │
│    return await getData();                                       │
│                                                                  │
│    // Option 2: Return AsyncIterable (pull streaming)           │
│    yield* generateStream();                                      │
│                                                                  │
│    // Option 3: Use emit (push streaming)                       │
│    ctx.emit.set("field", value);                                │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   server.execute(op)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Returns Observable<Result> that:                               │
│  - Calls observer.next() for each value                         │
│  - Calls observer.complete() when stream ends                   │
│  - Calls observer.error() on failure                            │
│  - Returns unsubscribe handle for cleanup                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   direct()      │ │     http()      │ │    ws()/sse()   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│  Observable     │ │  First value    │ │  Stream over    │
│  passthrough    │ │  only           │ │  protocol       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Client Hooks                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  const { data, loading } = client.user.get({ input: { id } });  │
│                                                                  │
│  // Hook subscribes to Observable                                │
│  // Updates state on each next()                                 │
│  // Cleans up on unmount                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Server Handler Adaptation

### HTTP Handler

```typescript
async function httpHandler(req: Request, server: LensServer) {
  const op = await req.json();
  const observable = server.execute(op);

  // HTTP can only return one value
  const result = await firstValueFrom(observable);
  return Response.json(result);
}
```

### WebSocket Handler

```typescript
function wsHandler(ws: WebSocket, server: LensServer) {
  const subscriptions = new Map<string, Unsubscribable>();

  ws.on('message', (msg) => {
    const op = JSON.parse(msg);

    if (op.type === 'unsubscribe') {
      subscriptions.get(op.id)?.unsubscribe();
      subscriptions.delete(op.id);
      return;
    }

    const observable = server.execute(op);
    const sub = observable.subscribe({
      next: (result) => ws.send({ type: 'data', id: op.id, ...result }),
      error: (err) => ws.send({ type: 'error', id: op.id, message: err.message }),
      complete: () => ws.send({ type: 'complete', id: op.id }),
    });

    subscriptions.set(op.id, sub);
  });

  ws.on('close', () => {
    subscriptions.forEach(sub => sub.unsubscribe());
  });
}
```

## Implementation Details

### execute() Implementation

```typescript
execute(op: Operation): Observable<Result> {
  const def = this.queries[op.path] || this.mutations[op.path];
  if (!def) {
    return createErrorObservable(new Error(`Operation not found: ${op.path}`));
  }

  return {
    subscribe: (observer) => {
      let currentState: unknown = undefined;
      const cleanups: (() => void)[] = [];
      let completed = false;

      // emit handler pushes to observer
      const emitHandler = (command: EmitCommand) => {
        if (completed) return;
        currentState = applyEmitCommand(command, currentState);
        observer.next?.({ data: currentState });
      };

      const emit = createEmit(emitHandler);
      const onCleanup = (fn: () => void) => {
        cleanups.push(fn);
        return () => { /* remove from cleanups */ };
      };

      const ctx = { ...this.context, emit, onCleanup };

      // Execute resolver
      (async () => {
        try {
          const result = def._resolve({ input: op.input, ctx });

          if (isAsyncIterable(result)) {
            // Pull model - stream all yields
            for await (const value of result) {
              if (completed) break;
              currentState = value;
              observer.next?.({ data: value });
            }
            if (!completed) {
              completed = true;
              observer.complete?.();
            }
          } else {
            // One-shot or emit-based
            const value = await result;
            currentState = value;
            observer.next?.({ data: value });
            // Don't complete - stay open for potential emit calls
            // Complete happens on unsubscribe
          }
        } catch (err) {
          if (!completed) {
            completed = true;
            observer.error?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      })();

      return {
        unsubscribe: () => {
          completed = true;
          cleanups.forEach(fn => fn());
        },
      };
    },
  };
}
```

### Helper: firstValueFrom

```typescript
function firstValueFrom<T>(observable: Observable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const sub = observable.subscribe({
      next: (value) => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          resolve(value);
        }
      },
      error: reject,
      complete: () => {
        if (!resolved) {
          reject(new Error('Observable completed without emitting'));
        }
      },
    });
  });
}
```

### Helper: applyEmitCommand

```typescript
function applyEmitCommand(command: EmitCommand, state: unknown): unknown {
  switch (command.type) {
    case 'full':
      return command.replace ? command.data : { ...state, ...command.data };
    case 'field':
      return { ...state, [command.field]: applyUpdate(state[command.field], command.update) };
    case 'batch':
      return command.updates.reduce(
        (s, u) => ({ ...s, [u.field]: applyUpdate(s[u.field], u.update) }),
        state
      );
    case 'array':
      return applyArrayOperation(state, command.operation);
  }
}
```

## Migration Guide

### Before (inProcess)

```typescript
import { createClient, inProcess } from '@sylphx/lens-client';

const client = createClient({
  transport: inProcess({ app: server }),
});

// Only gets first value, no streaming
const result = await client.user.get.fetch({ input: { id } });
```

### After (direct)

```typescript
import { createClient, direct } from '@sylphx/lens-client';

const client = createClient({
  transport: direct({ app: server }),
});

// Full streaming support
const { data } = client.user.get({ input: { id } });  // Live updates!
const result = await client.user.get.fetch({ input: { id } });  // One-shot
```

### Backwards Compatibility

`inProcess` is kept as a deprecated alias:

```typescript
/** @deprecated Use `direct` instead */
export const inProcess = direct;
```

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Server execute() | Returns `Promise<Result>` | Returns `Observable<Result>` |
| emit in execute() | No-op (ignored) | Connected to Observable |
| direct transport | One-shot only | Full streaming |
| Subscription handling | Separate code path | Unified through execute() |
| Transport naming | `inProcess` | `direct` (clearer) |
