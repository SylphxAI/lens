# Next.js Integration

Lens integrates seamlessly with Next.js for both client and server-side usage.

## Installation

```bash
npm install @sylphx/lens-react @sylphx/lens-server
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
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

## API Route (App Router)

```typescript
// app/api/lens/[...path]/route.ts
import { createHTTPHandler } from '@sylphx/lens-server'
import { app } from '@/server/app'

const handler = createHTTPHandler(app)

export const GET = handler
export const POST = handler
```

## Client Setup

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-react'
import { http } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api/lens' }),
})
```

## Client Components

```tsx
// components/UserProfile.tsx
'use client'

import { client } from '@/lib/client'

export function UserProfile({ userId }: { userId: string }) {
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

## Server Components

Use direct transport for server-side rendering:

```typescript
// lib/server-client.ts
import { createClient, direct } from '@sylphx/lens-client'
import { app } from '@/server/app'
import type { AppRouter } from '@/server/router'

export const serverClient = createClient<AppRouter>({
  transport: direct({ server: app }),
})
```

```tsx
// app/user/[id]/page.tsx
import { serverClient } from '@/lib/server-client'
import { UserProfile } from '@/components/UserProfile'

export default async function UserPage({
  params,
}: {
  params: { id: string }
}) {
  // Server-side data fetching
  const user = await serverClient.user.get({ input: { id: params.id } })

  return (
    <div>
      <h1>{user.name}</h1>
      {/* Client component for live updates */}
      <UserProfile userId={params.id} />
    </div>
  )
}
```

## WebSocket for Live Queries

Add WebSocket support for real-time features:

```typescript
// app/api/ws/route.ts
import { createWSHandler } from '@sylphx/lens-server'
import { app } from '@/server/app'

const wsHandler = createWSHandler(app)

export function GET(req: Request) {
  // Upgrade to WebSocket
  const { socket, response } = Bun.upgradeWebSocket(req)
  wsHandler.handleConnection(socket)
  return response
}
```

```typescript
// lib/client.ts
import { createClient } from '@sylphx/lens-react'
import { route, http, ws } from '@sylphx/lens-client'
import type { AppRouter } from '@/server/router'

export const client = createClient<AppRouter>({
  transport: route({
    query: http({ url: '/api/lens' }),
    mutation: http({ url: '/api/lens' }),
    subscription: ws({ url: 'ws://localhost:3000/api/ws' }),
  }),
})
```

## Middleware

Add Lens middleware for authentication:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Add auth header from cookie
  const token = request.cookies.get('token')?.value
  if (token && request.nextUrl.pathname.startsWith('/api/lens')) {
    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return NextResponse.next({ headers })
  }
  return NextResponse.next()
}
```

## Complete Example

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

```tsx
// app/page.tsx
import { serverClient } from '@/lib/server-client'
import { Dashboard } from '@/components/Dashboard'

export default async function Home() {
  // Pre-fetch data on server
  const users = await serverClient.user.list()

  return (
    <main>
      <h1>Welcome</h1>
      <Dashboard initialUsers={users} />
    </main>
  )
}
```

```tsx
// components/Dashboard.tsx
'use client'

import { client } from '@/lib/client'
import type { User } from '@/server/types'

export function Dashboard({ initialUsers }: { initialUsers: User[] }) {
  // Live query with initial data from SSR
  const { data: users } = client.user.list.useQuery({
    initialData: initialUsers,
  })

  return (
    <ul>
      {users?.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

## Best Practices

### 1. Separate Client/Server Clients

```typescript
// ✅ Good: Separate clients
// lib/client.ts - for client components
// lib/server-client.ts - for server components/actions

// ❌ Bad: Same client for both
```

### 2. Use Direct Transport for SSR

```typescript
// ✅ Good: Direct transport (no network overhead)
const serverClient = createClient({
  transport: direct({ server: app }),
})

// ❌ Bad: HTTP transport in server components
const serverClient = createClient({
  transport: http({ url: '/api/lens' }),
})
```

### 3. Pre-fetch for SEO

```tsx
// ✅ Good: Server-side data for SEO
export default async function Page() {
  const data = await serverClient.post.get({ input: { slug } })
  return <PostContent data={data} />
}
```
