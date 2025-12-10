# Subscriptions

Subscriptions enable real-time data updates. In Lens, any query can become a subscription.

## Basic Subscription

```typescript
const unsubscribe = client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)
})

// Later: stop receiving updates
unsubscribe()
```

## Observer Pattern

Full observer with error and complete handlers:

```typescript
const unsubscribe = client.user.get({ id: '123' }).subscribe({
  next: (user) => {
    console.log('User:', user)
  },
  error: (error) => {
    console.error('Error:', error)
  },
  complete: () => {
    console.log('Subscription closed')
  },
})
```

## One-time vs Subscribe

Every query supports both patterns:

```typescript
// One-time: Returns Promise
const user = await client.user.get({ id: '123' })

// Subscribe: Returns unsubscribe function
const unsubscribe = client.user.get({ id: '123' }).subscribe(callback)
```

The same query definition works for both - the client chooses the access pattern.

## With Field Selection

Selection works with subscriptions:

```typescript
client.user.get({ id: '123' }, {
  select: {
    name: true,
    status: true,  // Live field
  }
}).subscribe((user) => {
  // Only selected fields included
  console.log(user.name, user.status)
})
```

## Subscription Transport

Subscriptions require a transport that supports them:

```typescript
import { createClient, route, http, ws } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: route({
    query: http({ url: '/api' }),
    mutation: http({ url: '/api' }),
    subscription: ws({ url: 'wss://api.example.com' }),  // WebSocket for subscriptions
  }),
})
```

## Automatic Updates

When data changes on the server, subscribed clients receive updates automatically:

```typescript
// Client A subscribes
client.user.get({ id: '123' }).subscribe((user) => {
  console.log('User:', user.name)
})

// Client B makes a mutation
await client.user.update({ id: '123', name: 'New Name' })

// Client A receives update automatically
// Output: "User: New Name"
```

## Incremental Updates

Lens sends minimal diffs, not full objects:

```typescript
// Initial: Full object sent
{ id: '123', name: 'Alice', email: 'alice@example.com', bio: '...' }

// Update: Only changed fields sent
{ name: 'Bob' }  // ~99% smaller than full object

// Client sees merged result
{ id: '123', name: 'Bob', email: 'alice@example.com', bio: '...' }
```

## Reconnection

WebSocket transport handles reconnection automatically:

```typescript
const client = createClient<AppRouter>({
  transport: ws({
    url: 'wss://api.example.com',
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
  }),
})

// Subscriptions automatically resubscribe on reconnect
client.user.get({ id: '123' }).subscribe((user) => {
  // Called again after reconnection
})
```

## Multiple Subscriptions

Subscribe to multiple queries:

```typescript
// Subscribe to multiple entities
const unsub1 = client.user.get({ id: '123' }).subscribe(handleUser)
const unsub2 = client.post.list({ authorId: '123' }).subscribe(handlePosts)

// Clean up all
function cleanup() {
  unsub1()
  unsub2()
}
```

## Subscription State

Track subscription state:

```typescript
let connected = false

const unsubscribe = client.user.get({ id: '123' }).subscribe({
  next: (user) => {
    connected = true
    updateUI(user)
  },
  error: (error) => {
    connected = false
    showError(error)
  },
  complete: () => {
    connected = false
    showDisconnected()
  },
})
```

## With React

Use the `useQuery` hook for automatic subscription management:

```typescript
function UserProfile({ userId }: { userId: string }) {
  // Automatically subscribes and cleans up
  const { data, loading, error } = client.user.get.useQuery({
    input: { id: userId },
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{data?.name}</div>
}
```

## Conditional Subscription

Only subscribe when needed:

```typescript
function UserStatus({ userId, enabled }: { userId: string; enabled: boolean }) {
  const { data } = client.user.get.useQuery({
    input: { id: userId },
    enabled,  // Only subscribe when true
  })

  return data ? <span>{data.status}</span> : null
}
```

## Batched Subscriptions

Lens batches multiple subscriptions efficiently:

```typescript
// These are batched into a single WebSocket connection
client.user.get({ id: '1' }).subscribe(handleUser1)
client.user.get({ id: '2' }).subscribe(handleUser2)
client.user.get({ id: '3' }).subscribe(handleUser3)
```

## Error Recovery

Handle subscription errors gracefully:

```typescript
client.user.get({ id: '123' }).subscribe({
  next: (user) => {
    updateUI(user)
  },
  error: (error) => {
    if (error.code === 'UNAUTHORIZED') {
      // Redirect to login
      router.push('/login')
    } else {
      // Show error UI
      showError(error.message)
    }
  },
})
```

## Best Practices

### 1. Always Clean Up

```typescript
// ✅ Good: Store and call unsubscribe
const unsubscribe = client.user.get({ id }).subscribe(callback)
onCleanup(() => unsubscribe())

// ❌ Bad: Ignoring unsubscribe
client.user.get({ id }).subscribe(callback)  // Memory leak!
```

### 2. Use Framework Hooks

```typescript
// ✅ Good: Hook handles cleanup
const { data } = client.user.get.useQuery({ input: { id } })

// ⚠️ Manual: Must handle cleanup yourself
useEffect(() => {
  const unsub = client.user.get({ id }).subscribe(setData)
  return unsub
}, [id])
```

### 3. Handle All States

```typescript
client.user.get({ id }).subscribe({
  next: (user) => { /* handle data */ },
  error: (err) => { /* handle error */ },
  complete: () => { /* handle close */ },
})
```

### 4. Reconnection Strategy

```typescript
const client = createClient<AppRouter>({
  transport: ws({
    url: 'wss://...',
    reconnect: true,
    reconnectInterval: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    maxReconnectAttempts: Infinity,
  }),
})
```
