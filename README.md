# Lens

> **The Reactive Graph API Framework**

TypeScript-first • Real-time Native • Zero Codegen

```typescript
// Define schema (name derived from export key!)
export const User = entity({
  id: t.id(),
  name: t.string(),
  role: t.enum(['user', 'admin']),
})

// Define operations (ctx passed directly - tRPC style!)
const whoami = query()
  .returns(User)
  .resolve(({ ctx }) => ctx.currentUser)

const searchUsers = query()
  .input(z.object({ query: z.string() }))
  .returns([User])
  .resolve(({ input, ctx }) => ctx.db.user.findMany({
    where: { name: { contains: input.query } }
  }))

// Use on client
const me = await api.whoami()
const results = await api.searchUsers({ query: 'john' })
```

---

## Why Lens?

### The Problem

Building real-time, type-safe APIs is hard:

- **GraphQL**: Powerful but requires SDL + codegen, two sources of truth
- **tRPC**: Great DX but no entity model, no nested resolution, no real-time
- **REST**: No type safety, over-fetching, manual subscriptions

### The Solution

Lens brings GraphQL concepts to TypeScript:

| Feature | GraphQL | tRPC | **Lens** |
|---------|---------|------|----------|
| Type Safety | Codegen | ✅ | ✅ |
| Code-first | SDL-first | ✅ | ✅ |
| Free Operations | ✅ | ✅ | ✅ |
| Nested Resolution | ✅ | ❌ | ✅ |
| Real-time | Addon | Manual | **Native** |
| Optimistic Updates | Manual | Manual | **Auto** |
| Codegen Required | Yes | No | **No** |

---

## Core Concepts

### Three-Layer Architecture

```
Operations        →  Entry points (any query/mutation)
                     whoami, searchUsers, createPost, promoteBatch

Entity Resolvers  →  Nested data handling (reused everywhere)
                     User.posts, Post.author, Comment.replies

Schema            →  Structure + Relations only
                     Pure type definitions
```

**Why?** GraphQL separates Query/Mutation (operations) from type resolvers (nested handling). Lens does the same.

---

## Installation

```bash
bun add @sylphx/lens-core @sylphx/lens-server @sylphx/lens-client

# Framework adapters
bun add @sylphx/lens-react      # React hooks
bun add @sylphx/lens-solid      # SolidJS primitives
bun add @sylphx/lens-vue        # Vue composables
bun add @sylphx/lens-svelte     # Svelte stores
```

---

## Quick Start

### 1. Define Schema

```typescript
// schema/entities.ts
import { entity, t } from '@sylphx/lens-core'

// Name derived from export key (recommended)
export const User = entity({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  role: t.enum(['user', 'admin', 'vip']),
  createdAt: t.datetime().default(() => new Date()),
})

// Or explicit name (for edge cases)
export const Post = entity('Post', {
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
  published: t.boolean().default(() => false),
})
```

### 2. Define Relations

```typescript
// schema/relations.ts
import { relation, hasMany, belongsTo } from '@sylphx/lens-core'
import { User, Post } from './entities'

export const relations = [
  relation(User, {
    posts: hasMany(Post, e => e.authorId),  // Type-safe!
  }),
  relation(Post, {
    author: belongsTo(User, e => e.authorId),
  }),
]
```

### 3. Define Operations (Router-based - Recommended)

Use `router()` to organize operations into namespaces for better organization:

