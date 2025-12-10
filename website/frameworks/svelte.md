# Svelte Integration

Lens provides Svelte stores for reactive data access.

## Installation

```bash
npm install @sylphx/lens-svelte
```

## Setup

Create a typed client:

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-svelte'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})
```

## Query Store

```svelte
<script lang="ts">
  import { client } from '$lib/client'

  export let userId: string

  $: query = client.user.get.createQuery({
    input: { id: userId },
  })
</script>

{#if $query.loading}
  <div>Loading...</div>
{:else if $query.error}
  <div>Error: {$query.error.message}</div>
{:else if $query.data}
  <div>
    <h1>{$query.data.name}</h1>
    <p>{$query.data.email}</p>
  </div>
{/if}
```

## Mutation Store

```svelte
<script lang="ts">
  import { client } from '$lib/client'

  let title = ''
  let content = ''

  const mutation = client.post.create.createMutation()

  async function handleSubmit() {
    await $mutation.mutate({
      input: { title, content },
    })
    title = ''
    content = ''
  }
</script>

<form on:submit|preventDefault={handleSubmit}>
  <input bind:value={title} placeholder="Title" />
  <textarea bind:value={content} placeholder="Content" />
  <button type="submit" disabled={$mutation.loading}>
    {$mutation.loading ? 'Creating...' : 'Create Post'}
  </button>
  {#if $mutation.error}
    <p class="error">{$mutation.error.message}</p>
  {/if}
</form>
```

## Reactive Queries

Use reactive statements for dynamic inputs:

```svelte
<script lang="ts">
  export let userId: string

  // Automatically re-runs when userId changes
  $: query = client.user.get.createQuery({
    input: { id: userId },
  })
</script>
```

## Field Selection

```svelte
<script lang="ts">
  $: query = client.user.get.createQuery({
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
</script>
```

## Conditional Queries

```svelte
<script lang="ts">
  export let userId: string | null

  $: query = userId
    ? client.user.get.createQuery({
        input: { id: userId },
      })
    : null
</script>

{#if !userId}
  <div>Select a user</div>
{:else if $query?.loading}
  <div>Loading...</div>
{:else if $query?.data}
  <div>{$query.data.name}</div>
{/if}
```

## Live Updates

Queries automatically subscribe to real-time updates:

```svelte
<script lang="ts">
  export let userId: string

  $: query = client.user.get.createQuery({
    input: { id: userId },
    select: {
      name: true,
      status: true,  // Live field
    },
  })
</script>

<div>
  <span>{$query.data?.name}</span>
  <span class="status {$query.data?.status}">
    {$query.data?.status}
  </span>
</div>
```

## Complete Example

```svelte
<!-- routes/+page.svelte -->
<script lang="ts">
  import { client } from '$lib/client'

  const userQuery = client.user.me.createQuery()

  $: statsQuery = $userQuery.data
    ? client.dashboard.stats.createQuery()
    : null
</script>

{#if $userQuery.loading}
  <Loading />
{:else if !$userQuery.data}
  <LoginPrompt />
{:else}
  <div>
    <Header user={$userQuery.data} />
    <Stats data={$statsQuery?.data} />
    <RecentActivity userId={$userQuery.data.id} />
  </div>
{/if}
```

```svelte
<!-- components/RecentActivity.svelte -->
<script lang="ts">
  import { client } from '$lib/client'

  export let userId: string

  $: query = client.activity.list.createQuery({
    input: { userId, limit: 10 },
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
    },
  })
</script>

<ul>
  {#each $query.data ?? [] as activity (activity.id)}
    <li>
      <span>{activity.type}</span>
      <p>{activity.message}</p>
      <time>{activity.createdAt}</time>
    </li>
  {/each}
</ul>
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

## SvelteKit Integration

### Server-Side Data Loading

```typescript
// routes/user/[id]/+page.server.ts
import { client } from '$lib/client'

export async function load({ params }) {
  const user = await client.user.get({ input: { id: params.id } })
  return { user }
}
```

```svelte
<!-- routes/user/[id]/+page.svelte -->
<script lang="ts">
  export let data
</script>

<h1>{data.user.name}</h1>
```

## Best Practices

### 1. Use Reactive Statements

```svelte
<script>
  // ✅ Good: Reactive
  $: query = client.user.get.createQuery({
    input: { id: userId },
  })

  // ❌ Bad: Not reactive
  const query = client.user.get.createQuery({
    input: { id: userId },
  })
</script>
```

### 2. Handle All States

```svelte
{#if $query.loading}
  <Loading />
{:else if $query.error}
  <Error error={$query.error} />
{:else if !$query.data}
  <Empty />
{:else}
  <Content data={$query.data} />
{/if}
```
