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

// Define operations (not CRUD-locked!)
const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())

const searchUsers = query()
  .input(z.object({ query: z.string() }))
  .returns([User])
  .resolve(({ input }) => useDB().user.findMany({
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
bun add @sylphx/core @sylphx/server @sylphx/client

# Framework adapters
bun add @sylphx/react      # React hooks
bun add @sylphx/solid      # SolidJS primitives
bun add @sylphx/vue        # Vue composables
bun add @sylphx/svelte     # Svelte stores
```

---

## Quick Start

### 1. Define Schema

```typescript
// schema/entities.ts
import { entity, t } from '@sylphx/core'

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
import { relation, hasMany, belongsTo } from '@sylphx/core'
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

### 3. Define Operations

```typescript
// operations/queries.ts
import { query } from '@sylphx/core'
import { z } from 'zod'
import { User, Post } from '../schema/entities'

// No input required
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())

// With input
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => useDB().user.findUnique({
    where: { id: input.id }
  }))

// Custom logic
export const searchUsers = query()
  .input(z.object({ query: z.string(), limit: z.number().optional() }))
  .returns([User])
  .resolve(({ input }) => useDB().user.findMany({
    where: { name: { contains: input.query } },
    take: input.limit ?? 10,
  }))
```

```typescript
// operations/mutations.ts
import { mutation } from '@sylphx/core'
import { z } from 'zod'
import { Post } from '../schema/entities'

// "createPost" → auto 'create' optimistic (from naming convention!)
export const createPost = mutation()
  .input(z.object({ title: z.string(), content: z.string() }))
  .returns(Post)
  // No .optimistic() needed - auto-derived from "createPost" name!
  .resolve(({ input }) => {
    return useDB().post.create({
      data: { ...input, authorId: useCurrentUser().id },
    })
  })

// "updatePost" → auto 'merge' optimistic
export const updatePost = mutation()
  .input(z.object({ id: z.string(), title: z.string().optional() }))
  .returns(Post)
  .resolve(({ input }) => useDB().post.update({
    where: { id: input.id },
    data: input,
  }))
```

### 4. Define Entity Resolvers

```typescript
// resolvers/index.ts
import { entityResolvers } from '@sylphx/core'

export const resolvers = entityResolvers({
  User: {
    posts: (user) => useDB().post.findMany({
      where: { authorId: user.id }
    }),
  },
  Post: {
    author: (post) => useDB().user.findUnique({
      where: { id: post.authorId }
    }),
  },
})
```

### 5. Create Server

```typescript
// server.ts
import { createServer } from '@sylphx/server'
import * as entities from './schema/entities'
import { relations } from './schema/relations'
import * as queries from './operations/queries'
import * as mutations from './operations/mutations'
import { resolvers } from './resolvers'

export const server = createServer({
  entities,
  relations,
  queries,
  mutations,
  resolvers,
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
  }),
})

// Export router type for client
export type AppRouter = typeof server.router

server.listen(3000)
```

### 6. Create Client

```typescript
// client.ts
import { createClient, httpLink, websocketLink } from '@sylphx/client'
import type { AppRouter } from './server'

// Type-safe client with tRPC-style links
export const client = createClient<AppRouter>({
  links: [
    httpLink({ url: '/api' }),
    // Or for real-time:
    // websocketLink({ url: 'ws://localhost:3000' }),
  ],
})

// Direct usage (async/await)
const me = await client.queries.whoami()
const user = await client.queries.user({ id: '123' })
const result = await client.mutations.createPost({ title: 'Hello', content: 'World' })
```

### 7. Use in React

```tsx
// App.tsx
import { createClient, httpLink } from '@sylphx/client'
import { LensProvider } from '@sylphx/react'
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
import { useQuery, useMutation, useLensClient } from '@sylphx/react'
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
import { createClient, httpLink } from '@sylphx/client'
import { LensProvider, useQuery, useMutation, useLazyQuery, useLensClient } from '@sylphx/react'
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
import { createClient, httpLink } from '@sylphx/client'
import { LensProvider, createQuery, createMutation, createLazyQuery, useLensClient } from '@sylphx/solid'
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
import { createClient, httpLink } from '@sylphx/client'
import { provideLensClient, useQuery, useMutation, useLazyQuery, useLensClient } from '@sylphx/vue'
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
import { useLensClient, useQuery, useMutation, useLazyQuery } from '@sylphx/vue'
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
  import { createClient, httpLink } from '@sylphx/client'
  import { provideLensClient, query, mutation, lazyQuery, useLensClient } from '@sylphx/svelte'
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
  import { useLensClient, query, mutation, lazyQuery } from '@sylphx/svelte'
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
} from '@sylphx/client'

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
import { Link, LinkFn } from '@sylphx/client'

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
import { entity, t } from '@sylphx/core'

// Name derived from export key (recommended)
export const User = entity({
  // Primitives
  id: t.id(),                    // string (required)
  name: t.string(),              // string
  age: t.int(),                  // number (integer)
  score: t.float(),              // number
  active: t.boolean(),           // boolean

  // Date/Time
  createdAt: t.datetime(),       // Date (ISO string)
  birthDate: t.date(),           // Date (date only)

  // Large Numbers
  balance: t.decimal(),          // Decimal (string)
  bigValue: t.bigint(),          // BigInt (string)

  // Binary
  avatar: t.bytes(),             // Uint8Array (base64)

  // Enums
  role: t.enum(['user', 'admin']),

  // JSON
  metadata: t.json(),            // any

  // Optional
  bio: t.string().optional(),    // string | null

  // Computed (isomorphic - runs client + server)
  slug: t.string().compute(u => slugify(u.name)),

  // Default (isomorphic)
  createdAt: t.datetime().default(() => new Date()),
})
```

### Type-Safe Relations

```typescript
import { relation, hasMany, belongsTo, hasOne } from '@sylphx/core'

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
import { query } from '@sylphx/core'
import { z } from 'zod'

// No input
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())

// With input
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => useDB().user.findUnique({
    where: { id: input.id }
  }))

// Returns array
export const recentPosts = query()
  .input(z.object({ limit: z.number().default(10) }))
  .returns([Post])
  .resolve(({ input }) => useDB().post.findMany({
    orderBy: { createdAt: 'desc' },
    take: input.limit,
  }))

// Streaming (real-time)
export const activeUsers = query()
  .returns([User])
  .resolve(async function* () {
    yield await useDB().user.findMany({ where: { active: true } })

    for await (const event of useRedis().subscribe('user:active')) {
      yield event.users
    }
  })
```

### Mutation

```typescript
import { mutation } from '@sylphx/core'
import { z } from 'zod'

// Simple mutation - auto 'create' optimistic from naming convention!
export const createPost = mutation()
  .input(z.object({ title: z.string(), content: z.string() }))
  .returns(Post)
  .resolve(({ input }) => useDB().post.create({ data: input }))

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
  .resolve(async ({ input }) => {
    const users = await Promise.all(
      input.userIds.map(id =>
        useDB().user.update({ where: { id }, data: { role: input.newRole } })
      )
    )
    const notifications = await Promise.all(
      input.userIds.map(userId =>
        useDB().notification.create({
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
import { entityResolvers } from '@sylphx/core'

export const resolvers = entityResolvers({
  User: {
    posts: (user) => useDB().post.findMany({
      where: { authorId: user.id }
    }),
    comments: (user) => useDB().comment.findMany({
      where: { authorId: user.id }
    }),
  },

  Post: {
    author: (post) => useDB().user.findUnique({
      where: { id: post.authorId }
    }),
    comments: (post) => useDB().comment.findMany({
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
        const authors = await useDB().user.findMany({
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

// In operations - use composables
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())  // Clean!

export const createPost = mutation()
  .input(...)
  .resolve(({ input }) => {
    const db = useDB()
    const user = useCurrentUser()
    return db.post.create({ data: { ...input, authorId: user.id } })
  })
```

### Explicit Context (Fallback)

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
.resolve(({ input }) => useDB().user.findUnique({ where: { id: input.id } }))

// 2. Generator - Sequential streaming
.resolve(async function* ({ input }) {
  yield await useDB().user.findUnique({ where: { id: input.id } })

  for await (const event of useRedis().subscribe(`user:${input.id}`)) {
    yield event
  }
})

// 3. Emit - Event-driven
.resolve(({ input, emit, onCleanup }) => {
  emit(initialData)

  const handler = (data) => emit(data)
  useRedis().subscribe(`user:${input.id}`, handler)

  onCleanup(() => useRedis().unsubscribe(`user:${input.id}`, handler))
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
  .resolve(({ input }) => useDB().post.update({
    where: { id: input.id },
    data: { title: input.title },
  }))

// "createPost" → auto 'create' with tempId
export const createPost = mutation()
  .input(z.object({ title: z.string() }))
  .returns(Post)
  .resolve(({ input }) => useDB().post.create({ data: input }))

// "deletePost" → auto 'delete'
export const deletePost = mutation()
  .input(z.object({ id: z.string() }))
  .returns(Post)
  .resolve(({ input }) => useDB().post.delete({ where: { id: input.id } }))
```

### Explicit DSL (for edge cases)

```typescript
// "publishPost" doesn't match convention, needs explicit DSL
export const publishPost = mutation()
  .input(z.object({ id: z.string() }))
  .returns(Post)
  .optimistic({ merge: { published: true } })  // Set extra field
  .resolve(({ input }) => useDB().post.update({
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
t.id(), t.string(), ...         // Field types
hasMany(Entity, accessor)       // One-to-many
belongsTo(Entity, accessor)     // Many-to-one

// Operations (names derived from export keys!)
query()                         // Create query builder (name from export key)
query(name)                     // Create query builder (explicit name)
  .input(zodSchema)             // Input validation (optional)
  .returns(Entity | [Entity])   // Return type
  .resolve(fn)                  // Resolver function

mutation()                      // Create mutation builder (name from export key)
mutation(name)                  // Create mutation builder (explicit name)
  .input(zodSchema)             // Input validation
  .returns(Entity | { ... })    // Return type
  .optimistic(spec)             // Optimistic prediction (optional - auto-derived!)
  .resolve(fn)                  // Resolver function

// Auto-Optimistic from Naming Convention
// updateX → auto 'merge' (no .optimistic() needed)
// createX/addX → auto 'create'
// deleteX/removeX → auto 'delete'

// Explicit Optimistic DSL (for edge cases)
.optimistic('merge')                        // Merge input into entity
.optimistic('create')                       // Create with auto tempId
.optimistic('delete')                       // Mark as deleted
.optimistic({ merge: { published: true } }) // Merge with extra fields
.optimistic({ create: { status: 'draft' }}) // Create with extra fields

// Client
createClient<AppRouter>({ links: [...] })   // Create type-safe client
client.queries.operationName(input)         // Execute query
client.mutations.operationName(input)       // Execute mutation

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

// Context
useContext()                    // Get full context
useDB()                         // Get database
useCurrentUser()                // Get current user

// Helpers
tempId()                        // Generate temporary ID for optimistic
```

---

## Package Structure

| Package | Description |
|---------|-------------|
| `@sylphx/core` | Schema, operations, types (zero deps) |
| `@sylphx/server` | Execution engine, GraphStateManager |
| `@sylphx/client` | Client API, links, reactive store |
| `@sylphx/react` | React hooks |
| `@sylphx/solid` | SolidJS primitives |
| `@sylphx/vue` | Vue composables |
| `@sylphx/svelte` | Svelte stores |

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