```typescript
// router.ts
import { router, query, mutation } from '@sylphx/lens-core'
import { z } from 'zod'
import { User, Post } from './schema/entities'

export const appRouter = router({
  user: router({
    // client.user.me()
    me: query()
      .returns(User)
      .resolve(({ ctx }) => ctx.currentUser),

    // client.user.get({ id: "1" })
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.findUnique({
        where: { id: input.id }
      })),

    // client.user.search({ query: "john" })
    search: query()
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .returns([User])
      .resolve(({ input, ctx }) => ctx.db.user.findMany({
        where: { name: { contains: input.query } },
        take: input.limit ?? 10,
      })),
  }),

  post: router({
    // client.post.get({ id: "1" })
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.findUnique({
        where: { id: input.id }
      })),

    // client.post.create({ title: "Hello", content: "World" })
    // "create" → auto 'create' optimistic (from naming convention!)
    create: mutation()
      .input(z.object({ title: z.string(), content: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.create({
        data: { ...input, authorId: ctx.currentUser.id },
      })),

    // client.post.update({ id: "1", title: "Updated" })
    // "update" → auto 'merge' optimistic
    update: mutation()
      .input(z.object({ id: z.string(), title: z.string().optional() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.update({
        where: { id: input.id },
        data: input,
      })),
  }),
})

export type AppRouter = typeof appRouter
```

<details>
<summary>Flat Operations (Legacy)</summary>

```typescript
// operations/queries.ts
import { query } from '@sylphx/lens-core'
import { z } from 'zod'
import { User, Post } from '../schema/entities'

// No input required
export const whoami = query()
  .returns(User)
  .resolve(({ ctx }) => ctx.currentUser)

// With input
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.user.findUnique({
    where: { id: input.id }
  }))
```

```typescript
// operations/mutations.ts
import { mutation } from '@sylphx/lens-core'
import { z } from 'zod'
import { Post } from '../schema/entities'

export const createPost = mutation()
  .input(z.object({ title: z.string(), content: z.string() }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.create({
    data: { ...input, authorId: ctx.currentUser.id },
  }))
```

</details>

### 4. Define Entity Resolvers

```typescript
// resolvers/index.ts
import { entityResolvers } from '@sylphx/lens-core'

export const resolvers = entityResolvers({
  User: {
    posts: (user) => ctx.db.post.findMany({
      where: { authorId: user.id }
    }),
  },
  Post: {
    author: (post) => ctx.db.user.findUnique({
      where: { id: post.authorId }
    }),
  },
})
```

### 5. Create Server

```typescript
// server.ts
import { createServer } from '@sylphx/lens-server'
import * as entities from './schema/entities'
import { relations } from './schema/relations'
import { appRouter } from './router'
import { resolvers } from './resolvers'

export const server = createServer({
  entities,
  relations,
  router: appRouter,  // Use router for namespaced operations
  resolvers,
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
  }),
})

server.listen(3000)
```

### 6. Create Client

```typescript
// client.ts
import { createClient, httpLink, websocketLink, RouterApiShape } from '@sylphx/lens-client'
import type { AppRouter } from './router'

// Type-safe client with namespaced operations
export const client = createClient<RouterApiShape<AppRouter>>({
  links: [
    httpLink({ url: '/api' }),
    // Or for real-time:
    // websocketLink({ url: 'ws://localhost:3000' }),
  ],
})

// Namespaced usage (async/await)
const me = await client.user.me()
const user = await client.user.get({ id: '123' })
const post = await client.post.create({ title: 'Hello', content: 'World' })
```

### 7. Use in React

```tsx
// App.tsx
import { createClient, httpLink } from '@sylphx/lens-client'
import { LensProvider } from '@sylphx/lens-react'
import type { AppRouter } from './server'

const client = createClient<AppRouter>({
  links: [httpLink({ url: '/api' })],
})

function App() {
  return (
    <LensProvider client={client}>
      <UserProfile />
    </LensProvider>
  )
}
```

```tsx
// components/UserProfile.tsx
import { useQuery, useMutation, useLensClient } from '@sylphx/lens-react'
import type { AppRouter } from './server'

function UserProfile() {
  const client = useLensClient<AppRouter>()
  const { data: me, loading, error } = useQuery(client.queries.whoami())

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>Welcome, {me?.name}!</div>
}

function SearchUsers() {
  const client = useLensClient<AppRouter>()
  const [query, setQuery] = useState('')
  const { data: users } = useQuery(client.queries.searchUsers({ query }))

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ul>
        {users?.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
    </div>
  )
}

function CreatePost() {
  const client = useLensClient<AppRouter>()
  const { mutate, loading } = useMutation(client.mutations.createPost)

  return (
    <button
      disabled={loading}
      onClick={() => mutate({ title: 'Hello', content: 'World' })}
    >
      Create Post
    </button>
  )
}
```

