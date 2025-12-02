# Lens Reconnection Architecture

> Version: 1.0.0
> Status: Design Complete
> Last Updated: 2024-12-02

## Table of Contents

1. [Overview](#1-overview)
2. [Design Principles](#2-design-principles)
3. [Architecture](#3-architecture)
4. [Data Structures](#4-data-structures)
5. [Protocol Specification](#5-protocol-specification)
6. [Implementation Details](#6-implementation-details)
7. [Optimizations](#7-optimizations)
8. [Edge Cases](#8-edge-cases)
9. [Testing Strategy](#9-testing-strategy)
10. [Migration Guide](#10-migration-guide)
11. [Metrics & Observability](#11-metrics--observability)

---

## 1. Overview

### 1.1 Problem Statement

Current Lens architecture has critical reconnection issues:

1. **Server forgets client state on disconnect** — `removeClient()` deletes all subscriptions and `lastState`
2. **Client doesn't track subscriptions** — Only stores observer, not subscription details
3. **No catch-up mechanism** — Updates during disconnect are permanently lost
4. **No version tracking** — Cannot determine what client knows vs server state

### 1.2 Solution Summary

Implement a **version-based reconnection system** with:

- **Entity versioning** — Every state change increments version
- **Operation log** — Server retains recent patches for efficient catch-up
- **Client subscription registry** — Client tracks all subscriptions with versions
- **Reconnect protocol** — Efficient state synchronization on reconnect

### 1.3 Goals

| Goal | Metric |
|------|--------|
| Seamless reconnection | < 100ms for typical reconnect |
| No data loss | 100% updates delivered |
| Memory efficient | < 10MB operation log |
| Network efficient | Patches for short disconnects, snapshots for long |
| Scalable | Support 10,000+ concurrent clients |

---

## 2. Design Principles

### 2.1 Server Authoritative

Server is always the source of truth. Client state must converge to server state.

```
Server State (canonical) ──► Client State (derived)
         │                         ▲
         │    version-based        │
         └─────── sync ────────────┘
```

### 2.2 Stateless Server (for disconnected clients)

Server does NOT retain state for disconnected clients:

- ✅ Canonical entity state (shared)
- ✅ Operation log (shared, bounded)
- ❌ Per-client state after disconnect

Client is responsible for remembering its subscriptions.

### 2.3 Version-based Consistency

Every entity has a monotonically increasing version number:

```
emit(user, 123, {name: "Alice"})  → version 1
emit(user, 123, {name: "Bob"})    → version 2
emit(user, 123, {age: 30})        → version 3
```

Client tracks last received version. On reconnect:
- Same version → no update needed
- Different version → send patches or snapshot

### 2.4 Graceful Degradation

```
Short disconnect (< 5 min)  → Send patches (efficient)
Long disconnect (> 5 min)   → Send snapshot (complete)
Very long disconnect        → Re-initialize (safe)
```

---

## 3. Architecture

### 3.1 System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Transport (WS)  │  │ Subscription    │  │ Reactive Store      │ │
│  │                 │  │ Registry        │  │                     │ │
│  │ • connect()     │  │                 │  │ • entity state      │ │
│  │ • reconnect()   │◄─┤ • subscriptions │◄─┤ • observers         │ │
│  │ • send/receive  │  │ • versions      │  │ • updates           │ │
│  └────────┬────────┘  └─────────────────┘  └─────────────────────┘ │
│           │                                                         │
└───────────┼─────────────────────────────────────────────────────────┘
            │ WebSocket
            ▼
┌───────────┴─────────────────────────────────────────────────────────┐
│                              SERVER                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Connection      │  │ Graph State     │  │ Operation Log       │ │
│  │ Handler         │  │ Manager         │  │                     │ │
│  │                 │  │                 │  │ • entries[]         │ │
│  │ • handshake     │─►│ • canonical     │─►│ • maxEntries        │ │
│  │ • reconnect     │  │ • clients       │  │ • maxAge            │ │
│  │ • messages      │  │ • versions      │  │ • index             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

#### Normal Operation

```
Client                          Server
   │                               │
   │ SUBSCRIBE {entity, id}        │
   ├──────────────────────────────►│
   │                               │ subscribe(client, entity, id)
   │                               │ send initial state + version
   │◄──────────────────────────────┤
   │ UPDATE {v:1, data}            │
   │                               │
   │         ... time passes ...   │
   │                               │
   │                               │ emit(entity, id, newData)
   │                               │ version++
   │                               │ log.append(patch)
   │◄──────────────────────────────┤
   │ UPDATE {v:2, patches}         │
   │                               │
```

#### Reconnection

```
Client                          Server
   │                               │
   │ ══════ DISCONNECT ══════     │
   │                               │ removeClient(clientId)
   │ (keeps subscriptionRegistry)  │ (keeps canonical + opLog)
   │                               │
   │ ══════ RECONNECT ═══════     │
   │                               │
   │ RECONNECT {                   │
   │   subscriptions: [            │
   │     {entity, id, v: 1}        │
   │   ]                           │
   │ }                             │
   ├──────────────────────────────►│
   │                               │ for each subscription:
   │                               │   compare versions
   │                               │   get patches or snapshot
   │                               │   re-establish subscription
   │◄──────────────────────────────┤
   │ RECONNECT_ACK {               │
   │   results: [                  │
   │     {status, v, patches/data} │
   │   ]                           │
   │ }                             │
   │                               │
   │ ══════ NORMAL ═══════════    │
```

### 3.3 State Diagram

```
                    ┌─────────────┐
                    │ INITIALIZED │
                    └──────┬──────┘
                           │ connect()
                           ▼
                    ┌─────────────┐
            ┌──────►│  CONNECTED  │◄──────┐
            │       └──────┬──────┘       │
            │              │              │
            │              │ disconnect   │ reconnect success
            │              ▼              │
            │       ┌─────────────┐       │
            │       │RECONNECTING │───────┘
            │       └──────┬──────┘
            │              │ max retries exceeded
            │              ▼
            │       ┌─────────────┐
            └───────│ DISCONNECTED│
              close │             │
                    └─────────────┘
```

---

## 4. Data Structures

### 4.1 Server: Canonical Entity State

```typescript
/**
 * Canonical state for a single entity.
 * Shared across all clients, single source of truth.
 */
interface CanonicalEntityState {
  /** Current entity data */
  data: Record<string, unknown>;

  /** Monotonically increasing version number */
  version: number;

  /** Timestamp of last update (for debugging/metrics) */
  updatedAt: number;
}

/**
 * Canonical state for an array entity.
 */
interface CanonicalArrayState {
  /** Current array items */
  items: unknown[];

  /** Version number */
  version: number;

  /** Timestamp of last update */
  updatedAt: number;
}
```

### 4.2 Server: Operation Log

```typescript
/**
 * Single operation log entry.
 * Represents one state change that can be replayed.
 */
interface OperationLogEntry {
  /** Entity key (e.g., "user:123") */
  entityKey: string;

  /** Version AFTER this operation */
  version: number;

  /** Timestamp when operation occurred */
  timestamp: number;

  /** JSON Patch operations (RFC 6902) */
  patch: PatchOperation[];

  /** Size of patch in bytes (for memory tracking) */
  patchSize: number;
}

/**
 * Configuration for operation log.
 */
interface OperationLogConfig {
  /** Maximum number of entries to retain */
  maxEntries: number;

  /** Maximum age of entries in milliseconds */
  maxAge: number;

  /** Maximum total memory usage in bytes */
  maxMemory: number;
}

/**
 * Operation log with efficient lookup and bounded memory.
 */
class OperationLog {
  private entries: OperationLogEntry[] = [];
  private index: Map<string, number[]> = new Map(); // entityKey → entry indices
  private totalMemory: number = 0;
  private config: OperationLogConfig;

  constructor(config: Partial<OperationLogConfig> = {}) {
    this.config = {
      maxEntries: 10000,
      maxAge: 5 * 60 * 1000, // 5 minutes
      maxMemory: 10 * 1024 * 1024, // 10MB
      ...config,
    };
  }

  /**
   * Append new operation to log.
   * Automatically evicts old entries if limits exceeded.
   */
  append(entry: OperationLogEntry): void;

  /**
   * Get all operations for entity since given version.
   * Returns null if version is too old (not in log).
   */
  getSince(entityKey: string, fromVersion: number): OperationLogEntry[] | null;

  /**
   * Check if version is within log range.
   */
  hasVersion(entityKey: string, version: number): boolean;

  /**
   * Get oldest version available for entity.
   */
  getOldestVersion(entityKey: string): number | null;

  /**
   * Cleanup expired entries.
   */
  cleanup(): void;

  /**
   * Get memory usage statistics.
   */
  getStats(): OperationLogStats;
}
```

### 4.3 Client: Subscription Registry

```typescript
/**
 * Tracked subscription with version information.
 */
interface TrackedSubscription {
  /** Unique subscription ID */
  id: string;

  /** Entity type (e.g., "user") */
  entity: string;

  /** Entity ID (e.g., "123") */
  entityId: string;

  /** Subscribed fields or "*" for all */
  fields: string[] | "*";

  /** Last received version from server */
  version: number;

  /** Last known data (for optimistic updates) */
  lastData: Record<string, unknown> | null;

  /** Hash of last data (for efficient comparison) */
  lastDataHash: string | null;

  /** Observer callbacks */
  observer: {
    next?: (result: Result) => void;
    error?: (error: Error) => void;
    complete?: () => void;
  };

  /** Subscription state */
  state: "active" | "pending" | "reconnecting";

  /** Original subscription input */
  input: unknown;
}

/**
 * Registry for tracking all active subscriptions.
 */
class SubscriptionRegistry {
  private subscriptions = new Map<string, TrackedSubscription>();

  /**
   * Register new subscription.
   */
  add(sub: TrackedSubscription): void;

  /**
   * Update version after receiving update.
   */
  updateVersion(id: string, version: number, data?: Record<string, unknown>): void;

  /**
   * Get subscription by ID.
   */
  get(id: string): TrackedSubscription | undefined;

  /**
   * Remove subscription.
   */
  remove(id: string): void;

  /**
   * Get all subscriptions for reconnect.
   */
  getAllForReconnect(): ReconnectSubscription[];

  /**
   * Mark all subscriptions as reconnecting.
   */
  markReconnecting(): void;

  /**
   * Mark subscription as active after reconnect.
   */
  markActive(id: string): void;

  /**
   * Get statistics.
   */
  getStats(): SubscriptionRegistryStats;
}
```

### 4.4 Hashing Utilities

```typescript
/**
 * Fast hash function for change detection.
 * Using MurmurHash3 for speed and low collision rate.
 */
function hashValue(value: unknown): string;

/**
 * Compute hash of entity state.
 * Used for efficient comparison without full JSON.stringify.
 */
function hashEntityState(data: Record<string, unknown>): string;

/**
 * Compare two values efficiently.
 * Uses hash comparison first, falls back to deep compare if needed.
 */
function valuesEqual(a: unknown, b: unknown, aHash?: string, bHash?: string): boolean;
```

---

## 5. Protocol Specification

### 5.1 Message Types

```typescript
/**
 * All WebSocket message types.
 */
type WsMessageType =
  | "handshake"
  | "handshake_ack"
  | "operation"
  | "response"
  | "subscription"
  | "subscription_ack"
  | "unsubscribe"
  | "update"
  | "reconnect"
  | "reconnect_ack"
  | "error"
  | "ping"
  | "pong";
```

### 5.2 Reconnect Request

```typescript
/**
 * Client → Server: Request to restore subscriptions after reconnect.
 */
interface ReconnectMessage {
  type: "reconnect";

  /** Protocol version for forward compatibility */
  protocolVersion: number;

  /** Subscriptions to restore */
  subscriptions: ReconnectSubscription[];

  /** Optional: client-generated reconnect ID for deduplication */
  reconnectId?: string;
}

interface ReconnectSubscription {
  /** Original subscription ID */
  id: string;

  /** Entity type */
  entity: string;

  /** Entity ID */
  entityId: string;

  /** Subscribed fields */
  fields: string[] | "*";

  /** Last received version */
  version: number;

  /** Optional: hash of last known data for verification */
  dataHash?: string;

  /** Original subscription input */
  input?: unknown;
}
```

### 5.3 Reconnect Response

```typescript
/**
 * Server → Client: Response with catch-up data.
 */
interface ReconnectAckMessage {
  type: "reconnect_ack";

  /** Results for each subscription */
  results: ReconnectResult[];

  /** Server timestamp for sync */
  serverTime: number;

  /** Reconnect ID echo for correlation */
  reconnectId?: string;
}

interface ReconnectResult {
  /** Subscription ID */
  id: string;

  /** Entity type */
  entity: string;

  /** Entity ID */
  entityId: string;

  /** Sync status */
  status: ReconnectStatus;

  /** Current server version */
  version: number;

  /** For "patched": ordered patches to apply */
  patches?: PatchOperation[][];

  /** For "snapshot": full current state */
  data?: Record<string, unknown>;

  /** For "snapshot": hash of data for verification */
  dataHash?: string;

  /** Error message if status is "error" */
  error?: string;
}

type ReconnectStatus =
  | "current"    // Client is up-to-date, no action needed
  | "patched"    // Send patches to catch up
  | "snapshot"   // Send full state (patches too old)
  | "deleted"    // Entity was deleted
  | "error";     // Error processing subscription
```

### 5.4 Updated Update Message

```typescript
/**
 * Server → Client: State update with version.
 */
interface UpdateMessage {
  type: "update";

  /** Grouped updates by entity type and ID */
  updates: {
    [entity: string]: {
      [id: string]: EntityUpdate;
    };
  };
}

interface EntityUpdate {
  /** New version after this update */
  v: number;

  /** Field updates (existing format) */
  [field: string]: FieldUpdate | number; // number is for 'v'
}

interface FieldUpdate {
  /** Update strategy */
  s: "v" | "d" | "p"; // value, delta, patch

  /** Update data */
  d: unknown;
}
```

### 5.5 Subscription Acknowledgment (New)

```typescript
/**
 * Server → Client: Subscription confirmation with initial state.
 */
interface SubscriptionAckMessage {
  type: "subscription_ack";

  /** Subscription ID */
  id: string;

  /** Initial version */
  version: number;

  /** Initial data */
  data: Record<string, unknown>;

  /** Data hash for future verification */
  dataHash: string;
}
```

---

## 6. Implementation Details

### 6.1 Server: Version Management

```typescript
// In GraphStateManager

class GraphStateManager {
  // Existing
  private canonical = new Map<string, Record<string, unknown>>();

  // New: Version tracking
  private versions = new Map<string, number>();

  // New: Operation log
  private operationLog: OperationLog;

  /**
   * Emit entity update with versioning.
   */
  emit<T extends Record<string, unknown>>(
    entity: string,
    id: string,
    data: Partial<T>
  ): void {
    const key = this.makeKey(entity, id);
    const prevData = this.canonical.get(key) ?? {};
    const prevVersion = this.versions.get(key) ?? 0;

    // Compute patch BEFORE merging
    const patch = computeJsonPatch(prevData, { ...prevData, ...data });

    // Update canonical state
    const newData = { ...prevData, ...data };
    this.canonical.set(key, newData);

    // Increment version
    const newVersion = prevVersion + 1;
    this.versions.set(key, newVersion);

    // Append to operation log
    if (patch.length > 0) {
      this.operationLog.append({
        entityKey: key,
        version: newVersion,
        timestamp: Date.now(),
        patch,
        patchSize: JSON.stringify(patch).length,
      });
    }

    // Push to clients (with version)
    this.pushToClientsWithVersion(entity, id, newVersion, data);
  }

  /**
   * Handle reconnect request.
   */
  handleReconnect(
    clientId: string,
    subscriptions: ReconnectSubscription[]
  ): ReconnectResult[] {
    const results: ReconnectResult[] = [];

    for (const sub of subscriptions) {
      const result = this.processReconnectSubscription(clientId, sub);
      results.push(result);
    }

    return results;
  }

  private processReconnectSubscription(
    clientId: string,
    sub: ReconnectSubscription
  ): ReconnectResult {
    const key = this.makeKey(sub.entity, sub.entityId);
    const canonical = this.canonical.get(key);
    const currentVersion = this.versions.get(key) ?? 0;

    // Entity doesn't exist
    if (!canonical) {
      return {
        id: sub.id,
        entity: sub.entity,
        entityId: sub.entityId,
        status: "deleted",
        version: 0,
      };
    }

    // Re-establish subscription first
    this.subscribe(clientId, sub.entity, sub.entityId, sub.fields);

    // Version matches - client is current
    if (currentVersion === sub.version) {
      // Set lastState for future diffs
      this.setClientLastState(clientId, key, canonical);

      return {
        id: sub.id,
        entity: sub.entity,
        entityId: sub.entityId,
        status: "current",
        version: currentVersion,
      };
    }

    // Try to get patches
    const entries = this.operationLog.getSince(key, sub.version);

    if (entries && entries.length > 0) {
      // Have patches - send them
      // Set lastState to current for future diffs
      this.setClientLastState(clientId, key, canonical);

      return {
        id: sub.id,
        entity: sub.entity,
        entityId: sub.entityId,
        status: "patched",
        version: currentVersion,
        patches: entries.map(e => e.patch),
      };
    }

    // No patches available - send snapshot
    this.setClientLastState(clientId, key, canonical);

    return {
      id: sub.id,
      entity: sub.entity,
      entityId: sub.entityId,
      status: "snapshot",
      version: currentVersion,
      data: canonical,
      dataHash: hashEntityState(canonical),
    };
  }
}
```

### 6.2 Client: Subscription Registry

```typescript
// In client transport

class SubscriptionRegistry {
  private subscriptions = new Map<string, TrackedSubscription>();

  add(sub: Omit<TrackedSubscription, "state" | "lastDataHash">): void {
    this.subscriptions.set(sub.id, {
      ...sub,
      state: "pending",
      lastDataHash: sub.lastData ? hashEntityState(sub.lastData) : null,
    });
  }

  updateVersion(
    id: string,
    version: number,
    data?: Record<string, unknown>
  ): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.version = version;
    if (data) {
      sub.lastData = data;
      sub.lastDataHash = hashEntityState(data);
    }
    sub.state = "active";
  }

  getAllForReconnect(): ReconnectSubscription[] {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.state !== "pending")
      .map(sub => ({
        id: sub.id,
        entity: sub.entity,
        entityId: sub.entityId,
        fields: sub.fields,
        version: sub.version,
        dataHash: sub.lastDataHash ?? undefined,
        input: sub.input,
      }));
  }

  markReconnecting(): void {
    for (const sub of this.subscriptions.values()) {
      if (sub.state === "active") {
        sub.state = "reconnecting";
      }
    }
  }
}
```

### 6.3 Client: Reconnect Flow

```typescript
// In ws.ts

class WsTransport {
  private subscriptionRegistry = new SubscriptionRegistry();
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;

  private async handleDisconnect(): Promise<void> {
    this.socket = null;
    this.connectionState = "reconnecting";

    // Mark subscriptions as reconnecting (don't clear!)
    this.subscriptionRegistry.markReconnecting();

    // Start reconnect with exponential backoff + jitter
    this.attemptReconnect();
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.reconnectEnabled) {
      this.connectionState = "disconnected";
      this.notifyDisconnect();
      return;
    }

    if (this.reconnectAttempts >= this.maxAttempts) {
      this.connectionState = "disconnected";
      this.notifyReconnectFailed();
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const baseDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    const delay = Math.min(baseDelay + jitter, 30000); // Max 30s

    await sleep(delay);

    try {
      await this.connect();
      await this.performReconnect();

      this.reconnectAttempts = 0;
      this.connectionState = "connected";
      this.notifyReconnected();
    } catch (error) {
      this.attemptReconnect(); // Retry
    }
  }

  private async performReconnect(): Promise<void> {
    const subscriptions = this.subscriptionRegistry.getAllForReconnect();

    if (subscriptions.length === 0) {
      return; // Nothing to reconnect
    }

    // Send reconnect request
    const reconnectId = generateId();
    this.send({
      type: "reconnect",
      protocolVersion: 1,
      subscriptions,
      reconnectId,
    });

    // Wait for response
    const response = await this.waitForReconnectAck(reconnectId);

    // Process results
    for (const result of response.results) {
      this.processReconnectResult(result);
    }
  }

  private processReconnectResult(result: ReconnectResult): void {
    const sub = this.subscriptionRegistry.get(result.id);
    if (!sub) return;

    switch (result.status) {
      case "current":
        // No update needed
        this.subscriptionRegistry.markActive(result.id);
        break;

      case "patched":
        // Apply patches in order
        let data = sub.lastData ?? {};
        for (const patch of result.patches!) {
          data = applyPatch(data, patch);
        }
        this.subscriptionRegistry.updateVersion(result.id, result.version, data);
        sub.observer.next?.({ data });
        break;

      case "snapshot":
        // Full state update
        this.subscriptionRegistry.updateVersion(result.id, result.version, result.data);
        sub.observer.next?.({ data: result.data });
        break;

      case "deleted":
        // Entity was deleted
        sub.observer.next?.({ data: null, deleted: true });
        this.subscriptionRegistry.remove(result.id);
        break;

      case "error":
        // Subscription error
        sub.observer.error?.(new Error(result.error ?? "Reconnect failed"));
        this.subscriptionRegistry.remove(result.id);
        break;
    }
  }
}
```

---

## 7. Optimizations

### 7.1 Hash-based Change Detection

**Problem**: `JSON.stringify` is called multiple times for deep equality checks.

**Solution**: Use MurmurHash3 for O(1) equality comparison.

```typescript
import { murmurhash3 } from "./hash";

/**
 * Compute hash of value for fast comparison.
 * Uses streaming hash to handle large values efficiently.
 */
function hashValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return murmurhash3(String(value));
  }

  // For objects, hash the stringified value
  // Cache the result to avoid recomputation
  const json = JSON.stringify(value, Object.keys(value as object).sort());
  return murmurhash3(json);
}

// In GraphStateManager
class GraphStateManager {
  private canonicalHashes = new Map<string, Map<string, string>>(); // entityKey → field → hash

  private hasFieldChanged(
    entityKey: string,
    field: string,
    newValue: unknown
  ): boolean {
    const fieldHashes = this.canonicalHashes.get(entityKey);
    const oldHash = fieldHashes?.get(field);
    const newHash = hashValue(newValue);

    if (oldHash === newHash) {
      return false; // No change
    }

    // Update hash
    if (!fieldHashes) {
      this.canonicalHashes.set(entityKey, new Map([[field, newHash]]));
    } else {
      fieldHashes.set(field, newHash);
    }

    return true;
  }
}
```

**Impact**: 10-100x faster change detection for large objects.

### 7.2 Indexed Operation Log

**Problem**: Linear scan of operation log for each entity on reconnect.

**Solution**: Maintain index by entity key.

```typescript
class OperationLog {
  private entries: OperationLogEntry[] = [];

  // Index: entityKey → array of entry indices
  private entityIndex = new Map<string, number[]>();

  // Index: entityKey → oldest version in log
  private oldestVersionIndex = new Map<string, number>();

  append(entry: OperationLogEntry): void {
    const index = this.entries.length;
    this.entries.push(entry);

    // Update entity index
    let indices = this.entityIndex.get(entry.entityKey);
    if (!indices) {
      indices = [];
      this.entityIndex.set(entry.entityKey, indices);
      this.oldestVersionIndex.set(entry.entityKey, entry.version);
    }
    indices.push(index);

    this.cleanup();
  }

  getSince(entityKey: string, fromVersion: number): OperationLogEntry[] | null {
    const oldestVersion = this.oldestVersionIndex.get(entityKey);

    // Version too old
    if (oldestVersion === undefined || fromVersion < oldestVersion - 1) {
      return null;
    }

    // Get entries from index
    const indices = this.entityIndex.get(entityKey) ?? [];
    const entries: OperationLogEntry[] = [];

    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry && entry.version > fromVersion) {
        entries.push(entry);
      }
    }

    return entries;
  }
}
```

**Impact**: O(1) lookup instead of O(n) scan.

### 7.3 Patch Coalescing

**Problem**: Multiple patches for same entity during disconnect.

**Solution**: Coalesce patches into single optimized patch.

```typescript
/**
 * Coalesce multiple patches into single optimized patch.
 * Removes redundant operations and combines sequential changes.
 */
function coalescePatches(patches: PatchOperation[][]): PatchOperation[] {
  const flatPatches = patches.flat();
  const pathMap = new Map<string, PatchOperation>();

  for (const op of flatPatches) {
    const existing = pathMap.get(op.path);

    if (!existing) {
      pathMap.set(op.path, op);
      continue;
    }

    // Coalesce based on operation type
    switch (op.op) {
      case "replace":
      case "add":
        // Later value wins
        pathMap.set(op.path, op);
        break;

      case "remove":
        // Remove trumps add/replace
        pathMap.set(op.path, op);
        break;
    }
  }

  return Array.from(pathMap.values());
}
```

**Impact**: Reduced network transfer for rapid updates.

### 7.4 Batch Reconnect Processing

**Problem**: Processing many subscriptions sequentially.

**Solution**: Process in parallel with batching.

```typescript
async handleReconnect(
  clientId: string,
  subscriptions: ReconnectSubscription[]
): Promise<ReconnectResult[]> {
  // Process in parallel batches
  const BATCH_SIZE = 100;
  const results: ReconnectResult[] = [];

  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(sub => this.processReconnectSubscription(clientId, sub))
    );
    results.push(...batchResults);
  }

  return results;
}
```

### 7.5 Compression for Large Payloads

**Problem**: Snapshots can be large.

**Solution**: Use compression for payloads above threshold.

```typescript
interface CompressedPayload {
  compressed: true;
  algorithm: "gzip" | "deflate";
  data: string; // base64 encoded
}

function maybeCompress(
  data: unknown,
  threshold: number = 1024
): unknown | CompressedPayload {
  const json = JSON.stringify(data);

  if (json.length < threshold) {
    return data;
  }

  const compressed = gzip(json);

  // Only use compression if it actually helps
  if (compressed.length < json.length * 0.8) {
    return {
      compressed: true,
      algorithm: "gzip",
      data: base64Encode(compressed),
    };
  }

  return data;
}
```

### 7.6 Progressive Reconnect

**Problem**: Large number of subscriptions causes slow reconnect.

**Solution**: Progressive loading with priority.

```typescript
interface ReconnectMessage {
  type: "reconnect";
  subscriptions: ReconnectSubscription[];

  // NEW: Progressive options
  progressive?: {
    enabled: true;
    batchSize: number;
    priority: "recent" | "size" | "custom";
  };
}

// Server sends multiple reconnect_ack messages
interface ReconnectAckMessage {
  type: "reconnect_ack";
  results: ReconnectResult[];

  // NEW: Progress info
  progress?: {
    completed: number;
    total: number;
    hasMore: boolean;
  };
}
```

### 7.7 Version Vector for Arrays

**Problem**: Array updates need efficient versioning.

**Solution**: Track version per array, not per item.

```typescript
interface CanonicalArrayState {
  items: unknown[];
  version: number;

  // Track modifications for efficient patching
  modifications: ArrayModification[];
}

interface ArrayModification {
  type: "add" | "remove" | "update" | "move";
  index: number;
  item?: unknown;
  fromIndex?: number; // for move
  version: number;
}
```

### 7.8 Debounced Updates

**Problem**: Rapid updates cause many small messages.

**Solution**: Debounce updates with configurable window.

```typescript
class DebouncedEmitter {
  private pending = new Map<string, {
    data: Record<string, unknown>;
    timer: Timer;
  }>();

  private debounceMs: number;

  emit(entity: string, id: string, data: Partial<unknown>): void {
    const key = `${entity}:${id}`;
    const existing = this.pending.get(key);

    if (existing) {
      // Merge with pending
      Object.assign(existing.data, data);
    } else {
      // Start new debounce window
      this.pending.set(key, {
        data: { ...data },
        timer: setTimeout(() => this.flush(key), this.debounceMs),
      });
    }
  }

  private flush(key: string): void {
    const pending = this.pending.get(key);
    if (!pending) return;

    this.pending.delete(key);
    this.actualEmit(key, pending.data);
  }
}
```

### 7.9 Connection Quality Adaptation

**Problem**: Poor connections need different strategies.

**Solution**: Adapt based on connection quality.

```typescript
interface ConnectionQuality {
  latency: number;      // ms
  bandwidth: number;    // bytes/sec estimate
  packetLoss: number;   // 0-1
}

function selectReconnectStrategy(
  quality: ConnectionQuality,
  subscriptionCount: number
): ReconnectStrategy {
  // Poor connection: use snapshots (fewer round trips)
  if (quality.latency > 500 || quality.packetLoss > 0.1) {
    return "snapshot";
  }

  // Low bandwidth: use patches (smaller payloads)
  if (quality.bandwidth < 10000) {
    return "patches";
  }

  // Many subscriptions: use progressive
  if (subscriptionCount > 50) {
    return "progressive";
  }

  return "auto";
}
```

### 7.10 Memory Pool for Patches

**Problem**: Many small allocations for patches.

**Solution**: Pool and reuse patch objects.

```typescript
class PatchPool {
  private pool: PatchOperation[][] = [];
  private maxSize = 1000;

  acquire(): PatchOperation[] {
    return this.pool.pop() ?? [];
  }

  release(patch: PatchOperation[]): void {
    if (this.pool.length < this.maxSize) {
      patch.length = 0; // Clear
      this.pool.push(patch);
    }
  }
}
```

---

## 8. Edge Cases

### 8.1 Server Restart

```
Scenario: Server restarts, all in-memory state lost.

Client                          Server
   │                               │
   │ (subscribed, v=42)            │ (canonical, v=42)
   │                               │
   │ ══════ SERVER RESTART ══════ │
   │                               │
   │                               │ (canonical empty, v=0)
   │                               │
   │ RECONNECT {v: 42}             │
   ├──────────────────────────────►│
   │                               │ entity not found
   │◄──────────────────────────────┤
   │ RECONNECT_ACK {               │
   │   status: "deleted"           │
   │ }                             │

Solution: Client handles "deleted" status, re-initializes or notifies user.
Alternative: Persist canonical state to disk/Redis for recovery.
```

### 8.2 Entity Deleted During Disconnect

```
Scenario: Entity deleted while client disconnected.

Timeline:
  t0: Client subscribed to user:123 (v=5)
  t1: Client disconnects
  t2: Server: delete(user:123)
  t3: Client reconnects

Server behavior:
  - canonical.get("user:123") returns undefined
  - Return status: "deleted"

Client behavior:
  - Remove from subscription registry
  - Notify observer with { data: null, deleted: true }
```

### 8.3 Rapid Disconnect/Reconnect

```
Scenario: Network flapping causes rapid disconnect/reconnect.

Solution:
  1. Debounce reconnect attempts (min 1s between attempts)
  2. Use exponential backoff with jitter
  3. Track reconnect count, escalate if too frequent

Code:
  if (timeSinceLastReconnect < 1000) {
    await sleep(1000 - timeSinceLastReconnect);
  }
```

### 8.4 Version Overflow

```
Scenario: Version number exceeds safe integer.

Solution:
  - Use BigInt for versions internally
  - Or reset versions periodically with "epoch" marker

interface VersionedState {
  epoch: number;    // Incremented on reset
  version: number;  // Resets to 0 when epoch changes
}

Comparison:
  if (a.epoch !== b.epoch) return "snapshot"; // Different epochs
  return compareVersions(a.version, b.version);
```

### 8.5 Concurrent Updates During Reconnect

```
Scenario: New update arrives while processing reconnect.

Timeline:
  t0: Client sends RECONNECT (v=5)
  t1: Server processes, sends RECONNECT_ACK (v=7)
  t2: New emit() happens, v=8
  t3: Client receives RECONNECT_ACK (v=7)
  t4: Client receives UPDATE (v=8)

Solution: Normal - UPDATE (v=8) arrives after RECONNECT_ACK.
Client applies in order:
  1. Apply reconnect patches/snapshot → v=7
  2. Apply update → v=8

Versions ensure correct ordering.
```

### 8.6 Partial Reconnect Failure

```
Scenario: Some subscriptions fail to reconnect.

Solution: Return per-subscription status, let client handle individually.

results: [
  { id: "sub1", status: "current" },
  { id: "sub2", status: "error", error: "Entity not found" },
  { id: "sub3", status: "patched", patches: [...] },
]

Client:
  - sub1: Continue as normal
  - sub2: Notify observer.error(), remove subscription
  - sub3: Apply patches, continue
```

### 8.7 Large Operation Log

```
Scenario: Many entities with frequent updates fill operation log.

Solution: Per-entity eviction with LRU.

class OperationLog {
  cleanup(): void {
    const now = Date.now();

    // Time-based eviction
    this.entries = this.entries.filter(e =>
      now - e.timestamp < this.config.maxAge
    );

    // Count-based eviction (keep most recent)
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Memory-based eviction
    while (this.totalMemory > this.config.maxMemory && this.entries.length > 0) {
      const removed = this.entries.shift();
      this.totalMemory -= removed.patchSize;
    }

    // Rebuild indices after eviction
    this.rebuildIndices();
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
describe("OperationLog", () => {
  it("appends entries correctly");
  it("retrieves entries since version");
  it("returns null for version too old");
  it("evicts based on maxEntries");
  it("evicts based on maxAge");
  it("evicts based on maxMemory");
  it("maintains correct indices after eviction");
});

describe("SubscriptionRegistry", () => {
  it("tracks subscriptions correctly");
  it("updates versions on update");
  it("returns correct subscriptions for reconnect");
  it("marks subscriptions as reconnecting");
});

describe("hashValue", () => {
  it("returns consistent hash for same value");
  it("returns different hash for different values");
  it("handles nested objects");
  it("handles arrays");
  it("handles null/undefined");
});
```

### 9.2 Integration Tests

```typescript
describe("Reconnection", () => {
  it("reconnects and receives current status for unchanged entity");
  it("reconnects and receives patches for changed entity");
  it("reconnects and receives snapshot for old version");
  it("reconnects and receives deleted for removed entity");
  it("handles multiple subscriptions in single reconnect");
  it("handles concurrent updates during reconnect");
  it("maintains consistency after reconnect");
});

describe("Version Tracking", () => {
  it("increments version on emit");
  it("includes version in update messages");
  it("client tracks version correctly");
});
```

### 9.3 Stress Tests

```typescript
describe("Stress", () => {
  it("handles 1000 concurrent reconnects", async () => {
    const clients = await Promise.all(
      Array(1000).fill(0).map(() => createClient())
    );

    // Disconnect all
    await Promise.all(clients.map(c => c.disconnect()));

    // Reconnect all simultaneously
    const start = Date.now();
    await Promise.all(clients.map(c => c.reconnect()));
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // < 5s for 1000 clients
  });

  it("handles operation log with 100k entries");
  it("handles entity with 1000 updates during disconnect");
});
```

### 9.4 Chaos Tests

```typescript
describe("Chaos", () => {
  it("recovers from random disconnects", async () => {
    for (let i = 0; i < 100; i++) {
      await randomDelay(0, 100);

      if (Math.random() < 0.3) {
        await client.disconnect();
        await randomDelay(0, 500);
        // Auto-reconnect should handle
      }

      if (Math.random() < 0.5) {
        server.emit("user", "1", { count: i });
      }
    }

    // Verify final state matches
    const clientState = await client.query("user", "1");
    const serverState = server.getCanonical("user", "1");
    expect(clientState).toEqual(serverState);
  });
});
```

---

## 10. Migration Guide

### 10.1 Breaking Changes

1. **Update message format**: Added `v` field for version
2. **New message types**: `reconnect`, `reconnect_ack`, `subscription_ack`
3. **Client API**: Subscriptions now return additional metadata

### 10.2 Backward Compatibility

```typescript
// Server: Support both old and new clients
function handleMessage(msg: WsMessage): void {
  // New client sends protocol version
  if (msg.protocolVersion >= 2) {
    // Use new reconnect protocol
  } else {
    // Legacy: treat as new connection
  }
}

// Update messages: include version only for v2+ clients
function sendUpdate(client: Client, update: EntityUpdate): void {
  if (client.protocolVersion >= 2) {
    update.v = currentVersion;
  }
  client.send(update);
}
```

### 10.3 Upgrade Steps

1. **Deploy server with backward compatibility**
2. **Update clients to new SDK version**
3. **Monitor reconnect metrics**
4. **Remove backward compatibility after rollout complete**

---

## 11. Metrics & Observability

### 11.1 Metrics

```typescript
interface ReconnectionMetrics {
  // Counters
  reconnectAttempts: Counter;
  reconnectSuccesses: Counter;
  reconnectFailures: Counter;

  // Histograms
  reconnectDuration: Histogram;      // ms
  patchCount: Histogram;             // patches per reconnect
  snapshotSize: Histogram;           // bytes

  // Gauges
  operationLogSize: Gauge;           // entries
  operationLogMemory: Gauge;         // bytes
  activeSubscriptions: Gauge;
  reconnectingClients: Gauge;
}
```

### 11.2 Logging

```typescript
// Key events to log
logger.info("client.reconnect.start", { clientId, subscriptionCount });
logger.info("client.reconnect.complete", { clientId, duration, results });
logger.warn("client.reconnect.failed", { clientId, error, attempts });
logger.debug("oplog.append", { entityKey, version, patchSize });
logger.debug("oplog.evict", { count, reason });
```

### 11.3 Health Checks

```typescript
interface ReconnectionHealth {
  operationLogHealthy: boolean;  // Within memory limits
  reconnectSuccessRate: number;  // Last 5 minutes
  avgReconnectLatency: number;   // ms
}

function checkHealth(): ReconnectionHealth {
  const stats = operationLog.getStats();
  const metrics = getReconnectMetrics();

  return {
    operationLogHealthy: stats.memory < stats.maxMemory * 0.9,
    reconnectSuccessRate: metrics.successes / (metrics.successes + metrics.failures),
    avgReconnectLatency: metrics.avgDuration,
  };
}
```

---

## Appendix A: Full Type Definitions

See `packages/core/src/reconnect/types.ts` for complete type definitions.

## Appendix B: Configuration Reference

| Option | Default | Description |
|--------|---------|-------------|
| `operationLog.maxEntries` | 10000 | Max entries in operation log |
| `operationLog.maxAge` | 300000 | Max age in ms (5 min) |
| `operationLog.maxMemory` | 10485760 | Max memory in bytes (10MB) |
| `reconnect.enabled` | true | Enable auto-reconnect |
| `reconnect.maxAttempts` | 10 | Max reconnect attempts |
| `reconnect.baseDelay` | 1000 | Base delay in ms |
| `reconnect.maxDelay` | 30000 | Max delay in ms |
| `reconnect.jitter` | 0.3 | Jitter factor (0-1) |

## Appendix C: Performance Benchmarks

| Scenario | Target | Measured |
|----------|--------|----------|
| Reconnect (10 subs, current) | < 50ms | TBD |
| Reconnect (10 subs, patched) | < 100ms | TBD |
| Reconnect (10 subs, snapshot) | < 200ms | TBD |
| Reconnect (100 subs, mixed) | < 500ms | TBD |
| Operation log append | < 1ms | TBD |
| Operation log lookup | < 1ms | TBD |
