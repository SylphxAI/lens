# Emit API Reference

The `emit` API allows resolvers and subscriptions to push updates to clients.

## Overview

```typescript
// emit is available in:
// 1. Operation resolvers (via ctx.emit)
// 2. Field subscriptions (via publisher callback)

// Basic usage
emit(value)           // Full value
emit.value(value)     // Same as above
emit.merge(partial)   // Merge into existing object
emit.replace(value)   // Replace entire value

// Array operations
emit.push(item)
emit.unshift(item)
emit.insert(index, item)
emit.remove(index)
emit.update(index, item)
```

## Full Value

Send a complete new value:

```typescript
// These are equivalent
emit(newUser)
emit.value(newUser)

// Example
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  ctx.pubsub.on(`user:${parent.id}`, (user) => {
    emit(user)  // Send full user object
  })
})
```

## Merge

Merge fields into existing object:

```typescript
emit.merge({ name: 'New Name' })

// Result:
// Before: { id: '1', name: 'Old', email: 'a@b.com' }
// After:  { id: '1', name: 'New Name', email: 'a@b.com' }
```

Useful for partial updates:

```typescript
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  ctx.pubsub.on(`user:${parent.id}:status`, (status) => {
    emit.merge({ status })  // Only update status field
  })
})
```

## Replace

Replace the entire value (useful for null/undefined):

```typescript
emit.replace(null)
emit.replace({ completely: 'new', object: true })
```

Difference from `emit.value()`:
- `emit.value()` - May merge with existing
- `emit.replace()` - Always full replacement

## Array Operations

For array fields, use array-specific methods:

### push

Add item to end:

```typescript
emit.push(newMessage)

// Before: [msg1, msg2]
// After:  [msg1, msg2, newMessage]
```

### unshift

Add item to start:

```typescript
emit.unshift(newMessage)

// Before: [msg1, msg2]
// After:  [newMessage, msg1, msg2]
```

### insert

Insert at specific index:

```typescript
emit.insert(1, newMessage)

// Before: [msg1, msg2, msg3]
// After:  [msg1, newMessage, msg2, msg3]
```

### remove

Remove item at index:

```typescript
emit.remove(1)

// Before: [msg1, msg2, msg3]
// After:  [msg1, msg3]
```

### update

Update item at index:

```typescript
emit.update(1, updatedMessage)

// Before: [msg1, msg2, msg3]
// After:  [msg1, updatedMessage, msg3]
```

## Type Safety

`emit` is typed based on field return type:

```typescript
// Field returns User
status: t.string()
  .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
    emit('online')     // ✅ Valid
    emit(123)          // ❌ Type error
    emit.push('item')  // ❌ Type error (not an array)
  })

// Field returns Message[]
messages: t.many(() => Message)
  .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
    emit.push(message)   // ✅ Valid
    emit('string')       // ❌ Type error
  })
```

## Operation-Level Emit

Use `ctx.emit` in operation resolvers:

```typescript
const streamChat = query()
  .input(z.object({ prompt: z.string() }))
  .resolve(async ({ input, ctx }) => {
    const response = { content: '' }

    // Stream chunks
    for await (const chunk of ai.stream(input.prompt)) {
      response.content += chunk
      ctx.emit.merge({ content: response.content })
    }

    return response
  })
```

## Field-Level Emit

Use publisher callback in field subscriptions:

```typescript
const User = model<AppContext>('User', (t) => ({
  messages: t.many(() => Message)
    .resolve(({ parent, ctx }) =>
      ctx.db.message.findMany({ where: { userId: parent.id } })
    )
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`messages:${parent.id}`, (event) => {
        switch (event.type) {
          case 'new':
            emit.push(event.message)
            break
          case 'delete':
            emit.remove(event.index)
            break
          case 'update':
            emit.update(event.index, event.message)
            break
        }
      })
      onCleanup(unsub)
    }),
}))
```

## Batching

Multiple emits in same tick are batched:

```typescript
// These are batched into one update
emit.merge({ field1: 'value1' })
emit.merge({ field2: 'value2' })
emit.merge({ field3: 'value3' })

// Client receives single update:
// { field1: 'value1', field2: 'value2', field3: 'value3' }
```

## Best Practices

### 1. Use Specific Methods

```typescript
// ✅ Good: Specific method for arrays
emit.push(newItem)

// ❌ Bad: Full array replacement
emit([...currentItems, newItem])
```

### 2. Minimize Data Sent

```typescript
// ✅ Good: Only changed fields
emit.merge({ status: 'online' })

// ❌ Bad: Full object when only status changed
emit({ id, name, email, status: 'online', ... })
```

### 3. Type Your Emits

```typescript
interface StatusUpdate {
  status: 'online' | 'away' | 'offline'
  lastSeen: Date
}

// emit is typed
emit.merge({ status: 'online' } satisfies Partial<StatusUpdate>)
```

### 4. Handle Errors

```typescript
.subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
  const handler = (data: unknown) => {
    try {
      const validated = schema.parse(data)
      emit(validated)
    } catch (error) {
      console.error('Invalid data:', error)
      // Don't emit invalid data
    }
  }

  ctx.pubsub.on('event', handler)
  onCleanup(() => ctx.pubsub.off('event', handler))
})
```

## API Reference

### Emit\<T\>

```typescript
interface Emit<T> {
  // Full value
  (value: T): void
  value(value: T): void
  replace(value: T): void

  // Object operations (when T is object)
  merge(partial: Partial<T>): void

  // Array operations (when T is array)
  push(item: T[number]): void
  unshift(item: T[number]): void
  insert(index: number, item: T[number]): void
  remove(index: number): void
  update(index: number, item: T[number]): void
}
```

### EmitCommand

Internal command structure:

```typescript
type EmitCommand =
  | { type: 'full'; data: unknown; replace?: boolean }
  | { type: 'field'; field: string; update: FieldUpdate }
  | { type: 'batch'; updates: FieldUpdate[] }
  | { type: 'array'; operation: ArrayOperation }

type ArrayOperation =
  | { op: 'push'; item: unknown }
  | { op: 'unshift'; item: unknown }
  | { op: 'insert'; index: number; item: unknown }
  | { op: 'remove'; index: number }
  | { op: 'update'; index: number; item: unknown }
```