---

## Framework Adapters

### React

```tsx
import { createClient, httpLink } from '@sylphx/lens-client'
import { LensProvider, useQuery, useMutation, useLazyQuery, useLensClient } from '@sylphx/lens-react'
import type { AppRouter } from './server'

const client = createClient<AppRouter>({
  links: [httpLink({ url: '/api' })],
})

// Wrap app with provider
function App() {
  return (
    <LensProvider client={client}>
      <MyComponent />
    </LensProvider>
  )
}

// Use hooks in components
function MyComponent() {
  const client = useLensClient<AppRouter>()

  // Query - executes immediately
  const { data, loading, error, refetch } = useQuery(client.queries.whoami())

  // Mutation - returns mutate function
  const { mutate, loading: mutating } = useMutation(client.mutations.createPost)

  // Lazy query - executes on demand
  const { execute, data: searchData } = useLazyQuery(client.queries.searchUsers)

  return (
    <button onClick={() => execute({ query: 'john' })}>
      Search
    </button>
  )
}
```

### SolidJS

```tsx
import { createClient, httpLink } from '@sylphx/lens-client'
import { LensProvider, createQuery, createMutation, createLazyQuery, useLensClient } from '@sylphx/lens-solid'
import type { AppRouter } from './server'

const client = createClient<AppRouter>({
  links: [httpLink({ url: '/api' })],
})

// Wrap app with provider
function App() {
  return (
    <LensProvider client={client}>
      <MyComponent />
    </LensProvider>
  )
}

// Use primitives in components
function MyComponent() {
  const client = useLensClient<AppRouter>()

  // Query - reactive signals
  const { data, loading, error, refetch } = createQuery(() => client.queries.whoami())

  // Mutation
  const { mutate, loading: mutating } = createMutation(() => client.mutations.createPost)

  // Lazy query
  const { execute, data: searchData } = createLazyQuery(() => client.queries.searchUsers)

  return (
    <Show when={!loading()} fallback={<div>Loading...</div>}>
      <div>Welcome, {data()?.name}!</div>
    </Show>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { createClient, httpLink } from '@sylphx/lens-client'
import { provideLensClient, useQuery, useMutation, useLazyQuery, useLensClient } from '@sylphx/lens-vue'
import type { AppRouter } from './server'

// In root component - provide client
const client = createClient<AppRouter>({
  links: [httpLink({ url: '/api' })],
})
provideLensClient(client)
</script>
```

```vue
<script setup lang="ts">
import { useLensClient, useQuery, useMutation, useLazyQuery } from '@sylphx/lens-vue'
import type { AppRouter } from './server'

const client = useLensClient<AppRouter>()

// Query - reactive refs
const { data, loading, error, refetch } = useQuery(() => client.queries.whoami())

// Mutation
const { mutate, loading: mutating } = useMutation(() => client.mutations.createPost)

// Lazy query
const { execute, data: searchData } = useLazyQuery(() => client.queries.searchUsers)
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else>Welcome, {{ data?.name }}!</div>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { createClient, httpLink } from '@sylphx/lens-client'
  import { provideLensClient, query, mutation, lazyQuery, useLensClient } from '@sylphx/lens-svelte'
  import type { AppRouter } from './server'

  // In root component - provide client
  const client = createClient<AppRouter>({
    links: [httpLink({ url: '/api' })],
  })
  provideLensClient(client)
</script>
```

