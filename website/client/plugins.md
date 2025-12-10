# Client Plugins

Plugins extend the Lens client with additional functionality like authentication, caching, retries, and logging.

## Built-in Plugins

### Auth Plugin

Automatically adds authentication headers:

```typescript
import { createClient, http, auth } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    auth({
      getToken: async () => localStorage.getItem('token'),
      header: 'Authorization',
      prefix: 'Bearer ',
    }),
  ],
})
```

With token refresh:

```typescript
auth({
  getToken: async () => {
    const token = localStorage.getItem('token')
    if (isExpired(token)) {
      const newToken = await refreshToken()
      localStorage.setItem('token', newToken)
      return newToken
    }
    return token
  },
})
```

### Cache Plugin

Caches query results:

```typescript
import { createClient, http, cache } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    cache({
      ttl: 60000,  // 1 minute TTL
      maxSize: 100,  // Max 100 entries
    }),
  ],
})
```

Cache options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `60000` | Time-to-live in ms |
| `maxSize` | `number` | `100` | Maximum cache entries |
| `storage` | `Storage` | In-memory | Custom storage backend |

### Retry Plugin

Automatically retries failed requests:

```typescript
import { createClient, http, retry } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    retry({
      maxAttempts: 3,
      delay: 1000,
      backoff: 'exponential',
      retryOn: (error) => error.code === 'NETWORK_ERROR',
    }),
  ],
})
```

Retry options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Max retry attempts |
| `delay` | `number` | `1000` | Initial delay (ms) |
| `backoff` | `'linear' \| 'exponential'` | `'exponential'` | Delay strategy |
| `retryOn` | `(error) => boolean` | | Custom retry condition |

### Timeout Plugin

Sets request timeouts:

```typescript
import { createClient, http, timeout } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    timeout({
      query: 5000,     // 5s for queries
      mutation: 10000,  // 10s for mutations
    }),
  ],
})
```

### Logger Plugin

Logs all operations:

```typescript
import { createClient, http, logger } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    logger({
      level: 'debug',
      onRequest: (op) => console.log('Request:', op.path),
      onResponse: (op, result) => console.log('Response:', op.path, result),
      onError: (op, error) => console.error('Error:', op.path, error),
    }),
  ],
})
```

## Combining Plugins

Plugins run in order:

```typescript
const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [
    logger(),      // 1. Logs request
    auth(),        // 2. Adds auth header
    retry(),       // 3. Handles retries
    timeout(),     // 4. Enforces timeout
    cache(),       // 5. Checks/updates cache
  ],
})
```

## Creating Custom Plugins

### Basic Plugin

```typescript
import type { Plugin } from '@sylphx/lens-client'

const myPlugin: Plugin = {
  name: 'my-plugin',

  // Called before request
  beforeRequest: async (operation) => {
    console.log('Before:', operation.path)
    return operation  // Return modified operation
  },

  // Called after response
  afterResponse: async (operation, result) => {
    console.log('After:', operation.path, result)
    return result  // Return modified result
  },

  // Called on error
  onError: async (operation, error) => {
    console.error('Error:', operation.path, error)
    throw error  // Re-throw or return fallback
  },
}
```

### Metrics Plugin

```typescript
const metricsPlugin: Plugin = {
  name: 'metrics',

  beforeRequest: async (operation) => {
    operation.metadata = {
      ...operation.metadata,
      startTime: Date.now(),
    }
    return operation
  },

  afterResponse: async (operation, result) => {
    const duration = Date.now() - operation.metadata.startTime
    metrics.record(operation.path, duration)
    return result
  },
}
```

### Transform Plugin

```typescript
const transformPlugin: Plugin = {
  name: 'transform',

  // Transform input before sending
  beforeRequest: async (operation) => {
    if (operation.type === 'mutation') {
      operation.input = {
        ...operation.input,
        timestamp: new Date().toISOString(),
      }
    }
    return operation
  },

  // Transform response before returning
  afterResponse: async (operation, result) => {
    if (result.data?.createdAt) {
      result.data.createdAt = new Date(result.data.createdAt)
    }
    return result
  },
}
```

### Error Handler Plugin

```typescript
const errorHandlerPlugin: Plugin = {
  name: 'error-handler',

  onError: async (operation, error) => {
    if (error.code === 'UNAUTHORIZED') {
      // Redirect to login
      window.location.href = '/login'
    }

    if (error.code === 'RATE_LIMITED') {
      // Show rate limit message
      showToast('Too many requests. Please wait.')
    }

    throw error
  },
}
```

## Plugin Lifecycle

```
┌─────────────────┐
│ beforeRequest   │ ← Plugins run in order (1, 2, 3...)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transport     │ ← Actual network request
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Success     Error
    │         │
    ▼         ▼
┌─────────┐ ┌─────────┐
│ after   │ │ onError │ ← Plugins run in reverse (3, 2, 1...)
│Response │ │         │
└─────────┘ └─────────┘
```

## Best Practices

### 1. Order Matters

```typescript
// ✅ Good: Logical order
plugins: [
  logger(),   // Log everything
  auth(),     // Add auth before cache check
  cache(),    // Check cache before network
  retry(),    // Retry network failures
]

// ❌ Bad: Cache before auth
plugins: [
  cache(),    // Would cache unauthenticated requests!
  auth(),
]
```

### 2. Handle All Cases

```typescript
const robustPlugin: Plugin = {
  name: 'robust',

  afterResponse: async (op, result) => {
    if (!result) return result  // Handle null/undefined
    return result
  },

  onError: async (op, error) => {
    // Don't swallow errors silently
    console.error(error)
    throw error
  },
}
```

### 3. Use Types

```typescript
import type { Plugin, Operation, Result } from '@sylphx/lens-client'

const typedPlugin: Plugin = {
  name: 'typed',

  beforeRequest: async (op: Operation) => {
    // op is typed
    return op
  },

  afterResponse: async (op: Operation, result: Result) => {
    // result is typed
    return result
  },
}
```

### 4. Keep Plugins Focused

```typescript
// ✅ Good: Single responsibility
const authPlugin: Plugin = { /* auth only */ }
const cachePlugin: Plugin = { /* cache only */ }
const loggerPlugin: Plugin = { /* logging only */ }

// ❌ Bad: Does too much
const megaPlugin: Plugin = {
  /* auth + cache + logging + retry + ... */
}
```
