# @sylphx/lens-storage-redis

Redis storage adapter for Lens opLog plugin using ioredis.

**Best for:** Long-running servers with persistent Redis connections.

## Installation

```bash
bun add @sylphx/lens-storage-redis ioredis
```

## Quick Start

```typescript
import Redis from "ioredis";
import { createApp, opLog } from "@sylphx/lens-server";
import { redisStorage } from "@sylphx/lens-storage-redis";

// Create Redis client
const redis = new Redis(process.env.REDIS_URL);

// Use with opLog plugin
const app = createApp({
  router,
  plugins: [
    opLog({
      storage: redisStorage({ redis }),
    }),
  ],
});
```

## Configuration

```typescript
redisStorage({
  // Required: ioredis client
  redis: new Redis(process.env.REDIS_URL),

  // Optional: key prefix (default: "lens")
  prefix: "myapp",

  // Optional: TTL for state data in seconds (default: 0 = no expiration)
  stateTTL: 3600, // 1 hour

  // Optional: max patches to keep per entity (default: 100)
  maxPatchesPerEntity: 50,

  // Optional: max patch age in ms (default: 5 minutes)
  maxPatchAge: 60000,

  // Optional: retry count for optimistic locking (default: 3)
  maxRetries: 5,
});
```

## Storage Adapter Comparison

| Adapter | Best For | Connection Model |
|---------|----------|------------------|
| **redis** | Traditional servers | Persistent |
| **upstash** | Serverless (Vercel) | HTTP (REST) |
| **vercel-kv** | Vercel apps | HTTP (REST) |
| **memory** | Development/testing | In-process |

## Key Structure

```
lens:User:123        # Entity state + patches
lens:Post:456        # Another entity
myapp:User:123       # With custom prefix
```

## Features

### Optimistic Locking

Handles concurrent writes with automatic retry:

```typescript
// Two concurrent updates to same entity
await Promise.all([
  client.user.update({ id: "123", name: "Alice" }),
  client.user.update({ id: "123", name: "Bob" }),
]);
// One will retry and succeed with correct version
```

### Patch History

Stores patches for reconnection support:

```typescript
// Client reconnects after network issue
// Server sends only patches since last known version
// Instead of full state (bandwidth efficient)
```

### Automatic Cleanup

Old patches are automatically evicted based on `maxPatchAge` and `maxPatchesPerEntity`.

## Redis Cluster Support

Works with ioredis cluster:

```typescript
import Redis from "ioredis";

const redis = new Redis.Cluster([
  { host: "redis-1", port: 6379 },
  { host: "redis-2", port: 6379 },
]);

const storage = redisStorage({ redis });
```

## Graceful Shutdown

```typescript
process.on("SIGTERM", async () => {
  await app.close(); // Calls storage.dispose()
});
```

## Environment Variables

```bash
REDIS_URL=redis://localhost:6379
# or
REDIS_URL=rediss://user:pass@host:6379  # TLS
```

## Peer Dependencies

- `ioredis` - [npm](https://www.npmjs.com/package/ioredis)

## License

MIT