```svelte
<script lang="ts">
  import { useLensClient, query, mutation, lazyQuery } from '@sylphx/lens-svelte'
  import type { AppRouter } from './server'

  const client = useLensClient<AppRouter>()

  // Query - Svelte stores
  const whoami = query(() => client.queries.whoami())

  // Mutation
  const createPost = mutation(() => client.mutations.createPost)

  // Lazy query
  const search = lazyQuery(() => client.queries.searchUsers)
</script>

{#if $whoami.loading}
  <div>Loading...</div>
{:else}
  <div>Welcome, {$whoami.data?.name}!</div>
{/if}
```

---

## Links

Links are composable middleware for request/response processing (tRPC-style).

### Available Links

```typescript
import {
  // Transport
  httpLink,           // HTTP requests
  websocketLink,      // WebSocket for real-time
  sseLink,            // Server-Sent Events

  // Middleware
  loggerLink,         // Request/response logging
  retryLink,          // Automatic retry with backoff
  batchLink,          // Request batching
  deserializeLink,    // Date/BigInt deserialization

  // Optimization
  dedupLink,          // Request deduplication
  cacheLink,          // Response caching
} from '@sylphx/lens-client'

const client = createClient<AppRouter>({
  links: [
    loggerLink({ enabled: process.env.NODE_ENV === 'development' }),
    retryLink({ maxRetries: 3 }),
    deserializeLink(),
    httpLink({ url: '/api' }),
  ],
})
```

### Custom Links

```typescript
import { Link, LinkFn } from '@sylphx/lens-client'

const timingLink: Link = () => async (op, next) => {
  const start = performance.now()
  const result = await next(op)
  console.log(`${op.path} took ${performance.now() - start}ms`)
  return result
}

const client = createClient<AppRouter>({
  links: [
    timingLink,
    httpLink({ url: '/api' }),
  ],
})
```

---

## Schema

### Entity Definition

```typescript
import { entity, t } from '@sylphx/lens-core'

// Name derived from export key (recommended)
export const User = entity({
  // Primitives
  id: t.id(),                    // string (required)
  name: t.string(),              // string
  age: t.int(),                  // number (integer)
  score: t.float(),              // number
  active: t.boolean(),           // boolean

  // Date/Time
  createdAt: t.datetime(),       // Date (serialized as ISO string)
  birthDate: t.date(),           // Date (serialized as YYYY-MM-DD)

  // Large Numbers
  balance: t.decimal(),          // number (serialized as string for precision)
  bigValue: t.bigint(),          // bigint (serialized as string)

  // Binary
  avatar: t.bytes(),             // Uint8Array (serialized as base64)

  // Enums
  role: t.enum(['user', 'admin']),

  // JSON (schemaless)
  metadata: t.json(),            // unknown

  // Typed object
  settings: t.object<{ theme: string; notifications: boolean }>(),

  // Modifiers
  bio: t.string().nullable(),    // string | null (value can be null)
  nickname: t.string().optional(), // string | undefined (field may not exist)

  // Default value
  createdAt: t.datetime().default(() => new Date()),
})
```

### Custom Types

Define reusable custom types with `defineType()`:

```typescript
import { defineType, t } from '@sylphx/lens-core'

// Define a reusable custom type
const Point = defineType({
  name: 'Point',
  // Serialize: runtime value → JSON-safe transport
  serialize: (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng }),
  // Deserialize: transport → runtime value
  deserialize: (data) => ({ lat: data.lat, lng: data.lng }),
  // Optional validation
  validate: (v) => typeof v === 'object' && 'lat' in v && 'lng' in v,
})

// Use in entity
export const Store = entity({
  id: t.id(),
  name: t.string(),
  location: t.custom(Point),  // ✅ Reusable!
})

export const Event = entity({
  id: t.id(),
  title: t.string(),
  venue: t.custom(Point),     // ✅ Same type!
})
```

**Why `defineType()`?**
- Reusability - define once, use in multiple entities
- Consistency - same serialization logic everywhere
- Type safety - TypeScript infers correct types
- Shareable - create type libraries as packages

