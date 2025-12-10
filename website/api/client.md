# Client API Reference

Complete API reference for `@sylphx/lens-client`.

## createClient

Creates a typed Lens client.

```typescript
import { createClient } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [auth(), retry()],
})
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `transport` | `Transport` | Transport layer |
| `plugins` | `Plugin[]` | Client plugins |

### Usage

```typescript
// Query (Promise)
const user = await client.user.get({ id: '123' })

// Query with selection
const user = await client.user.get({ id: '123' }, {
  select: { name: true, email: true }
})

// Subscribe (Observable)
const unsubscribe = client.user.get({ id: '123' }).subscribe(callback)

// Mutation
await client.user.create({ name: 'Alice' })
```

## Transports

### http

HTTP transport for queries and mutations.

```typescript
import { http } from '@sylphx/lens-client'

http({
  url: 'http://localhost:3000',
  headers: { 'Authorization': 'Bearer token' },
  credentials: 'include',
  fetch: customFetch,
})
```

### ws

WebSocket transport for subscriptions.

```typescript
import { ws } from '@sylphx/lens-client'

ws({
  url: 'ws://localhost:3000',
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
})
```

### direct

Direct transport (no network).

```typescript
import { direct } from '@sylphx/lens-client'

direct({
  server: app,
  context: () => ({ user: testUser }),
})
```

### sse

Server-Sent Events transport.

```typescript
import { sse } from '@sylphx/lens-client'

sse({
  url: 'http://localhost:3000/sse',
})
```

### route

Route different operation types to different transports.

```typescript
import { route } from '@sylphx/lens-client'

route({
  query: http({ url: '/api' }),
  mutation: http({ url: '/api' }),
  subscription: ws({ url: 'wss://...' }),
})
```

### routeByType

Route by operation type.

```typescript
import { routeByType } from '@sylphx/lens-client'

routeByType({
  query: httpTransport,
  mutation: httpTransport,
  subscription: wsTransport,
})
```

### routeByPath

Route by operation path.

```typescript
import { routeByPath } from '@sylphx/lens-client'

routeByPath({
  default: httpTransport,
  paths: {
    'chat.*': wsTransport,
    'admin.*': adminHttpTransport,
  },
})
```

## Plugins

### auth

Authentication plugin.

```typescript
import { auth } from '@sylphx/lens-client'

auth({
  getToken: async () => localStorage.getItem('token'),
  header: 'Authorization',
  prefix: 'Bearer ',
})
```

### cache

Caching plugin.

```typescript
import { cache } from '@sylphx/lens-client'

cache({
  ttl: 60000,
  maxSize: 100,
})
```

### retry

Retry plugin.

```typescript
import { retry } from '@sylphx/lens-client'

retry({
  maxAttempts: 3,
  delay: 1000,
  backoff: 'exponential',
  retryOn: (error) => error.code === 'NETWORK_ERROR',
})
```

### timeout

Timeout plugin.

```typescript
import { timeout } from '@sylphx/lens-client'

timeout({
  query: 5000,
  mutation: 10000,
})
```

### logger

Logging plugin.

```typescript
import { logger } from '@sylphx/lens-client'

logger({
  level: 'debug',
  onRequest: (op) => console.log('Request:', op),
  onResponse: (op, result) => console.log('Response:', result),
  onError: (op, error) => console.error('Error:', error),
})
```

## Types

### Transport

```typescript
interface Transport {
  query?: (op: Operation) => Promise<Result>
  mutation?: (op: Operation) => Promise<Result>
  subscription?: (op: Operation) => Observable<Result>
}
```

### Plugin

```typescript
interface Plugin {
  name: string
  beforeRequest?: (op: Operation) => Promise<Operation>
  afterResponse?: (op: Operation, result: Result) => Promise<Result>
  onError?: (op: Operation, error: Error) => Promise<never>
}
```

### QueryResult

```typescript
interface QueryResult<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
  refetch: () => void
}
```

### MutationResult

```typescript
interface MutationResult<T> {
  mutate: (options: MutationOptions) => Promise<T>
  data: T | undefined
  loading: boolean
  error: Error | null
  reset: () => void
}
```

### SelectionObject

```typescript
type SelectionObject = {
  [field: string]:
    | true
    | { args?: Record<string, unknown> }
    | { select: SelectionObject; args?: Record<string, unknown> }
}
```

### Observable

```typescript
interface Observable<T> {
  subscribe(observer: Observer<T>): Unsubscribable
}

interface Observer<T> {
  next?: (value: T) => void
  error?: (error: Error) => void
  complete?: () => void
}

interface Unsubscribable {
  unsubscribe(): void
}
```
