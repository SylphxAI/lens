# @sylphx/lens-storage-vercel-kv

Vercel KV storage adapter for Lens opLog plugin.

**Best for:** Next.js apps deployed on Vercel.

## Installation

```bash
bun add @sylphx/lens-storage-vercel-kv @vercel/kv
```

## Quick Start

```typescript
import { kv } from "@vercel/kv";
import { createApp, opLog } from "@sylphx/lens-server";
import { vercelKVStorage } from "@sylphx/lens-storage-vercel-kv";

const app = createApp({
  router,
  plugins: [
    opLog({
      storage: vercelKVStorage({ kv }),
    }),
  ],
});
```

## Why Vercel KV?

- **Zero config** - Automatically configured in Vercel projects
- **Edge compatible** - Works with Edge Runtime
- **Included storage** - Comes with Vercel Pro/Enterprise plans
- **Same API** - Uses Upstash under the hood

## Configuration

```typescript
vercelKVStorage({
  // Required: Vercel KV client
  kv: kv,  // from @vercel/kv

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

## Next.js App Router Example

```typescript
// app/api/lens/route.ts
import { kv } from "@vercel/kv";
import { createApp, opLog } from "@sylphx/lens-server";
import { vercelKVStorage } from "@sylphx/lens-storage-vercel-kv";
import { appRouter } from "@/server/router";

const app = createApp({
  router: appRouter,
  plugins: [opLog({ storage: vercelKVStorage({ kv }) })],
});

export async function POST(request: Request) {
  return app(request);
}

export async function GET(request: Request) {
  return app(request);
}
```

## Environment Variables

Set automatically when you link a KV database in Vercel:

```bash
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=xxx
KV_REST_API_READ_ONLY_TOKEN=xxx
```

## Custom Client

For non-Vercel environments or multiple databases:

```typescript
import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const storage = vercelKVStorage({ kv });
```

## Storage Adapter Comparison

| Adapter | Best For | Setup |
|---------|----------|-------|
| **vercel-kv** | Vercel apps | Zero config |
| **upstash** | Any serverless | Manual setup |
| **redis** | Traditional servers | Self-hosted |
| **memory** | Development | No persistence |

## Peer Dependencies

- `@vercel/kv` - [npm](https://www.npmjs.com/package/@vercel/kv)

## License

MIT