### Type-Safe Relations

```typescript
import { relation, hasMany, belongsTo, hasOne } from '@sylphx/lens-core'

const relations = [
  relation(User, {
    posts: hasMany(Post, e => e.authorId),      // One-to-many
    profile: hasOne(Profile, e => e.userId),    // One-to-one
  }),

  relation(Post, {
    author: belongsTo(User, e => e.authorId),   // Many-to-one
    comments: hasMany(Comment, e => e.postId),
  }),
]
```

**Why `e => e.authorId` instead of `'authorId'`?**
- TypeScript validates the field exists
- Refactoring works automatically
- No typos possible

---

## Operations

Operations define entry points. They are NOT limited to CRUD.

### Query

```typescript
import { query } from '@sylphx/lens-core'
import { z } from 'zod'

// No input
export const whoami = query()
  .returns(User)
  .resolve(({ ctx }) => ctx.currentUser)

// With input
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.user.findUnique({
    where: { id: input.id }
  }))

// Returns array
export const recentPosts = query()
  .input(z.object({ limit: z.number().default(10) }))
  .returns([Post])
  .resolve(({ input, ctx }) => ctx.db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: input.limit,
  }))

// Streaming (real-time)
export const activeUsers = query()
  .returns([User])
  .resolve(async function* () {
    yield await ctx.db.user.findMany({ where: { active: true } })

    for await (const event of ctx.redis.subscribe('user:active')) {
      yield event.users
    }
  })
```

### Mutation

```typescript
import { mutation } from '@sylphx/lens-core'
import { z } from 'zod'

// Simple mutation - auto 'create' optimistic from naming convention!
export const createPost = mutation()
  .input(z.object({ title: z.string(), content: z.string() }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }))

// Multi-entity mutation
export const promoteSomeUsers = mutation()
  .input(z.object({
    userIds: z.array(z.string()),
    newRole: z.enum(['admin', 'vip']),
  }))
  .returns({
    users: [User],
    notifications: [Notification],
  })
  .optimistic(({ input }) => ({
    users: input.userIds.map(id => ({ id, role: input.newRole })),
    notifications: input.userIds.map(id => ({
      id: tempId(),
      userId: id,
      message: `Promoted to ${input.newRole}!`,
    })),
  }))
  .resolve(async ({ input, ctx }) => {
    const users = await Promise.all(
      input.userIds.map(id =>
        ctx.db.user.update({ where: { id }, data: { role: input.newRole } })
      )
    )
    const notifications = await Promise.all(
      input.userIds.map(userId =>
        ctx.db.notification.create({
          data: { userId, message: `Promoted to ${input.newRole}!` }
        })
      )
    )
    return { users, notifications }
  })
```

---

## Entity Resolvers

Entity Resolvers handle nested data. They are **reused across ALL operations**.

```typescript
import { entityResolvers } from '@sylphx/lens-core'

export const resolvers = entityResolvers({
  User: {
    posts: (user) => ctx.db.post.findMany({
      where: { authorId: user.id }
    }),
    comments: (user) => ctx.db.comment.findMany({
      where: { authorId: user.id }
    }),
  },

  Post: {
    author: (post) => ctx.db.user.findUnique({
      where: { id: post.authorId }
    }),
    comments: (post) => ctx.db.comment.findMany({
      where: { postId: post.id }
    }),
  },
})
```

### Batching (N+1 Prevention)

```typescript
export const resolvers = entityResolvers({
  Post: {
    author: {
      batch: async (posts) => {
        const authorIds = [...new Set(posts.map(p => p.authorId))]
        const authors = await ctx.db.user.findMany({
          where: { id: { in: authorIds } }
        })
        const authorMap = new Map(authors.map(a => [a.id, a]))
        return posts.map(p => authorMap.get(p.authorId))
      },
    },
  },
})
```

