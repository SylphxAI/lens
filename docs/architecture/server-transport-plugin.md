# Lens Server Architecture: Transport & Plugin Separation

## Overview

This document defines the correct separation of concerns between Server, Adapter (Transport), and Plugin layers.

## Core Principle

> **Transport 層不應該影響 Lens 邏輯**
>
> Adapters are pure delivery mechanisms. They should not know about state management, diff computation, or optimization strategies.

---

## Layer Responsibilities

### 1. Adapter (Transport Layer)

**職責：純協議處理**

- Receive client messages (WebSocket/HTTP/SSE)
- Parse protocol-specific format
- Call server methods
- Deliver server responses to client
- Connection lifecycle (connect/disconnect)

**不應該做：**
- ❌ Know about state management (`getStateManager()`)
- ❌ Call state manager directly (`stateManager.subscribe()`)
- ❌ Check if server has state (`hasStateManagement()`)
- ❌ Make decisions based on server mode (stateful vs stateless)
- ❌ Compute diffs or optimizations

**Interface：**
```typescript
interface Adapter {
  // Lifecycle
  handleConnection(ws: WebSocketLike): void;
  close(): Promise<void>;

  // No state-related methods!
}
```

### 2. Server (Execution Layer)

**職責：執行操作 + 協調 Plugin**

- Execute queries and mutations
- Manage plugin lifecycle
- Route data through plugin hooks
- Deliver data to clients (via registered send functions)

**Interface：**
```typescript
interface LensServer {
  // Core execution
  getMetadata(): ServerMetadata;
  execute(op: LensOperation): Promise<LensResult>;

  // Client management
  addClient(clientId: string, send: SendFn): Promise<boolean>;
  removeClient(clientId: string): void;

  // Subscription lifecycle (delegates to plugins)
  subscribe(ctx: SubscribeContext): Promise<boolean>;
  unsubscribe(ctx: UnsubscribeContext): void;

  // Data delivery (runs through plugin hooks)
  send(clientId: string, subscriptionId: string, data: unknown): Promise<void>;

  // Broadcast to all subscribers of an entity
  broadcast(entity: string, entityId: string, data: Record<string, unknown>): void;
}
```

### 3. Plugin (Behavior Extension)

**職責：攔截和修改行為**

Plugins use hooks to intercept and modify server behavior. The `diffOptimizer` plugin adds stateful behavior.

**diffOptimizer Plugin 職責：**
- Track per-client state
- Compute minimal diffs in `beforeSend` hook
- Determine optimal transfer strategy (value/delta/patch)
- Handle reconnection with version tracking

---

## Data Flow

### Subscribe Flow

```
Client                    Adapter                 Server                Plugin (diffOptimizer)
  |                         |                       |                         |
  |-- subscribe msg ------->|                       |                         |
  |                         |-- execute(query) ---->|                         |
  |                         |<---- result ----------|                         |
  |                         |                       |                         |
  |                         |-- subscribe(ctx) ---->|-- onSubscribe hook ---->|
  |                         |                       |                         |-- track subscription
  |                         |                       |                         |
  |                         |-- send(data) -------->|-- beforeSend hook ----->|
  |                         |                       |                         |-- compute if initial
  |                         |                       |<-- optimized data ------|
  |                         |<-- deliver to client--|                         |
  |<-- data msg ------------|                       |                         |
```

### Update Flow (Mutation/External)

```
External Event            Server                Plugin (diffOptimizer)        Client
  |                         |                         |                         |
  |-- broadcast(entity) --->|                         |                         |
  |                         |-- beforeSend hook ----->|                         |
  |                         |                         |-- get previous state    |
  |                         |                         |-- compute diff          |
  |                         |<-- optimized update ----|                         |
  |                         |                         |                         |
  |                         |-- deliver via sendFn --------------------------------->|
```

---

## Implementation Changes Required

### 1. Remove from WSAdapter

```typescript
// ❌ Remove these
const stateManager = server.getStateManager();
server.emit(entity, entityId, entityData);
stateManager.updateSubscription(...);
stateManager.subscribe(...);
adapter.getStateManager();
```

### 2. Add to Server

