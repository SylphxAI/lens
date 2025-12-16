# Fresh (Deno) Integration

Lens works with Fresh, Deno's next-gen web framework.

## Installation

```typescript
// Import from npm specifiers
import { createApp, router, query } from "npm:@sylphx/lens-server"
import { createClient, http } from "npm:@sylphx/lens-client"
```

## Server Setup

```typescript
// server/router.ts
import { lens, id, string, router } from "npm:@sylphx/lens-core"
import { z } from "npm:zod"

type AppContext = { db: Database }

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
import { createApp } from "npm:@sylphx/lens-server"
import { appRouter } from "./router.ts"

export const app = createApp({
  router: appRouter,
  context: (req) => ({
    db: kv,  // Deno KV
  }),
})
```

## Fresh Route Handler

```typescript
// routes/api/lens/[...path].ts
import { Handlers } from "$fresh/server.ts"
import { createHTTPHandler } from "npm:@sylphx/lens-server"
import { app } from "../../../server/app.ts"

const handler = createHTTPHandler(app)

export const handler: Handlers = {
  async GET(req) {
    return handler(req)
  },
  async POST(req) {
    return handler(req)
  },
}
```

## Client Setup

```typescript
// lib/client.ts
import { createClient, http } from "npm:@sylphx/lens-client"
import type { AppRouter } from "../server/router.ts"

export const client = createClient<AppRouter>({
  transport: http({ url: "/api/lens" }),
})
```

## Islands (Client Components)

```tsx
// islands/UserProfile.tsx
/** @jsx h */
import { h } from "preact"
import { useSignal, useEffect } from "@preact/signals"
import { client } from "../lib/client.ts"

interface Props {
  userId: string
}

export default function UserProfile({ userId }: Props) {
  const user = useSignal<User | null>(null)
  const loading = useSignal(true)
  const error = useSignal<Error | null>(null)

  useEffect(() => {
    const unsubscribe = client.user.get({ input: { id: userId } })
      .subscribe({
        next: (data) => {
          user.value = data
          loading.value = false
        },
        error: (err) => {
          error.value = err
          loading.value = false
        },
      })

    return unsubscribe
  }, [userId])

  if (loading.value) return <div>Loading...</div>
  if (error.value) return <div>Error: {error.value.message}</div>

  return (
    <div>
      <h1>{user.value?.name}</h1>
      <p>{user.value?.email}</p>
    </div>
  )
}
```

## Server-Side Rendering

```tsx
// routes/user/[id].tsx
/** @jsx h */
import { h } from "preact"
import { Handlers, PageProps } from "$fresh/server.ts"
import { createClient, direct } from "npm:@sylphx/lens-client"
import { app } from "../../server/app.ts"
import type { AppRouter } from "../../server/router.ts"
import UserProfile from "../../islands/UserProfile.tsx"

const serverClient = createClient<AppRouter>({
  transport: direct({ server: app }),
})

interface Data {
  user: User
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const user = await serverClient.user.get({
      input: { id: ctx.params.id },
    })
    return ctx.render({ user })
  },
}

export default function UserPage({ data }: PageProps<Data>) {
  return (
    <div>
      {/* SSR content */}
      <h1>{data.user.name}</h1>

      {/* Client-side island for live updates */}
      <UserProfile userId={data.user.id} />
    </div>
  )
}
```

## Using Deno KV

```typescript
// server/db.ts
const kv = await Deno.openKv()

export const db = {
  user: {
    async find(id: string) {
      const entry = await kv.get(["users", id])
      return entry.value
    },
    async findMany() {
      const entries = kv.list({ prefix: ["users"] })
      const users = []
      for await (const entry of entries) {
        users.push(entry.value)
      }
      return users
    },
    async create(data: { name: string; email: string }) {
      const id = crypto.randomUUID()
      const user = { id, ...data }
      await kv.set(["users", id], user)
      return user
    },
  },
}
```

```typescript
// server/app.ts
import { createApp } from "npm:@sylphx/lens-server"
import { appRouter } from "./router.ts"
import { db } from "./db.ts"

export const app = createApp({
  router: appRouter,
  context: () => ({ db }),
})
```

## Complete Example

```tsx
// routes/index.tsx
/** @jsx h */
import { h } from "preact"
import { Handlers, PageProps } from "$fresh/server.ts"
import { serverClient } from "../lib/server-client.ts"
import UserList from "../islands/UserList.tsx"

interface Data {
  users: User[]
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const users = await serverClient.user.list()
    return ctx.render({ users })
  },
}

export default function Home({ data }: PageProps<Data>) {
  return (
    <div>
      <h1>Users</h1>
      <UserList initialUsers={data.users} />
    </div>
  )
}
```

```tsx
// islands/UserList.tsx
/** @jsx h */
import { h } from "preact"
import { useSignal, useEffect } from "@preact/signals"
import { client } from "../lib/client.ts"

interface Props {
  initialUsers: User[]
}

export default function UserList({ initialUsers }: Props) {
  const users = useSignal(initialUsers)

  useEffect(() => {
    const unsubscribe = client.user.list()
      .subscribe((data) => {
        users.value = data
      })

    return unsubscribe
  }, [])

  return (
    <ul>
      {users.value.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

## Best Practices

### 1. Use npm: Specifiers

```typescript
// ✅ Good: npm specifiers
import { createApp } from "npm:@sylphx/lens-server"

// ❌ Bad: esm.sh (may have issues)
import { createApp } from "https://esm.sh/@sylphx/lens-server"
```

### 2. Separate Server/Client

```typescript
// ✅ Good: Server client for handlers
const serverClient = createClient({
  transport: direct({ server: app }),
})

// ✅ Good: Client for islands
const client = createClient({
  transport: http({ url: "/api/lens" }),
})
```

### 3. Use Islands for Interactivity

```tsx
// ✅ Good: Static page + island for live data
export default function Page({ data }) {
  return (
    <div>
      <StaticContent data={data} />
      <LiveDataIsland /> {/* Client-side */}
    </div>
  )
}
```
