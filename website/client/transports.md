# Transports

Transports handle the communication between client and server. Lens supports multiple transport types for different use cases.

## HTTP Transport

For standard request/response queries and mutations:

```typescript
import { createClient, http } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({
    url: 'http://localhost:3000',
    headers: {
      'Authorization': 'Bearer token',
    },
  }),
})
```

### HTTP Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Server URL |
| `headers` | `Record<string, string>` | Custom headers |
| `credentials` | `RequestCredentials` | Fetch credentials mode |
| `fetch` | `typeof fetch` | Custom fetch implementation |

## WebSocket Transport

For real-time subscriptions:

```typescript
import { createClient, ws } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: ws({
    url: 'ws://localhost:3000',
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
  }),
})
```

### WebSocket Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | | WebSocket server URL |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | `number` | `1000` | Reconnect delay (ms) |
| `maxReconnectAttempts` | `number` | `10` | Max reconnect attempts |
| `protocols` | `string[]` | | WebSocket sub-protocols |

## Direct Transport

For server-side or same-process usage (no network):

```typescript
import { createClient, direct } from '@sylphx/lens-client'
import { app } from './server'

const client = createClient<AppRouter>({
  transport: direct({ server: app }),
})
```

### Direct Options

| Option | Type | Description |
|--------|------|-------------|
| `server` | `LensServer` | Server instance |
| `context` | `() => Context` | Context factory |

## SSE Transport

Server-Sent Events for one-way streaming:

```typescript
import { createClient, sse } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: sse({
    url: 'http://localhost:3000/sse',
  }),
})
```

## Route Transport

Combine multiple transports based on operation type:

```typescript
import { createClient, route, http, ws } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: route({
    query: http({ url: 'http://localhost:3000' }),
    mutation: http({ url: 'http://localhost:3000' }),
    subscription: ws({ url: 'ws://localhost:3000' }),
  }),
})
```

### Route by Type

Route different operation types to different transports:

```typescript
import { routeByType, http, ws } from '@sylphx/lens-client'

const transport = routeByType({
  query: http({ url: '/api' }),
  mutation: http({ url: '/api' }),
  subscription: ws({ url: 'wss://api.example.com' }),
})
```

### Route by Path

Route specific paths to different transports:

```typescript
import { routeByPath, http, ws } from '@sylphx/lens-client'

const transport = routeByPath({
  default: http({ url: '/api' }),
  paths: {
    'chat.*': ws({ url: 'wss://chat.example.com' }),
    'admin.*': http({ url: '/admin-api' }),
  },
})
```

## Transport Capabilities

Transports declare what they support:

| Capability | Description |
|------------|-------------|
| `query` | Can execute queries |
| `mutation` | Can execute mutations |
| `subscription` | Can handle subscriptions |

```typescript
// HTTP: query + mutation
http({ url: '...' })

// WebSocket: query + mutation + subscription
ws({ url: '...' })

// Direct: query + mutation + subscription
direct({ server: app })
```

## Custom Headers

Add headers dynamically:

```typescript
const client = createClient<AppRouter>({
  transport: http({
    url: 'http://localhost:3000',
    headers: async () => ({
      'Authorization': `Bearer ${await getToken()}`,
    }),
  }),
})
```

## Multiple Servers

Connect to different servers for different operations:

```typescript
const client = createClient<AppRouter>({
  transport: route({
    query: http({ url: 'https://api.example.com' }),
    mutation: http({ url: 'https://api.example.com' }),
    subscription: ws({ url: 'wss://realtime.example.com' }),
  }),
})
```

## Server-Side Usage

Use direct transport in Next.js API routes or server components:

```typescript
// app/api/user/route.ts
import { createClient, direct } from '@sylphx/lens-client'
import { app } from '@/server'

const client = createClient<AppRouter>({
  transport: direct({ server: app }),
})

export async function GET(request: Request) {
  const user = await client.user.get({ id: '123' })
  return Response.json(user)
}
```

## Error Handling

Transport errors are caught and surfaced:

```typescript
try {
  const user = await client.user.get({ id: '123' })
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    // Network issue
  }
  if (error.code === 'TIMEOUT') {
    // Request timed out
  }
}
```

## Best Practices

### 1. Use Route for Production

```typescript
// ✅ Good: Route for optimal transport selection
const client = createClient<AppRouter>({
  transport: route({
    query: http({ url: '/api' }),
    mutation: http({ url: '/api' }),
    subscription: ws({ url: 'wss://...' }),
  }),
})

// ⚠️ Acceptable: Single transport for simple apps
const client = createClient<AppRouter>({
  transport: ws({ url: 'wss://...' }),
})
```

### 2. Handle Reconnection

```typescript
const client = createClient<AppRouter>({
  transport: ws({
    url: 'wss://...',
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    onReconnect: () => {
      console.log('Reconnected!')
    },
  }),
})
```

### 3. Use Direct for Testing

```typescript
// test/setup.ts
import { createClient, direct } from '@sylphx/lens-client'
import { app } from '../server'

export const testClient = createClient<AppRouter>({
  transport: direct({
    server: app,
    context: () => ({
      user: { id: 'test-user', role: 'admin' },
    }),
  }),
})
```
