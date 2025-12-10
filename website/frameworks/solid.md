# SolidJS Integration

Lens provides SolidJS primitives for reactive data access.

## Installation

```bash
npm install @sylphx/lens-solid
```

## Setup

Create a typed client:

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-solid'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})
```

## createQuery

```tsx
import { client } from '@/lib/client'

function UserProfile(props: { userId: string }) {
  const query = client.user.get.createQuery(() => ({
    input: { id: props.userId },
  }))

  return (
    <Switch>
      <Match when={query.loading}>
        <div>Loading...</div>
      </Match>
      <Match when={query.error}>
        <div>Error: {query.error?.message}</div>
      </Match>
      <Match when={query.data}>
        <div>
          <h1>{query.data?.name}</h1>
          <p>{query.data?.email}</p>
        </div>
      </Match>
    </Switch>
  )
}
```

## createMutation

```tsx
import { createSignal } from 'solid-js'
import { client } from '@/lib/client'

function CreatePost() {
  const [title, setTitle] = createSignal('')
  const [content, setContent] = createSignal('')

  const mutation = client.post.create.createMutation()

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    await mutation.mutate({
      input: {
        title: title(),
        content: content(),
      },
    })
    setTitle('')
    setContent('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="Title"
      />
      <textarea
        value={content()}
        onInput={(e) => setContent(e.currentTarget.value)}
        placeholder="Content"
      />
      <button type="submit" disabled={mutation.loading}>
        {mutation.loading ? 'Creating...' : 'Create Post'}
      </button>
      <Show when={mutation.error}>
        <p class="error">{mutation.error?.message}</p>
      </Show>
    </form>
  )
}
```

## Reactive Inputs

SolidJS automatically tracks dependencies:

```tsx
function UserProfile(props: { userId: string }) {
  // Automatically re-runs when props.userId changes
  const query = client.user.get.createQuery(() => ({
    input: { id: props.userId },
  }))

  return <div>{query.data?.name}</div>
}
```

## Field Selection

```tsx
const query = client.user.get.createQuery(() => ({
  input: { id: props.userId },
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
}))
```

## Conditional Queries

```tsx
function UserProfile(props: { userId: string | null }) {
  const query = client.user.get.createQuery(() => ({
    input: { id: props.userId! },
    enabled: !!props.userId,
  }))

  return (
    <Show when={props.userId} fallback={<div>Select a user</div>}>
      <div>{query.data?.name}</div>
    </Show>
  )
}
```

## Live Updates

Queries automatically subscribe to real-time updates:

```tsx
function LiveStatus(props: { userId: string }) {
  const query = client.user.get.createQuery(() => ({
    input: { id: props.userId },
    select: {
      name: true,
      status: true,  // Live field
    },
  }))

  return (
    <div>
      <span>{query.data?.name}</span>
      <span class={`status ${query.data?.status}`}>
        {query.data?.status}
      </span>
    </div>
  )
}
```

## Complete Example

```tsx
// components/Dashboard.tsx
import { Show, For } from 'solid-js'
import { client } from '@/lib/client'

export function Dashboard() {
  const userQuery = client.user.me.createQuery()
  const statsQuery = client.dashboard.stats.createQuery(() => ({
    enabled: !!userQuery.data,
  }))

  return (
    <Switch>
      <Match when={userQuery.loading}>
        <Loading />
      </Match>
      <Match when={!userQuery.data}>
        <LoginPrompt />
      </Match>
      <Match when={userQuery.data}>
        <div>
          <Header user={userQuery.data!} />
          <Stats data={statsQuery.data} />
          <RecentActivity userId={userQuery.data!.id} />
        </div>
      </Match>
    </Switch>
  )
}

function RecentActivity(props: { userId: string }) {
  const query = client.activity.list.createQuery(() => ({
    input: { userId: props.userId, limit: 10 },
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
    },
  }))

  return (
    <ul>
      <For each={query.data}>
        {(activity) => (
          <li>
            <span>{activity.type}</span>
            <p>{activity.message}</p>
            <time>{activity.createdAt}</time>
          </li>
        )}
      </For>
    </ul>
  )
}
```

## Vanilla Usage

```typescript
// Outside components
const user = await client.user.get({ input: { id } })

// Subscribe manually
const unsubscribe = client.user.get({ input: { id } }).subscribe((user) => {
  console.log('User updated:', user)
})
```

## Best Practices

### 1. Use Accessor Functions

```tsx
// ✅ Good: Accessor function for reactive tracking
const query = client.user.get.createQuery(() => ({
  input: { id: props.userId },
}))

// ❌ Bad: Static object (won't update)
const query = client.user.get.createQuery({
  input: { id: props.userId },
})
```

### 2. Handle All States with Switch/Match

```tsx
<Switch>
  <Match when={query.loading}><Loading /></Match>
  <Match when={query.error}><Error error={query.error} /></Match>
  <Match when={!query.data}><Empty /></Match>
  <Match when={query.data}><Content data={query.data} /></Match>
</Switch>
```