### Why Separate from Operations?

**Reusability:**
```typescript
// All three use the SAME User.posts resolver
const user = await api.user({ id: '1' }).select({ posts: true })
const users = await api.searchUsers({ query: 'john' }).select({ posts: true })
const me = await api.whoami().select({ posts: true })
```

---

## Context System

### AsyncLocalStorage (Recommended)

```typescript
// Server setup
const server = createServer({
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
  }),
})

// In operations - ctx is passed directly (tRPC style!)
export const whoami = query()
  .returns(User)
  .resolve(({ ctx }) => ctx.currentUser)  // Clean!

export const createPost = mutation()
  .input(...)
  .resolve(({ input, ctx }) => {
    return ctx.db.post.create({ data: { ...input, authorId: ctx.currentUser.id } })
  })
```

### Context Setup

```typescript
export const createPost = mutation()
  .input(...)
  .resolve(({ input, ctx }) => {  // ctx explicitly available
    return ctx.db.post.create({
      data: { ...input, authorId: ctx.currentUser.id }
    })
  })
```

---

## Client Usage

### Queries

```typescript
// Single value
const user = await client.queries.user({ id: '123' })

// With nested data
const user = await client.queries.user({ id: '123' }).select({
  name: true,
  posts: { title: true },
})

// Streaming
client.queries.activeUsers().subscribe(users => {
  console.log('Active users:', users.length)
})
```

### Mutations

```typescript
// Optimistic by default
await client.mutations.createPost({ title: 'Hello', content: 'World' })

// Multi-entity
const { users, notifications } = await client.mutations.promoteSomeUsers({
  userIds: ['1', '2', '3'],
  newRole: 'admin',
})
```

---

## Reactive System

### Three Resolver Patterns

```typescript
// 1. Return - Single value
.resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }))

// 2. Generator - Sequential streaming
.resolve(async function* ({ input }) {
  yield await ctx.db.user.findUnique({ where: { id: input.id } })

  for await (const event of ctx.redis.subscribe(`user:${input.id}`)) {
    yield event
  }
})

// 3. Emit - Event-driven
.resolve(({ input, emit, onCleanup }) => {
  emit(initialData)

  const handler = (data) => emit(data)
  ctx.redis.subscribe(`user:${input.id}`, handler)

  onCleanup(() => ctx.redis.unsubscribe(`user:${input.id}`, handler))
})
```

---

## Optimistic Updates

### Auto-Derived from Naming Convention (90% of cases!)

```typescript
// "updatePost" → auto 'merge' (no .optimistic() needed!)
export const updatePost = mutation()
  .input(z.object({ id: z.string(), title: z.string() }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.update({
    where: { id: input.id },
    data: { title: input.title },
  }))

// "createPost" → auto 'create' with tempId
export const createPost = mutation()
  .input(z.object({ title: z.string() }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }))

// "deletePost" → auto 'delete'
export const deletePost = mutation()
  .input(z.object({ id: z.string() }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.delete({ where: { id: input.id } }))
```

### Explicit DSL (for edge cases)

```typescript
// "publishPost" doesn't match convention, needs explicit DSL
export const publishPost = mutation()
  .input(z.object({ id: z.string() }))
  .returns(Post)
  .optimistic({ merge: { published: true } })  // Set extra field
  .resolve(({ input, ctx }) => ctx.db.post.update({
    where: { id: input.id },
    data: { published: true },
  }))
```

**Flow:**
1. Client calls mutation
2. Optimistic update predicts result → Update cache immediately
3. Server executes `resolve()`
4. Server response replaces optimistic data
5. On error: Rollback to previous state

---

## API Summary

