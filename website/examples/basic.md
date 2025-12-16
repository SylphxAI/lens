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
import { lens, id, string, date, boolean, list, nullable } from '@sylphx/lens-core'
import type { AppContext } from './context'

const { model } = lens<AppContext>()

export const User = model('User', {
  id: id(),
  name: string(),
  email: string(),
  createdAt: date(),

  // Computed field
  displayName: string(),

  // Relation
  posts: list(() => Post),
}).resolve({
  displayName: ({ source }) =>
    source.name || source.email.split('@')[0],
  posts: ({ source, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: source.id } }),
})

export const Post = model('Post', {
  id: id(),
  title: string(),
  content: string().optional(),
  published: boolean(),
  createdAt: date(),

  // Relation
  author: () => User,
}).resolve({
  author: ({ source, ctx }) =>
    ctx.db.user.findUnique({ where: { id: source.authorId } }),
})
```

### Router

```typescript
// server/router.ts
import { lens, list } from '@sylphx/lens-core'
import { z } from 'zod'
import { User, Post } from './models'
import type { AppContext } from './context'

const { router, query, mutation } = lens<AppContext>()

export const appRouter = router({
  user: {
    list: query()
      .returns(list(User))
      .resolve(({ ctx }) => ctx.db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) =>
        ctx.db.user.findUniqueOrThrow({ where: { id: input.id } })
      ),

    create: mutation()
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
    list: query()
      .input(z.object({
        published: z.boolean().optional(),
        authorId: z.string().optional(),
      }).optional())
      .returns(list(Post))
      .resolve(({ input, ctx }) =>
        ctx.db.post.findMany({
          where: {
            published: input?.published,
            authorId: input?.authorId,
          },
        })
      ),

    get: query()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) =>
        ctx.db.post.findUniqueOrThrow({ where: { id: input.id } })
      ),

    create: mutation()
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

    publish: mutation()
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
