# @sylphx/lens-server

Server runtime for the Lens API framework with WebSocket support.

## Installation

```bash
bun add @sylphx/lens-server
```

## Usage

### Basic Server Setup

```typescript
import { createApp, createHandler } from "@sylphx/lens-server";
import { entity, lens, router } from "@sylphx/lens-core";
import { z } from "zod";

// Define context type
interface AppContext {
  db: Database;
  user: User | null;
}

// Define entities with inline resolvers
const User = entity<AppContext>("User").define((t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),
}));

// Create typed builders
const { query, mutation } = lens<AppContext>();

// Define operations
const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.users.update(input)),
  },
});

// Create server
const app = createApp({
  router: appRouter,
  entities: { User },  // Inline resolvers auto-extracted
  context: () => ({
    db: database,
    user: getCurrentUser(),
  }),
});

// Start server
const handler = createHandler(app);
Bun.serve({ port: 3000, fetch: handler });
```

### With Optimistic Updates

```typescript
import { createApp, optimisticPlugin } from "@sylphx/lens-server";
import { lens, router } from "@sylphx/lens-core";
import { entity as e, temp, now } from "@sylphx/reify";

// Enable optimistic plugin
const { query, mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

const appRouter = router({
  user: {
    // Sugar syntax
    update: mutation()
      .input(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .optimistic("merge")  // Instant UI update
      .resolve(({ input, ctx }) => ctx.db.users.update(input)),
  },
  message: {
    // Reify DSL (multi-entity)
    send: mutation()
      .input(z.object({ content: z.string(), userId: z.string() }))
      .returns(Message)
      .optimistic(({ input }) => [
        e.create(Message, {
          id: temp(),
          content: input.content,
          createdAt: now(),
        }),
      ])
      .resolve(({ input, ctx }) => ctx.db.messages.create(input)),
  },
});

const app = createApp({
  router: appRouter,
  entities: { User, Message },
  plugins,  // Include optimistic plugin
  context: () => ({ ... }),
});
```

### Live Queries

```typescript
const { query } = lens<AppContext>();

// Live query with Publisher pattern
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!)  // Initial value
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    // Publisher callback - emit/onCleanup passed here
    const unsub = ctx.db.users.onChange(input.id, (user) => {
      emit(user);  // Push update to clients
    });
    onCleanup(unsub);  // Cleanup on disconnect
  });
```

### WebSocket Handler

```typescript
import { createApp, createHandler, createWSHandler } from "@sylphx/lens-server";

const app = createApp({ ... });

// HTTP handler
const httpHandler = createHandler(app);

// WebSocket handler
const wsHandler = createWSHandler(app);

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (req.headers.get("upgrade") === "websocket") {
      return wsHandler.upgrade(req, server);
    }
    return httpHandler(req);
  },
  websocket: wsHandler.websocket,
});
```

## createApp Options

```typescript
createApp({
  // Required (at least one)
  router: RouterDef,           // Namespaced operations

  // Optional
  entities: EntitiesMap,       // Entity definitions (inline resolvers auto-extracted)
  plugins: ServerPlugin[],     // Server plugins (optimistic, clientState, etc.)
  context: () => TContext,     // Context factory
  logger: LensLogger,          // Logging (default: silent)
  version: string,             // Server version (default: "1.0.0")
});
```

## Optimistic Update Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| `"merge"` | Merge input into entity | `.optimistic("merge")` |
| `"create"` | Create with temp ID | `.optimistic("create")` |
| `"delete"` | Mark entity deleted | `.optimistic("delete")` |
| `{ merge: {...} }` | Merge with extra fields | `.optimistic({ merge: { status: "pending" } })` |
| Reify DSL | Multi-entity operations | `.optimistic(({ input }) => [...])` |

## License

MIT

---

Built with [@sylphx/lens-core](https://github.com/SylphxAI/Lens).

Powered by Sylphx
