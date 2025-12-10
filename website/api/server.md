# Server API Reference

Complete API reference for `@sylphx/lens-server`.

## createApp

Creates a Lens server instance.

```typescript
import { createApp } from '@sylphx/lens-server'

const app = createApp({
  router: appRouter,
  context: (req) => ({ db, user }),
  plugins: [opLog()],
})
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `router` | `RouterDef` | Router with operations |
| `context` | `(req?) => Context` | Context factory |
| `entities` | `Record<string, ModelDef>` | Explicit entity definitions |
| `resolvers` | `ResolverDef[]` | Field resolvers |
| `plugins` | `ServerPlugin[]` | Server plugins |
| `logger` | `Logger` | Logging interface |
| `version` | `string` | API version |

### Methods

```typescript
// Get operation metadata
app.getMetadata(): ServerMetadata

// Execute an operation
app.execute(op: LensOperation): Observable<LensResult>
```

## query

Creates a query operation.

```typescript
import { query } from '@sylphx/lens-server'

const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    // ...
  })
```

### Methods

| Method | Description |
|--------|-------------|
| `.input(schema)` | Input validation (Zod) |
| `.returns(model)` | Return type |
| `.resolve(fn)` | Resolver function |
| `.subscribe(fn)` | Subscription (Publisher pattern) |

## mutation

Creates a mutation operation.

```typescript
import { mutation } from '@sylphx/lens-server'

const createUser = mutation()
  .input(z.object({ name: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.user.create(input))
  .optimistic(({ input }) => ({ id: tempId(), ...input }))
```

### Methods

| Method | Description |
|--------|-------------|
| `.input(schema)` | Input validation (Zod) |
| `.returns(model)` | Return type |
| `.resolve(fn)` | Resolver function |
| `.optimistic(fn)` | Optimistic update |

## router

Creates a router with namespaced operations.

```typescript
import { router } from '@sylphx/lens-server'

const appRouter = router({
  user: {
    get: query()...,
    create: mutation()...,
  },
})
```

## model

Creates a type-safe model definition.

```typescript
import { model } from '@sylphx/lens-core'

const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string().optional(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) => ...),
}))
```

### Field Types

| Method | TypeScript Type |
|--------|-----------------|
| `t.id()` | `string` |
| `t.string()` | `string` |
| `t.int()` | `number` |
| `t.float()` | `number` |
| `t.boolean()` | `boolean` |
| `t.date()` | `Date` |
| `t.json()` | `unknown` |
| `t.enum([...])` | Union type |
| `t.one(() => Model)` | Relation |
| `t.many(() => Model)` | Array relation |

### Field Modifiers

| Method | Description |
|--------|-------------|
| `.optional()` | Field can be undefined |
| `.nullable()` | Field can be null |
| `.default(value)` | Default value |
| `.resolve(fn)` | Field resolver |
| `.subscribe(fn)` | Live subscription |
| `.args(schema)` | Field arguments |

## createHTTPHandler

Creates HTTP request handler.

```typescript
import { createHTTPHandler } from '@sylphx/lens-server'

const handler = createHTTPHandler(app, {
  pathPrefix: '/api',
  cors: { origin: '*' },
})

Bun.serve({ fetch: handler })
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `pathPrefix` | `string` | URL path prefix |
| `cors` | `CorsOptions` | CORS configuration |
| `health` | `{ enabled, path }` | Health check endpoint |

## createWSHandler

Creates WebSocket handler.

```typescript
import { createWSHandler } from '@sylphx/lens-server'

const wsHandler = createWSHandler(app, {
  maxSubscriptionsPerClient: 100,
  maxConnections: 10000,
})

Bun.serve({
  fetch: httpHandler,
  websocket: wsHandler.websocket,
})
```

### Options

| Option | Type | Default |
|--------|------|---------|
| `maxSubscriptionsPerClient` | `number` | `100` |
| `maxConnections` | `number` | `10000` |
| `heartbeatInterval` | `number` | `30000` |

## opLog

Operation logging plugin.

```typescript
import { opLog } from '@sylphx/lens-server'

const app = createApp({
  plugins: [
    opLog({
      maxOperations: 1000,
      ttl: 3600000,
      storage: memoryStorage(),
    }),
  ],
})
```

### Options

| Option | Type | Default |
|--------|------|---------|
| `maxOperations` | `number` | `1000` |
| `ttl` | `number` | `3600000` |
| `storage` | `OpLogStorage` | In-memory |

## optimisticPlugin

Optimistic updates plugin.

```typescript
import { optimisticPlugin } from '@sylphx/lens-server'

const app = createApp({
  plugins: [optimisticPlugin()],
})
```

## Context Functions

### createContext

Creates a context store.

```typescript
import { createContext, runWithContext, useContext } from '@sylphx/lens-server'

const ctx = createContext<AppContext>()

await runWithContext(ctx, context, async () => {
  const currentCtx = useContext(ctx)
})
```

## Types

### ServerMetadata

```typescript
interface ServerMetadata {
  version: string
  operations: OperationsMap
  entities: EntitiesMetadata
}
```

### LensOperation

```typescript
interface LensOperation {
  path: string
  input?: unknown
}
```

### LensResult

```typescript
interface LensResult {
  data?: unknown
  error?: Error
}
```

### ServerPlugin

```typescript
interface ServerPlugin {
  name: string
  onConnect?: (ctx: ConnectContext) => boolean | Promise<boolean>
  onDisconnect?: (ctx: DisconnectContext) => void
  onSubscribe?: (ctx: SubscribeContext) => boolean | Promise<boolean>
  onUnsubscribe?: (ctx: UnsubscribeContext) => void
  beforeMutation?: (ctx: BeforeMutationContext) => void | Promise<void>
  afterMutation?: (ctx: AfterMutationContext) => void | Promise<void>
  beforeSend?: (ctx: BeforeSendContext) => unknown | Promise<unknown>
  afterSend?: (ctx: AfterSendContext) => void | Promise<void>
}
```
