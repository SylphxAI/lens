# @sylphx/lens-storage-upstash

Upstash Redis storage adapter for Lens opLog plugin.

**Best for:** Serverless/edge environments (Vercel, Cloudflare Workers, Deno Deploy).

## Installation

```bash
bun add @sylphx/lens-storage-upstash @upstash/redis
```

## Quick Start

```typescript
import { Redis } from "@upstash/redis";
import { createApp, opLog } from "@sylphx/lens-server";
import { upstashStorage } from "@sylphx/lens-storage-upstash";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const app = createApp({
  router,
  plugins: [
    opLog({
      storage: upstashStorage({ redis }),
    }),
  ],
});
```

## Why Upstash?

| Feature | Upstash | Traditional Redis |
|---------|---------|-------------------|
| Connection model | HTTP (stateless) | TCP (persistent) |
| Cold start | Fast (no connection) | Slow (connection setup) |
| Serverless cost | Pay per request | Pay for idle |
| Edge compatible | Yes | No |

## Configuration

```typescript
upstashStorage({
  // Required: Upstash Redis client
  redis: new Redis({ url, token }),

  // Optional: key prefix (default: "lens")
  prefix: "myapp",

  // Optional: TTL in seconds (default: 0 = no expiration)
  stateTTL: 3600,

  // Optional: max patches per entity (default: 100)
  maxPatchesPerEntity: 50,

  // Optional: max patch age in ms (default: 5 minutes)
  maxPatchAge: 60000,

  // Optional: retry count (default: 3)
  maxRetries: 5,
});
```

## Environment Variables

```bash
# From Upstash Console
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

## Storage Adapter Comparison

| Adapter | Best For | Pricing |
|---------|----------|---------|
| **upstash** | Serverless anywhere | Pay per request |
| **vercel-kv** | Vercel apps | Included in Vercel |
| **redis** | Traditional servers | Self-hosted/managed |
| **memory** | Development | Free (no persistence) |

## Next.js Example

```typescript
// app/api/lens/route.ts
import { Redis } from "@upstash/redis";
import { createApp, opLog } from "@sylphx/lens-server";
import { upstashStorage } from "@sylphx/lens-storage-upstash";

const redis = Redis.fromEnv();

const app = createApp({
  router,
  plugins: [opLog({ storage: upstashStorage({ redis }) })],
});

export async function POST(request: Request) {
  return app(request);
}
```

## Edge Runtime

Works with Edge runtime (no Node.js APIs required):

```typescript
// next.config.js
export const runtime = "edge";
```

## Peer Dependencies

- `@upstash/redis` - [npm](https://www.npmjs.com/package/@upstash/redis)

## License

MIT
