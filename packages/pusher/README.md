# @sylphx/lens-pusher

Pusher Channels integration for Lens real-time subscriptions.

**Use case:** Serverless deployments (Vercel, Cloudflare) where persistent WebSocket connections aren't available.

## Installation

```bash
bun add @sylphx/lens-pusher pusher pusher-js
```

## Architecture

```
┌─────────────┐      HTTP      ┌─────────────┐
│   Client    │ ──────────────▶│   Server    │
│             │                │  (Lambda)   │
└─────────────┘                └─────────────┘
       │                              │
       │ WebSocket                    │ HTTP
       ▼                              ▼
┌─────────────────────────────────────────────┐
│              Pusher Channels                │
│         (Managed WebSocket Service)         │
└─────────────────────────────────────────────┘
```

1. Client sends queries/mutations via HTTP to serverless function
2. Server processes request, publishes updates to Pusher
3. Client receives real-time updates via Pusher WebSocket

## Quick Start

### Server (Node/Bun)

```typescript
import Pusher from "pusher";
import { createPusherBroadcaster } from "@sylphx/lens-pusher";

// Initialize Pusher server SDK
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// Create broadcaster
const broadcast = createPusherBroadcaster(pusher);

// In your mutation resolver
const updateUser = mutation()
  .args(z.object({ id: z.string(), name: z.string() }))
  .resolve(async ({ args }) => {
    const user = await db.user.update(args);

    // Broadcast update to subscribers
    await broadcast(`entity:User:${user.id}`, user);

    return user;
  });
```

### Client (Browser)

```typescript
import Pusher from "pusher-js";
import { createPusherSubscription } from "@sylphx/lens-pusher";

// Initialize Pusher client
const pusher = new Pusher(process.env.PUSHER_KEY!, {
  cluster: process.env.PUSHER_CLUSTER!,
});

// Subscribe to entity updates
const unsubscribe = createPusherSubscription(
  pusher,
  "entity:User:123",
  (data) => {
    console.log("User updated:", data);
    // Update local state/cache
  }
);

// Later: unsubscribe
unsubscribe();
```

## API Reference

### `createPusherSubscription(pusher, channel, callback, prefix?)`

Subscribe to a Lens channel via Pusher.

| Param | Type | Description |
|-------|------|-------------|
| `pusher` | `PusherClientLike` | pusher-js instance |
| `channel` | `string` | Channel name (e.g., `entity:User:123`) |
| `callback` | `(data) => void` | Update handler |
| `prefix` | `string` | Channel prefix (default: `lens-`) |

Returns: `() => void` - Unsubscribe function

### `createPusherBroadcaster(pusher, prefix?)`

Create a broadcaster for publishing updates.

| Param | Type | Description |
|-------|------|-------------|
| `pusher` | `PusherServerLike` | pusher server SDK instance |
| `prefix` | `string` | Channel prefix (default: `lens-`) |

Returns: `(channel, data) => Promise<void>` - Broadcast function

## Channel Naming Convention

```
lens-entity:User:123      # Single entity
lens-query:user.list      # Query result
lens-subscription:chat:1  # Subscription channel
```

## Environment Variables

```bash
PUSHER_APP_ID=your-app-id
PUSHER_KEY=your-key
PUSHER_SECRET=your-secret
PUSHER_CLUSTER=us2  # or eu, ap1, etc.
```

## Comparison with WebSocket Transport

| Feature | WebSocket | Pusher |
|---------|-----------|--------|
| Serverless support | No | Yes |
| Self-hosted | Yes | No (SaaS) |
| Cost at scale | Server costs | Pusher pricing |
| Setup complexity | Higher | Lower |
| Connection management | Manual | Automatic |

## When to Use

- **Vercel/Netlify Functions** - No persistent connections
- **Cloudflare Workers** - Limited WebSocket support
- **AWS Lambda** - Pay-per-invocation, no long-running connections
- **Quick prototypes** - Pusher handles infrastructure

## Peer Dependencies

- `pusher` (server) - [npm](https://www.npmjs.com/package/pusher)
- `pusher-js` (client) - [npm](https://www.npmjs.com/package/pusher-js)

## License

MIT
