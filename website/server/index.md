# Server Overview

The Lens server provides type-safe API operations with automatic live query support.

## Installation

```bash
npm install @sylphx/lens-server
```

## Basic Setup

```typescript
import { createApp, router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

// Define your router
const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),

    create: mutation()
      .input(z.object({ name: z.string() }))
      .resolve(({ input, ctx }) => ctx.db.user.create(input)),
  },
})

// Create the app
const app = createApp({
  router: appRouter,
  context: () => ({ db }),
})

// Export types for client
export type AppRouter = typeof appRouter
```

## createApp Options

| Option | Type | Description |
|--------|------|-------------|
| `router` | `RouterDef` | Namespaced operations |
| `context` | `(req) => Context` | Context factory function |
| `entities` | `Record<string, ModelDef>` | Explicit entity definitions (optional) |
| `resolvers` | `ResolverDef[]` | Field resolvers array |
| `plugins` | `ServerPlugin[]` | Server plugins |
| `logger` | `Logger` | Optional logging interface |

## HTTP Handler

For HTTP/REST-like APIs:

```typescript
import { createHTTPHandler } from '@sylphx/lens-server'

const handler = createHTTPHandler(app, {
  pathPrefix: '/api',
  cors: { origin: '*' },
  health: { enabled: true, path: '/__lens/health' },
})

// Use with any HTTP server
Bun.serve({ port: 3000, fetch: handler })
```

## WebSocket Handler

For real-time subscriptions:

```typescript
import { createWSHandler } from '@sylphx/lens-server'

const wsHandler = createWSHandler(app, {
  maxSubscriptionsPerClient: 100,
  maxConnections: 10000,
})

Bun.serve({
  port: 3000,
  fetch: httpHandler,
  websocket: wsHandler.websocket,
})
```

## Key Concepts

### Router

Organizes operations into namespaces:

```typescript
const appRouter = router({
  user: { get: query()..., create: mutation()... },
  post: { list: query()..., create: mutation()... },
})
```

See [Router](/server/router) for details.

### Operations

Two types of operations:

- **Query**: Read data (GET)
- **Mutation**: Modify data (POST)

See [Operations](/server/operations) for details.

### Models

Define your data shape with type builders:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  posts: list(() => Post),
})
```

See [Models](/server/models) for details.

### Context

Request-scoped data available in all resolvers:

```typescript
const app = createApp({
  router,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromRequest(req),
  }),
})
```

See [Context](/server/context) for details.

## Next Steps

- [Models](/server/models) - Define type-safe data models
- [Operations](/server/operations) - Create queries and mutations
- [Router](/server/router) - Organize your API
- [Live Queries](/server/live-queries) - Implement real-time updates