```typescript
// Schema (names derived from export keys!)
entity(fields)                  // Define entity (name from export key)
entity(name, fields)            // Define entity (explicit name)
relation(entity, relations)     // Define relations
hasMany(Entity, accessor)       // One-to-many
belongsTo(Entity, accessor)     // Many-to-one

// Field Types
t.id()                          // string (primary key)
t.string()                      // string
t.int()                         // number (integer)
t.float()                       // number (floating point)
t.boolean()                     // boolean
t.datetime()                    // Date ↔ ISO string
t.date()                        // Date ↔ YYYY-MM-DD
t.decimal()                     // number ↔ string (precision)
t.bigint()                      // bigint ↔ string
t.bytes()                       // Uint8Array ↔ base64
t.enum(['a', 'b'])              // union type
t.json()                        // unknown (schemaless)
t.object<T>()                   // typed object
t.array(t.string())             // array of type
t.custom(definition)            // custom serialization

// Modifiers
.nullable()                     // T | null (value can be null)
.optional()                     // T | undefined (field may not exist)
.default(value)                 // Default value

// Operations
query()                         // Create query builder
  .input(zodSchema)             // Input validation (optional)
  .returns(Entity | [Entity])   // Return type
  .resolve(fn)                  // Resolver function

mutation()                      // Create mutation builder
  .input(zodSchema)             // Input validation
  .returns(Entity | { ... })    // Return type
  .optimistic(spec)             // Optimistic prediction (optional - auto-derived!)
  .resolve(fn)                  // Resolver function

// Router (namespaced operations - recommended!)
router({                        // Create namespace
  user: router({                // Nested namespace
    get: query()...,            // client.user.get()
    create: mutation()...,      // client.user.create()
  }),
  post: router({ ... }),
})

// Auto-Optimistic from Naming Convention
// update → auto 'merge' (no .optimistic() needed)
// create/add → auto 'create'
// delete/remove → auto 'delete'

// Explicit Optimistic DSL (for edge cases)
.optimistic('merge')                        // Merge input into entity
.optimistic('create')                       // Create with auto tempId
.optimistic('delete')                       // Mark as deleted
.optimistic({ merge: { published: true } }) // Merge with extra fields
.optimistic({ create: { status: 'draft' }}) // Create with extra fields

// Client (with router)
createClient<RouterApiShape<AppRouter>>({ links: [...] })
client.user.get({ id: '1' })               // Namespaced query
client.post.create({ title: 'Hi' })        // Namespaced mutation

// Links
httpLink({ url })               // HTTP transport
websocketLink({ url })          // WebSocket transport
sseLink({ url })                // SSE transport
loggerLink({ enabled })         // Request logging
retryLink({ maxRetries })       // Automatic retry
batchLink({ maxSize, delay })   // Request batching
dedupLink()                     // Request deduplication

// Entity Resolvers
entityResolvers({ Entity: { field: resolver } })

// Context (tRPC-style, passed directly to resolvers)
({ ctx }) =>                   // Access context in resolver
ctx.db                         // Get database
ctx.currentUser                // Get current user

// Helpers
tempId()                        // Generate temporary ID for optimistic
```

---

## Package Structure

| Package | Description |
|---------|-------------|
| `@sylphx/lens-core` | Schema, operations, types (zero deps) |
| `@sylphx/lens-server` | Execution engine, GraphStateManager |
| `@sylphx/lens-client` | Client API, links, reactive store |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-svelte` | Svelte stores |

---

## Documentation

- **[Architecture](./ARCHITECTURE.md)** - Design philosophy and decisions
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Development roadmap

---

## Philosophy

**TypeScript-first:** Same code runs on client and server. No SDL, no codegen.

**Operations are free:** Define any query/mutation, not limited to CRUD.

**Nested is automatic:** Entity resolvers handle nested data, reused everywhere.

**Reactive by default:** Every query can stream, optimistic is built-in.

**Simple > Complex:** No plugins, no unnecessary abstractions.

---

## License

MIT © Sylphx AI

---

## Why "Lens"?

A lens focuses light to create a clear image. Similarly, Lens focuses your data layer to create a clear, type-safe, reactive API. It's the lens through which your frontend views your backend data.