```typescript
// ✅ New server.send() method
async send(clientId: string, subscriptionId: string, data: unknown): Promise<void> {
  const sendFn = this.clientSendFns.get(clientId);
  if (!sendFn) return;

  // Run beforeSend hooks (plugins can transform data)
  const ctx: BeforeSendContext = { clientId, data, isInitial, entity, entityId };
  const optimizedData = await this.pluginManager.runBeforeSend(ctx);

  // Deliver to client
  sendFn({ type: "data", id: subscriptionId, data: optimizedData });

  // Run afterSend hooks
  await this.pluginManager.runAfterSend({ ...ctx, timestamp: Date.now() });
}

// ✅ New server.broadcast() method
broadcast(entity: string, entityId: string, data: Record<string, unknown>): void {
  // Get all clients subscribed to this entity
  const subscribers = this.getSubscribers(entity, entityId);

  for (const { clientId, subscriptionId } of subscribers) {
    this.send(clientId, subscriptionId, data);
  }
}
```

### 3. Update diffOptimizer Plugin

```typescript
// ✅ Plugin handles all state logic in beforeSend
beforeSend(ctx: BeforeSendContext): Record<string, unknown> | void {
  const { clientId, entity, entityId, data, isInitial } = ctx;

  if (isInitial) {
    // Store as initial state, return full data
    this.stateManager.setInitialState(entity, entityId, data);
    this.stateManager.updateClientState(clientId, entity, entityId, data);
    return data;
  }

  // Compute diff against client's last known state
  const lastState = this.stateManager.getClientState(clientId, entity, entityId);
  const diff = this.stateManager.computeDiff(lastState, data);

  // Update client's last known state
  this.stateManager.updateClientState(clientId, entity, entityId, data);

  // Return optimized payload (diff or full based on size)
  return diff;
}
```

### 4. Simplified WSAdapter

```typescript
async function handleSubscribe(conn: ClientConnection, message: SubscribeMessage) {
  const { id, operation, input, fields } = message;

  // 1. Execute query
  const result = await server.execute({ path: operation, input });
  if (result.error) { /* send error */ return; }

  // 2. Register subscription (server handles plugin hooks)
  const entities = extractEntities(result.data);
  for (const { entity, entityId } of entities) {
    const allowed = await server.subscribe({
      clientId: conn.id,
      subscriptionId: id,
      operation, input, fields,
      entity, entityId,
    });
    if (!allowed) { /* send error */ return; }
  }

  // 3. Send initial data (server handles optimization via plugins)
  await server.send(conn.id, id, result.data);

  // Done! Adapter doesn't know about state/diff
}
```

---

## Protocol Messages

### Stateless Mode (No Plugin)

Client always receives `data` messages with full payload:
```json
{ "type": "data", "id": "sub_1", "data": { "id": "123", "name": "John", "email": "john@example.com" } }
```

### Stateful Mode (With diffOptimizer)

Initial subscription - `data` message:
```json
{ "type": "data", "id": "sub_1", "data": { "id": "123", "name": "John", "email": "john@example.com" } }
```

Subsequent updates - `update` message (from plugin):
```json
{ "type": "update", "entity": "User", "id": "123", "version": 2, "updates": { "name": { "strategy": "value", "data": "Jane" } } }
```

---

## Benefits

1. **Clean separation**: Adapter knows nothing about optimization
2. **Testable**: Each layer can be tested independently
3. **Flexible**: Different plugins can implement different optimization strategies
4. **Consistent**: Same adapter works for stateless and stateful servers
5. **Maintainable**: Changes to optimization don't touch transport code

---

## Migration Steps

1. Add `server.send()` method
2. Add `server.broadcast()` method
3. Update `diffOptimizer.beforeSend()` to handle diff computation
4. Remove state manager references from WSAdapter
5. Remove `getStateManager()` from adapter interface
6. Remove `hasStateManagement()` checks from adapter
7. Update tests
8. Update documentation

---

## Questions for Review

1. Should `send()` be sync or async?
2. Should we keep `emit()` method or replace with `broadcast()`?
3. How should reconnection be handled? (Still need state manager access)
4. Should message format be unified (always `data` type, plugin modifies content)?
