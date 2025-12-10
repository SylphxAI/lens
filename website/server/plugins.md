# Server Plugins

Plugins extend Lens server functionality with hooks into the request lifecycle.

## Built-in Plugins

### opLog Plugin

Enables operation logging and cursor-based state synchronization for efficient reconnection:

```typescript
import { createApp, opLog } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  plugins: [opLog()],
})
```

With options:

```typescript
plugins: [
  opLog({
    maxOperations: 1000,     // Max operations to keep
    ttl: 60 * 60 * 1000,     // TTL in ms (1 hour)
  }),
]
```

With external storage (for serverless):

```typescript
import { upstashStorage } from '@sylphx/lens-storage-upstash'

plugins: [
  opLog({
    storage: upstashStorage({ redis }),
  }),
]
```

### optimisticPlugin

Enables optimistic updates with automatic rollback on failure:

```typescript
import { createApp, optimisticPlugin } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  plugins: [optimisticPlugin()],
})
```

## Plugin Hooks

Plugins can implement these hooks:

| Hook | Description |
|------|-------------|
| `onConnect` | Client WebSocket connected |
| `onDisconnect` | Client disconnected |
| `onSubscribe` | Client subscribes to query |
| `onUnsubscribe` | Client unsubscribes |
| `beforeMutation` | Before mutation executes |
| `afterMutation` | After mutation completes |
| `beforeSend` | Before sending update to client |
| `afterSend` | After sending update |
| `onBroadcast` | Entity update broadcast |
| `onReconnect` | Client reconnecting |
| `enhanceOperationMeta` | Enhance operation metadata |

## Creating Custom Plugins

### Basic Plugin

```typescript
import type { ServerPlugin } from '@sylphx/lens-server'

const loggingPlugin: ServerPlugin = {
  name: 'logging',

  onConnect({ clientId }) {
    console.log(`Client connected: ${clientId}`)
    return true // Allow connection
  },

  onDisconnect({ clientId }) {
    console.log(`Client disconnected: ${clientId}`)
  },

  beforeMutation({ path, input }) {
    console.log(`Mutation: ${path}`, input)
  },

  afterMutation({ path, result }) {
    console.log(`Mutation complete: ${path}`, result)
  },
}

const app = createApp({
  router: appRouter,
  plugins: [loggingPlugin],
})
```

### Rate Limiting Plugin

```typescript
const rateLimitPlugin = (limit: number, window: number): ServerPlugin => {
  const requests = new Map<string, number[]>()

  return {
    name: 'rate-limit',

    onConnect({ clientId }) {
      const now = Date.now()
      const clientRequests = requests.get(clientId) || []

      // Clean old requests
      const recent = clientRequests.filter(t => now - t < window)

      if (recent.length >= limit) {
        console.log(`Rate limited: ${clientId}`)
        return false // Reject connection
      }

      recent.push(now)
      requests.set(clientId, recent)
      return true
    },
  }
}

const app = createApp({
  router: appRouter,
  plugins: [rateLimitPlugin(100, 60000)], // 100 req/min
})
```

### Metrics Plugin

```typescript
const metricsPlugin: ServerPlugin = {
  name: 'metrics',

  onConnect({ clientId }) {
    metrics.increment('ws.connections')
    return true
  },

  onDisconnect({ clientId, subscriptionCount }) {
    metrics.decrement('ws.connections')
    metrics.decrement('subscriptions', subscriptionCount)
  },

  onSubscribe({ clientId, path }) {
    metrics.increment('subscriptions')
    metrics.increment(`subscriptions.${path}`)
    return true
  },

  onUnsubscribe({ clientId, path }) {
    metrics.decrement('subscriptions')
    metrics.decrement(`subscriptions.${path}`)
  },

  beforeMutation({ path }) {
    const timer = metrics.startTimer(`mutation.${path}`)
    return { timer }
  },

  afterMutation({ path }, state) {
    state.timer.end()
  },
}
```

