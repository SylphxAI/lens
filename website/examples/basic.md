# Basic Example

A complete example of a simple Lens application.

## Project Structure

```
my-app/
├── server/
│   ├── context.ts
│   ├── models.ts
│   ├── router.ts
│   └── index.ts
├── client/
│   └── api.ts
├── components/
│   └── UserList.tsx
└── package.json
```

## Server Setup

### Context

```typescript
// server/context.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface AppContext {
  db: PrismaClient
  user: { id: string; role: 'user' | 'admin' } | null
}

export const createContext = async (req: Request): Promise<AppContext> => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  let user = null

  if (token) {
    // Verify JWT and get user
    user = await verifyToken(token)
  }

  return { db: prisma, user }
}
```

### Models

```typescript
// server/models.ts
import { model } from '@sylphx/lens-core'
import type { AppContext } from './context'

export const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  createdAt: t.date(),

  // Computed field
  displayName: t.string().resolve(({ parent }) =>
    parent.name || parent.email.split('@')[0]
  ),

  // Relation
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: parent.id } })
  ),
}))

export const Post = model<AppContext>('Post', (t) => ({
  id: t.id(),
  title: t.string(),
  content: t.string().optional(),
  published: t.boolean(),
  createdAt: t.date(),

  // Relation
  author: t.one(() => User).resolve(({ parent, ctx }) =>
    ctx.db.user.findUnique({ where: { id: parent.authorId } })
  ),
}))
```

### Router

```typescript
// server/router.ts
import { router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'
import { User, Post } from './models'
import type { AppContext } from './context'

export const appRouter = router({
  user: {
    list: query<AppContext>()
      .returns([User])
      .resolve(({ ctx }) => ctx.db.user.findMany()),

    get: query<AppContext>()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) =>
        ctx.db.user.findUniqueOrThrow({ where: { id: input.id } })
      ),

    create: mutation<AppContext>()
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
      }))
      .returns(User)
      .resolve(({ input, ctx }) =>
        ctx.db.user.create({ data: input })
      ),
  },

  post: {
    list: query<AppContext>()
      .input(z.object({
        published: z.boolean().optional(),
        authorId: z.string().optional(),
      }).optional())
      .returns([Post])
      .resolve(({ input, ctx }) =>
        ctx.db.post.findMany({
          where: {
            published: input?.published,
            authorId: input?.authorId,
          },
        })
      ),

    get: query<AppContext>()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) =>
        ctx.db.post.findUniqueOrThrow({ where: { id: input.id } })
      ),

    create: mutation<AppContext>()
      .input(z.object({
        title: z.string(),
        content: z.string().optional(),
      }))
      .returns(Post)
      .resolve(({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated')
        return ctx.db.post.create({
          data: {
            ...input,
            authorId: ctx.user.id,
            published: false,
          },
        })
      }),

    publish: mutation<AppContext>()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(async ({ input, ctx }) => {
        const post = await ctx.db.post.findUnique({ where: { id: input.id } })
        if (!post) throw new Error('Post not found')
        if (post.authorId !== ctx.user?.id) throw new Error('Not authorized')

        return ctx.db.post.update({
          where: { id: input.id },
          data: { published: true },
        })
      }),
  },
})

export type AppRouter = typeof appRouter
```

### Server

```typescript
// server/index.ts
import { createApp, createHTTPHandler } from '@sylphx/lens-server'
import { appRouter } from './router'
import { createContext } from './context'

const app = createApp({
  router: appRouter,
  context: createContext,
})

const handler = createHTTPHandler(app, {
  pathPrefix: '/api',
  cors: { origin: '*' },
})

Bun.serve({
  port: 3000,
  fetch: handler,
})

console.log('Server running at http://localhost:3000')
```

## Client Setup

```typescript
// client/api.ts
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: 'http://localhost:3000/api' }),
})
```

## React Components

```tsx
// components/UserList.tsx
import { client } from '../client/api'

export function UserList() {
  const { data: users, loading, error } = client.user.list.useQuery()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {users?.map(user => (
        <li key={user.id}>
          <a href={`/user/${user.id}`}>{user.displayName}</a>
        </li>
      ))}
    </ul>
  )
}
```

```tsx
// components/UserProfile.tsx
import { client } from '../client/api'

export function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading } = client.user.get.useQuery({
    input: { id: userId },
    select: {
      displayName: true,
      email: true,
      posts: {
        select: {
          id: true,
          title: true,
          published: true,
        },
      },
    },
  })

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <h1>{user?.displayName}</h1>
      <p>{user?.email}</p>

      <h2>Posts</h2>
      <ul>
        {user?.posts.map(post => (
          <li key={post.id}>
            {post.title}
            {!post.published && <span> (draft)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```tsx
// components/CreatePost.tsx
import { useState } from 'react'
import { client } from '../client/api'

export function CreatePost() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const { mutate, loading, error } = client.post.create.useMutation({
    onSuccess: () => {
      setTitle('')
      setContent('')
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await mutate({ input: { title, content } })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Post'}
      </button>
      {error && <p className="error">{error.message}</p>}
    </form>
  )
}
```

## Running the Example

```bash
# Install dependencies
bun install

# Start database
docker compose up -d

# Run migrations
bunx prisma migrate dev

# Start server
bun run server/index.ts

# Start client (in another terminal)
bun run dev
```
