# Optimistic Updates

Optimistic updates provide instant UI feedback before server confirmation. Lens supports automatic optimistic updates with rollback on failure.

## How It Works

```
User clicks "Like"
       │
       ▼
┌──────────────────┐
│  Optimistic UI   │ ← Instant (fake) update
│  (likes: 43)     │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Server Request  │ ← Actual request in background
│  (POST /like)    │
└──────────────────┘
       │
       ├─ Success ──▶ Keep optimistic state
       │
       └─ Failure ──▶ Rollback to original
```

## Server-Side Definition

Define optimistic behavior on the mutation:

```typescript
import { mutation, tempId } from '@sylphx/lens-server'

const createPost = mutation()
  .input(z.object({
    title: z.string(),
    content: z.string(),
  }))
  .returns(Post)
  .resolve(({ input, ctx }) =>
    ctx.db.post.create({ data: { ...input, authorId: ctx.user.id } })
  )
  .optimistic(({ input }) => ({
    id: tempId(),  // Temporary ID until server responds
    title: input.title,
    content: input.content,
    createdAt: new Date(),
    authorId: 'current-user',
  }))
```

## Client Usage

Optimistic updates are automatic when defined:

```typescript
// This updates UI immediately, before server responds
await client.post.create({
  title: 'New Post',
  content: 'Hello world',
})
```

## Temp IDs

Use `tempId()` for items that don't have a real ID yet:

```typescript
import { tempId, isTempId } from '@sylphx/lens-core'

const optimisticPost = {
  id: tempId(),  // e.g., "temp_abc123"
  title: 'New Post',
}

// Check if ID is temporary
if (isTempId(optimisticPost.id)) {
  // Show pending indicator
}
```

## Automatic Rollback

If the mutation fails, Lens automatically rolls back:

```typescript
try {
  // UI updates immediately with optimistic data
  await client.post.create({ title: 'New Post', content: '...' })
  // If successful, optimistic data is replaced with server data
} catch (error) {
  // Automatically rolled back - no manual cleanup needed
}
```

## With Subscriptions

Optimistic updates work with live queries:

```typescript
// Subscribe to posts
client.post.list().subscribe((posts) => {
  renderPosts(posts)
})

// Create a new post - appears instantly in the list
await client.post.create({ title: 'New Post', content: '...' })
// Subscribers see the optimistic post immediately
// Then see it updated with real server data
```

## Update Existing Items

Optimistic updates for existing items:

```typescript
const updatePost = mutation()
  .input(z.object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
  }))
  .returns(Post)
  .resolve(({ input, ctx }) =>
    ctx.db.post.update({ where: { id: input.id }, data: input })
  )
  .optimistic(({ input }) => ({
    id: input.id,  // Use existing ID
    ...input,
  }))
```

## Delete Items

Optimistic deletes:

```typescript
const deletePost = mutation()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) =>
    ctx.db.post.delete({ where: { id: input.id } })
  )
  .optimistic(({ input }) => ({
    __deleted: true,  // Special marker for deletion
    id: input.id,
  }))
```

## Array Operations

Optimistic array updates:

```typescript
const addComment = mutation()
  .input(z.object({
    postId: z.string(),
    content: z.string(),
  }))
  .returns(Comment)
  .resolve(({ input, ctx }) =>
    ctx.db.comment.create({ data: input })
  )
  .optimistic(({ input }) => ({
    id: tempId(),
    postId: input.postId,
    content: input.content,
    createdAt: new Date(),
    authorId: 'current-user',
  }))
```

## Manual Optimistic Updates

For complex scenarios, handle optimistically on the client:

```typescript
// Manually optimistic update
const posts = [...currentPosts]
const tempPost = {
  id: tempId(),
  title: 'New Post',
  createdAt: new Date(),
}
setPosts([tempPost, ...posts])  // Update UI immediately

try {
  const realPost = await client.post.create({ title: 'New Post' })
  // Replace temp with real
  setPosts(posts => posts.map(p =>
    p.id === tempPost.id ? realPost : p
  ))
} catch (error) {
  // Rollback
  setPosts(posts => posts.filter(p => p.id !== tempPost.id))
}
```

## Best Practices

### 1. Use for Low-Risk Operations

```typescript
// ✅ Good: Low-risk, easily reversible
.optimistic(({ input }) => ({ likes: input.likes + 1 }))

// ⚠️ Careful: High-risk operations
.optimistic(({ input }) => ({ balance: input.balance - 1000 }))
// Consider showing "pending" state instead
```

### 2. Match Server Shape

```typescript
// ✅ Good: Same shape as server returns
.optimistic(({ input }) => ({
  id: tempId(),
  title: input.title,
  createdAt: new Date().toISOString(),  // Match server format
}))

// ❌ Bad: Different shape causes merge issues
.optimistic(({ input }) => ({
  id: tempId(),
  name: input.title,  // Wrong field name
  timestamp: Date.now(),  // Wrong format
}))
```

### 3. Handle Loading States

```typescript
function PostList() {
  const { data: posts } = client.post.list.useQuery()

  return (
    <ul>
      {posts?.map(post => (
        <li key={post.id}>
          {post.title}
          {isTempId(post.id) && <span className="pending">Saving...</span>}
        </li>
      ))}
    </ul>
  )
}
```

### 4. Don't Over-Optimize

```typescript
// ✅ Good: Simple operations benefit from optimistic
await client.post.like({ id: postId })  // Instant like

// ⚠️ Consider: Complex operations may not need it
await client.checkout.complete({ cartId })  // Show loading instead
```

## Enabling Optimistic Plugin

Enable the optimistic plugin on the server:

```typescript
import { createApp, optimisticPlugin } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  plugins: [optimisticPlugin()],
})
```

And on the client:

```typescript
import { createClient, http } from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
  plugins: [/* optimistic plugin if needed */],
})
```