### Authorization Plugin

```typescript
const authPlugin: ServerPlugin = {
  name: 'auth',

  async onConnect({ clientId, send }) {
    // Validate auth token from connection
    // Return false to reject
    return true
  },

  async onSubscribe({ clientId, path, input }) {
    // Check if client can subscribe to this query
    const allowed = await checkPermission(clientId, path)
    return allowed
  },

  async beforeMutation({ path, input, ctx }) {
    // Check mutation permission
    if (path.startsWith('admin.') && ctx.user?.role !== 'admin') {
      throw new Error('Admin access required')
    }
  },
}
```

## Plugin Context

Hooks receive context about the operation:

### Connect Context

```typescript
interface ConnectContext {
  clientId: string
  send: (msg: any) => void
}
```

### Subscribe Context

```typescript
interface SubscribeContext {
  clientId: string
  subscriptionId: string
  path: string
  input: unknown
}
```

### Mutation Context

```typescript
interface BeforeMutationContext {
  clientId?: string
  path: string
  input: unknown
  ctx: AppContext  // Your app context
}

interface AfterMutationContext extends BeforeMutationContext {
  result: unknown
  error?: Error
}
```

### Send Context

```typescript
interface BeforeSendContext {
  clientId: string
  subscriptionId: string
  entity: string
  entityId: string
  data: Record<string, unknown>
  isInitial: boolean
  fields: string | '*'
}
```

## Plugin Ordering

Plugins run in order:

```typescript
const app = createApp({
  router: appRouter,
  plugins: [
    loggingPlugin,    // Runs first
    authPlugin,       // Runs second
    metricsPlugin,    // Runs third
  ],
})
```

For `before*` hooks, plugins run in order.
For `after*` hooks, plugins run in reverse order.

## Storage Adapters

For serverless environments, use external storage:

### Upstash (Redis)

```typescript
import { upstashStorage } from '@sylphx/lens-storage-upstash'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const app = createApp({
  router: appRouter,
  plugins: [
    opLog({ storage: upstashStorage({ redis }) }),
  ],
})
```

### Vercel KV

```typescript
import { vercelKVStorage } from '@sylphx/lens-storage-vercel-kv'
import { kv } from '@vercel/kv'

const app = createApp({
  router: appRouter,
  plugins: [
    opLog({ storage: vercelKVStorage({ kv }) }),
  ],
})
```

### Memory (Default)

```typescript
import { memoryStorage } from '@sylphx/lens-server'

// This is the default - no need to specify
const app = createApp({
  router: appRouter,
  plugins: [
    opLog({ storage: memoryStorage() }),
  ],
})
```

## Best Practices

### 1. Name Your Plugins

```typescript
// ✅ Good: Named plugin
const myPlugin: ServerPlugin = {
  name: 'my-plugin',
  // ...
}

// ❌ Bad: Anonymous
const myPlugin: ServerPlugin = {
  // No name - harder to debug
}
```

### 2. Handle Errors

```typescript
const safePlugin: ServerPlugin = {
  name: 'safe',

  async beforeMutation({ path, input }) {
    try {
      await validateInput(input)
    } catch (error) {
      console.error('Validation failed:', error)
      throw error // Re-throw to abort mutation
    }
  },
}
```

### 3. Clean Up Resources

```typescript
const resourcePlugin: ServerPlugin = {
  name: 'resource',

  onConnect({ clientId }) {
    resources.allocate(clientId)
    return true
  },

  onDisconnect({ clientId }) {
    resources.release(clientId) // Always clean up
  },
}
```

### 4. Use Types

```typescript
import type { ServerPlugin, ConnectContext } from '@sylphx/lens-server'

const typedPlugin: ServerPlugin = {
  name: 'typed',

  onConnect(ctx: ConnectContext) {
    // ctx is typed
    console.log(ctx.clientId)
    return true
  },
}
```
