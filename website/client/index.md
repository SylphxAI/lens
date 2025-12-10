# Client Overview

The Lens client provides type-safe API access with automatic subscription support.

## Installation

```bash
npm install @sylphx/lens-client
```

## Basic Setup

```typescript
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: 'http://localhost:3000' }),
})
```

## Type Safety

Types flow automatically from your server:

```typescript
// Full autocomplete and type checking
const user = await client.user.get({ id: '123' })
//    ^? User type inferred from server

user.name  // ✅ Autocomplete works
user.foo   // ❌ TypeScript error
```

## One-time vs Live

Every query supports both access patterns:

```typescript
// One-time (HTTP)
const user = await client.user.get({ id: '123' })

// Live (WebSocket)
const unsubscribe = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)
})
```

## createClient Options

| Option | Type | Description |
|--------|------|-------------|
| `transport` | `Transport` | Primary transport (HTTP, WS, direct) |
| `plugins` | `Plugin[]` | Client plugins |

## Queries

```typescript
// Simple query
const user = await client.user.get({ id: '123' })

// With field selection
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    email: true,
  }
})

// With field arguments
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5 },
      select: { title: true }
    }
  }
})
```

## Mutations

```typescript
// Simple mutation
await client.user.create({ name: 'Alice', email: 'alice@example.com' })

// With return value
const user = await client.user.update({
  id: '123',
  name: 'New Name',
})
```

## Subscriptions

```typescript
// Subscribe to live updates
const unsubscribe = client.user.get({ id: '123' }).subscribe({
  next: (user) => console.log('Updated:', user),
  error: (err) => console.error('Error:', err),
  complete: () => console.log('Closed'),
})

// Simple callback form
client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User:', user)
})

// Stop listening
unsubscribe()
```

## Error Handling

```typescript
try {
  const user = await client.user.get({ id: 'invalid' })
} catch (error) {
  if (error instanceof LensError) {
    console.error('API error:', error.message)
  }
}

// Or with subscribe
client.user.get({ id: '123' }).subscribe({
  next: (user) => { /* handle data */ },
  error: (error) => { /* handle error */ },
})
```

## Next Steps

- [Transports](/client/transports) - HTTP, WebSocket, Direct
- [Selection](/client/selection) - Field selection and arguments
- [Subscriptions](/client/subscriptions) - Real-time updates
- [Optimistic Updates](/client/optimistic) - Instant UI feedback
- [Plugins](/client/plugins) - Auth, cache, retry, logging
