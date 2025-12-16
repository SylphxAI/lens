# Nuxt Integration

Lens integrates with Nuxt 3 for full-stack type-safe APIs.

## Installation

```bash
npm install @sylphx/lens-vue @sylphx/lens-server
```

## Server Setup

Create your Lens server:

```typescript
// server/router.ts
import { lens, id, string, router } from '@sylphx/lens-core'
import { z } from 'zod'

type AppContext = { db: Database; user: User }

const { model, query, mutation } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  email: string(),
})

export const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),

    list: query()
      .returns([User])
      .resolve(({ ctx }) => ctx.db.user.findMany()),
  },
})

export type AppRouter = typeof appRouter
```

```typescript
// server/app.ts
import { createApp } from '@sylphx/lens-server'
import { appRouter } from './router'

export const app = createApp({
  router: appRouter,
  context: async (event) => ({
    db: prisma,
    user: await getUserFromEvent(event),
  }),
})
```

## API Route

```typescript
// server/api/lens/[...path].ts
import { createHTTPHandler } from '@sylphx/lens-server'
import { app } from '~/server/app'

const handler = createHTTPHandler(app)

export default defineEventHandler((event) => {
  return handler(event.node.req, event.node.res)
})
```

## Client Setup

```typescript
// composables/useLens.ts
import { createClient } from '@sylphx/lens-vue'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '~/server/router'

export const useLens = () => {
  return createClient<AppRouter>({
    transport: http({ url: '/api/lens' }),
  })
}
```

Or as a plugin:

```typescript
// plugins/lens.client.ts
import { createClient } from '@sylphx/lens-vue'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '~/server/router'

export default defineNuxtPlugin(() => {
  const client = createClient<AppRouter>({
    transport: http({ url: '/api/lens' }),
  })

  return {
    provide: {
      lens: client,
    },
  }
})
```

## Usage in Components

```vue
<script setup lang="ts">
const client = useLens()

const { data, pending, error } = client.user.get.useQuery({
  input: { id: route.params.id as string },
})
</script>

<template>
  <div v-if="pending">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <h1>{{ data?.name }}</h1>
    <p>{{ data?.email }}</p>
  </div>
</template>
```

## Server-Side Data Fetching

Use `useAsyncData` with the server client:

```typescript
// server/utils/lens.ts
import { createClient, direct } from '@sylphx/lens-client'
import { app } from '~/server/app'
import type { AppRouter } from '~/server/router'

export const serverLens = createClient<AppRouter>({
  transport: direct({ server: app }),
})
```

```vue
<script setup lang="ts">
// SSR data fetching
const { data: user } = await useAsyncData('user', () =>
  serverLens.user.get({ input: { id: route.params.id as string } })
)
</script>

<template>
  <h1>{{ user?.name }}</h1>
</template>
```

## WebSocket for Live Queries

```typescript
// server/api/ws.ts
import { createWSHandler } from '@sylphx/lens-server'
import { app } from '~/server/app'

const wsHandler = createWSHandler(app)

export default defineWebSocketHandler({
  open(peer) {
    wsHandler.handleConnection(peer)
  },
  message(peer, message) {
    wsHandler.handleMessage(peer, message)
  },
  close(peer) {
    wsHandler.handleClose(peer)
  },
})
```

```typescript
// composables/useLens.ts
import { createClient } from '@sylphx/lens-vue'
import { route, http, ws } from '@sylphx/lens-client'
import type { AppRouter } from '~/server/router'

export const useLens = () => {
  const config = useRuntimeConfig()

  return createClient<AppRouter>({
    transport: route({
      query: http({ url: '/api/lens' }),
      mutation: http({ url: '/api/lens' }),
      subscription: ws({ url: config.public.wsUrl }),
    }),
  })
}
```

## Complete Example

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
const client = useLens()

const { data: users } = client.user.list.useQuery()

const createMutation = client.user.create.useMutation()

async function createUser(name: string) {
  await createMutation.mutate({
    input: { name, email: `${name.toLowerCase()}@example.com` },
  })
}
</script>

<template>
  <div>
    <h1>Users</h1>
    <ul>
      <li v-for="user in users" :key="user.id">
        {{ user.name }} - {{ user.email }}
      </li>
    </ul>

    <form @submit.prevent="createUser($event.target.name.value)">
      <input name="name" placeholder="Name" required />
      <button type="submit" :disabled="createMutation.loading">
        {{ createMutation.loading ? 'Creating...' : 'Create User' }}
      </button>
    </form>
  </div>
</template>
```

```vue
<!-- pages/user/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const client = useLens()

const { data: user, pending } = client.user.get.useQuery(
  computed(() => ({
    input: { id: route.params.id as string },
  }))
)
</script>

<template>
  <div v-if="pending">Loading...</div>
  <div v-else-if="user">
    <h1>{{ user.name }}</h1>
    <p>{{ user.email }}</p>
  </div>
</template>
```

## Best Practices

### 1. Use Composables

```typescript
// ✅ Good: Composable for reusability
export const useLens = () => createClient(...)

// In component
const client = useLens()
```

### 2. SSR with useAsyncData

```vue
<script setup>
// ✅ Good: SSR-friendly
const { data } = await useAsyncData('key', () =>
  serverLens.user.get({ input: { id } })
)

// ❌ Bad: Client-only in setup
const data = await client.user.get({ input: { id } })
</script>
```

### 3. Type Your Routes

```typescript
// ✅ Good: Import types from server
import type { AppRouter } from '~/server/router'

const client = createClient<AppRouter>({...})
```
