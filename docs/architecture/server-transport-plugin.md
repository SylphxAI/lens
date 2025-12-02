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
- ❌ Know about state management
- ❌ Call state manager directly
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
- Track subscriptions for broadcast

**Interface：**
```typescript
interface LensServer {
  // Core execution
  getMetadata(): ServerMetadata;
  execute(op: LensOperation): Promise<LensResult>;

  // Client management
  addClient(clientId: string, send: SendFn): Promise<boolean>;
  removeClient(clientId: string, subscriptionCount: number): void;

  // Subscription lifecycle (delegates to plugins)
  subscribe(ctx: SubscribeContext): Promise<boolean>;
  unsubscribe(ctx: UnsubscribeContext): void;

  // Data delivery (runs through plugin hooks)
  send(clientId, subscriptionId, entity, entityId, data, isInitial): Promise<void>;

  // Broadcast to all subscribers of an entity
  broadcast(entity: string, entityId: string, data: Record<string, unknown>): Promise<void>;

  // Reconnection (delegates to plugin hooks)
  handleReconnect(ctx: ReconnectContext): Promise<ReconnectHookResult[] | null>;

  // Field updates (delegates to plugin hooks)
  updateFields(ctx: UpdateFieldsContext): Promise<void>;

  // Plugin access
  getPluginManager(): PluginManager;
}
```

### 3. Plugin (Behavior Extension)

**職責：攔截和修改行為**

Plugins use hooks to intercept and modify server behavior. The `diffOptimizer` plugin adds stateful behavior.

**Available Hooks:**
- `onConnect(ctx)` - Client connects
- `onDisconnect(ctx)` - Client disconnects
- `onSubscribe(ctx)` - Client subscribes
- `onUnsubscribe(ctx)` - Client unsubscribes
- `beforeSend(ctx)` - Before sending data (can transform)
- `afterSend(ctx)` - After sending data
- `beforeMutation(ctx)` - Before mutation (can reject)
- `afterMutation(ctx)` - After mutation
- `onReconnect(ctx)` - Handle reconnection requests
- `onUpdateFields(ctx)` - Handle field subscription updates

**diffOptimizer Plugin 職責：**
- Track per-client state via internal maps
- Compute minimal diffs in `beforeSend` hook
- Determine optimal transfer strategy (value/delta/patch)
- Handle reconnection via `onReconnect` hook with version tracking
- Sync field updates via `onUpdateFields` hook

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
  |                         |                       |                         |-- store initial state
  |                         |                       |<-- full data -----------|
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

### Reconnection Flow

```
Client                    Adapter                 Server                Plugin (diffOptimizer)
  |                         |                       |                         |
  |-- reconnect msg ------->|                       |                         |
  |                         |                       |                         |
  |                         |-- handleReconnect --->|                         |
  |                         |    (ctx with subs)    |-- onReconnect hook ---->|
  |                         |                       |                         |-- check versions
  |                         |                       |                         |-- compute patches/snapshots
  |                         |                       |<-- results array -------|
  |                         |                       |                         |
  |                         |                       |-- update tracking ------|
  |                         |<-- results -----------|                         |
  |<-- reconnect_ack -------|                       |                         |
```

### Update Fields Flow

```
Client                    Adapter                 Server                Plugin (diffOptimizer)
  |                         |                       |                         |
  |-- updateFields msg ---->|                       |                         |
  |                         |-- updateFields(ctx) ->|                         |
  |                         |                       |-- onUpdateFields hook ->|
  |                         |                       |                         |-- update field tracking
  |                         |                       |                         |
```

---

## Implementation Status

### ✅ Completed

1. **Server Methods**
   - `send()` - Runs through beforeSend/afterSend hooks
   - `broadcast()` - Sends to all entity subscribers via send()
   - `handleReconnect()` - Delegates to onReconnect hook
   - `updateFields()` - Delegates to onUpdateFields hook

2. **Plugin Hooks**
   - `onReconnect` - Handle reconnection requests
   - `onUpdateFields` - Handle field subscription updates

3. **diffOptimizer Plugin**
   - `beforeSend` - Computes diffs using internal state tracking
   - `onReconnect` - Uses GraphStateManager for version/patch logic
   - `onUpdateFields` - Updates internal field tracking

4. **WSAdapter Simplification**
   - No longer references stateManager directly
   - Uses server methods for all operations
   - Converts ReconnectMessage to ReconnectContext

5. **Server State Removal**
   - Server no longer has direct `stateManager` field
   - `hasStateManagement()` checks for diffOptimizer plugin
   - `getStateManager()` retrieves from diffOptimizer plugin

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
{ "type": "data", "id": "sub_1", "data": { "_type": "update", "entity": "User", "id": "123", "updates": { "name": { "strategy": "value", "data": "Jane" } } } }
```

Reconnection response:
```json
{
  "type": "reconnect_ack",
  "reconnectId": "abc123",
  "results": [
    { "id": "sub_1", "entity": "User", "entityId": "123", "status": "current", "version": 5 },
    { "id": "sub_2", "entity": "Post", "entityId": "456", "status": "patched", "version": 8, "patches": [...] },
    { "id": "sub_3", "entity": "Comment", "entityId": "789", "status": "snapshot", "version": 3, "data": {...} }
  ],
  "serverTime": 1234567890,
  "processingTime": 12
}
```

---

## Benefits

1. **Clean separation**: Adapter knows nothing about optimization
2. **Testable**: Each layer can be tested independently
3. **Flexible**: Different plugins can implement different optimization strategies
4. **Consistent**: Same adapter works for stateless and stateful servers
5. **Maintainable**: Changes to optimization don't touch transport code

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Adapter (ws.ts)                                  │
│  - Parse WebSocket messages                                             │
│  - Call server methods                                                  │
│  - Deliver responses                                                    │
│  - Track local subscription IDs                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Server (create.ts)                               │
│  - Execute operations                                                   │
│  - Track subscriptions for broadcast                                    │
│  - Route through plugin hooks                                           │
│  - Manage client send functions                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Plugin Manager                                      │
│  - runOnConnect, runOnDisconnect                                        │
│  - runOnSubscribe, runOnUnsubscribe                                     │
│  - runBeforeSend, runAfterSend                                          │
│  - runOnReconnect, runOnUpdateFields                                    │
│  - runBeforeMutation, runAfterMutation                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    diffOptimizer Plugin                                  │
│  - Per-client state tracking (clientStates Map)                         │
│  - Per-client subscription tracking (clientSubscriptions Map)           │
│  - Per-client field tracking (clientFields Map)                         │
│  - GraphStateManager for reconnection                                   │
│  - Diff computation in beforeSend                                       │
└─────────────────────────────────────────────────────────────────────────┘
```
