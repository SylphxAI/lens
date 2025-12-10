# React Integration

Lens provides first-class React support with hooks for queries and mutations.

## Installation

```bash
npm install @sylphx/lens-react
```

## Setup

Create a typed client:

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-react'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})
```

## useQuery Hook

Subscribe to live data:

```tsx
import { client } from '@/lib/client'

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = client.user.get.useQuery({
    input: { id: userId },
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>{data?.name}</h1>
      <p>{data?.email}</p>
    </div>
  )
}
```

### Query Options

| Option | Type | Description |
|--------|------|-------------|
| `input` | `object` | Query input parameters |
| `select` | `SelectionObject` | Field selection |
| `enabled` | `boolean` | Enable/disable query |
| `refetchOnMount` | `boolean` | Refetch when component mounts |
| `refetchOnWindowFocus` | `boolean` | Refetch on window focus |

### Query Result

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | Query result |
| `loading` | `boolean` | Loading state |
| `error` | `Error \| null` | Error if failed |
| `refetch` | `() => void` | Manually refetch |

## useMutation Hook

Execute mutations:

```tsx
import { client } from '@/lib/client'

function CreatePost() {
  const { mutate, loading, error } = client.post.create.useMutation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    await mutate({
      input: {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" />
      <textarea name="content" placeholder="Content" />
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Post'}
      </button>
      {error && <p className="error">{error.message}</p>}
    </form>
  )
}
```

### Mutation Options

| Option | Type | Description |
|--------|------|-------------|
| `onSuccess` | `(data) => void` | Success callback |
| `onError` | `(error) => void` | Error callback |
| `onSettled` | `() => void` | Called after success or error |

### Mutation Result

| Property | Type | Description |
|----------|------|-------------|
| `mutate` | `(options) => Promise` | Execute mutation |
| `loading` | `boolean` | Loading state |
| `error` | `Error \| null` | Error if failed |
| `data` | `T \| undefined` | Last result |
| `reset` | `() => void` | Reset state |

## Field Selection

Select specific fields:

```tsx
const { data } = client.user.get.useQuery({
  input: { id: userId },
  select: {
    name: true,
    email: true,
    posts: {
      select: {
        title: true,
        createdAt: true,
      },
    },
  },
})
```

## Conditional Queries

Enable/disable queries conditionally:

```tsx
function UserProfile({ userId }: { userId: string | null }) {
  const { data } = client.user.get.useQuery({
    input: { id: userId! },
    enabled: !!userId,  // Only run when userId exists
  })

  return data ? <Profile user={data} /> : <div>Select a user</div>
}
```

## Dependent Queries

Chain queries based on results:

```tsx
function UserPosts({ userId }: { userId: string }) {
  const { data: user } = client.user.get.useQuery({
    input: { id: userId },
  })

  const { data: posts } = client.post.list.useQuery({
    input: { authorId: user?.id! },
    enabled: !!user?.id,
  })

  return (
    <div>
      <h1>{user?.name}'s Posts</h1>
      {posts?.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

## Optimistic Updates

```tsx
function LikeButton({ postId }: { postId: string }) {
  const { data: post } = client.post.get.useQuery({
    input: { id: postId },
    select: { id: true, likes: true },
  })

  const { mutate } = client.post.like.useMutation({
    onSuccess: () => {
      // Data automatically updates via subscription
    },
  })

  return (
    <button onClick={() => mutate({ input: { id: postId } })}>
      ❤️ {post?.likes}
    </button>
  )
}
```

## Live Updates

Queries automatically subscribe to live updates:

```tsx
function LiveStatus({ userId }: { userId: string }) {
  // This automatically receives real-time updates
  const { data } = client.user.get.useQuery({
    input: { id: userId },
    select: {
      name: true,
      status: true,  // Live field from server
    },
  })

  return (
    <div>
      <span>{data?.name}</span>
      <span className={`status ${data?.status}`}>
        {data?.status}
      </span>
    </div>
  )
}
```

## Complete Example

```tsx
// app/page.tsx
import { client } from '@/lib/client'

export default function Dashboard() {
  const { data: user, loading } = client.user.me.useQuery()
  const { data: stats } = client.dashboard.stats.useQuery({
    enabled: !!user,
  })

  if (loading) return <Loading />

  if (!user) {
    return <LoginPrompt />
  }

  return (
    <div>
      <Header user={user} />
      <Stats data={stats} />
      <RecentActivity userId={user.id} />
    </div>
  )
}

function RecentActivity({ userId }: { userId: string }) {
  const { data: activities } = client.activity.list.useQuery({
    input: { userId, limit: 10 },
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
    },
  })

  return (
    <ul>
      {activities?.map(activity => (
        <li key={activity.id}>
          <span>{activity.type}</span>
          <p>{activity.message}</p>
          <time>{activity.createdAt}</time>
        </li>
      ))}
    </ul>
  )
}
```

## Vanilla Usage

The client also works outside React:

```typescript
// In event handlers, utilities, etc.
const user = await client.user.get({ input: { id } })

// Subscribe manually
const unsubscribe = client.user.get({ input: { id } }).subscribe((user) => {
  console.log('User updated:', user)
})
```

## Best Practices

### 1. Colocate Queries with Components

```tsx
// ✅ Good: Query close to where it's used
function UserCard({ userId }: { userId: string }) {
  const { data } = client.user.get.useQuery({
    input: { id: userId },
    select: { name: true, avatar: true },
  })
  return <Card>{data?.name}</Card>
}
```

### 2. Use Field Selection

```tsx
// ✅ Good: Select only needed fields
const { data } = client.user.get.useQuery({
  input: { id: userId },
  select: { name: true, email: true },
})

// ❌ Bad: Fetch everything
const { data } = client.user.get.useQuery({
  input: { id: userId },
})
```

### 3. Handle All States

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = client.user.get.useQuery({
    input: { id: userId },
  })

  if (loading) return <Skeleton />
  if (error) return <ErrorBoundary error={error} />
  if (!data) return <NotFound />

  return <Profile user={data} />
}
```
