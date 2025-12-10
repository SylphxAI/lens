# Vue Integration

Lens provides Vue composables for reactive data access.

## Installation

```bash
npm install @sylphx/lens-vue
```

## Setup

Create a typed client:

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-vue'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})
```

## useQuery Composable

```vue
<script setup lang="ts">
import { client } from '@/lib/client'

const props = defineProps<{ userId: string }>()

const { data, loading, error } = client.user.get.useQuery({
  input: { id: props.userId },
})
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <h1>{{ data?.name }}</h1>
    <p>{{ data?.email }}</p>
  </div>
</template>
```

## useMutation Composable

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { client } from '@/lib/client'

const title = ref('')
const content = ref('')

const { mutate, loading, error } = client.post.create.useMutation()

async function handleSubmit() {
  await mutate({
    input: {
      title: title.value,
      content: content.value,
    },
  })
  title.value = ''
  content.value = ''
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="title" placeholder="Title" />
    <textarea v-model="content" placeholder="Content" />
    <button type="submit" :disabled="loading">
      {{ loading ? 'Creating...' : 'Create Post' }}
    </button>
    <p v-if="error" class="error">{{ error.message }}</p>
  </form>
</template>
```

## Field Selection

```vue
<script setup lang="ts">
const { data } = client.user.get.useQuery({
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
})
</script>
```

## Reactive Inputs

Use `computed` for reactive query inputs:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ userId: string }>()

const { data } = client.user.get.useQuery(
  computed(() => ({
    input: { id: props.userId },
  }))
)
</script>
```

## Conditional Queries

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ userId: string | null }>()

const { data } = client.user.get.useQuery(
  computed(() => ({
    input: { id: props.userId! },
    enabled: !!props.userId,
  }))
)
</script>
```

## Live Updates

Queries automatically subscribe to real-time updates:

```vue
<script setup lang="ts">
// Automatically receives live updates
const { data } = client.user.get.useQuery({
  input: { id: props.userId },
  select: {
    name: true,
    status: true,  // Live field
  },
})
</script>

<template>
  <div>
    <span>{{ data?.name }}</span>
    <span :class="['status', data?.status]">{{ data?.status }}</span>
  </div>
</template>
```

## Complete Example

```vue
<!-- components/Dashboard.vue -->
<script setup lang="ts">
import { client } from '@/lib/client'

const { data: user, loading } = client.user.me.useQuery()
const { data: stats } = client.dashboard.stats.useQuery({
  enabled: computed(() => !!user.value),
})
</script>

<template>
  <div v-if="loading">
    <Loading />
  </div>
  <div v-else-if="!user">
    <LoginPrompt />
  </div>
  <div v-else>
    <Header :user="user" />
    <Stats :data="stats" />
    <RecentActivity :user-id="user.id" />
  </div>
</template>
```

```vue
<!-- components/RecentActivity.vue -->
<script setup lang="ts">
import { client } from '@/lib/client'

const props = defineProps<{ userId: string }>()

const { data: activities } = client.activity.list.useQuery({
  input: { userId: props.userId, limit: 10 },
  select: {
    id: true,
    type: true,
    message: true,
    createdAt: true,
  },
})
</script>

<template>
  <ul>
    <li v-for="activity in activities" :key="activity.id">
      <span>{{ activity.type }}</span>
      <p>{{ activity.message }}</p>
      <time>{{ activity.createdAt }}</time>
    </li>
  </ul>
</template>
```

## Vanilla Usage

Use the client outside Vue components:

```typescript
// In composables, utilities, etc.
const user = await client.user.get({ input: { id } })

// Subscribe manually
const unsubscribe = client.user.get({ input: { id } }).subscribe((user) => {
  console.log('User updated:', user)
})
```

## Best Practices

### 1. Use Computed for Reactive Inputs

```vue
<script setup lang="ts">
// ✅ Good: Reactive input
const { data } = client.user.get.useQuery(
  computed(() => ({
    input: { id: props.userId },
  }))
)

// ❌ Bad: Non-reactive (won't update when props change)
const { data } = client.user.get.useQuery({
  input: { id: props.userId },
})
</script>
```

### 2. Handle All States

```vue
<template>
  <Loading v-if="loading" />
  <Error v-else-if="error" :error="error" />
  <Empty v-else-if="!data" />
  <Content v-else :data="data" />
</template>
```
